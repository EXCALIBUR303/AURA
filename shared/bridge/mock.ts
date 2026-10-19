// In-browser stand-in for the native host. Used by `npm run dev` in a normal
// browser and by tests. All data is synthetic and labelled as such: owners are
// "mock-user", URLs use the reserved .invalid TLD. Never put real data here.

import { WORLD_PREFERENCES_VERSION, WORLD_ROOM_ID_PATTERN } from "../contracts/domain.ts";
import { BRIDGE_PROTOCOL_VERSION } from "../contracts/envelope.ts";
import type { BridgeEventMessage, BridgeRequest, BridgeResponse } from "../contracts/envelope.ts";
import type { BridgeError } from "../contracts/errors.ts";
import type { BridgeEventName, EventPayload } from "../contracts/events.ts";
import type { BridgeMethod, MethodParams, MethodResult } from "../contracts/methods.ts";
import type {
  AIApprovalDecision,
  AIApprovalRequest,
  AIContextRequest,
  AIContextSection,
  AIContextSnapshot,
  AIConversationInfo,
  AIConversationTurn,
  AIProviderInfo,
  AISourceRef,
  AIToolActivity,
  AITurnState,
  CommitSummary,
  GitHubAccount,
  GitHubAuthStatus,
  GitHubInstallation,
  Preferences,
  PreferencesPatch,
  ProjectRecord,
  ProjectZoneSuggestion,
  RepositorySummary,
  RepositoryTree,
  VoiceCapabilities,
  VoiceIssue,
  VoiceIssueCode,
  VoiceListenMode,
  VoiceStatus,
  WorldPreferences,
} from "../contracts/domain.ts";
import type { BridgeTransport } from "./transport.ts";

export const DEFAULT_PREFERENCES: Preferences = {
  lastZone: "studio",
  reduceMotion: false,
  voice: { enabled: true, locale: "en-US", synthesisVoiceId: null, autoSpeakReplies: false, speechRate: 0.85, allowServerRecognition: false },
  ai: { defaultProviderId: null, contextSharing: true, privateRepositoryContext: "never" },
  graphics: { quality: "high", maxPixelRatio: 2 },
  world: { schemaVersion: WORLD_PREFERENCES_VERSION, presentation: "static", floatIntensity: 0.35, lightingPreset: "daylight", cameraMode: "inspect", lastRoomId: "project-hub" },
};

const WORLD_ENUMS = {
  presentation: ["static", "floating", "hybrid"],
  lightingPreset: ["daylight", "sunset", "night"],
  cameraMode: ["inspect", "explore"],
} as const;

/** Same rules as PreferencesPatch.World in BridgeDomain.swift: reject bad values, clamp intensity. */
function mergeWorld(current: WorldPreferences, patch: PreferencesPatch["world"]): WorldPreferences {
  if (patch === undefined) return current;
  const invalid = (message: string) => new MockFailure({ code: "invalid_request", message, retryable: false });
  if (current.schemaVersion !== WORLD_PREFERENCES_VERSION) throw invalid("world preferences were saved by a newer AURA");
  for (const key of ["presentation", "lightingPreset", "cameraMode"] as const) {
    const value = patch[key];
    if (value !== undefined && !(WORLD_ENUMS[key] as readonly string[]).includes(value)) throw invalid(`invalid world.${key}`);
  }
  const intensity = patch.floatIntensity;
  if (intensity !== undefined && (typeof intensity !== "number" || !Number.isFinite(intensity))) throw invalid("invalid world.floatIntensity");
  if (patch.lastRoomId !== undefined && (typeof patch.lastRoomId !== "string" || !WORLD_ROOM_ID_PATTERN.test(patch.lastRoomId))) throw invalid("invalid world.lastRoomId");
  return {
    ...current,
    ...(patch.presentation !== undefined ? { presentation: patch.presentation } : {}),
    ...(intensity !== undefined ? { floatIntensity: Math.min(1, Math.max(0, intensity)) } : {}),
    ...(patch.lightingPreset !== undefined ? { lightingPreset: patch.lightingPreset } : {}),
    ...(patch.cameraMode !== undefined ? { cameraMode: patch.cameraMode } : {}),
    ...(patch.lastRoomId !== undefined ? { lastRoomId: patch.lastRoomId } : {}),
  };
}

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

const MOCK_SHA = "0".repeat(40);

/** Synthetic files per mock repository, matching MockGitHubService in Swift. */
function mockFiles(repo: RepositorySummary): Record<string, string> {
  const [path, text] =
    repo.primaryLanguage === "C" ? ["src/main.c", '#include <stdio.h>\n\n// Mock firmware entry point.\nint main(void) {\n    printf("mock\\n");\n    return 0;\n}\n']
    : repo.primaryLanguage === "Python" ? ["eval/run.py", '"""Mock evaluation script."""\n\ndef main() -> None:\n    print("mock")\n\nif __name__ == "__main__":\n    main()\n']
    : ["src/index.ts", '// Mock web app entry point.\nexport function main(): string {\n  return "mock";\n}\n'];
  return {
    "README.md": `# ${repo.name}\n\n${repo.description ?? "Mock repository."}\n\nThis is synthetic mock content.\n`,
    "docs/ARCHITECTURE.md": `# Architecture (mock)\n\nOne module: \`${path}\`.\n`,
    [path]: text,
  };
}

function mockTree(repo: RepositorySummary, ref: string): RepositoryTree {
  const files = mockFiles(repo);
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/").slice(0, -1);
    while (parts.length) { dirs.add(parts.join("/")); parts.pop(); }
  }
  const entries = [
    ...[...dirs].map((path) => ({ path, type: "directory" as const, size: null })),
    ...Object.entries(files).map(([path, text]) => ({ path, type: "file" as const, size: new TextEncoder().encode(text).length })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  return { fullName: repo.fullName, ref, commitSha: MOCK_SHA, entries, truncated: false };
}

function numbered(text: string, start = 1, end?: number): { text: string; lines: { start: number; end: number } } {
  const lines = text.replace(/\n$/, "").split("\n");
  const first = Math.min(Math.max(start, 1), lines.length);
  const last = Math.min(Math.max(end ?? lines.length, first), lines.length);
  const width = String(last).length;
  return {
    text: lines.slice(first - 1, last).map((line, i) => `${String(first + i).padStart(width)}| ${line}`).join("\n"),
    lines: { start: first, end: last },
  };
}

const validPath = (path: string) =>
  path.length > 0 && path.length <= 512 && path.split("/").every((p) => p !== "" && p !== "." && p !== "..") && !/[\u0000-\u001f?#%\\]/.test(path);

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
  /** Mock voice: end every listening attempt with this issue (to design error states). */
  voiceIssue?: VoiceIssueCode;
  /** Mock voice: start with the microphone already granted. */
  voiceGranted?: boolean;
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
    microphone: options.voiceGranted ? "granted" : "not_determined",
    speechRecognition: "not_determined",
    listening: false,
    speaking: false,
    phase: options.voiceGranted ? "idle" : "needs_permission",
    revision: 0,
    sessionActive: false,
    conversationId: null,
    mode: null,
    utteranceId: null,
    speechId: null,
    speakingStreamId: null,
    outputMuted: false,
    speechPaused: false,
    canReplay: false,
    inputDevice: { name: "Mock microphone (offline)", transport: "built_in" },
    issue: null,
  };
  const voiceCapabilities = (): VoiceCapabilities => ({
    input: voice.microphone === "granted" ? "available" : "needs_permission",
    recognition: "on_device",
    engine: "speech_analyzer",
    requiresSpeechRecognitionPermission: false,
    recognitionAssets: "installed",
    locale: prefs.voice.locale,
    liveTranscripts: true,
    autoEndOfUtterance: true,
    handsFreeBargeIn: false,
    maxUtteranceSeconds: 60,
  });
  let voiceRun = 0;
  let utteranceCounter = 0;
  let speechCounter = 0;
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
  function mockContext(request: AIContextRequest, kind: AIProviderInfo["kind"], sourceConsent = false): AIContextSnapshot {
    const sections: AIContextSection[] = [];
    const omitted: AIContextSnapshot["omitted"] = [];
    const wanted = request.include ?? {};
    const repoSections = (["repository", "commits", "notes"] as const).filter((id) => request.repository && wanted[id]);
    const files = request.files ?? [];
    const readme = Boolean(request.repository && wanted.readme);
    if (files.length > 5) throw new MockFailure({ code: "invalid_request", message: "at most 5 files", retryable: false });
    if (files.some((file) => !validPath(file.path))) throw new MockFailure({ code: "invalid_request", message: "path must be a file path inside the repository", retryable: false });
    if (!prefs.ai.contextSharing) {
      if (request.zone) omitted.push({ section: "workspace", reason: "sharing_disabled", path: null });
      repoSections.forEach((section) => omitted.push({ section, reason: "sharing_disabled", path: null }));
      if (readme) omitted.push({ section: "readme", reason: "sharing_disabled", path: null });
      files.forEach((file) => omitted.push({ section: "file", reason: "sharing_disabled", path: file.path }));
      return { sections, omitted, totalChars: 0 };
    }
    const src = (kind: AISourceRef["kind"], extra: Partial<AISourceRef> = {}): AISourceRef => ({ kind, fullName: null, path: null, ref: null, lines: null, ...extra });
    if (request.zone) sections.push({ id: "workspace", title: "Workspace", trust: "app", text: `Active zone: ${request.zone}`, truncated: false, source: src("workspace") });
    if (request.repository && (repoSections.length || readme || files.length)) {
      const repo = MOCK_REPOS.find((r) => r.fullName === request.repository?.fullName);
      const policy = prefs.ai.privateRepositoryContext;
      const blocked = repo?.isPrivate && (policy === "never" || (policy === "local_only" && kind !== "local"));
      const fullName = repo?.fullName ?? null;
      const ref = request.repository.branch ?? repo?.defaultBranch ?? null;
      for (const section of repoSections) {
        if (!repo) omitted.push({ section, reason: "not_found", path: null });
        else if (blocked) omitted.push({ section, reason: "private_repository", path: null });
        else if (section === "repository") sections.push({ id: section, title: "Repository", trust: "untrusted", text: `${repo.fullName}: ${repo.description ?? ""} (${repo.primaryLanguage ?? "unknown"})`, truncated: false, source: src("repository", { fullName, ref }) });
        else if (section === "commits") sections.push({ id: section, title: "Recent commits", trust: "untrusted", text: "0000000 Mock commit 1", truncated: false, source: src("commits", { fullName, ref }) });
        else {
          const note = projects.get(repo.fullName)?.notes ?? "";
          if (note) sections.push({ id: section, title: "Project notes", trust: "untrusted", text: note, truncated: false, source: src("notes", { fullName }) });
          else omitted.push({ section, reason: "not_found", path: null });
        }
      }
      const needsConsent = Boolean(repo?.isPrivate && kind === "cloud" && !sourceConsent);
      const wantedFiles = [...(readme ? [{ path: "README.md", id: "readme" as const }] : []), ...files.map((file) => ({ ...file, id: "file" as const }))];
      for (const file of wantedFiles) {
        const path = file.id === "readme" ? "README.md" : file.path;
        const text = repo ? mockFiles(repo)[path] : undefined;
        if (!repo || text === undefined) omitted.push({ section: file.id, reason: "not_found", path });
        else if (blocked) omitted.push({ section: file.id, reason: "private_repository", path });
        else if (needsConsent) omitted.push({ section: file.id, reason: "consent_required", path });
        else {
          const excerpt = numbered(text, "startLine" in file ? file.startLine : undefined, "endLine" in file ? file.endLine : undefined);
          const title = file.id === "readme" ? "README (README.md)" : `File ${path} lines ${excerpt.lines.start}–${excerpt.lines.end}`;
          sections.push({ id: file.id, title, trust: "untrusted", text: excerpt.text, truncated: false, source: src("file", { fullName, path, ref, lines: excerpt.lines }) });
        }
      }
    }
    return { sections, omitted, totalChars: sections.reduce((sum, section) => sum + section.text.length, 0) };
  }

  // ---------------------------------------------------------- conversations (mock)
  // A simplified host: with a repository and tools on, every reply reads
  // README.md through a simulated tool call (with the same privacy and
  // approval rules as the native host), then echoes the message.
  interface MockConversation {
    info: AIConversationInfo;
    turns: AIConversationTurn[];
    approvals: Map<string, (decision: AIApprovalDecision) => void>;
  }
  const conversations = new Map<string, MockConversation>();
  let conversationCounter = 0;
  const notFound = (what: string) => new MockFailure({ code: "not_found", message: what, retryable: false });
  function conversation(id: string): MockConversation {
    const found = conversations.get(id);
    if (!found) throw notFound(`no conversation ${id}`);
    return found;
  }
  function mockRepositoryRef(ref: { fullName: string; branch?: string }): NonNullable<AIConversationInfo["repository"]> {
    const repo = mockRepo(ref.fullName);
    return { fullName: repo.fullName, branch: ref.branch ?? null, isPrivate: repo.isPrivate };
  }

  async function runMockTurn(conv: MockConversation, turn: AIConversationTurn, text: string, contextRequest: AIContextRequest | undefined): Promise<void> {
    const { streamId } = turn;
    const conversationId = conv.info.conversationId;
    let seq = 0;
    const live = () => activeStreams.has(streamId);
    const state = (next: AITurnState) => {
      if (!live()) return;
      conv.info.state = next;
      turn.state = next;
      emit("ai.turnState", { streamId, conversationId, seq: ++seq, state: next });
    };
    const activity = (next: AIToolActivity) => {
      if (!live()) return;
      const index = turn.tools.findIndex((a) => a.callId === next.callId);
      if (index >= 0) turn.tools[index] = next; else turn.tools.push(next);
      emit("ai.toolActivity", { streamId, conversationId, seq: ++seq, activity: next });
    };
    const ask = (request: Omit<AIApprovalRequest, "approvalId" | "expiresInSeconds" | "providerName" | "providerKind">) =>
      new Promise<AIApprovalDecision>((resolve) => {
        const approvalId = `mock-appr-${++conversationCounter}`;
        conv.approvals.set(approvalId, resolve);
        emit("ai.approvalRequested", { streamId, conversationId, seq: ++seq, approval: {
          ...request, approvalId, expiresInSeconds: 300, providerName: conv.info.providerName, providerKind: conv.info.providerKind,
        } });
      });
    const end = (finishReason: "stop" | "cancelled") => {
      turn.finishReason = finishReason;
      conv.info.activeStreamId = null;
      activeStreams.delete(streamId);
      cancelStream.delete(streamId);
    };
    cancelStream.set(streamId, () => {
      for (const resolve of conv.approvals.values()) resolve("deny");
      conv.approvals.clear();
      conv.info.state = "cancelled";
      turn.state = "cancelled";
      emit("ai.turnState", { streamId, conversationId, seq: ++seq, state: "cancelled" });
      emit("ai.done", { streamId, seq: ++seq, finishReason: "cancelled" });
      end("cancelled");
    });

    await wait(streamIntervalMs);
    state("preparing_context");
    const repo = conv.info.repository;
    const kind = conv.info.providerKind;
    const policy = prefs.ai.privateRepositoryContext;
    const privateAllowed = policy === "all" || (policy === "local_only" && kind === "local");
    if (contextRequest) {
      const request = { ...contextRequest, repository: repo ? { fullName: repo.fullName, branch: repo.branch ?? undefined } : undefined };
      let consent = Boolean(repo && conv.info.sourceSharingAllowed.includes(repo.fullName));
      let snapshot = mockContext(request, kind, consent);
      const needed = snapshot.omitted.filter((o) => o.reason === "consent_required").map((o) => o.path ?? "");
      if (needed.length && repo) {
        state("waiting_for_approval");
        const decision = await ask({ kind: "share_private_source", callId: null, tool: null, summary: `Send ${needed.length} files from the private repository ${repo.fullName} to ${conv.info.providerName}`, repository: repo.fullName, paths: needed });
        if (!live()) return;
        state("preparing_context");
        if (decision !== "deny") {
          consent = true;
          if (decision === "allow_for_conversation") conv.info.sourceSharingAllowed = [repo.fullName];
          snapshot = mockContext(request, kind, consent);
        }
      }
      turn.sources.push(...snapshot.sections.flatMap((section) => (section.source ? [section.source] : [])));
    }
    state("requesting");
    await wait(streamIntervalMs);
    let lead = "";
    if (repo && conv.info.toolsEnabled) {
      const callId = `mock-call-${++conversationCounter}`;
      const tool = "read_repository_file";
      state("waiting_for_tool");
      let allowed = !repo.isPrivate || privateAllowed;
      if (!allowed) {
        activity({ callId, tool, status: "denied", summary: "Refused read_repository_file", sources: [], message: "the repository is private, and AURA's privacy settings do not share private repositories with this provider" });
      } else if (repo.isPrivate && kind === "cloud" && !conv.info.sourceSharingAllowed.includes(repo.fullName)) {
        activity({ callId, tool, status: "awaiting_approval", summary: `Send README.md from the private repository ${repo.fullName} to ${conv.info.providerName}`, sources: [], message: null });
        state("waiting_for_approval");
        const decision = await ask({ kind: "share_private_source", callId, tool, summary: `Send README.md from the private repository ${repo.fullName} to ${conv.info.providerName}`, repository: repo.fullName, paths: ["README.md"] });
        if (!live()) return;
        state("waiting_for_tool");
        if (decision === "allow_for_conversation") conv.info.sourceSharingAllowed = [repo.fullName];
        allowed = decision !== "deny";
        if (!allowed) activity({ callId, tool, status: "denied", summary: "Send README.md", sources: [], message: "the user declined" });
      }
      if (allowed) {
        activity({ callId, tool, status: "running", summary: `Running ${tool}`, sources: [], message: null });
        await wait(streamIntervalMs);
        const readmeText = mockFiles(mockRepo(repo.fullName))["README.md"] ?? "";
        const source: AISourceRef = { kind: "file", fullName: repo.fullName, path: "README.md", ref: MOCK_SHA, lines: numbered(readmeText).lines };
        activity({ callId, tool, status: "succeeded", summary: `Read README.md, lines ${source.lines?.start}–${source.lines?.end}`, sources: [source], message: null });
        turn.sources.push(source);
        if (repo.isPrivate) conv.info.carriesPrivateContext = true;
        lead = "[mock] Read README.md. ";
      }
      state("requesting");
    }
    const words = `${lead}[mock] You said: ${text}`.split(/(?<= )/);
    for (const delta of words) {
      await wait(streamIntervalMs);
      if (!live()) return;
      if (turn.state !== "streaming") state("streaming");
      turn.replyText += delta;
      emit("ai.chunk", { streamId, seq: ++seq, delta });
    }
    if (!live()) return;
    state("completed");
    emit("ai.done", { streamId, seq: ++seq, finishReason: "stop" });
    end("stop");
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
    const merged = { ...voice, ...next };
    if (JSON.stringify({ ...merged, revision: 0 }) === JSON.stringify({ ...voice, revision: 0 })) return voice;
    voice = { ...merged, revision: voice.revision + 1 };
    emit("voice.statusChanged", voice);
    return voice;
  }

  const MOCK_VOICE_ISSUES: Partial<Record<VoiceIssueCode, Omit<VoiceIssue, "code">>> = {
    no_audio: { message: "No audio is arriving from Mock microphone (offline). Try again, or choose another microphone.", recovery: ["retry", "choose_input"], transport: "built_in" },
    input_failed: { message: "The Bluetooth headset's microphone could not start (error -10875). Try again, or choose another microphone.", recovery: ["retry", "choose_input"], transport: "bluetooth" },
    input_lost: { message: "Audio from Mock headset stopped; it may have been disconnected. Try again, or choose another microphone.", recovery: ["retry", "choose_input"], transport: "bluetooth" },
    no_speech: { message: "I didn't hear anything. Press Talk to try again.", recovery: ["retry"], transport: null },
    recognition_unavailable: { message: "The on-device speech model for en-US isn't installed yet.", recovery: ["install_speech_assets"], transport: null },
  };

  function mockVoiceIssue(code: VoiceIssueCode): VoiceIssue {
    const known = MOCK_VOICE_ISSUES[code];
    return { code, message: known?.message ?? `Mock voice issue: ${code}.`, recovery: known?.recovery ?? ["retry"], transport: known?.transport ?? null };
  }

  /** Mock listening: levels, a partial and (auto_end) a final transcript. */
  async function mockListen(run: number, utteranceId: string, mode: VoiceListenMode): Promise<void> {
    await wait(streamIntervalMs * 2);
    if (run !== voiceRun) return;
    if (options.voiceIssue) {
      const issue = mockVoiceIssue(options.voiceIssue);
      setVoice({ phase: options.voiceIssue === "no_speech" ? "idle" : "error", listening: false, mode: null, issue });
      return;
    }
    setVoice({ phase: "listening" });
    for (let i = 0; i < 6 && run === voiceRun && voice.phase === "listening"; i++) {
      emit("voice.inputLevel", { utteranceId, level: 0.2 + 0.5 * Math.abs(Math.sin(i)) });
      if (i === 3) emit("voice.transcript", { utteranceId, seq: 1, text: "mock transcript", isFinal: false });
      await wait(streamIntervalMs);
    }
    if (run === voiceRun && mode === "auto_end" && voice.phase === "listening") await mockFinish(run, utteranceId);
  }

  async function mockFinish(run: number, utteranceId: string): Promise<void> {
    setVoice({ phase: "recognizing", listening: false });
    await wait(streamIntervalMs * 2);
    if (run !== voiceRun) return;
    emit("voice.transcript", { utteranceId, seq: 2, text: "mock transcript complete", isFinal: true });
    setVoice({ phase: "idle", mode: null });
  }

  /** Mock speech: one progress pair and a few levels per sentence. */
  // The last spoken text, for voice.replay (cleared with its conversation).
  let lastSpeech: { text: string; streamId: string | null } | null = null;

  async function mockSpeak(text: string, streamId: string | null): Promise<void> {
    const run = ++voiceRun;
    const speechId = `speech-mock-${++speechCounter}`;
    lastSpeech = { text, streamId };
    setVoice({ phase: "speaking", speaking: true, listening: false, mode: null, speechId, speakingStreamId: streamId, speechPaused: false, issue: null });
    const sentences = text.replace(/```[\s\S]*?```/g, " I've put the code on screen. ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const [segment, sentence] of sentences.entries()) {
      if (run !== voiceRun) return;
      emit("voice.speechProgress", { speechId, streamId, segment, text: sentence, state: "started" });
      for (let i = 0; i < 4 && run === voiceRun; i++) {
        while (voice.speechPaused && run === voiceRun) await wait(streamIntervalMs);
        emit("voice.speechLevel", { level: Math.abs(Math.sin(i + segment)) });
        await wait(streamIntervalMs);
      }
      if (run !== voiceRun) return;
      emit("voice.speechProgress", { speechId, streamId, segment, text: sentence, state: "finished" });
    }
    emit("voice.speechLevel", { level: 0 });
    setVoice({ phase: "idle", speaking: false, speechId: null, speakingStreamId: null, speechPaused: false, canReplay: true });
  }

  /** A reset or ended conversation's replies can no longer be replayed. */
  function forgetSpokenReplies(turns: { streamId: string }[]): void {
    const spoken = lastSpeech?.streamId;
    if (!spoken || !turns.some((turn) => turn.streamId === spoken)) return;
    if (voice.speakingStreamId === spoken) stopMockSpeech();
    lastSpeech = null;
    setVoice({ canReplay: false });
  }

  function stopMockSpeech(): void {
    if (!voice.speaking) return;
    voiceRun++;
    emit("voice.speechLevel", { level: 0 });
    setVoice({ phase: "idle", speaking: false, speechId: null, speakingStreamId: null, speechPaused: false, canReplay: lastSpeech !== null });
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
      const world = mergeWorld(prefs.world, patch.world);
      prefs = {
        ...prefs,
        ...(patch.lastZone !== undefined ? { lastZone: patch.lastZone } : {}),
        ...(patch.reduceMotion !== undefined ? { reduceMotion: patch.reduceMotion } : {}),
        voice: { ...prefs.voice, ...patch.voice },
        ai: { ...prefs.ai, ...patch.ai },
        graphics: { ...prefs.graphics, ...patch.graphics },
        world,
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
    "github.listFiles": ({ fullName, branch, path, limit }) => {
      if (path !== undefined && !validPath(path)) throw new MockFailure({ code: "invalid_request", message: "path must be a file path inside the repository", retryable: false });
      const repo = mockRepo(fullName);
      const tree = mockTree(repo, branch ?? repo.defaultBranch);
      if (path !== undefined && !tree.entries.some((e) => e.path === path && e.type === "directory")) throw notFound(`${path} is not a directory`);
      const entries = tree.entries.filter((e) => path === undefined || e.path.startsWith(`${path}/`));
      const max = Math.min(Math.max(limit ?? 500, 1), 1000);
      return { ...tree, entries: entries.slice(0, max), truncated: entries.length > max };
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
    "ai.previewContext": ({ context, providerId, conversationId }) => {
      if (conversationId) {
        const conv = conversation(conversationId);
        if (context.repository) throw new MockFailure({ code: "invalid_request", message: "a conversation uses its own repository; change it with ai.setConversationRepository", retryable: false });
        const repo = conv.info.repository;
        return mockContext({ ...context, repository: repo ? { fullName: repo.fullName, branch: repo.branch ?? undefined } : undefined }, conv.info.providerKind,
          Boolean(repo && conv.info.sourceSharingAllowed.includes(repo.fullName)));
      }
      return mockContext(context, provider(providerId ?? prefs.ai.defaultProviderId ?? "mock").kind);
    },
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
    "ai.startConversation": ({ providerId, model, repository, tools }) => {
      const target = provider(providerId ?? prefs.ai.defaultProviderId ?? "mock");
      if (!target.available) throw new MockFailure({ code: "unavailable", message: `provider ${target.id} is not configured`, retryable: false });
      const chosen = model ?? target.defaultModel ?? target.models[0];
      if (!chosen || !target.models.includes(chosen)) throw new MockFailure({ code: "invalid_request", message: `model ${model} is not configured`, retryable: false });
      const conversationId = `conv-mock-${++conversationCounter}`;
      const info: AIConversationInfo = {
        conversationId, providerId: target.id, providerName: target.displayName, providerKind: target.kind, model: chosen,
        repository: repository ? mockRepositoryRef(repository) : null, toolsEnabled: (tools ?? true) && prefs.ai.contextSharing,
        state: "idle", activeStreamId: null, turnCount: 0, carriesPrivateContext: false, sourceSharingAllowed: [], createdAt: new Date().toISOString(),
      };
      conversations.set(conversationId, { info, turns: [], approvals: new Map() });
      return structuredClone(info);
    },
    "ai.listConversations": () => [...conversations.values()].map((c) => structuredClone({ ...c.info, turnCount: c.turns.length })),
    "ai.getConversation": ({ conversationId }) => {
      const conv = conversation(conversationId);
      return structuredClone({ conversation: { ...conv.info, turnCount: conv.turns.length }, turns: conv.turns });
    },
    "ai.sendMessage": ({ conversationId, text, context }) => {
      const conv = conversation(conversationId);
      if (conv.info.activeStreamId) throw new MockFailure({ code: "invalid_request", message: "a reply is already in progress in this conversation", retryable: false });
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 32000) throw new MockFailure({ code: "invalid_request", message: "text must be 1-32000 characters", retryable: false });
      if (context && "repository" in context && (context as AIContextRequest).repository) {
        throw new MockFailure({ code: "invalid_request", message: "a conversation uses its own repository; change it with ai.setConversationRepository", retryable: false });
      }
      if (context?.files?.length && !conv.info.repository) throw new MockFailure({ code: "invalid_request", message: "select a repository for this conversation before attaching files", retryable: false });
      streamCounter += 1;
      const streamId = `mock-stream-${streamCounter}`;
      activeStreams.add(streamId);
      const turn: AIConversationTurn = { streamId, userText: trimmed, replyText: "", finishReason: null, state: "idle", tools: [], sources: [] };
      conv.turns.push(turn);
      conv.info.activeStreamId = streamId;
      conv.info.state = "idle";
      void runMockTurn(conv, turn, trimmed, context);
      return { streamId };
    },
    "ai.setConversationRepository": ({ conversationId, repository }) => {
      const conv = conversation(conversationId);
      if (conv.info.activeStreamId) throw new MockFailure({ code: "invalid_request", message: "wait for the reply to finish, or cancel it, before switching repositories", retryable: false });
      conv.info.repository = repository ? mockRepositoryRef(repository) : null;
      conv.info.sourceSharingAllowed = [];
      const info = structuredClone({ ...conv.info, turnCount: conv.turns.length });
      emit("ai.conversationChanged", { conversationId, reason: "repository_changed", conversation: info });
      return info;
    },
    "ai.resetConversation": ({ conversationId }) => {
      const conv = conversation(conversationId);
      if (conv.info.activeStreamId && activeStreams.delete(conv.info.activeStreamId)) cancelStream.get(conv.info.activeStreamId)?.();
      forgetSpokenReplies(conv.turns);
      conv.turns = [];
      Object.assign(conv.info, { state: "idle", activeStreamId: null, carriesPrivateContext: false, sourceSharingAllowed: [] });
      const info = structuredClone({ ...conv.info, turnCount: 0 });
      emit("ai.conversationChanged", { conversationId, reason: "reset", conversation: info });
      return info;
    },
    "ai.endConversation": ({ conversationId }) => {
      const conv = conversation(conversationId);
      if (conv.info.activeStreamId && activeStreams.delete(conv.info.activeStreamId)) cancelStream.get(conv.info.activeStreamId)?.();
      forgetSpokenReplies(conv.turns);
      conversations.delete(conversationId);
      emit("ai.conversationChanged", { conversationId, reason: "ended", conversation: null });
      return {};
    },
    "ai.respondToApproval": ({ conversationId, approvalId, decision }) => {
      const conv = conversation(conversationId);
      const resolve = conv.approvals.get(approvalId);
      if (!resolve) throw notFound(`no pending approval ${approvalId} in this conversation`);
      if (!["allow_once", "allow_for_conversation", "deny"].includes(decision)) {
        throw new MockFailure({ code: "invalid_request", message: "decision must be allow_once, allow_for_conversation or deny", retryable: false });
      }
      conv.approvals.delete(approvalId);
      resolve(decision);
      return {};
    },

    "voice.getStatus": () => voice,
    "voice.getCapabilities": () => voiceCapabilities(),
    "voice.requestPermissions": () => {
      const status = setVoice({ microphone: "granted", phase: voice.phase === "needs_permission" ? "idle" : voice.phase, issue: null });
      emit("voice.capabilitiesChanged", voiceCapabilities());
      return status;
    },
    "voice.startSession": ({ conversationId }) => setVoice({ sessionActive: true, conversationId: conversationId ?? null, issue: null }),
    "voice.endSession": () => {
      voiceRun++;
      return setVoice({ sessionActive: false, conversationId: null, listening: false, speaking: false, mode: null, speechId: null, speakingStreamId: null, outputMuted: false, speechPaused: false, issue: null, phase: voice.microphone === "granted" ? "idle" : "needs_permission" });
    },
    "voice.startListening": ({ mode }) => {
      if (voice.microphone !== "granted") {
        setVoice({ phase: "needs_permission" });
        throw new MockFailure({ code: "permission_denied", message: "call voice.requestPermissions first", retryable: false });
      }
      stopMockSpeech();
      const run = ++voiceRun;
      const utteranceId = `utt-mock-${++utteranceCounter}`;
      const listenMode = mode ?? "auto_end";
      const status = setVoice({ sessionActive: true, phase: "starting", listening: true, mode: listenMode, utteranceId, issue: null });
      void mockListen(run, utteranceId, listenMode);
      return status;
    },
    "voice.stopListening": () => {
      if (voice.phase !== "listening" && voice.phase !== "starting") return voice;
      if (voice.phase === "starting") { voiceRun++; return setVoice({ phase: "idle", listening: false, mode: null }); }
      void mockFinish(voiceRun, voice.utteranceId ?? "");
      return voice;
    },
    "voice.cancelListening": () => {
      if (!voice.listening && voice.phase !== "recognizing") return voice;
      voiceRun++;
      return setVoice({ phase: "idle", listening: false, mode: null, issue: null });
    },
    "voice.speak": ({ text, interrupt }) => {
      if (!text.trim()) throw new MockFailure({ code: "invalid_request", message: "nothing to speak", retryable: false });
      if (voice.outputMuted) return {};
      if (voice.speaking && interrupt === false) throw new MockFailure({ code: "invalid_request", message: "already speaking", retryable: false });
      void mockSpeak(text, null);
      return {};
    },
    "voice.speakReply": ({ conversationId, streamId }) => {
      const turn = conversations.get(conversationId)?.turns.find((t) => t.streamId === streamId);
      if (!turn) throw new MockFailure({ code: "not_found", message: "no such reply in this conversation", retryable: false });
      if (turn.finishReason === "cancelled" || turn.finishReason === "error") {
        throw new MockFailure({ code: "invalid_request", message: "that reply was not completed", retryable: false });
      }
      if (voice.outputMuted || voice.speakingStreamId === streamId) return voice;
      const run = ++voiceRun;
      setVoice({ phase: "thinking", speaking: true, listening: false, speakingStreamId: streamId, issue: null });
      void (async () => {
        for (let i = 0; i < 400 && !turn.finishReason && run === voiceRun; i++) await wait(streamIntervalMs);
        if (run === voiceRun && turn.finishReason === "stop") await mockSpeak(turn.replyText, streamId);
        else if (run === voiceRun) stopMockSpeech();
      })();
      return voice;
    },
    "voice.stopSpeaking": () => {
      stopMockSpeech();
      return {};
    },
    "voice.pauseSpeaking": () => {
      if (!voice.speaking || voice.speechPaused) return voice;
      emit("voice.speechLevel", { level: 0 });
      return setVoice({ speechPaused: true });
    },
    "voice.resumeSpeaking": () => (voice.speaking && voice.speechPaused ? setVoice({ speechPaused: false }) : voice),
    "voice.replay": () => {
      if (!lastSpeech) throw notFound("nothing has been spoken yet");
      if (voice.outputMuted) return voice;
      void mockSpeak(lastSpeech.text, lastSpeech.streamId);
      return voice;
    },
    "voice.setOutputMuted": ({ muted }) => {
      if (muted) stopMockSpeech();
      return setVoice({ outputMuted: muted });
    },
    "voice.listVoices": ({ locale }) => [{ id: "mock.voice", name: "Mock voice (offline)", locale: locale ?? prefs.voice.locale, quality: "default" }],
    "voice.openSettings": () => ({}),
    "voice.installRecognitionAssets": () => {
      void wait(streamIntervalMs).then(() => emit("voice.capabilitiesChanged", voiceCapabilities()));
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
