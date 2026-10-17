// In-browser stand-in for the native host. Used by `npm run dev` in a normal
// browser and by tests. All data is synthetic and labelled as such: owners are
// "mock-user", URLs use the reserved .invalid TLD. Never put real data here.

import { BRIDGE_PROTOCOL_VERSION } from "../contracts/envelope.ts";
import type { BridgeEventMessage, BridgeRequest, BridgeResponse } from "../contracts/envelope.ts";
import type { BridgeError } from "../contracts/errors.ts";
import type { BridgeEventName, EventPayload } from "../contracts/events.ts";
import type { BridgeMethod, MethodParams, MethodResult } from "../contracts/methods.ts";
import type {
  AIContextRequest,
  AIContextSection,
  AIContextSnapshot,
  AIProviderInfo,
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
  ai: { defaultProviderId: null, contextSharing: true, privateRepositoryContext: "never" },
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
  missingPermissions: [],
  unneededPermissions: [],
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
  const cancelStream = new Map<string, () => void>();

  let prefs: Preferences = structuredClone(DEFAULT_PREFERENCES);
  const projects = new Map<string, ProjectRecord>();
  let voice: VoiceStatus = {
    microphone: "not_determined",
    speechRecognition: "not_determined",
    listening: false,
    speaking: false,
  };
  let streamCounter = 0;
  const MOCK_PROVIDER: AIProviderInfo = {
    id: "mock", displayName: "Mock provider (offline)", kind: "local", available: true, models: ["mock-echo"],
    api: "mock", defaultModel: "mock-echo", baseUrl: null, credential: "not_required", lastCheck: null, builtIn: true,
  };
  const providers = new Map<string, AIProviderInfo>([[MOCK_PROVIDER.id, MOCK_PROVIDER]]);
  const providerList = () => [...providers.values()].sort((a, b) => a.id.localeCompare(b.id));
  function provider(id: string): AIProviderInfo {
    const found = providers.get(id);
    if (!found) throw new MockFailure({ code: "not_found", message: `provider ${id}`, retryable: false });
    return found;
  }
  function updateProvider(id: string, patch: Partial<AIProviderInfo>): AIProviderInfo {
    const next = { ...provider(id), ...patch };
    next.available = next.models.length > 0 && next.credential !== "missing";
    providers.set(id, next);
    emit("ai.providersChanged", providerList());
    return next;
  }
  function mockContext(request: AIContextRequest, kind: AIProviderInfo["kind"]): AIContextSnapshot {
    const sections: AIContextSection[] = [];
    const omitted: AIContextSnapshot["omitted"] = [];
    const wanted = request.include ?? {};
    const repoSections = (["repository", "commits", "notes"] as const).filter((id) => request.repository && wanted[id]);
    if (!prefs.ai.contextSharing) {
      if (request.zone) omitted.push({ section: "workspace", reason: "sharing_disabled" });
      repoSections.forEach((section) => omitted.push({ section, reason: "sharing_disabled" }));
      return { sections, omitted, totalChars: 0 };
    }
    if (request.zone) sections.push({ id: "workspace", title: "Workspace", trust: "app", text: `Active zone: ${request.zone}`, truncated: false });
    if (request.repository && repoSections.length) {
      const repo = MOCK_REPOS.find((r) => r.fullName === request.repository?.fullName);
      const policy = prefs.ai.privateRepositoryContext;
      const blocked = repo?.isPrivate && (policy === "never" || (policy === "local_only" && kind !== "local"));
      for (const section of repoSections) {
        if (!repo) omitted.push({ section, reason: "not_found" });
        else if (blocked) omitted.push({ section, reason: "private_repository" });
        else if (section === "repository") sections.push({ id: section, title: "Repository", trust: "untrusted", text: `${repo.fullName}: ${repo.description ?? ""} (${repo.primaryLanguage ?? "unknown"})`, truncated: false });
        else if (section === "commits") sections.push({ id: section, title: "Recent commits", trust: "untrusted", text: "0000000 Mock commit 1", truncated: false });
        else {
          const note = projects.get(repo.fullName)?.notes ?? "";
          if (note) sections.push({ id: section, title: "Project notes", trust: "untrusted", text: note, truncated: false });
        }
      }
    }
    return { sections, omitted, totalChars: sections.reduce((sum, section) => sum + section.text.length, 0) };
  }
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

    "ai.listProviders": () => providerList(),
    "ai.saveProvider": (settings) => {
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(settings.id) || settings.id === "mock") {
        throw new MockFailure({ code: "invalid_request", message: "provider id must be 1-32 lowercase letters, digits or dashes", retryable: false });
      }
      const url = new URL(settings.baseUrl);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((!local && url.protocol !== "https:") || settings.models.length === 0) {
        throw new MockFailure({ code: "invalid_request", message: "a remote provider must use https, with at least one model", retryable: false });
      }
      const previous = providers.get(settings.id);
      const kind = local ? "local" : "cloud";
      const credential = kind === "local" ? "not_required" : previous?.credential === "stored" ? "stored" : "missing";
      providers.set(settings.id, {
        id: settings.id, displayName: settings.displayName, kind, available: credential !== "missing", models: settings.models,
        api: settings.api, defaultModel: settings.defaultModel ?? settings.models[0] ?? null, baseUrl: settings.baseUrl,
        credential, lastCheck: null, builtIn: false,
      });
      emit("ai.providersChanged", providerList());
      return provider(settings.id);
    },
    "ai.removeProvider": ({ providerId }) => {
      if (provider(providerId).builtIn) throw new MockFailure({ code: "invalid_request", message: "built-in provider", retryable: false });
      providers.delete(providerId);
      emit("ai.providersChanged", providerList());
      return {};
    },
    "ai.requestCredential": ({ providerId }) => {
      if (provider(providerId).kind !== "cloud") throw new MockFailure({ code: "invalid_request", message: "local providers take no key", retryable: false });
      // Stands in for the native secure prompt: no key value exists in the mock.
      void wait(streamIntervalMs).then(() => updateProvider(providerId, { credential: "stored" }));
      return {};
    },
    "ai.deleteCredential": ({ providerId }) => {
      const current = provider(providerId);
      return current.kind === "cloud" ? updateProvider(providerId, { credential: "missing", lastCheck: null }) : current;
    },
    "ai.validateProvider": ({ providerId }) => {
      const current = provider(providerId);
      const ok = current.credential !== "missing";
      return updateProvider(providerId, {
        lastCheck: {
          ok, checkedAt: new Date().toISOString(), code: ok ? null : "not_authenticated",
          message: ok ? null : "no API key stored", models: ok ? current.models : [],
        },
      });
    },
    "ai.previewContext": ({ context, providerId }) => mockContext(context, provider(providerId ?? prefs.ai.defaultProviderId ?? "mock").kind),
    "ai.chat": ({ messages, providerId }) => {
      const target = provider(providerId ?? prefs.ai.defaultProviderId ?? "mock");
      if (!target.available) throw new MockFailure({ code: "unavailable", message: `provider ${target.id} is not configured`, retryable: false });
      if (messages.length === 0 || messages.some((m) => m.role === "system")) {
        throw new MockFailure({ code: "invalid_request", message: "messages must be user/assistant and not empty", retryable: false });
      }
      streamCounter += 1;
      const streamId = `mock-stream-${streamCounter}`;
      activeStreams.add(streamId);
      let seq = 0;
      const last = messages.at(-1)?.content ?? "";
      const words = `[mock] You said: ${last}`.split(/(?<= )/);
      void (async () => {
        for (const delta of words) {
          await wait(streamIntervalMs);
          if (!activeStreams.has(streamId)) return;
          emit("ai.chunk", { streamId, seq: ++seq, delta });
        }
        if (!activeStreams.delete(streamId)) return;
        emit("ai.done", { streamId, seq: ++seq, finishReason: "stop" });
      })();
      cancelStream.set(streamId, () => emit("ai.done", { streamId, seq: ++seq, finishReason: "cancelled" }));
      return { streamId };
    },
    "ai.cancel": ({ streamId }) => {
      if (activeStreams.delete(streamId)) cancelStream.get(streamId)?.();
      cancelStream.delete(streamId);
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
