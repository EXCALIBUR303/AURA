// Request/response methods (web → native). Adding a method means adding it
// here, to BridgeMethod.swift, registering a handler in the native router and
// a mock in shared/bridge/mock.ts — in the same change.

import type {
  AIProviderInfo,
  AppInfo,
  ChatMessage,
  CommitSummary,
  GitHubAuthStatus,
  LogLevel,
  Page,
  Preferences,
  PreferencesPatch,
  ProjectPatch,
  ProjectRecord,
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
  "github.listRepositories": {
    params: { cursor?: string; perPage?: number };
    result: Page<RepositorySummary>;
  };
  "github.listCommits": {
    params: { fullName: string; branch?: string; limit?: number };
    result: CommitSummary[];
  };

  "projects.list": { params: Empty; result: ProjectRecord[] };
  "projects.update": { params: ProjectPatch; result: ProjectRecord };

  "ai.listProviders": { params: Empty; result: AIProviderInfo[] };
  /** Starts a streamed completion. Output arrives as ai.chunk / ai.done / ai.error events. */
  "ai.chat": {
    params: { messages: ChatMessage[]; providerId?: string; model?: string };
    result: { streamId: string };
  };
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
