// Request/response methods (web → native). Adding a method means adding it
// here, to BridgeMethod.swift, registering a handler in the native router and
// a mock in shared/bridge/mock.ts — in the same change.

import type {
  AIApprovalDecision,
  AIContextRequest,
  AIContextSnapshot,
  AIConversationInfo,
  AIConversationTurn,
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
  RepositoryTree,
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
  /**
   * File and directory paths of a repository (never contents), for choosing
   * files to attach as context. `path` narrows to one directory; `limit`
   * (1–1000, default 500) caps the entries returned.
   */
  "github.listFiles": {
    params: { fullName: string; branch?: string; path?: string; limit?: number };
    result: RepositoryTree;
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
  /**
   * The context ai.chat (or, with `conversationId`, ai.sendMessage) would
   * attach, for review. Sends nothing to any provider. In a conversation the
   * conversation's provider and repository are used, and private source the
   * user has not yet allowed shows as "consent_required".
   */
  "ai.previewContext": {
    params: { context: AIContextRequest; providerId?: string; conversationId?: string };
    result: AIContextSnapshot;
  };
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
  /** Stops a stream or a conversation reply. The host then sends exactly one ai.done with finishReason "cancelled" (unless it had already ended). */
  "ai.cancel": { params: { streamId: string }; result: Empty };

  /**
   * Starts a host-owned conversation bound to one provider and model and,
   * optionally, one repository. Astra may then use read-only tools on that
   * repository (and metadata of other accessible ones) unless `tools` is false.
   */
  "ai.startConversation": {
    params: { providerId?: string; model?: string; repository?: { fullName: string; branch?: string }; tools?: boolean };
    result: AIConversationInfo;
  };
  "ai.listConversations": { params: Empty; result: AIConversationInfo[] };
  /** The conversation and its turns, for showing it again (for example after a reload). */
  "ai.getConversation": {
    params: { conversationId: string };
    result: { conversation: AIConversationInfo; turns: AIConversationTurn[] };
  };
  /**
   * Sends the user's message and starts the reply. Events for it carry the
   * returned streamId and one shared `seq`: ai.turnState, ai.chunk,
   * ai.toolActivity, ai.approvalRequested, then exactly one ai.done or
   * ai.error. One reply at a time per conversation. `context` must not name
   * a repository: the conversation's own is used.
   */
  "ai.sendMessage": {
    params: { conversationId: string; text: string; context?: Omit<AIContextRequest, "repository">; maxOutputTokens?: number };
    result: { streamId: string };
  };
  /** Explicitly switches (or clears) the conversation's repository. Drops cached repository data and source-sharing approvals. */
  "ai.setConversationRepository": {
    params: { conversationId: string; repository: { fullName: string; branch?: string } | null };
    result: AIConversationInfo;
  };
  /** Cancels any reply in progress and clears history, attached context and approvals. Keeps provider and repository. */
  "ai.resetConversation": { params: { conversationId: string }; result: AIConversationInfo };
  /** Cancels any reply in progress and forgets the conversation. */
  "ai.endConversation": { params: { conversationId: string }; result: Empty };
  /** Answers an ai.approvalRequested. Only the page can approve: nothing a model or repository says counts as approval. */
  "ai.respondToApproval": {
    params: { conversationId: string; approvalId: string; decision: AIApprovalDecision };
    result: Empty;
  };

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
