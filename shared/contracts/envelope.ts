// Wire format. All messages are JSON strings:
//   web → native : webkit.messageHandlers.aura.postMessage(JSON.stringify(BridgeRequest))
//                  resolves with JSON.stringify(BridgeResponse)
//   native → web : window.__AURA_BRIDGE__.dispatch(JSON.stringify(BridgeEventMessage))

import type { BridgeError } from "./errors.ts";
import { isBridgeErrorCode } from "./errors.ts";
import type { BridgeMethod, MethodParams, MethodResult } from "./methods.ts";
import type { BridgeEventName, EventPayload } from "./events.ts";

export const BRIDGE_PROTOCOL_VERSION = 1;
/** WKScriptMessageHandler name registered by the native host. */
export const BRIDGE_HANDLER_NAME = "aura";
/** Global the native host calls to deliver events. */
export const BRIDGE_GLOBAL = "__AURA_BRIDGE__";

export interface BridgeRequest<M extends BridgeMethod = BridgeMethod> {
  kind: "request";
  v: number;
  id: string;
  method: M;
  params: MethodParams<M>;
}

export type BridgeResponse<M extends BridgeMethod = BridgeMethod> =
  | { kind: "response"; v: number; id: string; ok: true; result: MethodResult<M> }
  | { kind: "response"; v: number; id: string; ok: false; error: BridgeError };

export interface BridgeEventMessage<E extends BridgeEventName = BridgeEventName> {
  kind: "event";
  v: number;
  event: E;
  payload: EventPayload<E>;
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEventMessage;

// Structural guards for data crossing the boundary. They check the envelope,
// not every payload field; payloads are produced by typed code on both sides
// and verified against shared/fixtures in tests.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBridgeResponse(value: unknown): value is BridgeResponse {
  if (!isObject(value) || value.kind !== "response") return false;
  if (typeof value.v !== "number" || typeof value.id !== "string") return false;
  if (value.ok === true) return "result" in value;
  if (value.ok === false) {
    const error = value.error;
    return isObject(error) && isBridgeErrorCode(error.code) && typeof error.message === "string";
  }
  return false;
}

export function isBridgeEventMessage(value: unknown): value is BridgeEventMessage {
  return (
    isObject(value) &&
    value.kind === "event" &&
    typeof value.v === "number" &&
    typeof value.event === "string" &&
    "payload" in value
  );
}
