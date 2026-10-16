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
