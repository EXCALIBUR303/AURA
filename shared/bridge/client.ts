import {
  BRIDGE_PROTOCOL_VERSION,
  isBridgeEventMessage,
  isBridgeResponse,
} from "../contracts/envelope.ts";
import type { BridgeRequest } from "../contracts/envelope.ts";
import type { BridgeError, BridgeErrorCode } from "../contracts/errors.ts";
import type { BridgeEventName, EventPayload } from "../contracts/events.ts";
import type { BridgeMethod, MethodParams, MethodResult } from "../contracts/methods.ts";
import type { BridgeTransport } from "./transport.ts";

/** Thrown by BridgeClient.call for any failure, including transport faults. */
export class BridgeCallError extends Error {
  readonly code: BridgeErrorCode;
  readonly retryable: boolean;
  readonly method: string;

  constructor(method: string, error: BridgeError) {
    super(`${method}: ${error.message}`);
    this.name = "BridgeCallError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.method = method;
  }
}

export interface BridgeClient {
  readonly transportKind: BridgeTransport["kind"];
  call<M extends BridgeMethod>(method: M, params: MethodParams<M>): Promise<MethodResult<M>>;
  on<E extends BridgeEventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
  dispose(): void;
}

export interface BridgeClientOptions {
  /** Per-call timeout. Streaming work (ai.chat) returns immediately, so this stays short. */
  timeoutMs?: number;
  /** Receives protocol-level problems (bad JSON, unknown events). Defaults to console.warn. */
  onProtocolWarning?: (message: string, detail?: unknown) => void;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `w${Date.now().toString(36)}-${sequence}`;
}

export function createBridgeClient(
  transport: BridgeTransport,
  options: BridgeClientOptions = {},
): BridgeClient {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const warn = options.onProtocolWarning ?? ((message, detail) => console.warn(`[bridge] ${message}`, detail));
  const handlers = new Map<string, Set<(payload: unknown) => void>>();

  const unsubscribe = transport.onEvent((eventJson) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(eventJson);
    } catch (error) {
      warn("dropped unparseable event", error);
      return;
    }
    if (!isBridgeEventMessage(parsed)) {
      warn("dropped malformed event", parsed);
      return;
    }
    const set = handlers.get(parsed.event);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        handler(parsed.payload);
      } catch (error) {
        warn(`event handler for ${parsed.event} threw`, error);
      }
    }
  });

  async function call<M extends BridgeMethod>(method: M, params: MethodParams<M>): Promise<MethodResult<M>> {
    const request: BridgeRequest<M> = { kind: "request", v: BRIDGE_PROTOCOL_VERSION, id: nextId(), method, params };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new BridgeCallError(method, { code: "timeout", message: `no reply after ${timeoutMs}ms`, retryable: true })),
        timeoutMs,
      );
    });

    let replyJson: string;
    try {
      replyJson = await Promise.race([transport.send(JSON.stringify(request)), timeout]);
    } catch (error) {
      if (error instanceof BridgeCallError) throw error;
      throw new BridgeCallError(method, { code: "internal", message: `transport failure: ${String(error)}`, retryable: false });
    } finally {
      clearTimeout(timer);
    }

    let reply: unknown;
    try {
      reply = JSON.parse(replyJson);
    } catch {
      throw new BridgeCallError(method, { code: "internal", message: "reply was not valid JSON", retryable: false });
    }
    if (!isBridgeResponse(reply) || reply.id !== request.id) {
      throw new BridgeCallError(method, { code: "internal", message: "reply envelope mismatch", retryable: false });
    }
    if (!reply.ok) throw new BridgeCallError(method, reply.error);
    return reply.result as MethodResult<M>;
  }

  return {
    transportKind: transport.kind,
    call,
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      const erased = handler as (payload: unknown) => void;
      set.add(erased);
      return () => {
        set.delete(erased);
      };
    },
    dispose() {
      unsubscribe();
      handlers.clear();
    },
  };
}
