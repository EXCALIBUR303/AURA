import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { VoicePhase, VoiceRecovery, VoiceOption } from "@aura/contracts";
import fixturesRaw from "../../../shared/fixtures/bridge-messages.json?raw";
import { useWorld } from "../world/useWorld.ts";
import { Studio } from "../studio/Studio.tsx";
import type { StudioDiagnostics } from "../studio/diagnostics.ts";
import { EMPTY_DIAGNOSTICS } from "../validation/AvatarProbe.tsx";
import { Modal, UiIcon } from "../components/ui.tsx";
import { ZoneIcon } from "../components/ZoneIcon.tsx";

// Exact shared contract examples; never presented as microphone or model output.
const wire = JSON.parse(fixturesRaw) as { valid: { name: string; message: { payload?: unknown; result?: unknown } }[] };
function sample<T>(name: string): T {
  const item = wire.valid.find((entry) => entry.name === name);
  if (!item) throw new Error(`Missing design fixture: ${name}`);
  return (item.message.payload ?? item.message.result) as T;
}
const transcript = sample<{ text: string }>("event voice.transcript").text;
const caption = sample<{ text: string }>("event voice.speechProgress").text;
const inputLevel = sample<{ level: number }>("event voice.inputLevel").level;
const outputLevel = sample<{ level: number }>("event voice.speechLevel").level;
const voiceOption = sample<VoiceOption[]>("response voice.listVoices")[0];
const audioIssue = sample<{ issue: { message: string } }>("event voice.statusChanged").issue.message;

type Specimen = VoicePhase | "denied" | "restricted" | "no_device" | "no_speech" | "bluetooth" | "model_missing" | "review";
type Layout = "compact" | "expanded" | "focus";
type StateDesign = { title: string; detail: string; tone: "neutral" | "input" | "output" | "warning" | "error"; mic?: boolean; recovery?: VoiceRecovery[] };
const states: Record<Specimen, StateDesign> = {
  idle: { title: "Ready when you are", detail: "Talk, or keep typing. You choose when Astra listens.", tone: "neutral" },
  needs_permission: { title: "Microphone access needed", detail: "A short permission step before your first conversation by voice.", tone: "neutral" },
  starting: { title: "Starting microphone…", detail: "Waiting for the microphone and speech recogniser to be ready.", tone: "input", mic: true },
  listening: { title: "Listening", detail: "Speak naturally. Pause to finish, or choose Finish listening.", tone: "input", mic: true },
  recognizing: { title: "Finishing transcript…", detail: "The microphone is off. Waiting for final text.", tone: "input" },
  thinking: { title: "Preparing spoken reply", detail: "Waiting for the next complete sentence. The microphone is off.", tone: "neutral" },
  speaking: { title: "Astra is speaking", detail: "Follow the sentence here. The full response stays in your conversation.", tone: "output" },
  interrupted: { title: "Voice paused", detail: "Voice stopped when AURA became inactive. Talk again when you are ready.", tone: "warning", recovery: ["retry"] },
  error: { title: "Voice needs attention", detail: audioIssue, tone: "error", recovery: ["retry", "choose_input"] },
  denied: { title: "Microphone access denied", detail: "Allow AURA to use the microphone in System Settings. Text conversation is still available.", tone: "error", recovery: ["open_microphone_settings"] },
  restricted: { title: "Voice access is restricted", detail: "Microphone access is restricted on this Mac. You can continue typing.", tone: "warning" },
  no_device: { title: "Microphone unavailable", detail: "No input device is available. Choose a microphone to continue by voice.", tone: "warning", recovery: ["choose_input"] },
  unavailable: { title: "Voice unavailable", detail: "Native voice requires the bundled AURA.app. Text conversation remains available.", tone: "neutral" },
  no_speech: { title: "No speech heard", detail: "I didn’t hear anything. Press Talk to try again.", tone: "neutral", recovery: ["retry"] },
  bluetooth: { title: "Microphone disconnected", detail: "Audio input stopped. Bluetooth headsets may need reconnecting; you can choose another microphone.", tone: "warning", recovery: ["retry", "choose_input"] },
  model_missing: { title: "Speech model needed", detail: "Download Apple’s on-device speech model before using voice.", tone: "neutral", recovery: ["install_speech_assets"] },
  review: { title: "Ready to send", detail: "Review or edit the final transcript before sending it to Astra.", tone: "neutral" },
};
const choices: [Specimen, string][] = [["idle", "Idle"], ["needs_permission", "First Talk / permission"], ["starting", "Starting microphone"], ["listening", "Listening"], ["recognizing", "Recognising"], ["review", "Final transcript review"], ["thinking", "Thinking"], ["speaking", "Speaking"], ["interrupted", "Interrupted"], ["error", "No audio / error"], ["denied", "Permission denied"], ["restricted", "Permission restricted"], ["no_device", "Microphone unavailable"], ["bluetooth", "Bluetooth disconnected"], ["no_speech", "No speech"], ["model_missing", "Missing model"], ["unavailable", "Unavailable build"]];
const recoveryLabels: Record<VoiceRecovery, string> = { retry: "Talk again", choose_input: "Choose microphone", open_microphone_settings: "Microphone settings", open_speech_settings: "Speech Recognition settings", install_speech_assets: "Download speech model" };

function Mic({ off = false }: { off?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />{off && <path d="m3 3 18 18" />}</svg>;
}
function Speaker({ muted }: { muted: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11 4-5 5H2v6h4l5 5V4Z" />{muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg>;
}

const Scene = memo(function Scene({ reduced }: { reduced: boolean }) {
  const [sceneKey, setSceneKey] = useState(0);
  const {controller,snapshot}=useWorld();
  useEffect(()=>controller.focusWorkspace("companion"),[controller]);
  const [status, setStatus] = useState("loading");
  const report = useCallback((patch: Partial<StudioDiagnostics>) => {
    window.__AURA_DIAGNOSTICS__ = { ...EMPTY_DIAGNOSTICS, zone: "companion", cameraSettled: false, context: "ready", perZone: {}, ...window.__AURA_DIAGNOSTICS__, ...patch };
    if (patch.status) setStatus(patch.status);
  }, []);
  const restart = useCallback(() => { setSceneKey((key) => key + 1); setStatus("loading"); }, []);
  const stay = useCallback(() => {}, []);
  return <><Studio key={sceneKey} zone="companion" revision={0} reducedMotion={reduced} maxDpr={1} state="idle" speechLevel={0} report={report} navigate={stay} restart={restart} focusCompanion={stay} world={snapshot} worldController={controller} openWorldMap={stay} />
    {status !== "loaded" && <div className="vd-scene-feedback" role="status">{status === "error" ? <>Studio could not load. <button onClick={restart}>Retry scene</button></> : "Loading original Astra Lumen II…"}</div>}</>;
});

function Level({ specimen, reduced }: { specimen: Specimen; reduced: boolean }) {
  const active = specimen === "listening" || specimen === "speaking";
  const level = specimen === "listening" ? inputLevel : specimen === "speaking" ? outputLevel : 0;
  return <div className="vd-level-wrap"><div className="vd-level" aria-hidden="true" data-fixed={reduced}>
    {Array.from({ length: 24 }, (_, index) => <i key={index} data-on={active && (reduced || index / 24 < level)} />)}
  </div><span>{active ? `${specimen === "listening" ? "Input" : "Output"} · ${reduced ? "static indicator" : "fixture level sample"}` : specimen === "starting" ? "Waiting for audio" : "Microphone off"}</span></div>;
}

export function VoiceDesignPreview() {
  const [specimen, setSpecimen] = useState<Specimen>("idle");
  const [layout, setLayout] = useState<Layout>("expanded");
  const [dialog, setDialog] = useState<"permission" | "settings" | null>(null);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false), [edit, setEdit] = useState(true), [autoSpeak, setAutoSpeak] = useState(false);
  const [rate, setRate] = useState("1"), [voice, setVoice] = useState("");
  const [notice, setNotice] = useState("");
  const [reduce, setReduce] = useState(false);
  const [systemReduce, setSystemReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [holding, setHolding] = useState(false);
  const held = useRef(false), draftRef = useRef<HTMLTextAreaElement>(null);
  const view = states[specimen];
  const capture = specimen === "listening" || specimen === "starting";
  const output = specimen === "speaking" || specimen === "thinking";
  const reduced = reduce || systemReduce;
  const unavailable = ["unavailable", "denied", "restricted", "no_device", "model_missing"].includes(specimen);

  const choose = (next: Specimen) => { held.current = false; setHolding(false); setSpecimen(next); setNotice(""); };
  function cancel() { choose("idle"); setNotice("Preview cancelled. Your typed draft is preserved."); }
  function finish() { setSpecimen("recognizing"); setNotice("Finalisation specimen. Choose Final transcript review to inspect the next state."); }
  function talk() {
    if (specimen === "needs_permission") { setDialog("permission"); return; }
    if (capture) { finish(); return; }
    if (specimen === "recognizing" || unavailable) return;
    setLayout((current) => current === "compact" ? "expanded" : current);
    choose("listening");
  }
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduce(media.matches);
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (dialog || event.isComposing) return;
      if (event.key === "Escape" && (capture || specimen === "recognizing" || output)) {
        event.preventDefault(); held.current = false; setHolding(false); setSpecimen("idle"); setNotice("Preview stopped. No audio was captured or played.");
      }
      if (event.code !== "Space" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || held.current) return;
      if (unavailable || output || specimen === "recognizing") return;
      event.preventDefault();
      if (specimen === "needs_permission") { setDialog("permission"); return; }
      held.current = true; setHolding(true); setSpecimen("listening"); setLayout((current) => current === "compact" ? "expanded" : current);
    }
    function up(event: KeyboardEvent) {
      if (!held.current || event.code !== "Space" && event.key !== "Alt") return;
      event.preventDefault(); held.current = false; setHolding(false); setSpecimen("recognizing");
    }
    function blur() {
      if (!held.current) return;
      held.current = false; setHolding(false); setSpecimen("interrupted");
    }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [capture, dialog, output, specimen, unavailable]);

  function recover(action: VoiceRecovery) {
    if (action === "retry") { choose("listening"); return; }
    setNotice(`${recoveryLabels[action]} preview. Production will call the documented native action; this study opens no settings and downloads nothing.`);
  }
  function useTranscript() {
    if (draft.trim()) { setNotice("Your existing draft is preserved. Clear it explicitly before using this fixture transcript."); return; }
    setDraft(transcript); setSpecimen("idle"); draftRef.current?.focus();
  }

  return <div className="voice-design experience" data-layout={layout} data-reduced-motion={reduced}>
    <a className="skip-link" href="#voice-draft">Skip to voice controls</a>
    <header className="vd-chrome"><a className="vd-brand" href="/"><ZoneIcon zone="studio" size={23} />AURA</a><span>ASTRA / VOICE EXPERIENCE</span><a href="/">Return to application<UiIcon name="back" /></a></header>
    <div className="vd-study-controls"><span><strong>Design prototype</strong> · Contract fixtures · No microphone or messages</span><label>State<select aria-label="Voice design state" value={specimen} onChange={(event) => choose(event.target.value as Specimen)}>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="vd-reduce"><input type="checkbox" checked={reduced} disabled={systemReduce} onChange={(event) => setReduce(event.target.checked)} />Reduce motion</label></div>
    <main className="vd-workspace">
      <section className="viewport vd-scene" aria-label="Original 3D studio design context"><Scene reduced={reduced} />
        <div className="vd-scene-heading"><span className="eyebrow">THE SPACE BETWEEN THOUGHT & ACTION</span><h1>Astra,<br />{" "}<em>in conversation.</em></h1><p>Your work stays in view.<br />Your voice stays in your control.</p></div>
        <div className="vd-spatial-label"><ZoneIcon zone="companion" size={20} /><div><strong>ASTRA LUMEN II</strong><small>Original companion · idle pose</small></div></div>
        <div className="vd-scene-caption"><span>01 / VOICE RAIL</span><p>A quiet, precise interface.<br />One conversation, spoken or written.</p></div>
      </section>
      <section className="vd-pane" aria-label="Voice conversation design">
        <header className="vd-pane-heading"><span className="vd-astra-symbol"><ZoneIcon zone="companion" size={24} /></span><div><h2>Astra</h2><small>Conversation & voice</small></div><div className="vd-layouts">{(["compact", "expanded", "focus"] as const).map((item) => <button key={item} title={`${item} layout`} aria-label={`${item} layout`} aria-pressed={layout === item} onClick={() => setLayout(item)}><UiIcon name={item === "compact" ? "collapse" : item === "focus" ? "expand" : "file"} /></button>)}</div></header>
        <div className="vd-context-line"><UiIcon name="lock" /><span>Existing context & approval controls apply</span></div>
        <div className="vd-reading" tabIndex={0} aria-label="Voice design explanation"><span className="eyebrow">A NATURAL WAY TO THINK TOGETHER</span><h3>Say what’s<br />{" "}<em>on your mind.</em></h3><p>Start a thought aloud. Keep the details on screen. Move between voice and text without leaving the conversation.</p><div className="vd-shortcut"><kbd>⌥</kbd><kbd>Space</kbd><span>Hold to talk.<br /><strong>Release to finish.</strong></span></div><div className="vd-reading-rule" /><div className="vd-facts"><span>ON YOUR TERMS</span><p>Microphone on only while starting or listening. Speech output can be stopped at any time.</p></div><details><summary>How spoken replies work</summary><p>Replies are spoken one sentence at a time. Code and tables stay on screen; URLs and tool results are not read aloud. Long replies stop after about 4,000 characters. Listening and playback take turns; hands-free interruption is unavailable.</p></details></div>
        <div className="vd-bottom">
          <section className="vd-voice-rail" data-state={specimen} data-tone={view.tone} aria-label="Voice controls">
            <div className="vd-rail-top"><span className="vd-state-icon">{output ? <Speaker muted={muted} /> : <Mic off={!view.mic} />}</span><div><strong aria-live="polite" aria-atomic="true">{view.title}</strong><small>{view.mic ? "Microphone on · design specimen" : "Microphone off"}</small></div><button className="vd-round" aria-label="Voice settings preview" title="Voice settings" onClick={() => setDialog("settings")}><UiIcon name="settings" /></button></div>
            <Level specimen={specimen} reduced={reduced} />
            {specimen === "listening" || specimen === "recognizing" || specimen === "review" ? <div className="vd-transcript"><span>{specimen === "review" ? "FINAL TRANSCRIPT / CONTRACT FIXTURE" : "PARTIAL TEXT / DESIGN SPECIMEN"}</span><p>{transcript}</p>{specimen === "review" && <button onClick={useTranscript}>Use transcript in draft<UiIcon name="arrow" /></button>}</div> : specimen === "speaking" ? <div className="vd-transcript output"><span>NOW SPEAKING / CONTRACT FIXTURE</span><p>{caption}</p></div> : <p className="vd-state-detail">{view.detail}</p>}
            {specimen === "listening" && <p className="vd-capture-hint">{holding ? "Release ⌥Space to finish · Esc to cancel" : "Pause to finish · Esc to cancel"}</p>}
            {view.recovery && <div className="vd-recovery">{view.recovery.map((action) => <button key={action} onClick={() => recover(action)}>{recoveryLabels[action]}</button>)}</div>}
            <div className="vd-rail-actions">
              {output ? <button className="vd-primary" onClick={() => { choose("idle"); setNotice("Speech stopped in this preview. Text generation would continue."); }}><UiIcon name="stop" />Stop speaking</button>
                : !unavailable && !view.recovery && specimen !== "review" && <button className="vd-primary" disabled={specimen === "recognizing"} onClick={talk}><Mic />{capture ? "Finish listening" : specimen === "recognizing" ? "Finishing…" : "Talk with Astra"}</button>}
              {(capture || specimen === "recognizing") && <button className="vd-cancel" onClick={cancel}>Cancel</button>}
              <button className="vd-round" aria-label={muted ? "Unmute speech" : "Mute speech"} aria-pressed={muted} title={muted ? "Unmute speech" : "Mute speech"} onClick={() => { setMuted(!muted); if (!muted && output) choose("idle"); }}><Speaker muted={muted} /></button>
              <button className="vd-end" onClick={() => { choose("idle"); setMuted(false); setNotice("Voice session ended in this preview. Your text draft is preserved."); }}>End voice</button>
            </div>
          </section>
          <div className="vd-draft"><label className="sr-only" htmlFor="voice-draft">Message Astra design draft</label><textarea id="voice-draft" ref={draftRef} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Or keep the conversation in writing…" /><div><label><input type="checkbox" checked={edit} onChange={(event) => setEdit(event.target.checked)} />Edit before sending</label><button aria-label="Preview send action" disabled={!draft.trim()} onClick={() => setNotice("Draft retained. Production sending is implemented after the model checkpoint.")}><UiIcon name="arrow" /></button></div></div>
          {notice && <p className="vd-notice" role="status">{notice}<button aria-label="Dismiss preview notice" onClick={() => setNotice("")}><UiIcon name="close" /></button></p>}
          <div className="vd-bottom-note"><span>Half-duplex voice</span><span>⌥Space to talk · Esc to stop</span></div>
        </div>
      </section>
    </main>
    <footer className="vd-credit"><span>AURA / DESIGN CHECKPOINT 01</span><span>“Astra Lumen II, a rigged companion android” by <a href="https://sketchfab.com/pinckneyb" target="_blank" rel="noreferrer">XRProfXR</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428" target="_blank" rel="noreferrer">Source</a></span></footer>
    {dialog === "permission" && <Modal title="Talk with Astra" subtitle="YOUR MICROPHONE, YOUR CHOICE" close={() => setDialog(null)}><div className="ui-dialog-body vd-dialog-body"><span className="vd-permission-symbol"><Mic /></span><p>AURA opens your microphone only when you choose Talk or hold ⌥Space. It closes after you finish, cancel, or leave the active app.</p><p>Recognition follows your Mac’s voice capabilities. Final text uses your selected AI provider and the same context and approval controls as typing.</p><p className="vd-fixture-note">Design preview: this action shows the next state. It does not request microphone access.</p></div><footer className="ui-dialog-actions"><button className="ui-button" data-initial-focus onClick={() => setDialog(null)}>Not now</button><button className="ui-button primary" onClick={() => { setDialog(null); choose("idle"); setNotice("Permission-granted design state. Press Talk again to preview listening. No access was requested."); }}>Preview access granted</button></footer></Modal>}
    {dialog === "settings" && <Modal title="A voice that fits your work" subtitle="ASTRA / VOICE SETTINGS" close={() => setDialog(null)}><div className="ui-dialog-body vd-dialog-body"><p className="vd-fixture-note">Design preview · changes stay in this page. Voice options come from the shared contract fixture.</p><label className="vd-setting-row"><span><strong>Speak replies to spoken requests</strong><small>Typed messages stay silent. Off by default.</small></span><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /></label><label className="vd-setting-row"><span><strong>Edit before sending</strong><small>Review the final transcript in your composer.</small></span><input type="checkbox" checked={edit} onChange={(event) => setEdit(event.target.checked)} /></label><label className="ui-field">Voice<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="">System default</option>{voiceOption && <option value={voiceOption.id}>{voiceOption.name} · {voiceOption.locale} · {voiceOption.quality} · fixture</option>}</select></label><p className="help">This fixture contains a default-quality voice. The app will list installed voices. Add voices in System Settings → Accessibility → Spoken Content.</p><label className="ui-field">Speech rate · {Number(rate).toFixed(1)}×<input aria-label="Speech rate" type="range" min="0.8" max="1.2" step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} /></label><div className="vd-setting-row"><span><strong>Input device</strong><small>Resolved by the native host in the application.</small></span><button className="ui-button" onClick={() => setNotice("Choose microphone preview. No System Settings window was opened.")}>Choose microphone</button></div><p className="help">Bluetooth headsets can be unreliable. Choose another input if audio stops arriving. Apple server recognition is offered only for the fallback recogniser, with an explicit opt-in.</p>{notice && <p className="vd-fixture-note" role="status">{notice}</p>}</div><footer className="ui-dialog-actions"><button className="ui-button primary" onClick={() => setDialog(null)}>Done</button></footer></Modal>}
  </div>;
}
