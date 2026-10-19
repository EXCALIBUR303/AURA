import assert from "node:assert/strict";
import test from "node:test";
import { COMPONENTS, EXPLODE_SECONDS, FANS, GROUPS, HARDWARE_ORIGIN, SELECTABLE, componentById, focusPose, separation, stepProgress } from "../src/world/hardware/catalog.ts";
import type { ComponentDef } from "../src/world/hardware/catalog.ts";
import { HardwareInspection } from "../src/world/hardware/inspection.ts";
import { safePoint } from "../src/world/collision.ts";
import { HARDWARE_INSPECTION_COLLIDERS, ROOMS, worldGeometry } from "../src/world/registry.ts";
import { WorldController } from "../src/world/WorldController.ts";
import type { Point, RoomModule } from "../src/world/types.ts";

const module: RoomModule = { default: () => null };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const OPTIONS = { livingLights: true, gamingLights: true, curtainsOpen: true, livingPalette: "forest", chairSlot: "reading" } as const;

test("catalog: ids are unique, selectable parts carry the five information fields, and groups cover every selectable part", () => {
  assert.equal(new Set(COMPONENTS.map((c) => c.id)).size, COMPONENTS.length);
  for (const c of SELECTABLE) {
    assert.ok(c.info, c.id);
    for (const field of ["kind", "purpose", "connects", "cooling", "explanation"] as const) assert.ok(c.info![field].length > 20, `${c.id}.${field}`);
    assert.ok(GROUPS.includes(c.group));
  }
  for (const id of ["gpu", "cpu", "ram", "board", "cooler", "storage", "psu"]) assert.ok(componentById(id)?.selectable, id);
  assert.equal(componentById("glass")?.selectable, false);
  for (const fan of FANS) assert.ok(componentById(fan.component));
});

test("catalog: original, generic wording only (no trademarks, no invented figures or telemetry)", () => {
  const text = JSON.stringify(COMPONENTS.map((c) => [c.label, c.info]));
  assert.doesNotMatch(text, /nvidia|geforce|\brtx\b|radeon|\bamd\b|ryzen|\bintel\b|core i\d|corsair|asus|\bmsi\b|gigabyte|noctua|apple/i);
  assert.doesNotMatch(text, /\d+\s?(rpm|°c|celsius|fps|gb\/s|watts? used)/i, "no measured-looking values");
  assert.match(text, /decorative animation/i, "the fan text says the motion is not telemetry");
});

test("explode: separation is 0 at rest, 1 when fully exploded, monotonic, and the glass leaves first", () => {
  for (const c of COMPONENTS) {
    assert.equal(separation(0, c.delay), 0); assert.equal(separation(1, c.delay), 1);
    let last = -1; for (let p = 0; p <= 1.0001; p += 0.02) { const s = separation(p, c.delay); assert.ok(s >= last - 1e-12, `${c.id} monotonic`); last = s; }
  }
  assert.ok(separation(0.3, componentById("glass")!.delay) > separation(0.3, componentById("board")!.delay));
  // Reassembly is the same pure function run backwards: the part that left last returns first.
  assert.ok(separation(0.55, componentById("board")!.delay) < separation(0.55, componentById("gpu")!.delay));
});

test("explode: progress is rate-limited, reversible mid-way, exact at the ends and instant for reduced motion", () => {
  let p = 0; const dt = 1 / 60; let frames = 0;
  while (p < 1 && frames < 1000) { p = stepProgress(p, 1, dt, false); frames++; }
  assert.equal(p, 1); assert.ok(Math.abs(frames / 60 - EXPLODE_SECONDS) < 0.05, "takes about EXPLODE_SECONDS");
  let q = 0; for (let i = 0; i < 30; i++) q = stepProgress(q, 1, dt, false);
  const mid = q; assert.ok(mid > 0.3 && mid < 0.7);
  for (let i = 0; i < 30; i++) q = stepProgress(q, 0, dt, false);
  assert.ok(Math.abs(q) < 1e-9, "reversing mid-way returns to the start");
  assert.equal(stepProgress(0.4, 1, dt, true), 1); assert.equal(stepProgress(0.4, 0, dt, true), 0);
  assert.equal(stepProgress(0.5, 1, 100, false), 1, "a long stalled frame never overshoots");
  assert.equal(stepProgress(0.5, 1, -1, false), 0.5);
});

const bounds = (c: ComponentDef, exploded: boolean) => {
  const o = exploded ? c.offset : [0, 0, 0];
  return { min: c.center.map((v, i) => v + o[i]! - c.size[i]! / 2), max: c.center.map((v, i) => v + o[i]! + c.size[i]! / 2) };
};
test("exploded parts do not intersect each other (the physical parts that have exact bounds)", () => {
  const ids = ["gpu", "cooler", "ram", "cpu", "board", "psu", "airflow", "glass"];
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const A = bounds(componentById(a)!, true), B = bounds(componentById(b)!, true);
    const overlap = A.min.every((v, i) => v < B.max[i]! - 1e-6 && A.max[i]! > B.min[i]! + 1e-6);
    assert.equal(overlap, false, `${a} overlaps ${b} when exploded`);
  }
});

test("camera poses: every focus pose is collision-valid in the hardware inspection geometry, close enough and above the desk", () => {
  const { floors, colliders } = worldGeometry(["project-hub"], OPTIONS, "hardware");
  const ceiling = ROOMS["project-hub"].ceiling;
  for (const id of [null, ...SELECTABLE.map((c) => c.id)] as const) for (const exploded of [false, true]) {
    const pose = focusPose(id, exploded);
    assert.equal(pose.room, "project-hub");
    assert.ok(safePoint(pose.position, floors, colliders, 0.12, false), `${id}/${exploded} camera is inside a collider`);
    assert.ok(pose.position[1] >= 0.3 && pose.position[1] <= ceiling - 0.16);
    const d = dist(pose.position, pose.target);
    assert.ok(d >= 0.38 && d <= 1.3, `${id} distance ${d}`);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(pose.target[i]! - HARDWARE_ORIGIN[i]!) < 0.6, "target stays on the tower");
    if (id && id !== "case") { const c = componentById(id)!; assert.ok(d >= Math.max(...c.size) * 1.1, "the whole part fits in frame"); }
  }
});

test("camera poses: without the inspection allowance the same poses are rejected (so the scope is needed and is not global)", () => {
  const { floors, colliders } = worldGeometry(["project-hub"], OPTIONS);
  const rejected = SELECTABLE.filter((c) => !safePoint(focusPose(c.id, false).position, floors, colliders, 0.12, false));
  assert.ok(rejected.length > 0, "poses over the desk are inside the ordinary desk collider");
  const relaxed = worldGeometry(["project-hub"], OPTIONS, "hardware");
  assert.ok(!relaxed.colliders.some((c) => c.id === "desk.-3.25.-2.5"));
  for (const c of HARDWARE_INSPECTION_COLLIDERS) assert.ok(relaxed.colliders.some((x) => x.id === c.id));
  for (const other of ["desk.3.25.-2.5", "chair.-3.25.-2.5", "astra"]) assert.ok(relaxed.colliders.some((c) => c.id === other), `${other} keeps its collider`);
  assert.equal(worldGeometry(["living"], OPTIONS, "hardware").colliders.some((c) => c.id.startsWith("hardware.")), false, "no hardware colliders in other rooms");
});

test("hardware inspection store: selection rules, explode toggle, reset and close", () => {
  const s = new HardwareInspection(); let notified = 0; s.subscribe(() => notified++);
  assert.deepEqual(s.getSnapshot(), { open: false, selected: null, hovered: null, exploded: false, nonce: 0 });
  s.open(); s.select("gpu"); assert.equal(s.getSnapshot().selected, "gpu");
  s.select("glass"); assert.equal(s.getSnapshot().selected, null, "unselectable parts are ignored");
  s.select("not-a-part"); assert.equal(s.getSnapshot().selected, null);
  s.select("ram"); s.toggleExploded(); assert.equal(s.getSnapshot().exploded, true);
  s.reset(); const r = s.getSnapshot(); assert.equal(r.selected, null); assert.equal(r.exploded, false); assert.equal(r.nonce, 1); assert.equal(r.open, true);
  const before = notified; s.setExploded(false); assert.equal(notified, before, "no notification without a change");
  s.select("gpu"); s.close(); assert.deepEqual(s.getSnapshot(), { open: false, selected: null, hovered: null, exploded: false, nonce: 0 });
});

test("world controller: close inspection allowance is held until the exit travel has arrived", async () => {
  const c = new WorldController(async () => module); c.focusWorkspace("studio"); await tick(); c.arrive(c.getSnapshot().request!.id);
  assert.equal(c.getSnapshot().inspectionZone, undefined);
  const before = c.capture();
  c.inspect(focusPose("gpu", false), "hardware"); assert.equal(c.getSnapshot().inspectionZone, "hardware");
  await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, "hardware", "stays while inspecting");
  c.inspect(focusPose("cpu", true), "hardware"); await tick(); c.arrive(c.getSnapshot().request!.id);
  c.inspect(before); assert.equal(c.getSnapshot().inspectionZone, "hardware", "the exit travel still starts inside the relaxed geometry");
  await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, undefined, "cleared on arrival");
  assert.ok(dist(c.capture().position, before.position) < 1e-9, "exact return to the captured pose");
});

test("world controller: any other camera request ends the inspection allowance on arrival (workspace change, room travel, cancel)", async () => {
  const start = async () => { const c = new WorldController(async () => module); c.focusWorkspace("studio"); await tick(); c.arrive(c.getSnapshot().request!.id); c.inspect(focusPose("gpu", false), "hardware"); await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, "hardware"); return c; };
  // "Open hardware workspace" from the panel leaves through focusWorkspace, not through inspect().
  let c = await start(); c.focusWorkspace("hardware"); assert.equal(c.zoneAfterArrival(), undefined, "limits for the destination are the ordinary ones");
  await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, undefined);
  c = await start(); c.travel("atrium"); await tick(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, undefined);
  c = await start(); c.inspect(focusPose("cpu", true), "hardware"); await tick(); assert.equal(c.zoneAfterArrival(), "hardware", "a new hardware inspection keeps the zone");
  c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, "hardware");
  c = await start(); c.cancel(); c.arrive(c.getSnapshot().request!.id); assert.equal(c.getSnapshot().inspectionZone, undefined, "Escape-cancel lands in the ordinary geometry");
});
