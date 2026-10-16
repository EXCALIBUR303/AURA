import { createBridgeClient } from "./client.ts";
import type { BridgeClient, BridgeClientOptions } from "./client.ts";
import { createMockTransport } from "./mock.ts";
import { createNativeTransport, isNativeHostAvailable } from "./transport.ts";

export { BridgeCallError, createBridgeClient } from "./client.ts";
export type { BridgeClient, BridgeClientOptions } from "./client.ts";
export { createMockTransport, DEFAULT_PREFERENCES } from "./mock.ts";
export type { MockTransport, MockTransportOptions } from "./mock.ts";
export { createNativeTransport, isNativeHostAvailable } from "./transport.ts";
export type { BridgeTransport } from "./transport.ts";

export type BridgeMode = "auto" | "native" | "mock";

/**
 * Connects to the native host when running inside the macOS app, otherwise
 * to the in-browser mock. "native" fails loudly instead of silently mocking.
 */
export function connectBridge(mode: BridgeMode = "auto", options?: BridgeClientOptions): BridgeClient {
  const useNative = mode === "native" || (mode === "auto" && isNativeHostAvailable());
  const transport = useNative ? createNativeTransport() : createMockTransport({ latencyMs: 30 });
  return createBridgeClient(transport, options);
}
