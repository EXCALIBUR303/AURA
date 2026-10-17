// Push events (native → web). Fire-and-forget; no reply expected.

import type { BridgeError } from "./errors.ts";
import type { AIProviderInfo, FinishReason, GitHubAuthStatus, Preferences, VoiceStatus, WindowState, ZoneId } from "./domain.ts";

export interface BridgeEvents {
  /** Native menu items / global shortcuts asking the frontend to act. */
  "app.command":
    | { command: "navigate"; zone: ZoneId }
    | { command: "focusCompanion" }
    | { command: "openCommandPalette" };
  /**
   * Sent whenever WindowState changes. Render at full rate while active, at a
   * reduced rate while only visible, and not at all while not visible.
   */
  "app.windowStateChanged": WindowState;

  "prefs.changed": Preferences;
  /** Every GitHub connection state change, including authorizing → connected / error. */
  "github.authChanged": GitHubAuthStatus;

  /**
   * Stream output. `seq` starts at 1 and increases by one per event of the
   * stream (chunks and the final done/error), so the page can drop duplicates
   * and detect gaps. Chunks are coalesced to at most ~30 per second. Each
   * stream ends with exactly one ai.done or ai.error.
   */
  "ai.chunk": { streamId: string; seq: number; delta: string };
  "ai.done": { streamId: string; seq: number; finishReason: FinishReason };
  "ai.error": { streamId: string; seq: number; error: BridgeError };
  /** The provider list changed (saved, removed, key stored or deleted, validated). */
  "ai.providersChanged": AIProviderInfo[];

  "voice.statusChanged": VoiceStatus;
  "voice.transcript": { text: string; isFinal: boolean };
  /** Normalised 0–1 output level while speaking; drives jaw/glow animation. Max ~30 Hz. */
  "voice.speechLevel": { level: number };
}

export type BridgeEventName = keyof BridgeEvents;
export type EventPayload<E extends BridgeEventName> = BridgeEvents[E];
