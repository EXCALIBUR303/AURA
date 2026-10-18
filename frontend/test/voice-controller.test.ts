import assert from "node:assert/strict";
import test from "node:test";
import { createBridgeClient, createMockTransport } from "../../shared/bridge/index.ts";
import { VoiceController } from "../src/companion/voice/VoiceController.ts";
import type { FinalTranscript, VoiceHost } from "../src/companion/voice/VoiceController.ts";
import type { BridgeMethods, VoiceStatus } from "../../shared/contracts/index.ts";

const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await wait(); assert.ok(check()); }
async function setup(options: { granted?: boolean; delayStart?: number; failBind?: boolean; issue?: "no_audio" | "no_speech" } = {}) {
  const mock = createMockTransport({ streamIntervalMs: 3, voiceGranted: options.granted ?? true, voiceIssue: options.issue });
  const bridge = createBridgeClient(mock);
  const conversation = await bridge.call("ai.startConversation", {});
  const calls: string[] = [], finals: FinalTranscript[] = [];
  const host: VoiceHost = { on: bridge.on, call: async <M extends keyof BridgeMethods>(method: M, params: BridgeMethods[M]["params"]) => {
    calls.push(method);
    if (method === "voice.startSession" && options.failBind) throw Object.assign(new Error("Unavailable host fixture"), { code: "unavailable" });
    const result = await bridge.call(method, params);
    if (method === "voice.startListening" && options.delayStart) await wait(options.delayStart);
    return result;
  } };
  const samples = { input: 0, output: 0, phase: "idle" as VoiceStatus["phase"] };
  const controller = new VoiceController(host, samples);
  const config = { conversationId: conversation.conversationId, visible: true, enabled: true, canTalk: true, prepare: async () => conversation, final: (value: FinalTranscript) => { finals.push(value); }, cleared: () => {}, expand: () => {} };
  const unmount = controller.mount(); controller.configure(config);
  await until(() => !controller.snapshot().loading); controller.configure(config); await wait();
  return { mock, bridge, controller, config, calls, finals, samples, unmount, close: () => { unmount(); } };
}

test("voice initial revision 0 reconciles without capture or permission requests", async () => {
  const s = await setup({ granted: false });
  try {
    assert.equal(s.controller.snapshot().status?.phase, "needs_permission");
    assert.ok(!s.calls.includes("voice.startListening")); assert.ok(!s.calls.includes("voice.requestPermissions"));
    await s.controller.start(); assert.equal(s.controller.snapshot().permission, true);
    await s.controller.requestPermissions(); assert.equal(s.controller.snapshot().status?.microphone, "granted");
    assert.ok(!s.calls.includes("voice.startListening"));
  } finally { s.close(); }
});
test("final text delivered before a delayed start reply is claimed once", async () => {
  const s = await setup({ delayStart: 80 });
  try {
    await s.controller.start(); await until(() => s.finals.length === 1);
    assert.equal(s.finals[0]?.text, "mock transcript complete");
    const status = s.controller.snapshot().status!;
    s.mock.emit("voice.transcript", { utteranceId: status.utteranceId!, seq: 50, text: "late duplicate", isFinal: true });
    assert.equal(s.finals.length, 1); assert.equal(s.controller.snapshot().status?.phase, "idle");
  } finally { s.close(); }
});
test("stale revisions, foreign utterances and older transcript seq are ignored", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); await until(() => s.controller.snapshot().status?.phase === "listening");
    const status = s.controller.snapshot().status!;
    s.mock.emit("voice.statusChanged", { ...status, revision: status.revision - 1, phase: "error" });
    assert.equal(s.controller.snapshot().status?.phase, "listening");
    s.mock.emit("voice.transcript", { utteranceId: status.utteranceId!, seq: 10, text: "newer", isFinal: false });
    s.mock.emit("voice.transcript", { utteranceId: status.utteranceId!, seq: 9, text: "older", isFinal: false });
    s.mock.emit("voice.transcript", { utteranceId: "old-run", seq: 99, text: "foreign", isFinal: true });
    assert.equal(s.controller.snapshot().partial, "newer"); assert.equal(s.finals.length, 0);
  } finally { s.close(); }
});
test("release while start is pending finalises that same run", async () => {
  const s = await setup({ delayStart: 80 });
  try {
    const starting = s.controller.start("push_to_talk"); await wait(10); await s.controller.finish(); await starting;
    await until(() => s.finals.length === 1);
    assert.equal(s.calls.filter((method) => method === "voice.startListening").length, 1);
    assert.equal(s.calls.filter((method) => method === "voice.stopListening").length, 1);
  } finally { s.close(); }
});
test("cancel during a pending start rejects late final text and resets meters", async () => {
  const s = await setup({ delayStart: 80 });
  try {
    const starting = s.controller.start("push_to_talk"); await wait(10); const id = s.controller.snapshot().status?.utteranceId;
    await s.controller.cancel(); await starting;
    s.mock.emit("voice.transcript", { utteranceId: id!, seq: 99, text: "must not submit", isFinal: true });
    assert.equal(s.finals.length, 0); assert.equal(s.samples.input, 0); assert.equal(s.controller.snapshot().status?.listening, false);
  } finally { s.close(); }
});
test("conversation replacement invalidates an old utterance immediately", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); const status = s.controller.snapshot().status!;
    const next = await s.bridge.call("ai.startConversation", {});
    s.controller.configure({ ...s.config, conversationId: next.conversationId, prepare: async () => next });
    s.mock.emit("voice.transcript", { utteranceId: status.utteranceId!, seq: 99, text: "old conversation", isFinal: true });
    await wait(); assert.equal(s.finals.length, 0); assert.equal(s.controller.snapshot().status?.conversationId, next.conversationId);
  } finally { s.close(); }
});
test("End voice remains ended across ordinary renders and hides discard late finals", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); await s.controller.end();
    const binds = s.calls.filter((method) => method === "voice.startSession").length;
    s.controller.configure({ ...s.config }); await wait();
    assert.equal(s.calls.filter((method) => method === "voice.startSession").length, binds);
    await s.controller.start("push_to_talk"); const id = s.controller.snapshot().status?.utteranceId;
    s.controller.configure({ ...s.config, visible: false });
    s.mock.emit("voice.transcript", { utteranceId: id!, seq: 99, text: "hidden", isFinal: true });
    await wait(); assert.equal(s.finals.length, 0); assert.equal(s.controller.snapshot().status?.sessionActive, false);
  } finally { s.close(); }
});
test("native levels update only local subscribers and are gated by phase and utterance", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); await until(() => s.controller.snapshot().status?.phase === "listening");
    let views = 0, levels = 0; const off = s.controller.subscribe(() => views++), meterOff = s.controller.subscribeLevels(() => levels++);
    const id = s.controller.snapshot().status!.utteranceId!;
    s.mock.emit("voice.inputLevel", { utteranceId: id, level: 2 }); assert.equal(s.samples.input, 1);
    s.mock.emit("voice.inputLevel", { utteranceId: "old", level: 0 }); assert.equal(s.samples.input, 1);
    s.mock.emit("voice.speechLevel", { level: 1 }); assert.equal(s.samples.output, 0);
    assert.equal(views, 0); assert.equal(levels, 1); off(); meterOff(); await s.controller.cancel();
    s.mock.emit("voice.inputLevel", { utteranceId: id, level: 1 }); assert.equal(s.samples.input, 0);
  } finally { s.close(); }
});
test("captions match current speech and never regress to a finished segment", async () => {
  const s = await setup();
  try {
    await s.bridge.call("voice.speak", { text: "One. Two." });
    const status = s.controller.snapshot().status!;
    s.mock.emit("voice.speechProgress", { speechId: status.speechId!, streamId: null, segment: 20, text: "Current", state: "started" });
    assert.equal(s.controller.snapshot().caption, "Current");
    s.mock.emit("voice.speechProgress", { speechId: "old", streamId: null, segment: 30, text: "Old speech", state: "started" });
    s.mock.emit("voice.speechProgress", { speechId: status.speechId!, streamId: null, segment: 19, text: "Old segment", state: "started" });
    assert.equal(s.controller.snapshot().caption, "Current");
    s.mock.emit("voice.speechProgress", { speechId: status.speechId!, streamId: null, segment: 20, text: "Current", state: "finished" });
    s.mock.emit("voice.speechProgress", { speechId: status.speechId!, streamId: null, segment: 20, text: "Duplicate", state: "started" });
    assert.equal(s.controller.snapshot().caption, ""); await s.controller.stopSpeaking(); assert.equal(s.samples.output, 0);
  } finally { s.close(); }
});
test("blocked conversation and native-unavailable capabilities never start listening", async () => {
  const s = await setup();
  try {
    s.controller.configure({ ...s.config, canTalk: false }); await s.controller.start();
    assert.equal(s.calls.filter((m) => m === "voice.startListening").length, 0);
    const cap = s.controller.snapshot().capabilities!;
    s.mock.emit("voice.capabilitiesChanged", { ...cap, recognition: "unavailable", engine: "none" });
    s.controller.configure(s.config); await s.controller.start();
    assert.equal(s.calls.filter((m) => m === "voice.startListening").length, 0);
  } finally { s.close(); }
});
test("no audio and no speech retain truthful native issues with no automatic retry", async () => {
  for (const issue of ["no_audio", "no_speech"] as const) {
    const s = await setup({ issue });
    try {
      await s.controller.start(); await until(() => s.controller.snapshot().status?.issue?.code === issue);
      assert.equal(s.calls.filter((m) => m === "voice.startListening").length, 1); assert.equal(s.finals.length, 0); assert.equal(s.samples.input, 0);
    } finally { s.close(); }
  }
});
test("source approval events are never answered by transcript or voice actions", async () => {
  const s = await setup();
  try {
    s.controller.configure({ ...s.config, canTalk: false }); await s.controller.start();
    assert.ok(!s.calls.includes("ai.respondToApproval")); assert.ok(!s.calls.includes("ai.sendMessage"));
  } finally { s.close(); }
});
test("StrictMode teardown is ordered before the next session bind", async () => {
  const s = await setup();
  try {
    s.unmount(); const unmount = s.controller.mount(); s.controller.configure(s.config); await wait(20);
    assert.equal(s.controller.snapshot().status?.sessionActive, true);
    const tail = s.calls.slice(s.calls.lastIndexOf("voice.endSession"));
    assert.ok(tail.includes("voice.startSession")); unmount();
  } finally { s.close(); }
});
test("inactive window cancels capture and suppresses late levels and finals", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); const id = s.controller.snapshot().status?.utteranceId;
    s.mock.emit("app.windowStateChanged", { active: false, visible: true });
    s.mock.emit("voice.inputLevel", { utteranceId: id!, level: 1 });
    s.mock.emit("voice.transcript", { utteranceId: id!, seq: 99, text: "inactive", isFinal: true });
    await wait(); assert.equal(s.finals.length, 0); assert.equal(s.samples.input, 0);
    const count = s.calls.filter((m) => m === "voice.startListening").length; await s.controller.start();
    assert.equal(s.calls.filter((m) => m === "voice.startListening").length, count);
  } finally { s.close(); }
});
test("denied/restricted permissions are not prompted again by a Talk shortcut", async () => {
  const s = await setup();
  try {
    const status = s.controller.snapshot().status!;
    s.mock.emit("voice.statusChanged", { ...status, revision: status.revision + 10, microphone: "denied", phase: "needs_permission" });
    await s.controller.start("push_to_talk");
    assert.equal(s.controller.snapshot().permission, false); assert.ok(!s.calls.includes("voice.requestPermissions")); assert.ok(!s.calls.includes("voice.startListening"));
  } finally { s.close(); }
});
test("cancel suppresses late input levels even if native cancellation is delayed", async () => {
  const s = await setup();
  try {
    await s.controller.start("push_to_talk"); await until(() => s.controller.snapshot().status?.phase === "listening");
    const previous = s.controller.snapshot().status!;
    await s.controller.cancel();
    // A higher status cannot turn an explicitly discarded utterance back into a send intent.
    s.mock.emit("voice.statusChanged", { ...previous, revision: previous.revision + 100 });
    s.controller.configure(s.config);
    s.mock.emit("voice.inputLevel", { utteranceId: previous.utteranceId!, level: 1 });
    assert.equal(s.samples.input, 0);
    s.mock.emit("voice.transcript", { utteranceId: previous.utteranceId!, seq: 99, text: "discarded", isFinal: true });
    assert.equal(s.finals.length, 0);
  } finally { s.close(); }
});
test("reload adopts only the host utterance bound to the restored conversation", async () => {
  const s = await setup();
  try {
    s.unmount(); await wait();
    await s.bridge.call("voice.startSession", { conversationId: s.config.conversationId });
    await s.bridge.call("voice.startListening", { mode: "push_to_talk" }); await wait(10);
    const controller = new VoiceController(s.bridge, s.samples);
    const unmount = controller.mount(); controller.configure({ ...s.config, conversationId: null });
    await until(() => !controller.snapshot().loading); controller.configure(s.config);
    await controller.finish(); await until(() => s.finals.length === 1);
    assert.equal(s.finals[0]?.text, "mock transcript complete"); unmount();
  } finally { s.close(); }
});
test("automatic binding failure waits for explicit action instead of retrying on every render", async () => {
  const s = await setup({ failBind: true });
  try {
    for (let i = 0; i < 5; i++) { s.controller.configure(s.config); await wait(); }
    assert.equal(s.calls.filter((m) => m === "voice.startSession").length, 1);
    assert.ok(s.controller.snapshot().issue.includes("unavailable"));
    await s.controller.start();
    assert.equal(s.calls.filter((m) => m === "voice.startSession").length, 2);
    assert.equal(s.calls.filter((m) => m === "voice.startListening").length, 0);
  } finally { s.close(); }
});

test("pause, resume and replay call the host and follow its status", async () => {
  const s = await setup();
  try {
    await s.controller.preview("One. Two. Three. Four.");
    await until(() => !!s.controller.snapshot().status?.speaking);
    await s.controller.pauseSpeaking();
    assert.equal(s.controller.snapshot().status?.speechPaused, true); assert.equal(s.samples.output, 0);
    await s.controller.resumeSpeaking();
    assert.equal(s.controller.snapshot().status?.speechPaused, false);
    await s.controller.stopSpeaking();
    await until(() => !!s.controller.snapshot().status?.canReplay);
    await s.controller.replay();
    await until(() => !!s.controller.snapshot().status?.speaking);
    assert.deepEqual(s.calls.filter((call) => ["voice.speak", "voice.pauseSpeaking", "voice.resumeSpeaking", "voice.replay"].includes(call)), ["voice.speak", "voice.pauseSpeaking", "voice.resumeSpeaking", "voice.replay"]);
    assert.equal(s.calls.includes("ai.sendMessage"), false);
    await s.controller.stopSpeaking();
  } finally { s.close(); }
});
