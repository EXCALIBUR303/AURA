import { useCallback, useEffect, useRef, useState } from "react";
import type { AIProviderInfo, ChatMessage, CompanionState, VoiceStatus } from "@aura/contracts";
import { BridgeCallError } from "@aura/bridge";
import { bridge, useBridgeEvent } from "../platform/bridge.ts";

type StreamEvent = { streamId: string; delta?: string; done?: boolean; error?: string; cancelled?: boolean };

export function useCompanion() {
  const [provider, setProvider] = useState<AIProviderInfo | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const stream = useRef<string | null>(null);
  const starting = useRef(false);
  const epoch = useRef(0);
  const buffered = useRef<StreamEvent[]>([]);
  const output = useRef("");
  const history = useRef<ChatMessage[]>([]);

  useEffect(() => {
    let live = true;
    void bridge.call("ai.listProviders", {}).then((providers) => { if (live) setProvider(providers.find((item) => item.available) ?? null); })
      .catch(() => { if (live) setNotice("AI providers could not be loaded."); });
    void bridge.call("voice.getStatus", {}).then((status) => { if (live) setVoice(status); }).catch((error: unknown) => {
      if (live && error instanceof BridgeCallError && error.code === "unavailable") setVoiceUnavailable(true);
    });
    return () => {
      live = false; epoch.current++;
      if (stream.current) void bridge.call("ai.cancel", { streamId: stream.current }).catch(() => {});
    };
  }, []);

  const receive = (event: StreamEvent) => {
    if (starting.current && !stream.current) { buffered.current.push(event); return; }
    if (event.streamId !== stream.current) return;
    if (event.delta) { output.current += event.delta; setReply(output.current); }
    if (event.done || event.error) {
      if (output.current && !event.error && !event.cancelled) history.current.push({ role: "assistant", content: output.current });
      if (event.error) { setNotice(event.error); setFailure(true); }
      stream.current = null; setBusy(false);
    }
  };
  useBridgeEvent("ai.chunk", receive);
  useBridgeEvent("ai.done", (event) => receive({ ...event, done: true, cancelled: event.finishReason === "cancelled",
    error: event.finishReason === "error" ? "The reply ended with an error. Try again." : undefined }));
  useBridgeEvent("ai.error", (event) => receive({ streamId: event.streamId, error: `Reply unavailable (${event.error.code}). Try again.` }));
  useBridgeEvent("voice.statusChanged", (status) => { setVoice(status); if (!status.speaking) setSpeechLevel(0); });
  useBridgeEvent("voice.speechLevel", ({ level }) => setSpeechLevel(Math.min(1, Math.max(0, level))));
  useBridgeEvent("voice.transcript", ({ text }) => setTranscript(text));

  async function ask(text: string) {
    if (!text.trim() || starting.current || stream.current || !provider) return;
    const current = ++epoch.current;
    starting.current = true; buffered.current = []; output.current = "";
    setReply(""); setBusy(true); setFailure(false); setNotice(null);
    history.current = [...history.current.slice(-8), { role: "user", content: text.trim() }];
    try {
      const { streamId } = await bridge.call("ai.chat", { messages: history.current, providerId: provider.id });
      if (epoch.current !== current) { await bridge.call("ai.cancel", { streamId }); return; }
      stream.current = streamId; starting.current = false;
      const events = buffered.current; buffered.current = [];
      events.forEach(receive);
    } catch (error) {
      if (epoch.current === current) {
        setNotice(error instanceof BridgeCallError ? `AI unavailable (${error.code}).` : "The reply could not be started.");
        setFailure(true); setBusy(false);
      }
    } finally { if (epoch.current === current) starting.current = false; }
  }

  const cancel = useCallback(async () => {
    epoch.current++; starting.current = false; buffered.current = [];
    const id = stream.current; stream.current = null; setBusy(false);
    if (id) {
      try { await bridge.call("ai.cancel", { streamId: id }); }
      catch { setNotice("The reply was dismissed; the host could not confirm cancellation."); }
    }
  }, []);

  async function voiceAction(action: "listen" | "speak") {
    if (voiceBusy || voiceUnavailable) return;
    setVoiceBusy(true); setNotice(null); setFailure(false);
    try {
      if (action === "speak") {
        if (voice?.speaking) await bridge.call("voice.stopSpeaking", {});
        else await bridge.call("voice.speak", { text: reply, interrupt: true });
      } else if (voice?.listening) setVoice(await bridge.call("voice.stopListening", {}));
      else {
        const status = await bridge.call("voice.requestPermissions", {});
        if (status.microphone !== "granted" || status.speechRecognition !== "granted") {
          setNotice("Microphone and speech permissions are required. Check your system settings."); return;
        }
        setTranscript(""); setVoice(await bridge.call("voice.startListening", {}));
      }
    } catch (error) {
      if (error instanceof BridgeCallError && error.code === "unavailable") {
        setVoiceUnavailable(true); setNotice("Voice is unavailable in the native app until Phase 3. You can still type to Astra.");
      } else setNotice(error instanceof BridgeCallError ? `Voice action unavailable (${error.code}).` : "Voice could not start. Try again.");
    } finally { setVoiceBusy(false); }
  }

  const state: CompanionState = failure ? "error" : voice?.speaking ? "speaking" : voice?.listening ? "listening" : busy ? "thinking" : "idle";
  return { provider, reply, busy, ask, cancel, notice, voiceUnavailable, voiceBusy, voice, voiceAction, speechLevel, transcript, state };
}
