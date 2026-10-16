// Error vocabulary for every bridge response. Native code maps its internal
// errors onto these codes (see AuraError.swift); the frontend switches on
// `code`, never on `message` (messages are for logs and developers).

export const BRIDGE_ERROR_CODES = [
  "invalid_request", // malformed envelope or params failed validation
  "unknown_method", // method not registered on this host
  "unsupported_version", // protocol version mismatch
  "permission_denied", // macOS permission (mic, speech) denied or restricted
  "not_authenticated", // GitHub / provider credentials missing or revoked
  "not_found",
  "rate_limited",
  "network",
  "timeout",
  "cancelled",
  "unavailable", // feature not implemented yet or dependency offline
  "internal",
] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export interface BridgeError {
  code: BridgeErrorCode;
  /** Developer-facing, English, no secrets or tokens. */
  message: string;
  /** True when the same request may succeed if retried later. */
  retryable: boolean;
}

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === "string" && (BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}
