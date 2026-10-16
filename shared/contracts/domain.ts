// Domain types shared by the React frontend and the native macOS host.
// Every type here must stay JSON-serialisable and mirror
// macos/Sources/AuraCore/Bridge/BridgeDomain.swift.

/** Navigable areas of the studio. Order matches the ⌘1–⌘6 shortcuts. */
export const ZONE_IDS = [
  "studio",
  "hardware",
  "software",
  "ai-lab",
  "github",
  "companion",
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export type CompanionState = "idle" | "listening" | "thinking" | "speaking" | "error";

export type ISODateString = string;

// ---------------------------------------------------------------- app

export interface AppInfo {
  appVersion: string;
  build: string;
  /** "macos" inside the native shell; "web-dev" when running in a browser against the mock bridge. */
  host: "macos" | "web-dev";
  bridgeVersion: number;
  environment: "development" | "production";
}

/** Host window state, so the studio can match its render rate to what is on screen. */
export interface WindowState {
  /** AURA is the active (frontmost) app. */
  active: boolean;
  /** Part of the window is on screen: not minimized, hidden, fully covered or on another Space. */
  visible: boolean;
}

// ---------------------------------------------------------------- preferences

export interface Preferences {
  lastZone: ZoneId;
  reduceMotion: boolean;
  voice: {
    enabled: boolean;
    /** BCP-47 locale for recognition and synthesis, e.g. "en-US". */
    locale: string;
    /** AVSpeechSynthesisVoice identifier; null = system default. */
    synthesisVoiceId: string | null;
  };
  ai: {
    /** Provider id from ai.listProviders; null until the user picks one. */
    defaultProviderId: string | null;
  };
  graphics: {
    quality: "low" | "medium" | "high";
    /** Upper bound for devicePixelRatio passed to the renderer. */
    maxPixelRatio: number;
  };
}

/** Partial update; nested objects are merged one level deep. */
export interface PreferencesPatch {
  lastZone?: ZoneId;
  reduceMotion?: boolean;
  voice?: Partial<Preferences["voice"]>;
  ai?: Partial<Preferences["ai"]>;
  graphics?: Partial<Preferences["graphics"]>;
}

// ---------------------------------------------------------------- github

export type GitHubAuthStatus =
  | { state: "signed_out" }
  | { state: "signed_in"; login: string; scopes: string[] };

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page; null when there are no more items. */
  nextCursor: string | null;
}

export interface RepositorySummary {
  /** "owner/name" — stable key across the app. */
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  primaryLanguage: string | null;
  stargazerCount: number;
  pushedAt: ISODateString | null;
  htmlUrl: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  authorName: string;
  committedAt: ISODateString;
  htmlUrl: string;
}

// ---------------------------------------------------------------- local projects

/** App-local metadata attached to a repository (stored in SQLite, never sent to GitHub). */
export interface ProjectRecord {
  /** Equals RepositorySummary.fullName. */
  id: string;
  zone: ZoneId | null;
  pinned: boolean;
  notes: string;
  updatedAt: ISODateString;
}

export interface ProjectPatch {
  id: string;
  zone?: ZoneId | null;
  pinned?: boolean;
  notes?: string;
}

// ---------------------------------------------------------------- ai

export interface AIProviderInfo {
  id: string;
  displayName: string;
  kind: "local" | "cloud";
  /** False until credentials / a local runtime are available. */
  available: boolean;
  models: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type FinishReason = "stop" | "length" | "cancelled" | "error";

// ---------------------------------------------------------------- voice

export type PermissionState = "not_determined" | "granted" | "denied" | "restricted";

export interface VoiceStatus {
  microphone: PermissionState;
  speechRecognition: PermissionState;
  listening: boolean;
  speaking: boolean;
}

// ---------------------------------------------------------------- logging

export type LogLevel = "debug" | "info" | "notice" | "error" | "fault";
