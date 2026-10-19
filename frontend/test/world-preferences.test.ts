import assert from "node:assert/strict";
import test from "node:test";
import { createBridgeClient, createMockTransport } from "../../shared/bridge/index.ts";
import { WORLD_PREFERENCES_VERSION } from "../../shared/contracts/index.ts";
import type { Preferences, PreferencesPatch } from "../../shared/contracts/index.ts";
import { WorldController } from "../src/world/WorldController.ts";
import { WorldPreferenceSync } from "../src/world/worldPreferenceSync.ts";
import type { RoomModule } from "../src/world/types.ts";

const module: RoomModule = { default: () => null };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A world that has finished its startup workspace focus, like App after the first frame. */
async function idleWorld() {
  const c = new WorldController(async () => module);
  c.focusWorkspace("studio"); await tick(); c.arrive(c.getSnapshot().request!.id);
  return c;
}
async function settle(c: WorldController) {
  for (let i = 0; i < 5; i++) { await tick(); const r = c.getSnapshot().request; if (r) c.arrive(r.id); }
}

function harness(transport = createMockTransport()) {
  const bridge = createBridgeClient(transport);
  const writes: PreferencesPatch[] = [];
  const timers: (() => void)[] = [];
  const deps = {
    version: WORLD_PREFERENCES_VERSION,
    update: (patch: PreferencesPatch) => { writes.push(patch); return bridge.call("prefs.update", patch); },
    get: () => bridge.call("prefs.get", {}),
    setTimer: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimer: (handle: unknown) => { timers[(handle as number) - 1] = () => {}; },
  };
  const runTimers = () => { const all = timers.splice(0); all.forEach((fn) => fn()); };
  return { transport, bridge, writes, deps, runTimers };
}
async function start(h: ReturnType<typeof harness>, c?: WorldController) {
  const controller = c ?? await idleWorld();
  const sync = new WorldPreferenceSync(controller, h.deps);
  const detach = sync.attach();
  return { controller, sync, detach };
}

test("relaunch restores the saved room, settings and Explore without echoing a save", async () => {
  const h = harness();
  await h.bridge.call("prefs.update", { world: { presentation: "hybrid", floatIntensity: 0.6, lightingPreset: "night", cameraMode: "explore", lastRoomId: "living" } });
  const { controller, sync } = await start(h);
  sync.receive(await h.bridge.call("prefs.get", {}));
  assert.equal(sync.getStatus(), "saved");
  await settle(controller);
  const s = controller.getSnapshot();
  assert.equal(s.room, "living");
  assert.equal(s.mode, "explore");
  assert.deepEqual([s.settings.presentation, s.settings.floatIntensity, s.settings.lightingPreset], ["hybrid", 0.6, "night"]);
  assert.equal(h.writes.length, 0, "restore must not write");
  h.bridge.dispose();
});

test("a saved Project Hub restores settings and camera without moving away from the lastZone pose", async () => {
  const h = harness();
  await h.bridge.call("prefs.update", { world: { lightingPreset: "sunset", cameraMode: "explore" } });
  const { controller, sync } = await start(h);
  const before = controller.capture();
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  assert.equal(controller.getSnapshot().room, "project-hub");
  assert.equal(controller.getSnapshot().mode, "explore");
  assert.equal(controller.getSnapshot().settings.lightingPreset, "sunset");
  assert.deepEqual(controller.capture().position, before.position, "no travel to the Hub introduction");
  assert.equal(h.writes.length, 0);
  h.bridge.dispose();
});

test("an unknown saved room falls back to the Project Hub through the checked controller path", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  const prefs = await h.bridge.call("prefs.get", {});
  sync.receive({ ...prefs, world: { ...prefs.world, lastRoomId: "observatory" } });
  await settle(controller);
  assert.equal(controller.getSnapshot().room, "project-hub");
  assert.equal(h.writes.length, 0);
  h.bridge.dispose();
});

test("user changes write only the changed fields; float intensity is debounced; nothing session-only is sent", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);

  controller.setWorldSettings({ presentation: "floating" });
  for (const v of [0.4, 0.5, 0.6, 0.7]) controller.setWorldSettings({ floatIntensity: v });
  await tick();
  assert.deepEqual(h.writes, [{ world: { presentation: "floating" } }], "float waits for the debounce");
  h.runTimers(); await tick(); await tick();
  assert.deepEqual(h.writes[1], { world: { floatIntensity: 0.7 } }, "one write with the last value");

  controller.setWorldSettings({ reduceMotion: true });
  controller.setRoomOptions({ curtainsOpen: false, chairSlot: "conversation" });
  await tick();
  assert.equal(h.writes.length, 2, "reduceMotion and room options stay session-only");

  controller.setMode("explore"); await tick();
  controller.setMode("inspect"); await tick();
  controller.travel("atrium"); await settle(controller); await tick();
  const sent = h.writes.slice(2).map((w) => w.world);
  assert.deepEqual(sent, [{ cameraMode: "explore" }, { cameraMode: "inspect" }, { lastRoomId: "atrium" }]);
  assert.ok(h.writes.every((w) => !("schemaVersion" in (w.world ?? {})) && (w.world as { cameraMode?: string }).cameraMode !== "cinematic"));

  const stored = (await h.bridge.call("prefs.get", {})).world;
  assert.deepEqual([stored.presentation, stored.floatIntensity, stored.cameraMode, stored.lastRoomId], ["floating", 0.7, "inspect", "atrium"]);
  assert.equal(sync.getStatus(), "saved");
  h.bridge.dispose();
});

test("a debounced change is flushed when the window hides or the page leaves", async () => {
  const h = harness();
  const { controller, sync, detach } = await start(h);
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  controller.setWorldSettings({ floatIntensity: 0.9 });
  assert.equal(h.writes.length, 0);
  detach(); await tick(); await tick();
  assert.deepEqual(h.writes, [{ world: { floatIntensity: 0.9 } }]);
  assert.equal((await h.bridge.call("prefs.get", {})).world.floatIntensity, 0.9);
  h.bridge.dispose();
});

test("a newer stored schema keeps the world session-only and sends nothing", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  const prefs = await h.bridge.call("prefs.get", {});
  sync.receive({ ...prefs, world: { ...prefs.world, schemaVersion: 2, lightingPreset: "night", lastRoomId: "living" } });
  assert.equal(sync.getStatus(), "session");
  await settle(controller);
  assert.equal(controller.getSnapshot().room, "project-hub");
  assert.equal(controller.getSnapshot().settings.lightingPreset, "daylight");
  controller.setWorldSettings({ presentation: "hybrid" }); controller.travel("atrium"); await settle(controller);
  assert.equal(h.writes.length, 0);
  h.bridge.dispose();
});

test("a failed preferences read keeps the world session-only", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  sync.readFailed();
  assert.equal(sync.getStatus(), "session");
  controller.setWorldSettings({ lightingPreset: "night" }); await tick();
  assert.equal(h.writes.length, 0);
  h.bridge.dispose();
});

test("invalid_request reconciles to the host values without saving them back", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  h.transport.failNext("prefs.update", { code: "invalid_request", message: "refused", retryable: false });
  controller.setWorldSettings({ lightingPreset: "night" });
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(controller.getSnapshot().settings.lightingPreset, "daylight", "reconciled to the stored value");
  assert.equal(h.writes.length, 1, "no save-back after reconcile");
  assert.equal(sync.getStatus(), "saved");
  h.bridge.dispose();
});

test("a save failure is reported, and the next successful change marks the world saved again", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  h.transport.failNext("prefs.update", { code: "internal", message: "disk", retryable: true });
  controller.setWorldSettings({ lightingPreset: "night" });
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(sync.getStatus(), "unsaved");
  assert.equal(controller.getSnapshot().settings.lightingPreset, "night", "the session keeps the user's choice");
  controller.setWorldSettings({ presentation: "hybrid" });
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(sync.getStatus(), "saved");
  h.bridge.dispose();
});

test("an external prefs.changed mirrors settings without a save, and is ignored while our write is pending", async () => {
  const h = harness();
  const { controller, sync } = await start(h);
  const prefs = await h.bridge.call("prefs.get", {});
  sync.receive(prefs);
  await settle(controller);
  const external = (world: Partial<Preferences["world"]>): Preferences => ({ ...prefs, world: { ...prefs.world, ...world } });

  sync.receive(external({ lightingPreset: "sunset", presentation: "floating" }));
  assert.equal(controller.getSnapshot().settings.lightingPreset, "sunset");
  assert.equal(h.writes.length, 0, "no echo save");

  controller.setWorldSettings({ floatIntensity: 0.8 }); // debounced, not yet sent
  sync.receive(external({ lightingPreset: "sunset", presentation: "floating", floatIntensity: 0.2 }));
  assert.equal(controller.getSnapshot().settings.floatIntensity, 0.8, "a stale value does not overwrite a pending user change");
  h.runTimers(); for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(h.writes, [{ world: { floatIntensity: 0.8 } }]);
  h.bridge.dispose();
});

test("user navigation before a slow launch read wins over the saved room", async () => {
  const h = harness();
  await h.bridge.call("prefs.update", { world: { lastRoomId: "gaming", lightingPreset: "night" } });
  const { controller, sync } = await start(h);
  sync.navigated(); // e.g. Cmd+3 before prefs.get answered
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  assert.equal(controller.getSnapshot().room, "project-hub", "no late teleport");
  assert.equal(controller.getSnapshot().settings.lightingPreset, "night", "settings still restore");
  assert.equal(h.writes.length, 0);
  h.bridge.dispose();
});

test("a world change made before the read arrives is kept and the room is not restored", async () => {
  const h = harness();
  await h.bridge.call("prefs.update", { world: { lastRoomId: "living", lightingPreset: "night" } });
  const { controller, sync } = await start(h);
  controller.setWorldSettings({ lightingPreset: "sunset" });
  controller.travel("atrium"); await settle(controller);
  sync.receive(await h.bridge.call("prefs.get", {}));
  await settle(controller);
  assert.equal(controller.getSnapshot().room, "atrium");
  assert.equal(controller.getSnapshot().settings.lightingPreset, "sunset");
  h.bridge.dispose();
});

test("restore waits until the startup workspace focus is idle", async () => {
  const h = harness();
  await h.bridge.call("prefs.update", { world: { lastRoomId: "living" } });
  const controller = new WorldController(async () => module);
  controller.focusWorkspace("github"); // still preparing
  const { sync } = await start(h, controller);
  sync.receive(await h.bridge.call("prefs.get", {}));
  assert.notEqual(controller.getSnapshot().pending, "living", "not while the zone focus is in flight");
  await tick(); controller.arrive(controller.getSnapshot().request!.id);
  sync.tryRestore(); await settle(controller);
  assert.equal(controller.getSnapshot().room, "living");
  h.bridge.dispose();
});
