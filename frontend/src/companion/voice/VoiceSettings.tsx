import { useEffect, useState } from "react";
import type { Preferences, VoiceOption } from "@aura/contracts";
import { bridge } from "../../platform/bridge.ts";
import { Modal } from "../../components/ui.tsx";
import { voiceError } from "./VoiceController.ts";
import type { VoiceController, VoiceView } from "./VoiceController.ts";

export function VoiceSettings({ prefs, view, controller, edit, setEdit, close }: {
  prefs: Preferences | null; view: VoiceView; controller: VoiceController; edit: boolean; setEdit: (value: boolean) => void; close: () => void;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]), [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState(""), [pending, setPending] = useState(false), [retry, setRetry] = useState(0);
  const locale = prefs?.voice.locale;
  useEffect(() => {
    let live = true; setLoading(true);
    void bridge.call("voice.listVoices", { locale }).then((value) => { if (live) setVoices(value); }).catch((error) => { if (live) setIssue(voiceError(error)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [locale, retry]);
  async function save(patch: Partial<Preferences["voice"]>) {
    if (pending) return;
    setPending(true); setIssue("");
    try { await bridge.call("prefs.update", { voice: patch }); if (patch.enabled === false) await controller.end(); if ("allowServerRecognition" in patch) await controller.refresh(); }
    catch (error) { setIssue(voiceError(error)); }
    finally { setPending(false); }
  }
  const options = prefs?.voice;
  return <Modal title="A voice that fits your work" subtitle="ASTRA / VOICE SETTINGS" close={close}>
    <div className="ui-dialog-body voice-settings">
      {bridge.transportKind === "mock" && <p className="policy-note">Browser mock · voice, transcripts and installed voices are simulated. No microphone is captured.</p>}
      {issue && <p className="inline-error" role="alert">{issue}</p>}
      {!prefs ? <p role="status">Loading voice preferences…</p> : <>
        <label className="voice-setting-row"><span><strong>Enable voice controls</strong><small>Microphone access still requires an explicit Talk action.</small></span><input type="checkbox" checked={options?.enabled ?? false} disabled={pending} onChange={(event) => void save({ enabled: event.target.checked })} /></label>
        <label className="voice-setting-row"><span><strong>Speak replies to spoken requests</strong><small>Off by default. Typed messages stay silent.</small></span><input type="checkbox" checked={options?.autoSpeakReplies ?? false} disabled={pending} onChange={(event) => void save({ autoSpeakReplies: event.target.checked })} /></label>
        <label className="voice-setting-row"><span><strong>Edit before sending</strong><small>Review final speech in the composer. Applies to this page.</small></span><input type="checkbox" checked={edit} onChange={(event) => setEdit(event.target.checked)} /></label>
        <label className="ui-field">Voice<select value={options?.synthesisVoiceId ?? ""} disabled={pending || loading} onChange={(event) => void save({ synthesisVoiceId: event.target.value || null })}><option value="">System default</option>{options?.synthesisVoiceId && !voices.some((value) => value.id === options.synthesisVoiceId) && <option value={options.synthesisVoiceId}>Saved voice · not currently listed</option>}{voices.map((voice) => <option value={voice.id} key={voice.id}>{voice.name} · {voice.locale} · {voice.quality}</option>)}</select></label>
        {loading ? <p role="status" className="help">Loading installed voices…</p> : !voices.length ? <p className="help">No voices were returned. <button onClick={() => setRetry((value) => value + 1)}>Reload voices</button></p> : voices.every((voice) => voice.quality === "default") && <p className="help">Only default-quality voices are installed. Add voices in System Settings → Accessibility → Spoken Content.</p>}
        <label className="ui-field">Speaking pace · {(options?.speechRate ?? 0.85).toFixed(2)}×<input aria-label="Speaking pace" aria-valuetext={`${(options?.speechRate ?? 0.85).toFixed(2)} times the voice's natural pace`} type="range" min="0.7" max="1.3" step="0.05" disabled={pending} value={options?.speechRate ?? 0.85} onChange={(event) => void save({ speechRate: Number(event.target.value) })} /></label>
        <div className="voice-setting-row"><span><strong>Hear this voice</strong><small>1.00× is the voice's natural pace. 0.85× (default) is calmer.</small></span><button className="ui-button" disabled={pending || !!view.status?.outputMuted || view.status?.phase === "unavailable" || !!view.status?.listening} onClick={() => void controller.preview("Hi, I'm Astra. I found three pull requests waiting for review, and one of them fixes a crash on macOS.")}>Preview voice</button></div>
        <div className="voice-setting-row"><span><strong>Input device</strong><small>{view.status?.inputDevice?.name ?? "No input device reported"}</small></span><button className="ui-button" onClick={() => void controller.openSettings("sound_input")}>Choose microphone</button></div>
        {view.capabilities?.engine === "sf_speech_recognizer" && <label className="voice-setting-row"><span><strong>Allow Apple server recognition</strong><small>macOS 15–25 fallback only. When on-device recognition is unavailable, audio may be sent to Apple. Off by default.</small></span><input type="checkbox" disabled={pending} checked={options?.allowServerRecognition ?? false} onChange={(event) => void save({ allowServerRecognition: event.target.checked })} /></label>}
      </>}
      <p className="help">Voice takes turns between listening and speaking. Hands-free interruption is unavailable. Bluetooth headsets may need reconnecting or another input.</p>
      <p className="help">Spoken replies skip code, tables, URLs and tool output. Long replies stop after about 4,000 spoken characters; the rest stays on screen.</p>
      {view.notice && <p className="inline-notice" role="status">{view.notice}</p>}{view.issue && <p className="inline-error" role="alert">{view.issue}</p>}
    </div><footer className="ui-dialog-actions"><button className="ui-button" onClick={() => void controller.refresh()}>Check voice access</button><button className="ui-button primary" onClick={close}>Done</button></footer>
  </Modal>;
}
