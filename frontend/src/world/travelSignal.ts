import type { RoomId } from "./types.ts";
/**
 * Per-frame travel state for scene decoration (threshold lights, atmosphere, arrival glow).
 * Written only by WorldNavigation, read in useFrame callbacks: no React renders, no persistence.
 */
export const travelSignal = {
  /** Destination room while a camera move is running, else null. */
  destination: null as RoomId | null,
  via: null as RoomId | null,
  kind: null as "route" | "journey" | "bridge" | "cut" | null,
  /** 0..1 along the current move. */
  progress: 0,
  /** performance.now() of the last arrival in a different room, and that room. */
  arrivedAt: -1e9,
  arrivedRoom: null as RoomId | null,
};

/** Whether each loaded room is drawn this frame (doorway visibility, WorldScene). Objects that
 * belong to a room but are mounted elsewhere (Astra) follow it. */
export const roomVisible: Partial<Record<RoomId, boolean>> = {};
