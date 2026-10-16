// In-browser stand-in for the native host. Used by `npm run dev` in a normal
// browser and by tests. All data is synthetic and labelled as such: owners are
// "mock-user", URLs use the reserved .invalid TLD. Never put real data here.

import { BRIDGE_PROTOCOL_VERSION } from "../contracts/envelope.ts";
import type { BridgeEventMessage, BridgeRequest, BridgeResponse } from "../contracts/envelope.ts";
import type { BridgeError } from "../contracts/errors.ts";
import type { BridgeEventName, EventPayload } from "../contracts/events.ts";
import type { BridgeMethod, MethodParams, MethodResult } from "../contracts/methods.ts";
import type {
  CommitSummary,
  GitHubAccount,
  GitHubAuthStatus,
  GitHubInstallation,
  Preferences,
  ProjectRecord,
  ProjectZoneSuggestion,
  RepositorySummary,
  VoiceStatus,
} from "../contracts/domain.ts";
import type { BridgeTransport } from "./transport.ts";

export const DEFAULT_PREFERENCES: Preferences = {
  lastZone: "studio",
  reduceMotion: false,
  voice: { enabled: true, locale: "en-US", synthesisVoiceId: null },
  ai: { defaultProviderId: null },
  graphics: { quality: "high", maxPixelRatio: 2 },
};

const MOCK_REPO_SEEDS: [name: string, description: string, language: string, topics: string[], zone: ProjectZoneSuggestion["zone"]][] = [
  ["sample-firmware", "Mock repository for the Hardware Lab", "C", ["firmware", "embedded"], "hardware"],
  ["sample-web-app", "Mock repository for the Software Studio", "TypeScript", ["web"], "software"],
  ["sample-llm-eval", "Mock repository for the AI / LLM Lab", "Python", ["llm"], "ai-lab"],
];

const MOCK_ACCOUNT: GitHubAccount = { login: "mock-user", name: "Mock User", htmlUrl: "https://github.invalid/mock-user" };
const MOCK_INSTALLATIONS: GitHubInstallation[] = [{
  id: 1,
  accountLogin: "mock-user",
  repositorySelection: "selected",
  permissions: { contents: "read", metadata: "read" },
  readOnly: true,
  manageUrl: "https://github.invalid/settings/installations/1",
}];
const MOCK_CONNECTED: GitHubAuthStatus = { state: "connected", account: MOCK_ACCOUNT, installations: MOCK_INSTALLATIONS };

const MOCK_REPOS: RepositorySummary[] = MOCK_REPO_SEEDS.map(([name, description, language, topics], index) => ({
  fullName: `mock-user/${name}`,
  owner: "mock-user",
  name,
  description,
  isPrivate: index === 0,
  defaultBranch: "main",
  primaryLanguage: language,
  stargazerCount: 0,
  pushedAt: "2026-01-01T00:00:00Z",
  htmlUrl: `https://github.invalid/mock-user/${name}`,
  topics,
  isFork: false,
  isArchived: false,
}));

class MockFailure extends Error {
  readonly error: BridgeError;
  constructor(error: BridgeError) {
    super(error.message);
    this.error = error;
  }
}

type Handlers = { [M in BridgeMethod]: (params: MethodParams<M>) => MethodResult<M> | Promise<MethodResult<M>> };

export interface MockTransport extends BridgeTransport {
  /** Push an event as if the native host sent it. */
  emit<E extends BridgeEventName>(event: E, payload: EventPayload<E>): void;
  /** Make the next call to `method` fail with `error` (one-shot). */
  failNext(method: BridgeMethod, error: BridgeError): void;
}

export interface MockTransportOptions {
  /** Artificial latency per call, ms. Defaults to 0. */
  latencyMs?: number;
  /** Delay between streamed chunks/events, ms. Defaults to 40. */
  streamIntervalMs?: number;
  /** How long github.connect stays "authorizing" before the mock approves, ms. Defaults to 1500. */
  githubApprovalMs?: number;
}

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const latencyMs = options.latencyMs ?? 0;
  const streamIntervalMs = options.streamIntervalMs ?? 40;
  const githubApprovalMs = options.githubApprovalMs ?? 1500;
  const listeners = new Set<(eventJson: string) => void>();
  const pendingFailures = new Map<BridgeMethod, BridgeError>();
  const activeStreams = new Set<string>();

  let prefs: Preferences = structuredClone(DEFAULT_PREFERENCES);
  const projects = new Map<string, ProjectRecord>();
  let voice: VoiceStatus = {
    microphone: "not_determined",
    speechRecognition: "not_determined",
    listening: false,
    speaking: false,
  };
  let streamCounter = 0;
  let github: GitHubAuthStatus = MOCK_CONNECTED;
  let githubAttempt = 0;

  function emit<E extends BridgeEventName>(event: E, payload: EventPayload<E>): void {
    const message: BridgeEventMessage<E> = { kind: "event", v: BRIDGE_PROTOCOL_VERSION, event, payload };
    const json = JSON.stringify(message);
    for (const listener of listeners) listener(json);
  }

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  function setGitHub(next: GitHubAuthStatus): GitHubAuthStatus {
    github = next;
    emit("github.authChanged", github);
    return github;
  }

  function mockRepo(fullName: string): RepositorySummary {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(fullName) || /\/\.{1,2}$/.test(fullName)) {
      throw new MockFailure({ code: "invalid_request", message: "fullName must be owner/name", retryable: false });
    }
    if (github.state !== "connected") throw new MockFailure({ code: "not_authenticated", message: "mock GitHub is disconnected", retryable: false });
    const repo = MOCK_REPOS.find((r) => r.fullName === fullName);
    if (!repo) throw new MockFailure({ code: "not_found", message: `no mock repo ${fullName}`, retryable: false });
    return repo;
  }

  function setVoice(next: Partial<VoiceStatus>): VoiceStatus {
    voice = { ...voice, ...next };
    emit("voice.statusChanged", voice);
    return voice;
  }

  const handlers: Handlers = {
    "app.getInfo": () => ({
      appVersion: "0.1.0",
      build: "dev",
      host: "web-dev",
      bridgeVersion: BRIDGE_PROTOCOL_VERSION,
      environment: "development",
    }),

    // A browser tab has no native window; the page already pauses via document.hidden.
    "app.getWindowState": () => ({ active: true, visible: true }),

    "prefs.get": () => prefs,
    "prefs.update": (patch) => {
      prefs = {
        ...prefs,
        ...(patch.lastZone !== undefined ? { lastZone: patch.lastZone } : {}),
        ...(patch.reduceMotion !== undefined ? { reduceMotion: patch.reduceMotion } : {}),
        voice: { ...prefs.voice, ...patch.voice },
        ai: { ...prefs.ai, ...patch.ai },
        graphics: { ...prefs.graphics, ...patch.graphics },
      };
      emit("prefs.changed", prefs);
      return prefs;
    },

    "github.getAuthStatus": () => github,
    "github.connect": () => {
      const attempt = ++githubAttempt;
      void (async () => {
        await wait(githubApprovalMs);
        if (attempt === githubAttempt && github.state === "authorizing") setGitHub(MOCK_CONNECTED);
      })();
      return setGitHub({
        state: "authorizing",
        userCode: "MOCK-0000",
        verificationUri: "https://github.invalid/login/device",
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      });
    },
    "github.disconnect": () => {
      githubAttempt += 1;
      return setGitHub({ state: "disconnected" });
    },
    "github.refresh": () => github,
    "github.listRepositories": ({ cursor, perPage = 30 }) => {
      if (github.state !== "connected") throw new MockFailure({ code: "not_authenticated", message: "mock GitHub is disconnected", retryable: false });
      const offset = cursor === undefined ? 0 : Number(/^offset:(\d+)$/.exec(cursor)?.[1] ?? NaN);
      if (!Number.isInteger(offset)) throw new MockFailure({ code: "invalid_request", message: "invalid cursor", retryable: false });
      const end = Math.min(offset + perPage, MOCK_REPOS.length);
      return { items: MOCK_REPOS.slice(offset, end), nextCursor: end < MOCK_REPOS.length ? `offset:${end}` : null };
    },
    "github.getRepository": ({ fullName }) => {
      const repo = mockRepo(fullName);
      return {
        ...repo,
        languages: repo.primaryLanguage ? [{ name: repo.primaryLanguage, bytes: 1000 }] : [],
        forksCount: 0,
        openIssuesCount: 0,
        license: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
    },
    "github.listBranches": ({ fullName }) => {
      mockRepo(fullName);
      return { items: [{ name: "main", sha: "0".repeat(40), isProtected: false, isDefault: true }], nextCursor: null };
    },
    "github.listCommits": ({ fullName, limit = 10 }) => {
      const repo = mockRepo(fullName);
      return Array.from({ length: Math.min(limit, 3) }, (_, i): CommitSummary => ({
        sha: `000000000000000000000000000000000000000${i}`,
        message: `Mock commit ${i + 1} in ${repo.name}`,
        authorName: "Mock Author",
        authorLogin: null,
        committedAt: `2026-01-0${i + 1}T00:00:00Z`,
        htmlUrl: `${repo.htmlUrl}/commit/${i}`,
      }));
    },

    "projects.list": () => [...projects.values()],
    "projects.update": (patch) => {
      const current = projects.get(patch.id) ?? { id: patch.id, zone: null, pinned: false, notes: "", updatedAt: "" };
      const next: ProjectRecord = {
        ...current,
        ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date().toISOString(),
      };
      projects.set(next.id, next);
      return next;
    },
    "projects.suggestZones": () => {
      if (github.state !== "connected") throw new MockFailure({ code: "not_authenticated", message: "mock GitHub is disconnected", retryable: false });
      return MOCK_REPO_SEEDS.filter(([name]) => !projects.get(`mock-user/${name}`)?.zone).map(([name, , , topics, zone]): ProjectZoneSuggestion => ({
        id: `mock-user/${name}`,
        zone,
        reasons: topics.map((topic) => `topic: ${topic}`),
        confidence: "high",
      }));
    },

    "ai.listProviders": () => [
      { id: "mock", displayName: "Mock provider (offline)", kind: "local", available: true, models: ["mock-echo"] },
    ],
    "ai.chat": ({ messages }) => {
      streamCounter += 1;
      const streamId = `mock-stream-${streamCounter}`;
      activeStreams.add(streamId);
      const last = messages.at(-1)?.content ?? "";
      const words = `[mock] You said: ${last}`.split(/(?<= )/);
      void (async () => {
        for (const delta of words) {
          await wait(streamIntervalMs);
          if (!activeStreams.has(streamId)) return emit("ai.done", { streamId, finishReason: "cancelled" });
          emit("ai.chunk", { streamId, delta });
        }
        activeStreams.delete(streamId);
        emit("ai.done", { streamId, finishReason: "stop" });
      })();
      return { streamId };
    },
    "ai.cancel": ({ streamId }) => {
      activeStreams.delete(streamId);
      return {};
    },

    "voice.getStatus": () => voice,
    "voice.requestPermissions": () => setVoice({ microphone: "granted", speechRecognition: "granted" }),
    "voice.startListening": () => {
      if (voice.microphone !== "granted" || voice.speechRecognition !== "granted") {
        throw new MockFailure({ code: "permission_denied", message: "call voice.requestPermissions first", retryable: false });
      }
      const status = setVoice({ listening: true });
      void (async () => {
        await wait(streamIntervalMs * 5);
        if (voice.listening) emit("voice.transcript", { text: "mock transcript", isFinal: false });
        await wait(streamIntervalMs * 5);
        if (voice.listening) emit("voice.transcript", { text: "mock transcript complete", isFinal: true });
      })();
      return status;
    },
    "voice.stopListening": () => setVoice({ listening: false }),
    "voice.speak": () => {
      setVoice({ speaking: true });
      void (async () => {
        for (let i = 0; i < 10 && voice.speaking; i++) {
          emit("voice.speechLevel", { level: Math.abs(Math.sin(i)) });
          await wait(streamIntervalMs);
        }
        emit("voice.speechLevel", { level: 0 });
        setVoice({ speaking: false });
      })();
      return {};
    },
    "voice.stopSpeaking": () => {
      setVoice({ speaking: false });
      return {};
    },

    "log.write": ({ level, message }) => {
      (level === "error" || level === "fault" ? console.error : console.debug)(`[web-log] ${message}`);
      return {};
    },
  };

  async function dispatch(request: BridgeRequest): Promise<BridgeResponse> {
    const base = { kind: "response" as const, v: BRIDGE_PROTOCOL_VERSION, id: request.id };
    if (request.v !== BRIDGE_PROTOCOL_VERSION) {
      return { ...base, ok: false, error: { code: "unsupported_version", message: `protocol v${request.v}`, retryable: false } };
    }
    const failure = pendingFailures.get(request.method);
    if (failure) {
      pendingFailures.delete(request.method);
      return { ...base, ok: false, error: failure };
    }
    const handler = handlers[request.method] as ((params: unknown) => unknown) | undefined;
    if (!handler) {
      return { ...base, ok: false, error: { code: "unknown_method", message: request.method, retryable: false } };
    }
    try {
      const result = await handler(request.params ?? {});
      return { ...base, ok: true, result } as BridgeResponse;
    } catch (error) {
      if (error instanceof MockFailure) return { ...base, ok: false, error: error.error };
      return { ...base, ok: false, error: { code: "internal", message: String(error), retryable: false } };
    }
  }

  return {
    kind: "mock",
    async send(requestJson) {
      if (latencyMs > 0) await wait(latencyMs);
      return JSON.stringify(await dispatch(JSON.parse(requestJson) as BridgeRequest));
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit,
    failNext(method, error) {
      pendingFailures.set(method, error);
    },
  };
}
