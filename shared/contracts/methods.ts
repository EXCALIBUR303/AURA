// Request/response methods (web → native). Adding a method means adding it
// here, to BridgeMethod.swift, registering a handler in the native router and
// a mock in shared/bridge/mock.ts — in the same change.

import type {
  AIContextRequest,
  AIContextSnapshot,
  AIProviderInfo,
  AIProviderSettings,
  AppInfo,
  BranchSummary,
  ChatMessage,
  CommitSummary,
  GitHubAuthStatus,
  LogLevel,
  Page,
  Preferences,
  PreferencesPatch,
  ProjectPatch,
  ProjectRecord,
  ProjectZoneSuggestion,
  RepositoryDetail,
  RepositorySummary,
  VoiceStatus,
  WindowState,
} from "./domain.ts";

type Empty = Record<string, never>;

export interface BridgeMethods {
  "app.getInfo": { params: Empty; result: AppInfo };
  /** Current window state. Call on load: events sent before the page was listening are lost. */
  "app.getWindowState": { params: Empty; result: WindowState };

  "prefs.get": { params: Empty; result: Preferences };
  "prefs.update": { params: PreferencesPatch; result: Preferences };

  "github.getAuthStatus": { params: Empty; result: GitHubAuthStatus };
  /**
   * Starts GitHub device authorization (also used to reconnect). Resolves with
   * the `authorizing` state once GitHub has issued a code; the outcome arrives
   * as github.authChanged. Calling it again restarts the attempt.
   */
  "github.connect": { params: Empty; result: GitHubAuthStatus };
  /** Cancels any authorization in progress and deletes the stored session from the Keychain. */
  "github.disconnect": { params: Empty; result: GitHubAuthStatus };
  /** Re-validates the stored session and drops cached GitHub data. Use for "Refresh" and "Retry". */
  "github.refresh": { params: Empty; result: GitHubAuthStatus };
  /** Repositories AURA's GitHub App can see, across installations, most recently pushed first. */
  "github.listRepositories": {
    params: { cursor?: string; perPage?: number };
    result: Page<RepositorySummary>;
  };
  "github.getRepository": { params: { fullName: string }; result: RepositoryDetail };
  "github.listBranches": {
    params: { fullName: string; cursor?: string; perPage?: number };
    result: Page<BranchSummary>;
  };
  /** Most recent commits on `branch` (default branch when omitted). Empty for an empty repository. */
  "github.listCommits": {
    params: { fullName: string; branch?: string; limit?: number };
    result: CommitSummary[];
  };

  "projects.list": { params: Empty; result: ProjectRecord[] };
  "projects.update": { params: ProjectPatch; result: ProjectRecord };
  /** Zone suggestions for accessible repositories that have no zone yet. Read-only. */
  "projects.suggestZones": { params: Empty; result: ProjectZoneSuggestion[] };

  "ai.listProviders": { params: Empty; result: AIProviderInfo[] };
  /** Adds or replaces a provider's non-secret settings. Emits ai.providersChanged. */
  "ai.saveProvider": { params: AIProviderSettings; result: AIProviderInfo };
  /** Removes a provider and deletes its Keychain key. Emits ai.providersChanged. */
  "ai.removeProvider": { params: { providerId: string }; result: Empty };
  /**
   * Opens a native secure prompt for the provider's API key. The key goes
   * straight to the Keychain and never reaches the page. Returns at once; the
   * outcome (stored or cancelled) arrives as ai.providersChanged.
   */
  "ai.requestCredential": { params: { providerId: string }; result: Empty };
  /** Deletes the provider's Keychain key. Emits ai.providersChanged. */
  "ai.deleteCredential": { params: { providerId: string }; result: AIProviderInfo };
  /** Checks reachability and the key with a free model-list request (no inference). */
  "ai.validateProvider": { params: { providerId: string }; result: AIProviderInfo };
  /** The context ai.chat would attach for this request and provider, for review. Sends nothing. */
  "ai.previewContext": { params: { context: AIContextRequest; providerId?: string }; result: AIContextSnapshot };
  /**
   * Starts a streamed completion. Output arrives as ai.chunk / ai.done /
   * ai.error events, numbered by `seq`. Messages are user/assistant only.
   * `conversationId` (page-chosen, 1–64 chars) ties turns together: once a
   * conversation has received private-repository context, the host refuses
   * to send it to a provider the preferences do not allow.
   */
  "ai.chat": {
    params: {
      messages: ChatMessage[];
      providerId?: string;
      model?: string;
      context?: AIContextRequest;
      conversationId?: string;
      /** Upper bound for the reply, 1–8192 tokens. */
      maxOutputTokens?: number;
    };
    result: { streamId: string };
  };
  /** Stops a stream. The host then sends exactly one ai.done with finishReason "cancelled" (unless it had already ended). */
  "ai.cancel": { params: { streamId: string }; result: Empty };

  "voice.getStatus": { params: Empty; result: VoiceStatus };
  /** Triggers the macOS permission prompts on first use. */
  "voice.requestPermissions": { params: Empty; result: VoiceStatus };
  "voice.startListening": { params: Empty; result: VoiceStatus };
  "voice.stopListening": { params: Empty; result: VoiceStatus };
  "voice.speak": { params: { text: string; interrupt?: boolean }; result: Empty };
  "voice.stopSpeaking": { params: Empty; result: Empty };

  /** Forwards frontend logs into macOS unified logging (category "web"). */
  "log.write": {
    params: { level: LogLevel; message: string; context?: Record<string, string> };
    result: Empty;
  };
}

export type BridgeMethod = keyof BridgeMethods;
export type MethodParams<M extends BridgeMethod> = BridgeMethods[M]["params"];
export type MethodResult<M extends BridgeMethod> = BridgeMethods[M]["result"];
