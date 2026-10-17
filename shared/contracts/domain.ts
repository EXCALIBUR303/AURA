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
    /** Master switch for workspace context in ai.chat. Off: the host sends no context at all. */
    contextSharing: boolean;
    /**
     * Whether context from private repositories may be sent: "never" (default),
     * "local_only" (only to providers on this Mac), or "all" (cloud providers too).
     */
    privateRepositoryContext: "never" | "local_only" | "all";
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

/**
 * GitHub connection, as the page sees it. Tokens and device codes never
 * cross the bridge; only these derived states do. Sent by
 * github.getAuthStatus and on every change as github.authChanged.
 */
export type GitHubAuthStatus =
  | { state: "disconnected" }
  /** Device authorization in progress: show `userCode` and a link to `verificationUri`. */
  | { state: "authorizing"; userCode: string; verificationUri: string; expiresAt: ISODateString }
  | { state: "connected"; account: GitHubAccount; installations: GitHubInstallation[] }
  /**
   * The stored session no longer works and has been deleted. `expired`: the
   * refresh token ran out. `revoked`: GitHub rejected the credentials (access
   * revoked or app uninstalled). Offer "Reconnect" (github.connect).
   */
  | { state: "expired"; login: string | null; reason: "expired" | "revoked" }
  /** Connected, but GitHub's API rate limit is exhausted until `resetAt`. */
  | { state: "rate_limited"; account: GitHubAccount; installations: GitHubInstallation[]; resetAt: ISODateString }
  | { state: "error"; reason: GitHubConnectionErrorReason; message: string; retryable: boolean };

export type GitHubConnectionErrorReason =
  /** The user declined on github.com. */
  | "denied"
  /** The device code expired before it was approved. */
  | "code_expired"
  /** GitHub could not be reached; a stored session (if any) is kept. */
  | "network"
  /** The GitHub App is misconfigured (device flow disabled, wrong client id) or not configured in this build. */
  | "configuration"
  /** An installation grants more than read access. The host deleted the token; the message says where to fix it. Reconnect afterwards. */
  | "excess_permissions"
  | "internal";

export interface GitHubAccount {
  login: string;
  name: string | null;
  htmlUrl: string;
}

/** An installation of AURA's GitHub App the signed-in user can access. */
export interface GitHubInstallation {
  id: number;
  /** The account the app is installed on (user or organization login). */
  accountLogin: string;
  /** "all" repositories, or only those the owner "selected". */
  repositorySelection: "all" | "selected";
  /** Permission name → level as granted by GitHub, e.g. { contents: "read", metadata: "read" }. */
  permissions: Record<string, string>;
  /** False if any permission is above "read". The host refuses such a session (error reason "excess_permissions"). */
  readOnly: boolean;
  /** Required permissions (metadata, contents) that are absent. Without contents, branches and commits fail. */
  missingPermissions: string[];
  /** Read permissions AURA does not use. Harmless, but the owner can remove them on github.com. */
  unneededPermissions: string[];
  /** Where the owner changes repository access for this installation. */
  manageUrl: string;
}

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
  topics: string[];
  isFork: boolean;
  isArchived: boolean;
}

/** github.getRepository: the summary plus fields that need extra requests. */
export interface RepositoryDetail extends RepositorySummary {
  /** Bytes of code per language, largest first, as reported by GitHub. */
  languages: { name: string; bytes: number }[];
  forksCount: number;
  openIssuesCount: number;
  /** SPDX id, e.g. "MIT"; null when GitHub detects none. */
  license: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface BranchSummary {
  name: string;
  /** Head commit SHA. */
  sha: string;
  isProtected: boolean;
  isDefault: boolean;
}

export interface CommitSummary {
  sha: string;
  /** Full commit message. Untrusted text: render as plain text. */
  message: string;
  authorName: string;
  /** GitHub login of the author, when GitHub can match one. */
  authorLogin: string | null;
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

/**
 * A suggested studio zone for a repository that has no zone yet, inferred
 * from its language, topics, name and description. Suggestions are never
 * applied automatically: apply one with projects.update.
 */
export interface ProjectZoneSuggestion {
  /** Repository fullName, equal to ProjectRecord.id. */
  id: string;
  zone: "hardware" | "software" | "ai-lab";
  /** The signals that matched, for display, e.g. ["topic: firmware", "language: C"]. */
  reasons: string[];
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------- ai

/**
 * Wire protocol a provider speaks. "openai_compatible" is chat completions
 * with SSE streaming: OpenAI-style APIs and local runtimes (Ollama, LM Studio,
 * llama.cpp server). "mock" is the built-in offline provider.
 */
export type AIProviderApi = "openai_compatible" | "mock";

/** API keys live only in the macOS Keychain; the page only ever sees this state. */
export type AICredentialState = "not_required" | "missing" | "stored";

/** Outcome of ai.validateProvider (a free model-list request, no inference). */
export interface AIProviderCheck {
  ok: boolean;
  checkedAt: ISODateString;
  /** BridgeErrorCode when not ok, e.g. "not_authenticated", "unavailable". */
  code: string | null;
  message: string | null;
  /** Model ids the provider reported (at most 100); empty when not ok. */
  models: string[];
}

export interface AIProviderInfo {
  id: string;
  displayName: string;
  /** "local": loopback endpoint on this Mac. "cloud": any https endpoint elsewhere. */
  kind: "local" | "cloud";
  /** False while a cloud provider has no stored key, or no model is configured. */
  available: boolean;
  /** Models ai.chat may use with this provider. */
  models: string[];
  api: AIProviderApi;
  /** Used when ai.chat names no model. */
  defaultModel: string | null;
  /** Endpoint base, e.g. "http://127.0.0.1:11434/v1". Never contains credentials. null for the built-in mock. */
  baseUrl: string | null;
  credential: AICredentialState;
  /** Last ai.validateProvider result in this app session. */
  lastCheck: AIProviderCheck | null;
  /** Built-in providers (the offline mock) cannot be edited or removed. */
  builtIn: boolean;
}

/** Non-secret provider settings, saved with ai.saveProvider. Keys go through ai.requestCredential instead. */
export interface AIProviderSettings {
  /** 1–32 lowercase letters, digits or dashes. Saving an existing id replaces its settings (the key is kept). */
  id: string;
  displayName: string;
  api: "openai_compatible";
  /** Loopback http(s) for a local runtime, https otherwise. No user info, query or fragment. */
  baseUrl: string;
  /** 1–20 model ids. */
  models: string[];
  /** Must be one of `models`; null = the first. */
  defaultModel: string | null;
}

/** "system" is reserved for the host: ai.chat rejects it from the page. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * What workspace context to attach to an ai.chat request. The page names
 * things by id only; the host fetches the data itself and applies the
 * sharing preferences, so the page cannot inject content as "context".
 */
export interface AIContextRequest {
  /** The zone the user is in. */
  zone?: ZoneId;
  /** The selected repository and, optionally, branch. In a conversation, leave it out: the conversation's repository is used. */
  repository?: { fullName: string; branch?: string };
  /** Which repository-derived sections to include. All default to false. */
  include?: { repository?: boolean; commits?: boolean; notes?: boolean; readme?: boolean };
  /**
   * Files the user selected (at most 5), optionally narrowed to 1-based,
   * inclusive lines. Source content: private-repository files go to a cloud
   * provider only inside a conversation and after the user approves
   * (ai.approvalRequested); elsewhere they are omitted as "consent_required".
   */
  files?: AIFileSelection[];
}

export interface AIFileSelection {
  path: string;
  startLine?: number;
  endLine?: number;
}

export type AIContextSectionId = "workspace" | "repository" | "commits" | "notes" | "readme" | "file";

/** Where a piece of context or a tool result came from, for citations. */
export interface AISourceRef {
  kind: "workspace" | "repository" | "commits" | "commit" | "notes" | "directory" | "file";
  /** owner/name; null for the workspace. */
  fullName: string | null;
  /** Repository-relative path (file, directory) or null. */
  path: string | null;
  /** Branch or commit SHA the data was read at. */
  ref: string | null;
  /** 1-based inclusive line range of a file excerpt. */
  lines: { start: number; end: number } | null;
}

export interface AIContextSection {
  id: AIContextSectionId;
  title: string;
  /** "app": produced by AURA. "untrusted": text from repositories or notes, sent fenced as data. */
  trust: "app" | "untrusted";
  /** Exactly the text the provider receives for this section (inside its data fence). */
  text: string;
  truncated: boolean;
  source: AISourceRef | null;
}

export type AIContextOmissionReason =
  | "sharing_disabled"
  | "private_repository"
  | "not_connected"
  | "not_found"
  | "unavailable"
  | "budget"
  /** Private source for a cloud provider without the user's approval. */
  | "consent_required"
  | "binary"
  | "too_large";

/** The context the host would attach, for review (ai.previewContext) before sending. */
export interface AIContextSnapshot {
  sections: AIContextSection[];
  /** `path` names the file for "file" omissions, otherwise null. */
  omitted: { section: AIContextSectionId; reason: AIContextOmissionReason; path: string | null }[];
  /** Characters across sections (roughly 4 per token). */
  totalChars: number;
}

export type FinishReason = "stop" | "length" | "cancelled" | "error";

// ---------------------------------------------------------------- ai conversations

/**
 * Lifecycle of one reply in a conversation. Allowed transitions:
 * idle → preparing_context → requesting → streaming ⇄ waiting_for_tool,
 * requesting/streaming → waiting_for_tool → requesting (next round),
 * waiting_for_tool ⇄ waiting_for_approval, and any active state → completed,
 * cancelled or error (terminal). A conversation is "idle" before its first reply.
 */
export type AITurnState =
  | "idle"
  | "preparing_context"
  | "requesting"
  | "streaming"
  | "waiting_for_tool"
  | "waiting_for_approval"
  | "completed"
  | "cancelled"
  | "error";

/** A host-owned conversation. History stays in memory on the Mac and is never written to disk. */
export interface AIConversationInfo {
  /** Host-issued, e.g. "conv-…". */
  conversationId: string;
  providerId: string;
  providerName: string;
  providerKind: "local" | "cloud";
  model: string;
  /** The repository this conversation may read. Changes only through ai.setConversationRepository. */
  repository: { fullName: string; branch: string | null; isPrivate: boolean } | null;
  /** False when context sharing is off, tools were not requested, or the provider rejected tool definitions. */
  toolsEnabled: boolean;
  /** State of the latest reply; "idle" before the first one. */
  state: AITurnState;
  /** streamId of the reply in progress, if any. */
  activeStreamId: string | null;
  turnCount: number;
  /** True once data from a private repository entered this conversation. */
  carriesPrivateContext: boolean;
  /** Repositories whose private source the user allowed for this conversation ("allow_for_conversation"). */
  sourceSharingAllowed: string[];
  createdAt: ISODateString;
}

export interface AIConversationTurn {
  streamId: string;
  userText: string;
  /** The reply as shown to the user (all rounds), possibly partial. */
  replyText: string;
  /** null while the reply is in progress. */
  finishReason: FinishReason | null;
  state: AITurnState;
  tools: AIToolActivity[];
  /** Everything this reply used: attached context and tool results. */
  sources: AISourceRef[];
}

/** One tool call as the user should see it. The text is host-written, never model output. */
export interface AIToolActivity {
  callId: string;
  /** An allowlisted tool name, or "unknown" when the model asked for something AURA does not offer. */
  tool: string;
  status: "running" | "succeeded" | "failed" | "denied" | "awaiting_approval" | "cancelled";
  /** e.g. "Read Sources/App.swift, lines 1–120". */
  summary: string;
  sources: AISourceRef[];
  /** Why it was denied or failed; null otherwise. */
  message: string | null;
}

/** Something only the user can allow. The reply waits (state "waiting_for_approval") until ai.respondToApproval or expiry (= deny). */
export interface AIApprovalRequest {
  approvalId: string;
  /** "share_private_source": private repository source would go to a cloud provider. "app_action": the model suggests navigating. */
  kind: "share_private_source" | "app_action";
  /** The tool call it belongs to; null for files attached as context. */
  callId: string | null;
  tool: string | null;
  /** Host-written description of exactly what would happen. */
  summary: string;
  repository: string | null;
  paths: string[];
  providerName: string;
  providerKind: "local" | "cloud";
  expiresInSeconds: number;
}

/** "allow_for_conversation" covers further private source from the same repository in this conversation only. */
export type AIApprovalDecision = "allow_once" | "allow_for_conversation" | "deny";

export type AIConversationChangeReason =
  | "reset"
  | "ended"
  | "repository_changed"
  /** GitHub disconnected or the account changed: private content was cleared from conversations. */
  | "github_access_changed"
  /** The provider was removed or its endpoint changed; the conversation cannot continue. */
  | "provider_changed"
  | "tools_unavailable"
  /** Dropped to stay within the in-memory limit. */
  | "evicted";

// ---------------------------------------------------------------- repository content

export interface RepositoryTreeEntry {
  /** Repository-relative path, e.g. "Sources/App.swift". */
  path: string;
  type: "file" | "directory";
  /** Bytes, for files. */
  size: number | null;
}

/** github.listFiles: paths only, never file contents. */
export interface RepositoryTree {
  fullName: string;
  /** The branch (or SHA) that was listed. */
  ref: string;
  /** The commit the listing was taken from. */
  commitSha: string;
  entries: RepositoryTreeEntry[];
  /** True when GitHub or AURA cut the listing short. */
  truncated: boolean;
}

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
