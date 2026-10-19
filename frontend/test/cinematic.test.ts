import assert from "node:assert/strict";
import test from "node:test";
import { framingOffset, planTravel, routeDuration, ROUTE_MAX, ROUTE_MIN, BRIDGE_ARRIVE, BRIDGE_DEPART, smootherstep } from "../src/world/cinematic.ts";
import { cameraPath, safePoint } from "../src/world/collision.ts";
import { ROOMS, worldGeometry, zonePose } from "../src/world/registry.ts";
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

test("non-adjacent travel keeps the source room until arrival, then releases it (at most two rooms)", async () => {
  const c = await ready();
  c.travel("gaming"); await tick();
  assert.deepEqual([...c.getSnapshot().loaded].sort(), ["gaming", "project-hub"]);
  c.arrive(c.getSnapshot().request!.id);
  assert.deepEqual(c.getSnapshot().loaded, ["gaming"]);
  c.travel("atrium"); await tick(); assert.deepEqual([...c.getSnapshot().loaded].sort(), ["atrium", "gaming"]);
  c.arrive(c.getSnapshot().request!.id); assert.deepEqual([...c.getSnapshot().loaded].sort(), ["atrium", "gaming"], "adjacent pair kept");
  for (const room of ["living", "project-hub", "gaming", "living", "atrium", "project-hub"] as const) {
    c.travel(room); await tick(); assert.ok(c.getSnapshot().loaded.length <= 2); c.arrive(c.getSnapshot().request!.id); assert.ok(c.getSnapshot().loaded.length <= 2);
  }
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

test("cancel during a bridge lands safely in a loaded room and releases the other", async () => {
  const c = await ready();
  c.travel("living"); await tick();
  c.updatePose({ position: [0, 2.6, -7.6], target: [0, 1.4, -10], room: "project-hub" });
  c.cancel(); const s = c.getSnapshot();
  assert.equal(s.request!.instant, true); assert.equal(s.room, "project-hub");
  c.arrive(s.request!.id); assert.deepEqual(c.getSnapshot().loaded, ["project-hub"]); assert.equal(c.getSnapshot().phase, "idle");
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
