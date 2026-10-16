// Push events (native → web). Fire-and-forget; no reply expected.

import type { BridgeError } from "./errors.ts";
import type { FinishReason, GitHubAuthStatus, Preferences, VoiceStatus, ZoneId } from "./domain.ts";

export interface BridgeEvents {
  /** Native menu items / global shortcuts asking the frontend to act. */
  "app.command":
    | { command: "navigate"; zone: ZoneId }
    | { command: "focusCompanion" }
    | { command: "openCommandPalette" };
  /** Window became key / resigned key; frontend should throttle rendering when inactive. */
  "app.activeChanged": { active: boolean };

  "prefs.changed": Preferences;
  "github.authChanged": GitHubAuthStatus;

  "ai.chunk": { streamId: string; delta: string };
  "ai.done": { streamId: string; finishReason: FinishReason };
  "ai.error": { streamId: string; error: BridgeError };

  "voice.statusChanged": VoiceStatus;
  "voice.transcript": { text: string; isFinal: boolean };
  /** Normalised 0–1 output level while speaking; drives jaw/glow animation. Max ~30 Hz. */
  "voice.speechLevel": { level: number };
}

export type BridgeEventName = keyof BridgeEvents;
export type EventPayload<E extends BridgeEventName> = BridgeEvents[E];
