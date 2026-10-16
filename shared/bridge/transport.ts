// Transport = how JSON strings move between the web view and the host.
// The client (client.ts) is transport-agnostic so it can run against the
// WebKit host, the in-browser mock, or a test double.

import { BRIDGE_GLOBAL, BRIDGE_HANDLER_NAME } from "../contracts/envelope.ts";

export interface BridgeTransport {
  readonly kind: "native" | "mock";
  /** Sends a serialised BridgeRequest; resolves with a serialised BridgeResponse. */
  send(requestJson: string): Promise<string>;
  /** Subscribes to serialised BridgeEventMessages. Returns an unsubscribe function. */
  onEvent(listener: (eventJson: string) => void): () => void;
}

interface WebKitReplyHandler {
  postMessage(message: string): Promise<unknown>;
}

interface WebKitWindow {
  webkit?: { messageHandlers?: Record<string, WebKitReplyHandler | undefined> };
  [BRIDGE_GLOBAL]?: { dispatch(eventJson: string): void };
}

function webkitHandler(): WebKitReplyHandler | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as WebKitWindow).webkit?.messageHandlers?.[BRIDGE_HANDLER_NAME];
}

export function isNativeHostAvailable(): boolean {
  return webkitHandler() !== undefined;
}

/** Transport backed by WKScriptMessageHandlerWithReply in the macOS app. */
export function createNativeTransport(): BridgeTransport {
  const handler = webkitHandler();
  if (!handler) throw new Error("AURA native bridge is not available in this context");

  const listeners = new Set<(eventJson: string) => void>();
  (window as unknown as WebKitWindow)[BRIDGE_GLOBAL] = {
    dispatch(eventJson: string) {
      for (const listener of listeners) listener(eventJson);
    },
  };

  return {
    kind: "native",
    async send(requestJson) {
      const reply = await handler.postMessage(requestJson);
      if (typeof reply !== "string") throw new Error("Native bridge returned a non-string reply");
      return reply;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
