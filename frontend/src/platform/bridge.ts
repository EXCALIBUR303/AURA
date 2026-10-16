// Owned by Claude Code (native integration). Frontend code imports `bridge`
// and `useBridgeEvent` from here instead of calling connectBridge itself.

import { useEffect, useRef } from "react";
import { connectBridge } from "@aura/bridge";
import type { BridgeEventName, EventPayload } from "@aura/contracts";

export const bridge = connectBridge(import.meta.env.VITE_AURA_BRIDGE ?? "auto");

/** Subscribes to a native event for the lifetime of the component. */
export function useBridgeEvent<E extends BridgeEventName>(event: E, handler: (payload: EventPayload<E>) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => bridge.on(event, (payload) => latest.current(payload)), [event]);
}
