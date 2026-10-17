import { useSyncExternalStore } from "react";
import type { VoiceRecovery } from "@aura/contracts";
import { UiIcon } from "../../components/ui.tsx";
import type { VoiceController, VoiceView } from "./VoiceController.ts";

export function VoiceIcon({ speaker = false, off = false }: { speaker?: boolean; off?: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={speaker ? "m11 4-5 5H2v6h4l5 5V4Z" : "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"} />{speaker && !off && <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}{off && <path d="m3 3 18 18" />}</svg>;
}
const recoveryLabels: Record<VoiceRecovery, string> = { retry: "Talk again", choose_input: "Choose microphone", open_microphone_settings: "Microphone settings", open_speech_settings: "Speech Recognition settings", install_speech_assets: "Download speech model" };
export function voiceLabel(view: VoiceView) {
  const status = view.status, issue = status?.issue;
  if (view.loading) return "Checking voice…";
  if (issue?.code === "permission_denied") return status?.microphone === "granted" ? "Speech access denied" : "Microphone access denied";
  if (issue?.code === "permission_restricted") return "Voice access is restricted";
  if (issue?.code === "no_input_device") return "Microphone unavailable";
  if (issue?.code === "no_speech") return "No speech heard";
  if (issue?.code === "time_limit") return "Listening limit reached";
  if (issue?.code === "conversation_ended") return "Voice conversation ended";
  if (!status || status.phase === "unavailable") return "Voice unavailable";
  if (view.capabilities?.recognitionAssets === "downloadable" && view.capabilities.recognition === "unavailable") return "Speech model needed";
  if (view.capabilities?.input === "unavailable") return "Microphone unavailable";
  return ({ idle: "Ready when you are", needs_permission: "Microphone access needed", starting: "Starting microphone…", listening: "Listening", recognizing: "Finishing transcript…", thinking: "Preparing spoken reply", speaking: "Astra is speaking", interrupted: "Voice paused", error: "Voice needs attention" } as const)[status.phase];
}
function Level({ controller, reduced, view }: { controller: VoiceController; reduced: boolean; view: VoiceView }) {
  const level = useSyncExternalStore(controller.subscribeLevels, controller.levelSnapshot);
  const phase = view.status?.phase, active = phase === "listening" || phase === "speaking";
  return <div className="voice-level-line"><div className="voice-level" aria-hidden="true" data-static={reduced}>
    {Array.from({ length: 20 }, (_, i) => <i key={i} data-on={active && (reduced || i / 20 < level)} />)}
  </div><span>{active ? `${phase === "listening" ? "Input" : "Output"} ${reduced ? "active" : "level"}` : phase === "starting" ? "Waiting for audio" : "Microphone off"}</span></div>;
}
export function VoiceRail({ controller, view, enabled, disabled, reduced, settings }: { controller: VoiceController; view: VoiceView; enabled: boolean; disabled: boolean; reduced: boolean; settings: () => void }) {
  const status = view.status, capabilities = view.capabilities, label = voiceLabel(view);
  const capturing = !!status?.listening, recognizing = status?.phase === "recognizing", output = !!status?.speaking;
  const available = enabled && capabilities?.recognition !== "unavailable" && !!capabilities && status?.phase !== "unavailable";
  const denied = status?.microphone === "denied" || status?.microphone === "restricted" || capabilities?.requiresSpeechRecognitionPermission && ["denied", "restricted"].includes(status?.speechRecognition ?? "");
  const tone = status?.phase === "error" || denied || view.issue ? "error" : status?.phase === "interrupted" ? "warning" : status?.phase === "speaking" ? "output" : "input";
  const recovery = status?.issue?.recovery ?? [];
  async function recover(action: VoiceRecovery) {
    if (action === "retry") await controller.start();
    else if (action === "install_speech_assets") await controller.install();
    else await controller.openSettings(action === "choose_input" ? "sound_input" : action === "open_microphone_settings" ? "microphone" : "speech_recognition");
  }
  return <section className="voice-rail" aria-label="Astra voice" data-phase={status?.phase ?? "unavailable"} data-tone={tone} data-active={capturing || recognizing || output || !!status?.issue || !!view.issue || !!view.final}>
    <div className="voice-rail-heading"><span className="voice-state-icon"><VoiceIcon speaker={output} off={!capturing && !output} /></span><div><strong role="status" aria-live="polite" aria-atomic="true">{enabled ? label : "Voice is turned off"}</strong><small title={status?.inputDevice?.name}>{capturing ? "Microphone on" : "Microphone off"}</small></div><button className="voice-icon-button" type="button" aria-label="Voice settings" title="Voice settings" onClick={settings}><UiIcon name="settings" /></button></div>
    <Level controller={controller} reduced={reduced} view={view} />
    {view.partial && <div className="voice-partial"><span>LIVE TRANSCRIPT</span><label className="sr-only" htmlFor="voice-partial">Live speech transcript, not yet sent</label><textarea id="voice-partial" readOnly value={view.partial} rows={2} aria-live="off" /></div>}
    {view.caption && <div className="voice-caption" aria-live="off"><span>ASTRA IS SAYING</span><p>{view.caption}</p></div>}
    {status?.issue && <p className="voice-issue">{status.issue.message}</p>}
    {view.issue && <p className="voice-call-error" role="alert">{view.issue}</p>}
    {!available && !view.loading && !view.issue && status?.phase === "unavailable" && <p className="voice-issue">Voice unavailable in this host. Use the bundled AURA.app for native voice.</p>}
    <div className="voice-recovery">{recovery.map((action) => <button type="button" key={action} disabled={view.busy || action === "retry" && disabled || action === "install_speech_assets" && view.installing} onClick={() => void recover(action)}>{recoveryLabels[action]}</button>)}
      {!recovery.includes("install_speech_assets") && capabilities?.recognitionAssets === "downloadable" && <button type="button" disabled={view.installing} onClick={() => void controller.install()}>Download speech model</button>}
      {(view.issue || denied || capabilities?.input === "unavailable") && <button type="button" onClick={() => void controller.refresh()}>Check voice access</button>}
      {!recovery.includes("choose_input") && capabilities?.input === "unavailable" && status?.phase !== "unavailable" && <button type="button" onClick={() => void controller.openSettings("sound_input")}>Choose microphone</button>}
    </div>
    <div className="voice-rail-actions">
      {available && !denied && capabilities?.input !== "unavailable" && <button type="button" className="voice-talk" disabled={view.busy || recognizing || !capturing && disabled} onClick={() => void (capturing ? controller.finish() : controller.start())}><VoiceIcon />{view.busy ? "Preparing…" : capturing ? "Finish listening" : recognizing ? "Finishing…" : "Talk with Astra"}</button>}
      {(capturing || recognizing || view.busy) && <button type="button" className="voice-cancel" onClick={() => void controller.cancel()}>Cancel listening</button>}
      {output && <button type="button" className="voice-stop" onClick={() => void controller.stopSpeaking()}><UiIcon name="stop" />Stop speaking</button>}
      {status && status.phase !== "unavailable" && <button type="button" className="voice-icon-button" aria-label={status.outputMuted ? "Unmute speech" : "Mute speech"} aria-pressed={status.outputMuted} title={status.outputMuted ? "Unmute speech" : "Mute speech"} onClick={() => void controller.mute(!status.outputMuted)}><VoiceIcon speaker off={status.outputMuted} /></button>}
      {status?.sessionActive && <button type="button" className="voice-end" onClick={(event) => { const rail = event.currentTarget.closest("section"); void controller.end().then(() => rail?.querySelector<HTMLButtonElement>(".voice-talk")?.focus()); }}>End voice</button>}
    </div>
    {capturing && <p className="voice-hint">{status.mode === "push_to_talk" ? "Release ⌥Space to finish" : "Pause to finish"} · Esc to cancel</p>}
    {view.notice && <p className="voice-notice" role="status">{view.notice}<button type="button" aria-label="Dismiss voice notice" onClick={controller.clearIssue}><UiIcon name="close" /></button></p>}
  </section>;
}
