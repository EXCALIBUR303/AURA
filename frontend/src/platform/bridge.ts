// Owned by Claude Code (native integration). Frontend code imports `bridge`
// and `useBridgeEvent` from here instead of calling connectBridge itself.

import { useEffect, useRef, useState } from "react";
import { applyReplyEvent, connectBridge, newReply } from "@aura/bridge";
import type { ReplyEvent, ReplyView } from "@aura/bridge";
import type { BridgeEventName, EventPayload } from "@aura/contracts";

export const bridge = connectBridge(import.meta.env.VITE_AURA_BRIDGE ?? "auto");

/** Subscribes to a native event for the lifetime of the component. */
export function useBridgeEvent<E extends BridgeEventName>(event: E, handler: (payload: EventPayload<E>) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => bridge.on(event, (payload) => latest.current(payload)), [event]);
}

export { applyReplyEvent, newReply } from "@aura/bridge";
export type { ReplyEvent, ReplyView } from "@aura/bridge";

const REPLY_EVENTS = ["ai.turnState", "ai.chunk", "ai.toolActivity", "ai.approvalRequested", "ai.done", "ai.error"] as const;

/**
 * Folds one conversation reply's events (ai.sendMessage → streamId) into a
 * ReplyView in `seq` order; duplicates and late events are ignored. Chunks
 * arrive at most ~30 per second; keep this hook out of the 3D tree so text
 * updates do not re-render the scene.
 */
export function useReply(streamId: string | null): ReplyView | null {
  const [view, setView] = useState<ReplyView | null>(null);
  useEffect(() => {
    if (!streamId) { setView(null); return; }
    let current = newReply(streamId);
    setView(current);
    const offs = REPLY_EVENTS.map((name) => bridge.on(name, (payload) => {
      if (payload.streamId !== streamId) return;
      const next = applyReplyEvent(current, { name, payload } as ReplyEvent);
      if (next !== current) { current = next; setView(next); }
    }));
    return () => offs.forEach((off) => off());
  }, [streamId]);
  return view;
}
