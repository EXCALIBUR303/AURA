import assert from "node:assert/strict";
import test from "node:test";
import { framingOffset, planTravel, roundCorners, routeDuration, JOURNEY_MAX, JOURNEY_MIN, ROUTE_MAX, ROUTE_MIN, BRIDGE_ARRIVE, BRIDGE_DEPART, WALKWAY_MAX, smootherstep } from "../src/world/cinematic.ts";
import { cameraPath, doorwayPath, passagesFor, safePoint } from "../src/world/collision.ts";
import { connectionFor, ROOMS, viaRoom, worldGeometry, zonePose } from "../src/world/registry.ts";
import { WorldController } from "../src/world/WorldController.ts";
import type { Point, RoomId, RoomModule } from "../src/world/types.ts";

const module: RoomModule = { default: () => null };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ready = async () => { const c = new WorldController(async () => module); c.focusWorkspace("studio"); await tick(); c.arrive(c.getSnapshot().request!.id); return c; };
/** Degrees the view direction turns between consecutive samples. */
const turn = (a: { position: Point; target: Point }, b: { position: Point; target: Point }) => {
  const u = a.target.map((v, i) => v - a.position[i]!), w = b.target.map((v, i) => v - b.position[i]!);
  const dot = u.reduce((sum, v, i) => sum + v * w[i]!, 0) / (Math.hypot(...u) * Math.hypot(...w));
  return Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
};
const intro = (room: RoomId) => ({ position: [...ROOMS[room].introduction.position] as Point, target: [...ROOMS[room].introduction.target] as Point });
function frames(plan: ReturnType<typeof planTravel>, fps = 60) {
  const out = []; for (let t = 0; t <= plan.duration + 1e-9; t += 1 / fps) out.push(plan.sample(t)); out.push(plan.sample(plan.duration)); return out;
}

test("easing starts and stops at rest and stays monotonic", () => {
  assert.equal(smootherstep(0), 0); assert.equal(smootherstep(1), 1); assert.equal(smootherstep(-3), 0); assert.equal(smootherstep(9), 1);
  let last = -1; for (let t = 0; t <= 1; t += 0.01) { const v = smootherstep(t); assert.ok(v >= last); last = v; }
  assert.ok(smootherstep(0.02) < 0.001 && 1 - smootherstep(0.98) < 0.001, "zero velocity at both ends");
});

test("route durations are bounded so travel never delays ordinary use", () => {
  assert.equal(routeDuration(0), ROUTE_MIN); assert.equal(routeDuration(500), ROUTE_MAX);
  assert.ok(BRIDGE_DEPART + BRIDGE_ARRIVE <= 1.5);
});

test("Hub to Atrium follows the collision-checked walkway, eases, looks ahead and lands exactly", () => {
  const g = worldGeometry(["project-hub", "atrium"]);
  const from = intro("project-hub"), to = intro("atrium");
  const route = cameraPath(from.position, to.position, g.floors, g.colliders);
  assert.ok(route.length > 0);
  const plan = planTravel({ from, to, route, geometry: g, reduced: false, instant: false });
  assert.equal(plan.kind, "route"); assert.ok(plan.duration >= ROUTE_MIN && plan.duration <= ROUTE_MAX);
  const samples = frames(plan);
  for (const s of samples) assert.ok(safePoint(s.position, g.floors, g.colliders, 0.1, false), `unsafe ${s.position}`);
  assert.deepEqual(samples.at(-1)!.position, to.position); assert.deepEqual(samples.at(-1)!.target, to.target);
  // Ease-in: the first frame moves far less than a middle frame.
  const step = (i: number) => dist(samples[i]!.position, samples[i + 1]!.position);
  assert.ok(step(0) < step(Math.floor(samples.length / 2)) / 5);
  assert.ok(samples.every((s) => s.veil === 0), "walkways need no veil");
  for (let i = 1; i < samples.length; i++) assert.ok(turn(samples[i - 1]!, samples[i]!) < 3, `whip pan at frame ${i}`);
});

test("Hub to Gaming has no walkway: depart, veil, arrive into the room's own framing", () => {
  const g = worldGeometry(["project-hub", "gaming"]);
  const from = intro("project-hub"), to = intro("gaming");
  assert.deepEqual(cameraPath(from.position, to.position, g.floors, g.colliders), []);
  const plan = planTravel({ from, to, route: [], geometry: g, reduced: false, instant: false });
  assert.equal(plan.kind, "bridge"); assert.ok(Math.abs(plan.duration - (BRIDGE_DEPART + BRIDGE_ARRIVE)) < 1e-9);
  const samples = frames(plan);
  const peak = samples.reduce((m, s) => Math.max(m, s.veil), 0);
  assert.equal(peak, 1, "fully veiled while the camera crosses between rooms");
  // The room change happens only behind a full veil: consecutive visible frames never jump.
  for (let i = 1; i < samples.length; i++) if (dist(samples[i]!.position, samples[i - 1]!.position) > 0.5) assert.equal(Math.min(samples[i]!.veil, samples[i - 1]!.veil), 1);
  for (const s of samples) if (s.veil < 0.99) assert.ok(safePoint(s.position, g.floors, g.colliders, 0.12, false), `visible unsafe pose ${s.position}`);
  assert.equal(samples[0]!.veil, 0); assert.equal(samples.at(-1)!.veil, 0);
  assert.deepEqual(samples.at(-1)!.position, to.position);
  const approach = framingOffset(to, 1.35, 0.35, g)!;
  assert.ok(dist(approach, to.position) > 0.3, "arrival dollies in from a pulled-back framing");
});

test("reduced motion and instant restores cut without animation or veil", () => {
  const g = worldGeometry(["project-hub", "atrium"]);
  for (const flags of [{ reduced: true, instant: false }, { reduced: false, instant: true }]) {
    const plan = planTravel({ from: intro("project-hub"), to: intro("atrium"), route: [intro("atrium").position], geometry: g, ...flags });
    assert.equal(plan.kind, "cut"); assert.equal(plan.duration, 0);
    assert.deepEqual(plan.sample(0), { position: intro("atrium").position, target: intro("atrium").target, veil: 0 });
  }
});

test("a replacement plan fades out a veil that was already on screen", () => {
  const g = worldGeometry(["project-hub", "atrium"]);
  const route = cameraPath(intro("project-hub").position, intro("atrium").position, g.floors, g.colliders);
  const plan = planTravel({ from: intro("project-hub"), to: intro("atrium"), route, geometry: g, reduced: false, instant: false, carryVeil: 0.9 });
  assert.ok(Math.abs(plan.sample(0).veil - 0.9) < 1e-9); assert.equal(plan.sample(0.3).veil, 0);
});

test("short in-room inspection moves re-aim smoothly without a look-ahead swing", () => {
  const g = worldGeometry(["project-hub"]);
  const from = { position: zonePose("studio").position, target: zonePose("studio").target }, to = { position: zonePose("hardware").position, target: zonePose("hardware").target };
  const plan = planTravel({ from, to, route: cameraPath(from.position, to.position, g.floors, g.colliders), geometry: g, reduced: false, instant: false });
  const samples = frames(plan);
  for (let i = 1; i < samples.length; i++) assert.ok(turn(samples[i - 1]!, samples[i]!) < 3, "under 180°/s at 60 fps");
});

test("framing offsets back off from walls instead of entering them", () => {
  const g = worldGeometry(["gaming"]);
  const nearWall = { position: [15.2, 1.6, 0] as Point, target: [12, 1.2, 0] as Point };
  const p = framingOffset(nearWall, 1.35, 0.35, g);
  assert.ok(!p || safePoint(p, g.floors, g.colliders, 0.12, false));
});

test("unconnected rooms are reached by a journey through the Atrium; settled, at most two rooms remain", async () => {
  const c = await ready();
  c.travel("gaming"); await tick();
  const request = c.getSnapshot().request!;
  assert.equal(request.via, "atrium"); assert.equal(request.origin, "project-hub");
  assert.deepEqual([...c.getSnapshot().loaded].sort(), ["atrium", "gaming", "project-hub"], "the walk needs both doorways");
  c.arrive(request.id);
  assert.deepEqual([...c.getSnapshot().loaded].sort(), ["atrium", "gaming"], "the Hub is released on arrival");
  c.travel("atrium"); await tick(); assert.equal(c.getSnapshot().request!.via, undefined, "adjacent rooms need no journey");
  c.arrive(c.getSnapshot().request!.id); assert.deepEqual([...c.getSnapshot().loaded].sort(), ["atrium", "gaming"], "adjacent pair kept");
  for (const room of ["living", "project-hub", "gaming", "living", "atrium", "project-hub"] as const) {
    c.travel(room); await tick(); assert.ok(c.getSnapshot().loaded.length <= 3); c.arrive(c.getSnapshot().request!.id); assert.ok(c.getSnapshot().loaded.length <= 2, `${room}: ${c.getSnapshot().loaded}`);
  }
});

test("retargeting mid-journey keeps the room the camera is standing in", async () => {
  const c = await ready();
  c.travel("living"); await tick();
  c.updatePose({ position: [0.4, 1.62, 0.3], target: [-3, 1.5, 0], room: "atrium" });
  c.travel("gaming"); await tick();
  const s = c.getSnapshot();
  assert.ok(s.loaded.includes("atrium") && s.loaded.includes("gaming"), String(s.loaded));
  assert.ok(!s.loaded.includes("project-hub"), "the Hub behind the camera is released");
  assert.equal(s.request!.via, undefined, "Atrium to Gaming is a direct walk");
});

test("skip marks only the active travel and is cleared by arrival or a newer request", async () => {
  const c = await ready();
  c.skip(); assert.equal(c.getSnapshot().skip, undefined, "nothing to skip while idle");
  c.travel("atrium"); c.skip(); assert.equal(c.getSnapshot().skip, undefined, "nothing to skip while preparing");
  await tick(); const id = c.getSnapshot().request!.id; c.skip(); assert.equal(c.getSnapshot().skip, id);
  c.travel("living"); assert.equal(c.getSnapshot().skip, undefined, "a newer request clears the skip");
  await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().skip, undefined); assert.equal(c.getSnapshot().room, "living");
});

test("look sensitivity is bounded, finite and session-only", async () => {
  const c = await ready(); const changes: unknown[] = []; c.subscribeUserChanges((change) => changes.push(change));
  assert.equal(c.getSnapshot().lookSensitivity, 1);
  c.setLookSensitivity(9); assert.equal(c.getSnapshot().lookSensitivity, 2);
  c.setLookSensitivity(0); assert.equal(c.getSnapshot().lookSensitivity, 0.4);
  c.setLookSensitivity(Number.NaN); assert.equal(c.getSnapshot().lookSensitivity, 0.4);
  c.setLookSensitivity(1.26); assert.equal(c.getSnapshot().lookSensitivity, 1.3);
  assert.equal(changes.length, 0, "no persistence intent");
});

test("cancel during a journey lands safely in a loaded room and keeps at most two", async () => {
  const c = await ready();
  c.travel("living"); await tick();
  c.updatePose({ position: [0, 2.6, -7.6], target: [0, 1.4, -10], room: "project-hub" });
  c.cancel(); let s = c.getSnapshot();
  assert.equal(s.request!.instant, true); assert.equal(s.room, "project-hub");
  c.arrive(s.request!.id); s = c.getSnapshot(); assert.equal(s.phase, "idle"); assert.ok(s.loaded.includes("project-hub") && s.loaded.length <= 2 && !s.loaded.includes("living"), String(s.loaded));
  // Cancelling in the Atrium, which connects to everything, still settles on two rooms.
  c.travel("gaming"); await tick();
  c.updatePose({ position: [0.5, 1.62, 0.5], target: [3, 1.5, 0], room: "atrium" });
  c.cancel(); s = c.getSnapshot(); assert.equal(s.room, "atrium");
  c.arrive(s.request!.id); s = c.getSnapshot(); assert.ok(s.loaded.includes("atrium") && s.loaded.length === 2, String(s.loaded));
});

test("every journey through the Atrium is collision-safe, bounded, rounded at doorways and free of whip pans", () => {
  for (const [a, b] of [["project-hub", "living"], ["project-hub", "gaming"], ["living", "gaming"]] as const)
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const geometry = worldGeometry([x, "atrium", y]);
      const from = intro(x), to = intro(y);
      const route = doorwayPath(from.position, to.position, [x, "atrium", y], geometry.floors, geometry.colliders);
      assert.ok(route.length, `${x}→${y}: no walkway`);
      // Through the middle of both doorways.
      for (const edge of [connectionFor(x, "atrium")!, connectionFor("atrium", y)!]) assert.ok(route.some(p => Math.hypot(p[0] - edge.fromPoint[0], p[2] - edge.fromPoint[2]) < 1e-6) && route.some(p => Math.hypot(p[0] - edge.toPoint[0], p[2] - edge.toPoint[2]) < 1e-6), `${x}→${y}: off-centre at ${edge.id}`);
      const plan = planTravel({ from, to, route, geometry, reduced: false, instant: false, journey: true });
      assert.equal(plan.kind, "journey");
      assert.ok(plan.duration >= JOURNEY_MIN && plan.duration <= JOURNEY_MAX, `${x}→${y}: ${plan.duration}`);
      const shots = frames(plan);
      for (const f of shots) { assert.equal(f.veil, 0, "no veil: the rooms are walked"); assert.ok(safePoint(f.position, geometry.floors, geometry.colliders, 0.1, false), `${x}→${y}: unsafe ${f.position}`); }
      for (let i = 1; i < shots.length; i++) assert.ok(turn(shots[i - 1]!, shots[i]!) < 3.2, `${x}→${y}: ${turn(shots[i - 1]!, shots[i]!).toFixed(1)}° at frame ${i}`);
      const end = shots.at(-1)!; assert.ok(dist(end.position, to.position) < 1e-6 && dist(end.target, to.target) < 1e-6);
      // Visits the intermediate room for real.
      assert.ok(shots.some(f => Math.abs(f.position[0]) < 3.5 && Math.abs(f.position[2]) < 3.5), `${x}→${y}: never crosses the Atrium`);
    }
});

test("doorway corners are rounded only where the curve itself is clear", () => {
  const geometry = worldGeometry(["project-hub", "atrium", "gaming"]);
  const sharp: Point[] = [[0, 1.62, -7.5], [0, 1.62, 0], [8, 1.62, 0]];
  const round = roundCorners(sharp, geometry);
  assert.ok(round.length > sharp.length, "a free corner gets a curve");
  for (let i = 1; i < round.length; i++) assert.ok(cameraPath(round[i - 1]!, round[i]!, geometry.floors, geometry.colliders).length === 1);
  const walled: Point[] = [[0, 1.62, -7.5], [0, 1.62, -4.2], [3.9, 1.62, -4.2]];
  assert.ok(roundCorners(walled, geometry).length >= walled.length);
});

test("every walkway and every Hub workspace move stays collision-safe without whip pans", () => {
  const cases: { geometry: ReturnType<typeof worldGeometry>; from: { position: Point; target: Point }; to: { position: Point; target: Point }; label: string }[] = [];
  for (const [a, b] of [["project-hub", "atrium"], ["atrium", "living"], ["atrium", "gaming"]] as const)
    for (const [x, y] of [[a, b], [b, a]] as const) cases.push({ geometry: worldGeometry([x, y]), from: intro(x), to: intro(y), label: `${x}→${y}` });
  const zones = ["studio", "hardware", "software", "ai-lab", "github", "companion"] as const;
  for (const x of zones) for (const y of zones) if (x !== y) cases.push({ geometry: worldGeometry(["project-hub"]), from: zonePose(x), to: zonePose(y), label: `${x}→${y}` });
  for (const c of cases) {
    const route = cameraPath(c.from.position, c.to.position, c.geometry.floors, c.geometry.colliders);
    const plan = planTravel({ from: c.from, to: c.to, route, geometry: c.geometry, reduced: false, instant: false });
    const samples = frames(plan);
    for (let i = 1; i < samples.length; i++) {
      assert.ok(turn(samples[i - 1]!, samples[i]!) < 3.2, `${c.label}: ${turn(samples[i - 1]!, samples[i]!).toFixed(1)}° at frame ${i}`);
      // Routes are checked at 0.12 m every 5 cm; between checks a frame can graze a box corner by millimetres, so assert ≥10 cm clearance.
      if (samples[i]!.veil < 0.99) assert.ok(safePoint(samples[i]!.position, c.geometry.floors, c.geometry.colliders, 0.1, false), `${c.label}: unsafe ${samples[i]!.position}`);
    }
    assert.deepEqual(samples.at(-1)!.target, c.to.target);
  }
});

test("Living object inspection poses are collision-safe and face their objects", async () => {
  const { ROOM_OBJECT_FOCUS, ROOM_OBJECTS } = await import("../src/world/interactions/registry.ts");
  const g = worldGeometry(["living"]);
  for (const id of Object.keys(ROOM_OBJECTS)) {
    const pose = ROOM_OBJECT_FOCUS[id]; assert.ok(pose, `${id} has a focus pose`); assert.equal(pose.room, "living");
    assert.ok(safePoint(pose.position, g.floors, g.colliders, 0.12, false), `${id} camera clear`);
    assert.ok(dist(pose.position, pose.target) > 1 && dist(pose.position, pose.target) < 3, `${id} framing distance`);
  }
});

/** Share of a 9×5 ray grid across the view (50° vertical FOV, 16:10) that meets a collider within `near` metres. */
function closeWalls(f: { position: Point; target: Point }, colliders: readonly { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }[], near = 1.6) {
  const o = f.position, d0 = f.target.map((v, i) => v - o[i]!), l0 = Math.hypot(...d0), fw = d0.map(v => v / l0);
  const rl = Math.hypot(fw[2]!, fw[0]!) || 1, right = [-fw[2]! / rl, 0, fw[0]! / rl];
  const up = [right[1]! * fw[2]! - right[2]! * fw[1]!, right[2]! * fw[0]! - right[0]! * fw[2]!, right[0]! * fw[1]! - right[1]! * fw[0]!];
  const tan = Math.tan(25 * Math.PI / 180); let hits = 0;
  for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 9; ix++) {
    const nx = (ix / 4 - 1) * 0.9 * tan * 1.6, ny = (iy / 2 - 1) * 0.9 * tan;
    const d = fw.map((v, k) => v + right[k]! * nx + up[k]! * ny), dl = Math.hypot(...d); d.forEach((v, k) => (d[k] = v / dl));
    let best = Infinity;
    for (const c of colliders) {
      let t0 = 0, t1 = Infinity; const lo = [c.minX, c.minY, c.minZ], hi = [c.maxX, c.maxY, c.maxZ];
      for (let k = 0; k < 3 && t0 <= t1; k++) { if (Math.abs(d[k]!) < 1e-9) { if (o[k]! < lo[k]! || o[k]! > hi[k]!) t0 = Infinity; continue; } let a = (lo[k]! - o[k]!) / d[k]!, b = (hi[k]! - o[k]!) / d[k]!; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
      if (t0 <= t1 && t0 < best) best = t0;
    }
    if (d[1]! < 0 && -o[1]! / d[1]! < best) best = Infinity; // the floor is open view, not a wall
    if (best < near) hits++;
  }
  return hits / 45;
}

test("doorway travel between every pair of rooms never faces a wall at close range and turns in the open", () => {
  const rooms = ["project-hub", "atrium", "living", "gaming"] as const;
  for (const x of rooms) for (const y of rooms) {
    if (x === y) continue;
    const via = viaRoom(x, y), list = via ? [x, via, y] : [x, y], geometry = worldGeometry(list);
    const from = intro(x), to = intro(y);
    // Exactly as WorldNavigation plans it.
    const route = doorwayPath(from.position, to.position, list, geometry.floors, geometry.colliders);
    assert.ok(route.length, `${x}→${y}: no walkway`);
    const plan = planTravel({ from, to, route, geometry, reduced: false, instant: false, journey: !!via, doors: passagesFor(list) });
    assert.equal(plan.kind, via ? "journey" : "route");
    assert.ok(via ? plan.duration >= JOURNEY_MIN && plan.duration <= JOURNEY_MAX : plan.duration >= ROUTE_MIN && plan.duration <= WALKWAY_MAX, `${x}→${y}: ${plan.duration}`);
    const shots = frames(plan);
    for (const [i, f] of shots.entries()) {
      assert.equal(f.veil, 0); assert.ok(safePoint(f.position, geometry.floors, geometry.colliders, 0.1, false), `${x}→${y}: unsafe ${f.position}`);
      const cover = closeWalls(f, geometry.colliders);
      assert.ok(cover < 0.4, `${x}→${y}: ${Math.round(cover * 100)}% of the view is a wall within 1.6 m at frame ${i}`);
    }
    for (let i = 1; i < shots.length; i++) assert.ok(turn(shots[i - 1]!, shots[i]!) < 3.2, `${x}→${y}: ${turn(shots[i - 1]!, shots[i]!).toFixed(1)}° at frame ${i}`);
    for (let i = 1; i < shots.length; i++) assert.ok(dist(shots[i - 1]!.position, shots[i]!.position) < 0.25, `${x}→${y}: ${dist(shots[i - 1]!.position, shots[i]!.position).toFixed(2)} m in one frame`);
    const end = shots.at(-1)!; assert.ok(dist(end.position, to.position) < 1e-6 && dist(end.target, to.target) < 1e-6, `${x}→${y}: lands off the framing`);
  }
});

test("doorway travel is skippable, cancels cleanly and cuts under reduced motion", () => {
  const list = ["living", "atrium", "project-hub"] as const, geometry = worldGeometry(list);
  const from = intro("living"), to = intro("project-hub");
  const route = doorwayPath(from.position, to.position, list, geometry.floors, geometry.colliders), doors = passagesFor(list);
  const plan = planTravel({ from, to, route, geometry, reduced: false, instant: false, journey: true, doors });
  const end = plan.sample(plan.duration); assert.deepEqual(end.position, to.position); assert.deepEqual(end.target, to.target);
  assert.equal(planTravel({ from, to, route, geometry, reduced: true, instant: false, journey: true, doors }).kind, "cut");
  assert.equal(planTravel({ from, to, route, geometry, reduced: false, instant: true, journey: true, doors }).kind, "cut");
  // A replan from mid-walk (retarget) starts exactly where the camera is.
  const mid = plan.sample(plan.duration * 0.45), back = intro("living");
  const g2 = worldGeometry(["atrium", "living"]);
  const r2 = doorwayPath(mid.position, back.position, ["atrium", "living"], g2.floors, g2.colliders);
  const again = planTravel({ from: mid, to: back, route: r2, geometry: g2, reduced: false, instant: false, doors: passagesFor(["atrium", "living"]) });
  const first = again.sample(0); assert.ok(dist(first.position, mid.position) < 1e-6 && turn(first, mid) < 0.5, "no jump on retarget");
});
