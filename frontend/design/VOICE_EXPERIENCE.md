# Astra voice experience — design checkpoint

Phases 0–2 only. Production integration starts after the owner's model checkpoint.
Source: `claude/phase3c-d-voice`, verified at
`4087d11a9a377232e0f7acb40ec75a620f837969`.
Working branch: `codex/phase3c-d-voice-experience`.
Native authority: [PHASE3C_D_VOICE.md](../../docs/PHASE3C_D_VOICE.md), especially §§6, 8, 9,
and `shared/contracts/{domain,methods,events}.ts`.

## Direction and alternatives

| Concept | Strength | Cost / decision |
|---|---|---|
| A small control beside Astra in the scene | Strong spatial relationship | Camera movement separates controls from the transcript; too little space for permissions and recovery. Keep only a secondary status label. |
| A dedicated full-window voice stage | Spacious captions and expression | Displaces the developer's work, duplicates conversation navigation. Reject. |
| **Voice rail in the existing composer** | One place to talk, read, edit, stop and recover; survives every conversation layout | Requires a bounded transcript area and deliberate control priority. **Selected.** |

The rail feels like a precise audio instrument, with a segmented level strip and a
clear input/output label. It is not a waveform: the bridge supplies scalar RMS / TTS
envelope levels, not sample history or frequency bands. No orb, ambient pulsing,
random bars, particles, additional canvas, lights or postprocessing.

Use existing paper/white surfaces, ink, teal action and semantic warning/error tokens.
Listening is teal (`--aura-action`); spoken output is blue (`#315d99` on `#edf3fb`).
Phase labels and icons distinguish states without colour. Thin rules, a 12 px radius,
16 px inset, 12 px control gaps; 36 px Talk target, 32 px secondary controls. Text is
13/20 px, transcript 15/24 px, secondary copy 12/18 px, no body text below 11 px.
The component is quieter than the existing scene and never overlaps Astra's face.

## Layout and controls

- **Compact:** one compact control group in the existing composer; Talk, output mute,
  phase label and settings. A live utterance expands the existing conversation pane
  so its text and cancellation remain visible. Do not add a floating second dock.
- **Expanded:** retain the existing 440–650 px resizable pane. Voice lives above the
  text composer, below the transcript. Reserve 40 px for status/level, 48–96 px for
  partial/caption, 36 px for actions. Overflow scrolls inside the transcript, not the
  whole window. Fold explanatory copy into settings at 1100×700.
- **Focus:** the same components, text and session with a wider reading measure;
  preserve exact camera return. No voice-specific camera fly-in on Talk.
- **Permission explainer:** shared accessible Modal, “Talk with Astra”, two short
  paragraphs: microphone opens only when requested; transcription follows the
  current recognition capability; final text uses the chosen AI provider and existing
  context/privacy policy. “Not now” has initial focus; “Continue to microphone access”
  invokes `requestPermissions` only on click. On grant, show “Ready”; require a fresh
  Talk/hold gesture. A released shortcut must not start recording after a slow prompt.
- **Tap to talk:** Talk opens `auto_end`; once listening, the same primary position
  reads “Finish listening”. A separate Cancel discards. Show “Pause to finish” or
  “Release ⌥Space to finish” according to the actual run's `mode`.
- **Push to talk:** hold ⌥Space while AURA is key, once per physical press. Start only
  without a modal, IME composition, active send, or pending approval. Do not steal
  native Control-Option accessibility shortcuts: reject Ctrl, Cmd and Shift modifiers.
  Ignore repeats. On Space/Alt release, stop that same utterance even if modifiers
  have changed. Release during an asynchronous start queues a stop; losing focus
  cancels and invalidates the run, never sends. Handle pointer release/cancel if a
  hold target is added; it is optional, not a second mode preference.
- **Esc:** capture while starting/listening (cancel, never finalise) or during speech
  output including `thinking` with `speaking:true` (stop speech only). Cancel during
  recognizing is also available via its explicit button. Otherwise preserve the
  existing modal/camera Escape behaviour; never answer an approval with Escape/voice.
- **Output mute:** “Mute speech” / “Unmute speech”, `aria-pressed`, affects speech
  only. Unmute never resumes a stopped reply. Distinct from the persisted auto-speak
  preference; no microphone mute toggle because capture has Finish and Cancel.
- **Stop speaking:** always reachable while host `speaking` is true, including gaps
  between sentences. It does not cancel text generation. Existing “Stop reply” still
  cancels the AI turn and consequently its speech.
- **End voice:** stops capture/playback and clears the voice binding, retains text
  conversation/draft, returns focus to Talk. Do not immediately auto-bind it again
  in an effect. Reopen on the next explicit Talk/Read aloud action.
- **Read aloud:** on a completed successful/length-limited assistant turn only;
  no automatic reading of typed requests. Prefer `speakReply`; on `not_found` only,
  use `speak` with that visible assistant text. No fallback for errors/cancelled
  replies. Use native text limits, never combine tool result text with the reply.
- **Settings:** Edit before sending (page preference, default ON; no new native
  contract), auto-speak spoken replies (native default OFF), installed voice picker,
  speech rate 0.8–1.2, current input device and Choose input. Save native preferences
  only on explicit changes, label failures and keep the last confirmed value.
  Show “Only default-quality voices are installed” only from real `listVoices`
  results; describe System Settings → Accessibility → Spoken Content for adding
  voices. This is guidance, not an invented bridge target. Only show Apple server
  recognition for the fallback capability; explain audio goes to Apple and leave
  opt-in off by default. `enabled:false` disables voice controls without permission
  prompts. Do not promise that all subsequent AI processing stays on this Mac.

## State specification

| Host state / condition | Visible label and presentation | Available actions |
|---|---|---|
| idle | “Ready when you are”; microphone off, unlit level strip | Talk, Mute speech, Settings; End voice if active |
| needs_permission, not determined | “Microphone access needed”; microphone off | Talk → explainer; continue typing |
| starting | “Starting microphone…”; quiet static indicator, no claim of usable audio | Finish / Cancel, End voice |
| listening | “Listening”; input level and read-only partial transcript, mic on | Finish listening, Cancel, End voice |
| recognizing | “Finishing transcript…”; microphone off, last partial stays read-only | Cancel, End voice; no send until final |
| thinking | “Preparing spoken reply” when native speech waits for a sentence; otherwise use existing exact AI turn label | Stop speaking if host speaking, Stop reply if AI active |
| speaking | “Astra is speaking”; blue output level, current sentence caption | Stop speaking, Mute speech, End voice; explicit Talk may interrupt output only when AI send rules allow |
| interrupted | “Voice paused”; microphone off, exact host reason, warm neutral styling | Host recovery actions, End voice; never automatic restart |
| error | “Voice needs attention”; flat error rule, exact host issue and recovery | Buttons from `issue.recovery`; continue typing |
| no_input_device / unavailable input | “Microphone unavailable”; no active input animation | Choose input when supplied; refresh capability/status after return |
| permission_denied | “Microphone access denied” (or Speech Recognition for fallback); microphone off | Exact host settings recovery, Check access; no repeated permission prompt |
| permission_restricted | “Voice access is restricted”; microphone off | Continue typing; no fictitious recovery button |
| unavailable build / recognition | “Voice unavailable”; no Talk action | Explain bundled AURA.app requirement when appropriate; downloadable assets get the actual install action |
| idle + no_speech | “No speech heard”; gentle hint with host message | Talk again from native retry |
| idle + time_limit | “Listening limit reached”; retain only actual final text | Edit/send final; next Talk only by gesture |
| conversation_ended | “Voice conversation ended”; invalidate binding and pending final delivery | New/existing text conversation choice; explicit Talk after rebinding |

Priority: approval has focus over everything; then voice error/interruption, capture,
speech, AI work, idle. Keep native `VoicePhase` separate from the derived visual label:
“Thinking” from `ai.turnState` must never fabricate `voice.phase` or output activity.
Mic-on means **starting/listening only**, not `sessionActive` and not a permission grant.

## Contract inventory and implementation seams

All 15 methods were read in TS and their Swift implementations. No contract edits.

| Method | Frontend responsibility |
|---|---|
| getStatus | Initial/reload and return-from-settings reconciliation; not microphone activation |
| getCapabilities | Capability gate; engine/locale/assets truth; refresh on activation/settings return |
| requestPermissions | Explicit second action after Talk explainer only |
| startSession | Bind existing/newly created conversation; opens no microphone |
| endSession | Close/hide conversation workspace, End voice, teardown; cancel pending send intent |
| startListening | Explicit Talk/hold/retry only; auto_end or push_to_talk |
| stopListening | Finalise on Finish/release, may return while recognizing |
| cancelListening | Discard on Cancel/Escape/abandoned gesture |
| speak | Explicit completed-turn read-aloud fallback on not_found only |
| speakReply | After spoken send returns its exact stream id, if auto-speak enabled and not muted; or explicit Read aloud |
| stopSpeaking | Stop output without cancelling AI text |
| setOutputMuted | Session mute; never changes capture or auto-speak preference |
| listVoices | Real installed options, locale and quality; empty/failure state |
| openSettings | Only microphone, speech_recognition, sound_input targets |
| installRecognitionAssets | User action; acknowledge request, wait for capabilitiesChanged; never a fabricated progress percentage |

All six events were read with fixtures and mock implementation:

| Event | Acceptance / rendering rule |
|---|---|
| statusChanged | Accept only revision > last accepted; initialise cursor to −1 so revision 0 works. Apply method replies through the same gate. |
| capabilitiesChanged | Replace capability snapshot. Installed means ready, not listening. A still-downloadable result is not success; offer recheck/retry. |
| transcript | Whole text replacement, keyed by utteranceId + highest seq. Exactly-once final claim before any await; never partial submission. |
| inputLevel | Match current listening utteranceId, clamp 0–1; zero on every exit; no sample in starting. |
| speechLevel | No speech id/sequence exists in this payload. Gate on current speaking phase, clamp, zero on exit. Rely on native stale-run suppression, do not invent a cursor. |
| speechProgress | Match speechId and speakingStreamId (including null for read aloud); monotone segment, finish only matching caption. No phoneme timings. |

Suggested files for Phase 3: `companion/voice/useVoice.ts`, `voiceState.ts`,
`VoiceRail.tsx`, `VoiceSettings.tsx`, `voice.css`, and frontend-owned tests.
Only `platform/bridge.ts` exposes host calls. Do not modify that file or import
the bridge client directly in production. Reuse existing `Modal`, composer,
`useConversation` and approval UI.

### Race/lifecycle decisions

1. Subscribe before snapshots and before starts. Buffer bounded early transcripts/
   progress until their run id is known; reject old conversation epochs. Never
   let a delayed method result roll back a newer status. Reconcile after reload;
   no replayable partial snapshot exists, so show “Listening — waiting for text”.
2. Host emits final transcript **before** its idle status. Accept final in recognizing,
   claim `(conversation epoch, utteranceId)` synchronously, then call the existing
   send path. Do not require an idle transition first or send from two effects.
3. Existing `useConversation.send` returns boolean. Extend the frontend-only result
   (or add a once-only callback) to expose the accepted `{conversationId, streamId}`
   after existing generation/cancel guards. Carry source `typed | voice` in UI intent;
   do not change `ai.sendMessage`. `speakReply` must use those exact identifiers.
4. With Edit before sending ON, final goes into editable draft and remains explicitly
   voice-origin until edited/sent/discarded; editing does not bypass privacy. With
   OFF, send exactly once if allowed. If a typed draft exists, preserve it and show
   an explicit “Use transcript” choice; never silently overwrite or auto-send a
   combined draft. If busy, approval pending, provider invalid, unbound or privacy
   blocked, retain final for review; no automatic retry when a busy state clears.
5. Cancel/end/focus loss/new conversation/reset/GitHub clearing invalidate the
   utterance epoch before awaiting native calls. Drop late finals and clear private
   captions/drafts associated with a revoked conversation. `conversation_ended`
   can arrive during capture: explicitly cancel/end, do not assume the host did.
6. Layout collapse retains a visible compact workspace/session; true hiding (for
   example compact GitHub explorer), unmount or end closes it. Zone navigation must
   not automatically open capture. StrictMode effect replay must not race a stale
   cleanup endSession against a newer bind; serialize session operations with epochs.
7. First-ever Talk creates/binds a normal conversation through the existing controller
   before capture; this is not inference. Disable while invalid provider/busy/approval.
   Recheck gesture intent after every await, especially permissions and session bind.
8. Install-assets has no progress/failure event; a capabilities result still marked
   downloadable is “not ready”, never “installed”. Recheck may be offered without
   opening the microphone; no retry timer that silently starts recognition.

### Recovery mapping

Render one button per native recovery: `retry` → **“Talk again”** → startListening
(fresh gesture); `choose_input` → **“Choose microphone”** → sound_input;
`open_microphone_settings` → **“Microphone settings”**; `open_speech_settings` →
**“Speech Recognition settings”**; `install_speech_assets` → **“Download speech model”**.
Label retry “Talk again”, including after output failures, because §9 defines it as
listening; never falsely label it “Retry playback”. A separate explicit Read aloud
on a completed turn can request playback. Do not infer actions from issue.message.
Bridge-call failures get typed error feedback + safe recheck. Opening Settings is
not evidence of permission/device recovery. Returning never starts capture.

## Astra and performance specification

Keep the original 72-joint GLB, `Idle02_F`, scale and materials. Head/eyes/jaw exist;
no facial morphs or finger bones. No new animation clips are assumed.

| Signal | Existing scene integration for Phase 4 |
|---|---|
| starting/listening | Existing listening head attention; no jaw motion; input level may gently modulate the existing floor marker, never add geometry |
| recognizing | Blend back toward thinking; static UI text is primary feedback |
| AI work / native thinking | Existing thinking pose; no timer-driven output meter |
| speaking + speechLevel | Existing jaw damping; ≤0.18 rad current bound; envelope-driven, **not phoneme lip-sync** |
| interrupted | Immediate meter clear, idle pose; persistent reason until next action |
| error | Existing error state and UI recovery; no flashing/emissive alarm |

Use a stable ref/sample channel for 20/30 Hz levels, consumed inside the existing
R3F frame; do not set App state for each level or transcript. Voice rail updates
locally, bounded to native rate; no polling or extra always-running rAF. Compare
draw calls/triangles before/after; preserve adaptive DPR, cached GPU strings,
30 fps visible-inactive and suspended hidden policy. No new scene cost accepted
without measurement. First-sentence native engine startup is an explicit M5 risk.

Reduce Motion: fixed level segments with input/output-active text, no changing
heights, pulses, pose/jaw/head movement or layout translation. Phase transitions
use colour/labels immediately. Normal motion: 120 ms hover, 160 ms opacity, no
spring overshoot; a stopped microphone/output must not visually linger.

## Accessibility and validation plan

- Talk/Finish, Cancel, Stop speaking and End voice have distinct names and stable
  positions. Tab order follows transcript → primary action → cancel → mute → settings.
- One polite atomic region announces phase changes only. Live partials, meters and
  rapidly changing captions are not live regions. Partial textarea is read-only;
  final text becomes editable with “Review transcript” label when appropriate.
- Dialog keeps focus and restores its trigger; safe initial focus for permission;
  pending source approval remains unchanged and higher priority.
- All controls work without hold gestures. Meter is decorative with adjacent text;
  no percentage-as-accuracy, no confidence indicator unsupported by the contract.
- Verify 1100×700, 1280×800, 1440×900 and 1728×1117, compact/expanded/focus,
  reduced motion and keyboard. Keep credit visible and no horizontal document scroll.
- Phase 3/6 tests: stale revision/seq/run, duplicate final, early events, release
  before start, blur, Escape, permission denied/restricted, no device, no audio,
  no speech, Bluetooth loss, download, speaking gaps, output mute, end/reset,
  rebind/private clearing, approval blocked, voice/typed draft preservation,
  failed-send retention, speakReply not_found fallback, preference failures,
  native-unavailable gate, and all prior Astra/GitHub/studio regressions.
- Actual microphone, speakers, TCC prompts, fallback recognizer, asset download,
  Sound input link, Bluetooth switching, VoiceOver and M5 ≥55 fps remain native
  acceptance, not claims a browser mock can establish.

## Representative prototype

`frontend/voice-design.html` is an isolated Vite design entry (not built into the
production application). It uses the original Studio and contract fixture text;
scenario controls are explicit design snapshots. Level samples are labelled, not
random animation or microphone input. No voice/AI mutation is called, no permission
requested, no native settings opened. It refuses the native bridge. Interaction
previews include Talk/Finish/Cancel, ⌥Space release, Escape, output mute, session end,
edit final text, permission explainer, settings and all error/recovery specimens.
The 3D character stays idle at this checkpoint; reactions belong to Phase 4.

Checkpoint 1: switch manually to **GPT-6.1 Sol / High**, then implement Phases 3–4
from this state. Do not replace native services, validated fixes or the original
asset. Phase 5 requires Astra / Extra High, Phase 6 Luna / Medium, Phase 7 Sol / High.
