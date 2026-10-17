// Push events (native → web). Fire-and-forget; no reply expected.

import type { BridgeError } from "./errors.ts";
import type {
  AIApprovalRequest,
  AIConversationChangeReason,
  AIConversationInfo,
  AIProviderInfo,
  AIToolActivity,
  AITurnState,
  FinishReason,
  GitHubAuthStatus,
  Preferences,
  VoiceCapabilities,
  VoiceStatus,
  WindowState,
  ZoneId,
} from "./domain.ts";

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
  /** Conversation replies only: the reply's state changed (see AITurnState). Same `seq` sequence as the reply's other events. */
  "ai.turnState": { streamId: string; conversationId: string; seq: number; state: AITurnState };
  /** Conversation replies only: a tool call started, finished, was denied or awaits approval (same callId updates in place). */
  "ai.toolActivity": { streamId: string; conversationId: string; seq: number; activity: AIToolActivity };
  /** Conversation replies only: the reply waits for the user. Answer with ai.respondToApproval. */
  "ai.approvalRequested": { streamId: string; conversationId: string; seq: number; approval: AIApprovalRequest };
  /** A conversation was reset, ended, cleared or changed by the host. `conversation` is null when it no longer exists. */
  "ai.conversationChanged": { conversationId: string; reason: AIConversationChangeReason; conversation: AIConversationInfo | null };
  /** The provider list changed (saved, removed, key stored or deleted, validated). */
  "ai.providersChanged": AIProviderInfo[];

  /** Every voice status change (see VoiceStatus.revision for ordering). */
  "voice.statusChanged": VoiceStatus;
  "voice.capabilitiesChanged": VoiceCapabilities;
  /**
   * The utterance's whole text so far (not a delta). `seq` increases per utterance.
   * Exactly one isFinal event ends an utterance that heard something; never send non-final text to a model.
   */
  "voice.transcript": { utteranceId: string; seq: number; text: string; isFinal: boolean };
  /** Normalised 0–1 microphone level while listening (about 10–20 Hz). */
  "voice.inputLevel": { utteranceId: string; level: number };
  /** Normalised 0–1 output level while speaking; drives jaw/glow animation. Max ~30 Hz. */
  "voice.speechLevel": { level: number };
  /** A spoken sentence started or finished (captions). `segment` counts from 0 per speech. */
  "voice.speechProgress": { speechId: string; streamId: string | null; segment: number; text: string; state: "started" | "finished" };
}

export type BridgeEventName = keyof BridgeEvents;
export type EventPayload<E extends BridgeEventName> = BridgeEvents[E];
