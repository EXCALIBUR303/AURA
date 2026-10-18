import type { BridgeEventName, BridgeMethods, EventPayload, VoiceCapabilities, VoiceListenMode, VoicePhase, VoiceStatus } from "@aura/contracts";

export type VoiceSamples = { input: number; output: number; phase: VoicePhase };
export type VoiceHost = {
  call<M extends keyof BridgeMethods>(method: M, params: BridgeMethods[M]["params"]): Promise<BridgeMethods[M]["result"]>;
  on<E extends BridgeEventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
};
export type FinalTranscript = { utteranceId: string; text: string; generation: number };
export type VoiceView = {
  status: VoiceStatus | null; capabilities: VoiceCapabilities | null; loading: boolean; busy: boolean;
  partial: string; final: FinalTranscript | null; caption: string; issue: string; notice: string;
  permission: boolean; installing: boolean;
};
type Options = {
  conversationId: string | null; visible: boolean; enabled: boolean; canTalk: boolean;
  prepare: () => Promise<{ conversationId: string } | null>;
  final: (transcript: FinalTranscript) => void;
  cleared: () => void;
  expand: () => void;
};
const initial: VoiceView = { status: null, capabilities: null, loading: true, busy: false, partial: "", final: null, caption: "", issue: "", notice: "", permission: false, installing: false };
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const voiceError = (error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? error.code : "internal";
  return code === "permission_denied" ? "Voice permission is needed. Check access before trying again."
    : code === "unavailable" ? "Voice is unavailable in this host. Use the bundled AURA.app for native voice."
      : code === "timeout" ? "The voice action was not confirmed. Check voice status before trying again."
        : code === "not_found" ? "This spoken reply is no longer held by the host."
          : code === "invalid_request" ? "Voice cannot perform that action now. Stop the current activity and try again."
            : "The voice action could not be completed. Check voice status and try again.";
};

/** Frontend coordinator; native owns capture, recognition, playback and permissions.
 * Level listeners are separate from the React view: never redraw App for audio.
 */
export class VoiceController {
  private view: VoiceView = initial;
  private listeners = new Set<() => void>();
  private levels = new Set<() => void>();
  private off: (() => void)[] = [];
  private mounted = false;
  private lifetime = 0;
  private revision = -1;
  private generation = 0;
  private intent = 0;
  private run: { id: string | null; seq: number; final: boolean; generation: number; conversationId: string } | null = null;
  private early: EventPayload<"voice.transcript">[] = [];
  private progress: EventPayload<"voice.speechProgress">[] = [];
  private segment = -1;
  private segmentFinished = false;
  private outputStopped = false;
  private discardedUtterances = new Set<string>();
  private accepting = false;
  private preparing = false;
  private releaseWanted = false;
  private closed = false;
  private binding: string | null = null;
  private failedBinding: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private read = 0;
  private capabilityVersion = 0;
  private windowActive = true;
  private options: Options | null = null;
  private host: VoiceHost;
  readonly samples: VoiceSamples;

  constructor(host: VoiceHost, samples: VoiceSamples) { this.host = host; this.samples = samples; }
  snapshot = () => this.view;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  subscribeLevels = (callback: () => void) => { this.levels.add(callback); return () => { this.levels.delete(callback); }; };
  levelSnapshot = () => this.samples.phase === "listening" ? this.samples.input : this.samples.phase === "speaking" ? this.samples.output : 0;
  private update(patch: Partial<VoiceView>) { this.view = { ...this.view, ...patch }; if (this.mounted) this.listeners.forEach((notify) => notify()); }
  private clearLevels() { this.samples.input = 0; this.samples.output = 0; this.levels.forEach((notify) => notify()); }
  private invalidate(clear = true) {
    if (this.run?.id) this.discardedUtterances.add(this.run.id);
    if (this.discardedUtterances.size > 32) this.discardedUtterances.delete(this.discardedUtterances.values().next().value!);
    this.generation++; this.intent++; this.run = null; this.accepting = false; this.preparing = false;
    this.outputStopped = true;
    this.early = []; this.progress = []; this.releaseWanted = false; this.clearLevels();
    if (clear) this.update({ partial: "", final: null, caption: "", permission: false });
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(action); this.queue = result.catch(() => {}); return result;
  }
  mount() {
    this.mounted = true; const lifetime = ++this.lifetime;
    this.off = [
      this.host.on("voice.statusChanged", this.status),
      this.host.on("voice.capabilitiesChanged", (value) => {
        this.capabilityVersion++;
        this.update({ capabilities: value, installing: false, ...(this.view.installing ? { notice: value.recognitionAssets === "installed" ? "Speech model is ready. Choose Talk when you are ready." : "The speech model is not ready yet. Check access or try downloading again." } : {}) });
      }),
      this.host.on("voice.transcript", this.transcript),
      this.host.on("voice.inputLevel", (value) => {
        if (!this.windowActive || !this.accepting || this.samples.phase !== "listening" || value.utteranceId !== this.view.status?.utteranceId || !this.options?.visible) return;
        this.samples.input = clamp(value.level); this.levels.forEach((notify) => notify());
      }),
      this.host.on("voice.speechLevel", ({ level }) => {
        if (!this.windowActive || this.outputStopped || this.samples.phase !== "speaking" || !this.options?.visible) return;
        this.samples.output = clamp(level); this.levels.forEach((notify) => notify());
      }),
      this.host.on("voice.speechProgress", this.speechProgress),
      this.host.on("ai.conversationChanged", (event) => {
        if (event.conversationId !== this.options?.conversationId || event.reason === "tools_unavailable") return;
        this.invalidate(); this.options?.cleared(); this.binding = null;
        void this.serial(async () => { this.status(await this.host.call("voice.endSession", {})); }).catch(this.fail);
      }),
      this.host.on("github.authChanged", () => { this.invalidate(); this.options?.cleared(); void this.end(); }),
      this.host.on("app.windowStateChanged", (window) => {
        this.windowActive = window.active && window.visible;
        if (!this.windowActive) { void this.cancel(); if (this.view.status?.speaking) void this.stopSpeaking(); }
        else void this.refresh();
      }),
    ];
    void this.refresh();
    return () => {
      if (lifetime !== this.lifetime) return;
      this.mounted = false; this.lifetime++; this.off.forEach((off) => off()); this.off = []; this.invalidate(); this.binding = null;
      // Ordered ahead of the next StrictMode setup/bind; never end a newer session.
      void this.serial(() => this.host.call("voice.endSession", {})).catch(() => {});
    };
  }
  configure(options: Options) {
    const previous = this.options;
    this.options = options;
    const changed = previous && previous.conversationId !== options.conversationId;
    const adopted = changed && previous.conversationId === null && (this.preparing || !this.closed && this.view.status?.conversationId === options.conversationId);
    if (changed && !adopted) { this.invalidate(); options.cleared(); this.closed = false; this.binding = null; }
    if (!options.visible || !options.enabled) {
      if (previous?.visible && previous.enabled) void this.end();
      return;
    }
    const restored = this.view.status;
    if (!this.run && !this.preparing && !this.closed && restored?.utteranceId && !this.discardedUtterances.has(restored.utteranceId) && restored.conversationId === options.conversationId && (restored.listening || restored.phase === "recognizing")) {
      this.run = { id: restored.utteranceId, seq: -1, final: false, generation: this.generation, conversationId: restored.conversationId! }; this.accepting = true;
    }
    if (options.conversationId && !this.view.loading && this.view.status && this.view.status.phase !== "unavailable" && !this.closed && this.binding !== options.conversationId && this.failedBinding !== options.conversationId && !this.preparing) {
      void this.bind(options.conversationId).catch(this.fail);
    }
  }
  private fail = (error: unknown) => { if (this.mounted) this.update({ issue: voiceError(error) }); };
  refresh = async () => {
    const request = ++this.read, lifetime = this.lifetime, capabilityVersion = this.capabilityVersion;
    try {
      const [status, capabilities] = await Promise.all([this.host.call("voice.getStatus", {}), this.host.call("voice.getCapabilities", {})]);
      if (!this.mounted || request !== this.read || lifetime !== this.lifetime) return;
      this.status(status);
      this.update({ ...(capabilityVersion === this.capabilityVersion ? { capabilities } : {}), loading: false, issue: "" });
    } catch (error) { if (this.mounted && lifetime === this.lifetime) this.update({ loading: false, issue: voiceError(error) }); }
  };
  private status = (value: VoiceStatus) => {
    if (!this.mounted || value.revision <= this.revision) return;
    this.revision = value.revision;
    const before = this.view.status;
    this.samples.phase = this.options?.visible && this.options.enabled ? value.phase : "idle";
    if (value.phase !== before?.phase || !value.listening && !value.speaking) this.clearLevels();
    if (before?.speechId !== value.speechId || !value.speaking) { this.segment = -1; this.segmentFinished = false; this.update({ caption: "" }); if (value.speaking && value.speechId) this.outputStopped = false; }
    this.update({ status: value, loading: false });
    if (this.accepting && this.run && !this.run.id && value.utteranceId && ["starting", "listening", "recognizing"].includes(value.phase)) {
      this.run.id = value.utteranceId; const buffer = this.early; this.early = []; buffer.forEach(this.transcript);
    }
    if (value.speechId && this.progress.length) { const buffer = this.progress; this.progress = []; buffer.forEach(this.speechProgress); }
    if (value.issue?.code === "conversation_ended") {
      this.invalidate(); this.closed = true; this.binding = null; this.options?.cleared(); this.update({ notice: value.issue.message });
      void this.serial(async () => { this.status(await this.host.call("voice.endSession", {})); }).catch(this.fail);
    } else if (["interrupted", "error", "unavailable"].includes(value.phase) || value.phase === "idle" && value.issue?.code === "no_speech") {
      this.run = null; this.accepting = false; this.update({ partial: "" });
    }
  };
  private transcript = (value: EventPayload<"voice.transcript">) => {
    if (!this.mounted || !this.accepting || !this.run) return;
    if (!this.run.id) { if (this.early.length < 32) this.early.push(value); return; }
    if (value.utteranceId !== this.run.id || value.seq <= this.run.seq || this.run.final || this.run.generation !== this.generation) return;
    this.run.seq = value.seq;
    if (!value.isFinal) { this.update({ partial: value.text }); return; }
    this.run.final = true; // Claim before callbacks/awaits: one submission per utterance.
    if (!value.text.trim()) { this.update({ partial: "" }); return; }
    const final = { utteranceId: value.utteranceId, text: value.text, generation: this.generation };
    this.update({ partial: "", final }); this.options?.final(final);
  };
  private speechProgress = (value: EventPayload<"voice.speechProgress">) => {
    if (!this.windowActive || this.outputStopped) return;
    const status = this.view.status;
    if (!this.options?.visible || status?.conversationId !== this.options.conversationId) return;
    if (!status?.speaking || !status.speechId) { if (this.progress.length < 16) this.progress.push(value); return; }
    if (value.speechId !== status.speechId || value.streamId !== status.speakingStreamId || value.segment < this.segment) return;
    if (value.segment > this.segment) { this.segment = value.segment; this.segmentFinished = false; }
    if (value.state === "finished") { this.segmentFinished = true; this.update({ caption: "" }); }
    else if (!this.segmentFinished) this.update({ caption: value.text });
  };
  private async bind(id: string) {
    this.binding = id; const generation = this.generation;
    try { await this.serial(async () => {
      if (!this.mounted || this.closed || generation !== this.generation || !this.options?.visible) return;
      this.status(await this.host.call("voice.startSession", { conversationId: id }));
      this.failedBinding = null;
    }); } catch (error) { this.binding = null; this.failedBinding = id; throw error; }
  }
  start = async (mode: VoiceListenMode = "auto_end") => {
    const options = this.options, status = this.view.status, capabilities = this.view.capabilities;
    if (!this.windowActive || !options?.visible || !options.enabled || !options.canTalk || this.view.busy || !capabilities || capabilities.input === "unavailable" || capabilities.recognition === "unavailable" || status?.phase === "unavailable") return;
    if (status?.microphone === "denied" || status?.microphone === "restricted" || capabilities.requiresSpeechRecognitionPermission && ["denied", "restricted"].includes(status?.speechRecognition ?? "")) return;
    if (status?.microphone !== "granted" || capabilities.requiresSpeechRecognitionPermission && status.speechRecognition !== "granted") {
      this.update({ permission: true }); return;
    }
    const intent = ++this.intent; this.preparing = true; this.releaseWanted = false; this.closed = false;
    this.update({ busy: true, issue: "", final: null, partial: "", notice: "" }); options.expand();
    try {
      const conversation = await options.prepare();
      if (!conversation || intent !== this.intent || !this.mounted || !this.options?.visible) return;
      await this.bind(conversation.conversationId);
      if (intent !== this.intent) return;
      this.run = { id: null, seq: -1, final: false, generation: this.generation, conversationId: conversation.conversationId };
      this.accepting = true; this.early = [];
      const result = await this.host.call("voice.startListening", { mode });
      this.status(result);
      if (intent !== this.intent) { this.status(await this.host.call("voice.cancelListening", {})); return; }
      if (this.run && !this.run.id && result.utteranceId) { this.run.id = result.utteranceId; const buffer = this.early; this.early = []; buffer.forEach(this.transcript); }
      if (this.releaseWanted) this.status(await this.host.call("voice.stopListening", {}));
    } catch (error) { this.accepting = false; this.run = null; this.fail(error); await this.refreshAfterFailure(); }
    finally { this.preparing = false; this.update({ busy: false }); }
  };
  private async refreshAfterFailure() {
    // Keep the call failure visible while reconciling an uncertain native result.
    const issue = this.view.issue; await this.refresh(); if (issue) this.update({ issue });
  }
  finish = async () => {
    if (this.preparing) { this.releaseWanted = true; return; }
    try { this.status(await this.host.call("voice.stopListening", {})); } catch (error) { this.fail(error); }
  };
  cancel = async () => {
    const active = this.preparing || this.view.status?.listening || this.view.status?.phase === "recognizing";
    this.invalidate(false); this.update({ partial: "", final: null });
    if (active) try { this.status(await this.host.call("voice.cancelListening", {})); } catch (error) { this.fail(error); }
  };
  end = async () => {
    this.invalidate(); this.closed = true; this.binding = null;
    try { await this.serial(async () => { this.status(await this.host.call("voice.endSession", {})); }); }
    catch (error) { this.fail(error); }
  };
  stopSpeaking = async () => {
    this.outputStopped = true;
    this.samples.output = 0; this.update({ caption: "" }); this.clearLevels();
    try { await this.host.call("voice.stopSpeaking", {}); await this.refresh(); } catch (error) { this.fail(error); }
  };
  pauseSpeaking = async () => {
    this.samples.output = 0; this.clearLevels();
    try { this.status(await this.host.call("voice.pauseSpeaking", {})); } catch (error) { this.fail(error); }
  };
  resumeSpeaking = async () => {
    try { this.status(await this.host.call("voice.resumeSpeaking", {})); } catch (error) { this.fail(error); }
  };
  /** Speaks the last spoken response again (status.canReplay). */
  replay = async () => {
    if (!this.options?.visible || !this.options.enabled) return;
    this.closed = false; this.outputStopped = false;
    try { this.status(await this.host.call("voice.replay", {})); } catch (error) { this.fail(error); }
  };
  /** Speaks a short sample with the current voice settings. */
  preview = async (text: string) => {
    this.outputStopped = false;
    try { await this.host.call("voice.speak", { text, interrupt: true }); await this.refresh(); } catch (error) { this.fail(error); }
  };
  mute = async (muted: boolean) => {
    if (muted) { this.outputStopped = true; this.clearLevels(); this.update({ caption: "" }); }
    try { this.status(await this.host.call("voice.setOutputMuted", { muted })); } catch (error) { this.fail(error); }
  };
  requestPermissions = async () => {
    this.update({ permission: false, busy: true, issue: "" });
    try { this.status(await this.host.call("voice.requestPermissions", {})); await this.refresh(); }
    catch (error) { this.fail(error); }
    finally { this.update({ busy: false }); }
    // Deliberately require a new Talk gesture. Never open capture after a prompt.
  };
  closePermission = () => this.update({ permission: false });
  dismissFinal = () => this.update({ final: null });
  clearIssue = () => this.update({ issue: "", notice: "" });
  isCurrent = (generation: number) => generation === this.generation && !this.closed && !!this.options?.visible;
  speakReply = async (reply: { conversationId: string; streamId: string }, generation?: number, fallbackText?: string) => {
    if (!this.options?.visible || !this.options.enabled || generation !== undefined && !this.isCurrent(generation)) return;
    this.closed = false; const intent = this.intent;
    this.outputStopped = false;
    try {
      await this.bind(reply.conversationId);
      if (intent !== this.intent) return;
      this.status(await this.host.call("voice.speakReply", reply));
    } catch (error) {
      if (fallbackText && intent === this.intent && error && typeof error === "object" && "code" in error && error.code === "not_found") {
        try { await this.host.call("voice.speak", { text: fallbackText, interrupt: true }); await this.refresh(); } catch (fallbackError) { this.fail(fallbackError); }
      } else this.fail(error);
    }
  };
  openSettings = async (target: "microphone" | "speech_recognition" | "sound_input") => {
    try { await this.host.call("voice.openSettings", { target }); this.update({ notice: "Return here and check voice access after changing System Settings." }); } catch (error) { this.fail(error); }
  };
  install = async () => {
    if (this.view.installing) return;
    this.update({ installing: true, issue: "", notice: "Speech model requested. Waiting for updated availability…" });
    try { await this.host.call("voice.installRecognitionAssets", {}); } catch (error) { this.update({ installing: false }); this.fail(error); }
  };
}
