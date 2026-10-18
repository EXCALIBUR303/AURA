// Run with: node --test shared/test/   (Node ≥ 23 strips TypeScript types natively)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BRIDGE_ERROR_CODES,
  BRIDGE_PROTOCOL_VERSION,
  ZONE_IDS,
  isBridgeEventMessage,
  isBridgeResponse,
} from "../contracts/index.ts";
import { BridgeCallError, createBridgeClient, createMockTransport } from "../bridge/index.ts";

const fixtures = JSON.parse(readFileSync(new URL("../fixtures/bridge-messages.json", import.meta.url), "utf8")) as {
  valid: { name: string; message: { kind: string } }[];
};

test("fixtures: every response and event passes the envelope guards", () => {
  for (const { name, message } of fixtures.valid) {
    if (message.kind === "response") assert.ok(isBridgeResponse(message), name);
    if (message.kind === "event") assert.ok(isBridgeEventMessage(message), name);
  }
});

test("constants are stable", () => {
  assert.equal(BRIDGE_PROTOCOL_VERSION, 1);
  assert.deepEqual([...ZONE_IDS], ["studio", "hardware", "software", "ai-lab", "github", "companion"]);
  assert.ok(BRIDGE_ERROR_CODES.includes("unknown_method"));
});

test("client round-trips a call through the mock transport", async () => {
  const bridge = createBridgeClient(createMockTransport());
  const info = await bridge.call("app.getInfo", {});
  assert.equal(info.host, "web-dev");
  assert.equal(info.bridgeVersion, BRIDGE_PROTOCOL_VERSION);

  const prefs = await bridge.call("prefs.update", { lastZone: "github", graphics: { quality: "low" } });
  assert.equal(prefs.lastZone, "github");
  assert.equal(prefs.graphics.quality, "low");
  assert.equal(prefs.graphics.maxPixelRatio, 2, "nested patch merges, not replaces");
  bridge.dispose();
});

test("errors surface as BridgeCallError with a code", async () => {
  const transport = createMockTransport();
  const bridge = createBridgeClient(transport);
  transport.failNext("github.listRepositories", { code: "rate_limited", message: "slow down", retryable: true });
  await assert.rejects(bridge.call("github.listRepositories", {}), (error: unknown) => {
    assert.ok(error instanceof BridgeCallError);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.retryable, true);
    return true;
  });
  await assert.rejects(bridge.call("github.listCommits", { fullName: "nobody/nothing" }), { code: "not_found" });
  bridge.dispose();
});

test("timeouts reject with code=timeout", async () => {
  const bridge = createBridgeClient(
    { kind: "mock", send: () => new Promise(() => {}), onEvent: () => () => {} },
    { timeoutMs: 20 },
  );
  await assert.rejects(bridge.call("app.getInfo", {}), { code: "timeout" });
});

test("malformed replies are rejected, not trusted", async () => {
  const bridge = createBridgeClient({ kind: "mock", send: async () => '{"kind":"response"}', onEvent: () => () => {} });
  await assert.rejects(bridge.call("app.getInfo", {}), { code: "internal" });
});

test("ai.chat streams chunks then done", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 1 }));
  const chunks: string[] = [];
  const done = new Promise<string>((resolve) => {
    bridge.on("ai.done", ({ finishReason }) => resolve(finishReason));
  });
  bridge.on("ai.chunk", ({ delta }) => chunks.push(delta));
  const { streamId } = await bridge.call("ai.chat", { messages: [{ role: "user", content: "ping" }] });
  assert.match(streamId, /^mock-stream-/);
  assert.equal(await done, "stop");
  assert.equal(chunks.join(""), "[mock] You said: ping");
  bridge.dispose();
});

test("malformed events are dropped and reported; valid ones are delivered", () => {
  let push: (json: string) => void = () => {};
  const bridge = createBridgeClient(
    { kind: "mock", send: async () => "", onEvent: (listener) => ((push = listener), () => {}) },
    { onProtocolWarning: (message) => warnings.push(message) },
  );
  const warnings: string[] = [];
  const received: boolean[] = [];
  bridge.on("app.windowStateChanged", ({ active }) => received.push(active));

  push("{not json");
  push(JSON.stringify({ kind: "event", event: "app.windowStateChanged" }));
  push(JSON.stringify({ kind: "event", v: 1, event: "app.windowStateChanged", payload: { active: true, visible: true } }));

  assert.deepEqual(warnings, ["dropped unparseable event", "dropped malformed event"]);
  assert.deepEqual(received, [true]);
  bridge.dispose();
});

test("mock GitHub walks disconnect → authorizing → connected and reports it as events", async () => {
  const bridge = createBridgeClient(createMockTransport({ githubApprovalMs: 5 }));
  const states: string[] = [];
  bridge.on("github.authChanged", (status) => states.push(status.state));

  assert.equal((await bridge.call("github.getAuthStatus", {})).state, "connected");
  assert.equal((await bridge.call("github.disconnect", {})).state, "disconnected");
  await assert.rejects(bridge.call("github.listRepositories", {}), { code: "not_authenticated" });

  const authorizing = await bridge.call("github.connect", {});
  assert.equal(authorizing.state, "authorizing");
  if (authorizing.state === "authorizing") assert.equal(authorizing.userCode, "MOCK-0000");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(states, ["disconnected", "authorizing", "connected"]);

  const page = await bridge.call("github.listRepositories", { perPage: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, "offset:2");
  const rest = await bridge.call("github.listRepositories", { cursor: page.nextCursor ?? undefined, perPage: 2 });
  assert.equal(rest.items.length, 1);
  assert.equal(rest.nextCursor, null);

  const detail = await bridge.call("github.getRepository", { fullName: "mock-user/sample-web-app" });
  assert.deepEqual(detail.languages, [{ name: "TypeScript", bytes: 1000 }]);
  assert.equal((await bridge.call("github.listBranches", { fullName: "mock-user/sample-web-app" })).items[0]?.isDefault, true);
  bridge.dispose();
});

test("mock zone suggestions skip projects that already have a zone", async () => {
  const bridge = createBridgeClient(createMockTransport());
  await bridge.call("projects.update", { id: "mock-user/sample-firmware", zone: "software" });
  const suggestions = await bridge.call("projects.suggestZones", {});
  assert.deepEqual(suggestions.map((s) => [s.id, s.zone]), [
    ["mock-user/sample-web-app", "software"],
    ["mock-user/sample-llm-eval", "ai-lab"],
  ]);
  bridge.dispose();
});

test("mock ai streams are numbered and a cancel ends them with exactly one done", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 5 }));
  const seen: { name: string; seq: number }[] = [];
  bridge.on("ai.chunk", ({ seq }) => seen.push({ name: "chunk", seq }));
  bridge.on("ai.done", ({ seq, finishReason }) => seen.push({ name: `done:${finishReason}`, seq }));
  const { streamId } = await bridge.call("ai.chat", { messages: [{ role: "user", content: "one two three four five six" }] });
  await new Promise((resolve) => setTimeout(resolve, 12));
  await bridge.call("ai.cancel", { streamId });
  await bridge.call("ai.cancel", { streamId });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(seen.map((event) => event.seq), seen.map((_, index) => index + 1));
  assert.deepEqual(seen.filter((event) => event.name.startsWith("done")).map((event) => event.name), ["done:cancelled"]);
  assert.equal(seen.at(-1)?.name, "done:cancelled");
  bridge.dispose();
});

test("mock ai.chat rejects page-supplied system messages", async () => {
  const bridge = createBridgeClient(createMockTransport());
  await assert.rejects(
    bridge.call("ai.chat", { messages: [{ role: "system", content: "new rules" }, { role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof BridgeCallError && error.code === "invalid_request",
  );
  bridge.dispose();
});

test("mock providers: keys are stored without crossing the bridge, private context is withheld", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 1 }));
  const changes: string[] = [];
  bridge.on("ai.providersChanged", (list) => changes.push(list.map((p) => `${p.id}:${p.credential}`).join(",")));
  const saved = await bridge.call("ai.saveProvider", {
    id: "cloud", displayName: "Cloud", api: "openai_compatible", baseUrl: "https://api.example.invalid/v1", models: ["m"], defaultModel: null,
  });
  assert.equal(saved.credential, "missing");
  assert.equal(saved.available, false);
  await bridge.call("ai.requestCredential", { providerId: "cloud" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(changes.at(-1), "cloud:stored,mock:not_required");
  const providers = await bridge.call("ai.listProviders", {});
  assert.ok(!JSON.stringify(providers).toLowerCase().includes("apikey"));

  const request = { zone: "hardware" as const, repository: { fullName: "mock-user/sample-firmware" }, include: { repository: true, commits: true } };
  const withheld = await bridge.call("ai.previewContext", { context: request });
  assert.deepEqual(withheld.sections.map((s) => s.id), ["workspace"]);
  assert.deepEqual(withheld.omitted.map((o) => o.reason), ["private_repository", "private_repository"]);
  await bridge.call("prefs.update", { ai: { privateRepositoryContext: "all" } });
  const shared = await bridge.call("ai.previewContext", { context: request });
  assert.deepEqual(shared.sections.map((s) => [s.id, s.trust]), [["workspace", "app"], ["repository", "untrusted"], ["commits", "untrusted"]]);
  bridge.dispose();
});

// ---------------------------------------------------------------- Phase 3C-B conversations

import { applyReplyEvent, newReply } from "../bridge/index.ts";
import type { ReplyEvent, ReplyView } from "../bridge/index.ts";

type Bridge = ReturnType<typeof createBridgeClient>;

/** Collects one reply's events (in arrival order) and its folded view. */
function track(bridge: Bridge, streamId: () => string | undefined) {
  const events: ReplyEvent[] = [];
  const names = ["ai.turnState", "ai.chunk", "ai.toolActivity", "ai.approvalRequested", "ai.done", "ai.error"] as const;
  const offs = names.map((name) => bridge.on(name, (payload) => {
    if (payload.streamId === streamId()) events.push({ name, payload } as ReplyEvent);
  }));
  return {
    events,
    view: (): ReplyView => events.reduce(applyReplyEvent, newReply(streamId() ?? "")),
    stop: () => offs.forEach((off) => off()),
  };
}

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 400 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), "condition not reached");
};

test("mock conversation: one seq per reply, explicit states, tool activity, history", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 1 }));
  const conversation = await bridge.call("ai.startConversation", { repository: { fullName: "mock-user/sample-web-app" } });
  assert.equal(conversation.repository?.isPrivate, false);
  assert.equal(conversation.toolsEnabled, true);
  let id: string | undefined;
  const reply = track(bridge, () => id);
  ({ streamId: id } = await bridge.call("ai.sendMessage", { conversationId: conversation.conversationId, text: "Summarise it", context: { zone: "software", include: { readme: true } } }));
  await until(() => reply.view().ended);

  const view = reply.view();
  assert.equal(view.gap, false);
  assert.deepEqual(reply.events.map((e) => e.payload.seq), reply.events.map((_, i) => i + 1));
  assert.equal(view.state, "completed");
  assert.equal(view.finishReason, "stop");
  assert.match(view.text, /Read README\.md\. \[mock\] You said: Summarise it/);
  assert.deepEqual(view.tools.map((t) => [t.tool, t.status]), [["read_repository_file", "succeeded"]]);
  const states = reply.events.flatMap((e) => (e.name === "ai.turnState" ? [e.payload.state] : []));
  assert.deepEqual(states, ["preparing_context", "requesting", "waiting_for_tool", "requesting", "streaming", "completed"]);

  // Duplicates and late events change nothing.
  const replayed = [...reply.events, ...reply.events].reduce(applyReplyEvent, newReply(id ?? ""));
  assert.equal(replayed.text, view.text);
  assert.equal(replayed.tools.length, 1);

  await assert.rejects(
    bridge.call("ai.sendMessage", { conversationId: conversation.conversationId, text: "x", context: { repository: { fullName: "mock-user/sample-firmware" } } as never }),
    (error: unknown) => error instanceof BridgeCallError && error.code === "invalid_request",
  );
  const detail = await bridge.call("ai.getConversation", { conversationId: conversation.conversationId });
  assert.equal(detail.turns.length, 1);
  assert.ok(detail.turns[0]?.sources.some((s) => s.path === "README.md"));
  const files = await bridge.call("github.listFiles", { fullName: "mock-user/sample-web-app", path: "src" });
  assert.deepEqual(files.entries.map((e) => e.path), ["src/index.ts"]);
  reply.stop();
  bridge.dispose();
});

test("mock conversation: private source to a cloud provider waits for approval; cancel ends once", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 1 }));
  await bridge.call("prefs.update", { ai: { privateRepositoryContext: "all" } });
  await bridge.call("ai.saveProvider", { id: "cloud", displayName: "Cloud", api: "openai_compatible", baseUrl: "https://api.example.invalid/v1", models: ["m"], defaultModel: null });
  await bridge.call("ai.requestCredential", { providerId: "cloud" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const conversation = await bridge.call("ai.startConversation", { providerId: "cloud", repository: { fullName: "mock-user/sample-firmware" } });

  let id: string | undefined;
  const reply = track(bridge, () => id);
  ({ streamId: id } = await bridge.call("ai.sendMessage", { conversationId: conversation.conversationId, text: "What does it do?" }));
  await until(() => reply.view().approval !== null);
  const pending = reply.view();
  assert.equal(pending.state, "waiting_for_approval");
  assert.equal(pending.approval?.kind, "share_private_source");
  assert.deepEqual(pending.approval?.paths, ["README.md"]);
  await bridge.call("ai.respondToApproval", { conversationId: conversation.conversationId, approvalId: pending.approval?.approvalId ?? "", decision: "allow_for_conversation" });
  await until(() => reply.view().ended);
  assert.equal(reply.view().tools.at(-1)?.status, "succeeded");
  const info = (await bridge.call("ai.getConversation", { conversationId: conversation.conversationId })).conversation;
  assert.deepEqual(info.sourceSharingAllowed, ["mock-user/sample-firmware"]);
  assert.equal(info.carriesPrivateContext, true);
  reply.stop();

  let second: string | undefined;
  const cancelled = track(bridge, () => second);
  ({ streamId: second } = await bridge.call("ai.sendMessage", { conversationId: conversation.conversationId, text: "again" }));
  await bridge.call("ai.cancel", { streamId: second });
  await until(() => cancelled.view().ended);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cancelled.view().finishReason, "cancelled");
  assert.equal(cancelled.events.filter((e) => e.name === "ai.done").length, 1);
  assert.equal(cancelled.events.at(-1)?.name, "ai.done");

  const preview = await bridge.call("ai.previewContext", { context: { files: [{ path: "src/main.c" }] }, conversationId: conversation.conversationId });
  assert.deepEqual(preview.sections.map((s) => s.title), ["File src/main.c lines 1–7"]); // allowed for this conversation
  const fresh = await bridge.call("ai.resetConversation", { conversationId: conversation.conversationId });
  assert.deepEqual(fresh.sourceSharingAllowed, []);
  const withheld = await bridge.call("ai.previewContext", { context: { files: [{ path: "src/main.c" }] }, conversationId: conversation.conversationId });
  assert.deepEqual(withheld.omitted, [{ section: "file", reason: "consent_required", path: "src/main.c" }]);
  cancelled.stop();
  bridge.dispose();
});

test("reply folding detects gaps and ignores other streams", () => {
  const chunk = (seq: number, delta: string, streamId = "s"): ReplyEvent => ({ name: "ai.chunk", payload: { streamId, seq, delta } });
  let view = newReply("s");
  view = applyReplyEvent(view, chunk(1, "a"));
  view = applyReplyEvent(view, chunk(1, "a"));
  view = applyReplyEvent(view, chunk(2, "b", "other"));
  assert.equal(view.text, "a");
  assert.equal(view.gap, false);
  view = applyReplyEvent(view, chunk(3, "c"));
  assert.equal(view.text, "ac");
  assert.equal(view.gap, true);
  view = applyReplyEvent(view, { name: "ai.error", payload: { streamId: "s", seq: 4, error: { code: "network", message: "x", retryable: true } } });
  assert.equal(view.state, "error");
  assert.equal(applyReplyEvent(view, chunk(5, "late")), view);
});

test("mock voice: permission, live transcript, one final, revisions only increase", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 2 }));
  const revisions: number[] = [];
  const transcripts: { text: string; isFinal: boolean }[] = [];
  bridge.on("voice.statusChanged", ({ revision }) => revisions.push(revision));
  bridge.on("voice.transcript", ({ text, isFinal }) => transcripts.push({ text, isFinal }));
  assert.equal((await bridge.call("voice.getStatus", {})).phase, "needs_permission");
  await assert.rejects(bridge.call("voice.startListening", {}), (error: unknown) => error instanceof BridgeCallError && error.code === "permission_denied");
  const granted = await bridge.call("voice.requestPermissions", {});
  assert.equal(granted.microphone, "granted");
  assert.equal(granted.speechRecognition, "not_determined");
  assert.equal((await bridge.call("voice.getCapabilities", {})).handsFreeBargeIn, false);
  await bridge.call("voice.startListening", { mode: "auto_end" });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(transcripts.map((t) => t.isFinal), [false, true]);
  assert.equal((await bridge.call("voice.getStatus", {})).phase, "idle");
  assert.deepEqual(revisions, revisions.map((_, index) => revisions[0] + index));
  bridge.dispose();
});

test("mock voice: an issue scenario ends listening with recovery options", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 2, voiceGranted: true, voiceIssue: "no_audio" }));
  await bridge.call("voice.startListening", { mode: "push_to_talk" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const status = await bridge.call("voice.getStatus", {});
  assert.equal(status.phase, "error");
  assert.deepEqual(status.issue?.recovery, ["retry", "choose_input"]);
  bridge.dispose();
});

test("mock voice: pause holds speech, resume continues, replay repeats the last speech until its conversation resets", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 2, voiceGranted: true }));
  const progress: string[] = [];
  bridge.on("voice.speechProgress", ({ text, state }) => progress.push(`${state}:${text}`));
  await assert.rejects(bridge.call("voice.replay", {}), (error: unknown) => error instanceof BridgeCallError && error.code === "not_found");
  const { conversationId } = await bridge.call("ai.startConversation", {});
  const { streamId } = await bridge.call("ai.sendMessage", { conversationId, text: "One. Two." });
  for (let i = 0; i < 400 && !(await bridge.call("ai.getConversation", { conversationId })).turns.at(-1)?.finishReason; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await bridge.call("voice.speakReply", { conversationId, streamId });
  for (let i = 0; i < 200 && (await bridge.call("voice.getStatus", {})).phase !== "speaking"; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  const paused = await bridge.call("voice.pauseSpeaking", {});
  assert.equal(paused.speechPaused, true); assert.equal(paused.speaking, true);
  const heard = progress.length;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(progress.length, heard, "nothing advances while paused");
  assert.equal((await bridge.call("voice.resumeSpeaking", {})).speechPaused, false);
  for (let i = 0; i < 400 && (await bridge.call("voice.getStatus", {})).speaking; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await bridge.call("voice.getStatus", {})).canReplay, true);
  const before = progress.length;
  await bridge.call("voice.replay", {});
  for (let i = 0; i < 400 && (await bridge.call("voice.getStatus", {})).speaking; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(progress.length > before);
  await bridge.call("ai.resetConversation", { conversationId });
  assert.equal((await bridge.call("voice.getStatus", {})).canReplay, false);
  bridge.dispose();
});

test("mock voice: a reply is spoken sentence by sentence and can be stopped", async () => {
  const bridge = createBridgeClient(createMockTransport({ streamIntervalMs: 2, voiceGranted: true }));
  const progress: string[] = [];
  bridge.on("voice.speechProgress", ({ segment, state }) => progress.push(`${segment}:${state}`));
  const { conversationId } = await bridge.call("ai.startConversation", {});
  const { streamId } = await bridge.call("ai.sendMessage", { conversationId, text: "Hello there. How are you?" });
  const speaking = await bridge.call("voice.speakReply", { conversationId, streamId });
  assert.equal(speaking.speakingStreamId, streamId);
  for (let i = 0; i < 200 && (await bridge.call("voice.getStatus", {})).speaking; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(progress.length >= 2 && progress[0] === "0:started");
  assert.equal(progress.at(-1)?.endsWith(":finished"), true);
  await bridge.call("voice.speak", { text: "One. Two. Three." });
  await bridge.call("voice.stopSpeaking", {});
  assert.equal((await bridge.call("voice.getStatus", {})).speaking, false);
  bridge.dispose();
});
