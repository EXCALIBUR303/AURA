# Phase 3C-D: Astra Voice Intelligence (architecture plan)

Status: **approved** (owner, with the §13 recommended defaults). Native implementation done on `claude/phase3c-d-voice`; see [PHASE3C_D_VOICE.md](PHASE3C_D_VOICE.md). Physical microphone and device tests are deferred (§14).
Base: `main` at `e2996ba`, which includes Phase 3C-B and 3C-C.
Author: Claude Code (Opus 5.5, High).

Astra should listen when the user asks, turn speech into text on the Mac, send that text through the existing conversation engine, and speak the reply while the character visibly listens, thinks and talks. Voice is a different way into the same conversation. It is not a second AI path, and it carries no extra authority.

---

## 1. What already exists (inspected, not repeated)

| Piece | Where | State |
|---|---|---|
| Bridge methods `voice.getStatus / requestPermissions / startListening / stopListening / speak / stopSpeaking` | `shared/contracts/methods.ts`, `BridgeMethod.swift`, registered in `AppServices.swift` | Live on the bridge, but backed by `UnavailableVoiceService`, which throws `unavailable` |
| Events `voice.statusChanged`, `voice.transcript {text,isFinal}`, `voice.speechLevel {level}` | `shared/contracts/events.ts` | Declared; nothing emits them yet |
| `VoiceStatus {microphone, speechRecognition, listening, speaking}` and `PermissionState` | `domain.ts`, `BridgeDomain.swift` | Done |
| `Preferences.voice {enabled, locale, synthesisVoiceId}` | `domain.ts`, `BridgeDomain.swift` | Done and persisted |
| `VoiceSession` (half-duplex lifecycle, barge-in, generation guards, interruptions, route observation) | `Services/Voice/VoiceSession.swift` | Done and tested with fakes, but not wired in |
| `SpeechInput`, `SpeechOutput`, `VoicePermissions`, `AudioRouteMonitor` protocols; `SystemVoicePermissions` | same file | Protocols are done; there are no system implementations except permissions |
| `VoiceRouteTests`, plus `FakeSpeech` and `FakeVoicePermissions` | `AIToolAndVoiceContractTests.swift` and others | Passing |
| Info.plist `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` | `macos/App/Info.plist` | Present in the installed build |
| Entitlement `com.apple.security.device.audio-input` | `macos/App/AURA.entitlements` | Present; App Sandbox on |
| Window activity and occlusion | `AuraApp/WindowStateObserver.swift` | Exists; it will feed `VoiceInterruption.appInactive` |
| Conversation engine: `ai.sendMessage`, `ai.cancel`, `ai.chunk` (one emit point, `AIService.swift:264`), `ai.turnState`, approvals, privacy matrix | `Services/AI/*` | Done (3C-B). **Not rewritten by this plan** |
| Astra `CompanionState` (`idle/listening/thinking/speaking/error`), head yaw while listening, jaw damped from `speechLevel` | `frontend/src/studio/Astra.tsx`, `components/useCompanion.ts` | Done. `App.tsx` currently passes `speechLevel={0}` |
| Voice "unavailable" copy and disabled talk button | `CommandDock.tsx`, `useCompanion.ts` | Exists (Codex will replace the copy) |
| Rules from 3C-B §12 | `docs/PHASE3C_B_ASTRA_INTELLIGENCE.md` | Adopted below without change |

The environment has Xcode 27.1, macOS 27.2 SDK/host and an M5. The deployment target is macOS 15.0, so anything newer needs `#available` gates.

---

## 2. Voice pipeline

```
 user presses Talk / ⌥Space (window key)            nothing is captured before this
        │
        ▼
 ┌─ VoiceSession (MainActor, existing) ───────────────────────────────────────┐
 │  permission gate → stop speech (barge-in) → start listening generation     │
 └──────┬─────────────────────────────────────────────────────────────────────┘
        ▼
 AudioCapture (AVAudioEngine input tap, voice processing on, in memory only)
        │  PCM buffers ──► LevelMeter (RMS → voice.inputLevel ≤20 Hz)
        │               └► EndpointDetector (speech/silence, hands-free mode only)
        ▼
 SpeechInput (on-device STT)
        │  partial transcripts ─► voice.transcript {isFinal:false}  (display only)
        │  final transcript    ─► voice.transcript {isFinal:true}
        ▼
 Page (useConversation): final text → composer → ai.sendMessage(conversationId)
        │      same conversation, same provider binding, same privacy matrix
        ▼
 AIConversation / AIService (unchanged) ── ai.chunk … ai.turnState … ai.done
        │                    └─► ReplyTap (new internal observer, native only)
        ▼
 SpokenReplyPlanner: Markdown → speakable sentences (code/tables/links summarised)
        ▼
 SpeechOutput: AVSpeechSynthesizer.write → AVAudioPlayerNode (same engine)
        │  output tap RMS ─► voice.speechLevel (≤30 Hz) → Astra jaw/glow
        ▼
 finished / cancelled / interrupted → voice.statusChanged → Astra idle
```

**Key decisions**

1. **The page sends the transcript and the host speaks the reply.** The page already owns the composer, drafts, context chips and `ai.sendMessage`, so a final transcript goes there and appears on screen as the user's message. Spoken input therefore never bypasses the visible conversation. Speaking stays native: the host observes the reply stream it already produces, so text does not travel host → page → host, and cancelling the reply stops speech within the same actor hop.
2. **Half-duplex by default.** Astra either listens or speaks, never both, which the existing `VoiceSession` already enforces. Barge-in is an explicit action (Talk button, shortcut, or Esc to just stop). Hands-free barge-in, where AURA listens while it speaks, is an opt-in later step that depends on voice-processing echo cancellation (§6).
3. **Push-to-talk / tap-to-talk is the default.** Hands-free "end on silence" is an option within a session the user started. AURA never uses an always-on wake word (§4).

---

## 3. Recommended macOS technologies

| Need | Primary (macOS 26+, available on this Mac) | Fallback (macOS 15–25) | Notes |
|---|---|---|---|
| Speech-to-text | **`SpeechAnalyzer` + `SpeechTranscriber`** (Speech framework, on-device, long-form, volatile and finalized results) with model assets via `AssetInventory` | **`SFSpeechRecognizer`** with `requiresOnDeviceRecognition = true` when `supportsOnDeviceRecognition` | Server recognition is **off**. It is offered only as an explicit per-user opt-in ("Allow Apple server recognition") when on-device recognition is unavailable for the locale. |
| End of utterance | `SpeechDetector` module in the analyzer (if suitable) plus an energy/silence endpoint | Energy/silence endpoint on the input tap | Used only in hands-free mode |
| Capture | **`AVAudioEngine`** input node, `setVoiceProcessingEnabled(true)` (AEC, noise suppression, AGC) | same | One engine for both capture and playback, so the voice processor can cancel AURA's own speech |
| Text-to-speech | **`AVSpeechSynthesizer.write(_:toBufferCallback:)`** → `AVAudioPlayerNode` | same | Writing to buffers allows accurate level metering and same-engine echo reference. `speak()` is a fallback if buffer rendering fails for a voice. |
| Voices | `AVSpeechSynthesisVoice.speechVoices()` filtered by locale; prefer installed `.premium` / `.enhanced` | same | No downloads are triggered by AURA. The page links to System Settings › Accessibility › Spoken Content to add voices. Personal Voice is excluded (separate authorization; not needed). |
| Output metering | RMS of rendered buffers on a tap, smoothed, ≤30 Hz | same | Feeds the existing `voice.speechLevel` |
| Captions / sync | `AVSpeechSynthesizerDelegate willSpeakRangeOfSpeechString` (or buffer markers) | same | Drives "currently spoken sentence" highlighting |
| Device routing | **CoreAudio** `AudioObjectAddPropertyListenerBlock` on `kAudioHardwarePropertyDefaultInputDevice` / `…DefaultOutputDevice`, plus `AVAudioEngineConfigurationChange` | same | Implements the existing `AudioRouteMonitor` |
| App activity | `WindowStateObserver` (existing) | same | Maps to `VoiceInterruption.appInactive` |
| Permissions | `AVCaptureDevice.requestAccess(.audio)`, `SFSpeechRecognizer.requestAuthorization` (existing `SystemVoicePermissions`) | same | Whether `SpeechAnalyzer` also needs speech-recognition authorization is **verified in D0, not assumed**. |

No third-party speech SDKs, cloud STT/TTS or paid services. If the owner later wants hosted voices (for example OpenAI TTS), that would be a separate, cost-approved step behind the same `SpeechOutput` protocol.

---

## 4. Privacy and security design

**Authorization and visibility**
- The microphone opens only after an explicit user action: a click, the in-window shortcut, or a spoken follow-up the user enabled for that session. It never opens at launch, on zone change, after a reply, or because a model or tool asked.
- The first Talk shows an in-app explainer, then the macOS prompts. A denied or restricted state shows how to enable access (deep link to System Settings › Privacy & Security › Microphone / Speech Recognition). AURA never re-prompts in a loop.
- While capturing, three signals are always visible: the macOS orange microphone indicator, a pulsing "Listening" pill with a live input-level meter, and Astra's listening pose. The pill always has a Stop control.
- There is a hard cap of 60 s per utterance (configurable to 120 s). Hands-free mode ends the session after 30 s with no speech.
- Capture stops immediately when AURA resigns active, the window is hidden or minimised, the audio route changes, the Mac sleeps, or the screen locks. Nothing restarts by itself.
- Global hotkeys are excluded: they need Input Monitoring/Accessibility. The shortcut works only while the AURA window is key.

**Data handling**
- Audio stays in memory as ring buffers. It is never written to disk, logged, sent over the bridge, or sent to an AI provider.
- Transcripts are user messages. They follow the existing in-memory conversation rules and the privacy matrix (never / local_only / all) unchanged. Voice adds no new destinations.
- STT is on device. Server recognition requires an explicit preference, and the UI says it sends audio to Apple.
- Logs record states, durations, error codes and device-change facts only. Transcript text, spoken text and device names are `.private` or not logged at all.

**Authority boundary** (from 3C-B §12, kept as is)
- Spoken input has the same authority as typed input and no more.
- Approvals (`ai.approvalRequested`) are never answered by voice. Speech pauses at an approval and Astra says only "I need your approval on screen."
- Tool results, approval summaries, repository file contents and URLs are never read aloud automatically.
- A partial transcript is never sent.
- The provider binding, consent and privacy checks in `AIConversation` run exactly as for typed messages, because the page sends through the same `ai.sendMessage`.

**Security**
- The App Sandbox stays on. No new entitlements are needed: `audio-input` is already granted. The bundle identifier is unchanged.
- No new network destinations. If STT asset downloads go through `AssetInventory`, that is a system service, not AURA networking.

---

## 5. Native service interfaces

### 5.1 Swift (AuraCore), additions only

```swift
// Implements the existing protocols.
struct AnalyzerSpeechInput: SpeechInput          // @available(macOS 26, *) SpeechAnalyzer/SpeechTranscriber
struct RecognizerSpeechInput: SpeechInput        // SFSpeechRecognizer, on-device required unless opted in
struct SynthesizerSpeechOutput: SpeechOutput     // AVSpeechSynthesizer.write → player node, yields RMS levels
struct CoreAudioRouteMonitor: AudioRouteMonitor  // default input/output listeners

// Shared audio graph so capture and playback use one voice-processing engine.
@MainActor final class VoiceAudioGraph {
    func startCapture(_ consumer: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void) throws
    func stopCapture()
    func play(_ buffer: AVAudioPCMBuffer) async throws    // cancellable
    func stopPlayback()
    var inputLevels: AsyncStream<Double> { get }
    func shutDown()                                       // engine stopped, no mic, when idle
}

// Splits streamed Markdown into speakable sentences. Pure and unit-tested.
struct SpokenReplyPlanner {
    mutating func append(_ delta: String) -> [SpokenSegment]   // emits complete sentences only
    mutating func finish() -> [SpokenSegment]
}
// Fenced code becomes "I've put the code on screen." Tables become "There's a table on screen."
// Links are spoken by their text, never the URL. Inline code is read plainly. Lists are numbered naturally.

// Native-only observer at AIService's single ai.chunk emit point (no engine rewrite).
protocol ReplyObserver: Sendable {
    func reply(_ streamId: String, delta: String)
    func reply(_ streamId: String, ended: FinishReason?)   // nil = error/cancel
}

// The real VoiceService behind the bridge (replaces UnavailableVoiceService in AURA.app;
// `swift run` keeps Unavailable because it has no usage strings).
final class LiveVoiceService: VoiceService, ReplyObserver
```

`VoiceSession` keeps its role as the single owner of listen/speak state, generations and interruptions. Its only change is a speech queue of segments instead of one string.

### 5.2 Bridge contract changes (additive, one commit, following ARCHITECTURE.md § Adding a bridge method)

```ts
// methods.ts
"voice.getCapabilities": { params: Empty; result: VoiceCapabilities };
"voice.startListening":  { params: { mode?: "push_to_talk" | "hands_free"; locale?: string }; result: VoiceStatus }; // params optional, so existing callers keep working
"voice.speakReply":      { params: { conversationId: string; streamId: string }; result: Empty };
//  Speaks the reply as it streams; ends with the reply. Fails with invalid_request if the stream
//  does not belong to that conversation. Speaking a finished reply again is allowed ("Read aloud").
"voice.listVoices":      { params: { locale?: string }; result: VoiceOption[] };
// voice.speak / voice.stopSpeaking / voice.stopListening / voice.requestPermissions are unchanged.

// events.ts
"voice.statusChanged":  VoiceStatus;                                       // extended, see below
"voice.transcript":     { utteranceId: string; text: string; isFinal: boolean };   // utteranceId added
"voice.inputLevel":     { level: number };                                 // new, ≤20 Hz, listening only
"voice.speechLevel":    { level: number };                                 // unchanged
"voice.speechProgress": { streamId: string | null; segment: number; text: string; state: "started" | "finished" }; // captions
"voice.interrupted":    { reason: "app_inactive" | "audio_route_changed" | "time_limit" | "system" };

// domain.ts
interface VoiceStatus {
  microphone: PermissionState; speechRecognition: PermissionState;
  listening: boolean; speaking: boolean;               // existing fields kept
  phase: VoicePhase;                                    // new
  mode: "push_to_talk" | "hands_free" | null;
  speakingStreamId: string | null;
  inputDevice: string | null;                           // display name, null if none
}
type VoicePhase = "unavailable" | "needs_permission" | "idle" | "starting" | "listening"
                | "finalizing" | "speaking" | "interrupted" | "error";
interface VoiceCapabilities {
  recognition: "on_device" | "server_opt_in" | "none"; engine: "speech_analyzer" | "sf_speech_recognizer" | "none";
  locales: string[]; handsFreeBargeIn: boolean;         // true only if voice-processing AEC verified
}
interface VoiceOption { id: string; name: string; locale: string; quality: "default" | "enhanced" | "premium" }

// Preferences.voice gains: autoSpeakReplies: boolean (default false), handsFree: boolean (default false),
// allowServerRecognition: boolean (default false), rate: number (0.8–1.2, default 1.0)
```

Swift mirrors, fixtures in `shared/fixtures/`, the drift test and the mock (`shared/bridge/mock.ts`, which simulates phases, labelled mock) all ship in the same commit.

---

## 6. Voice interaction states

Host phase (authoritative) × conversation turn state (existing) → Astra presentation:

| Host `phase` | `AITurnState` | Astra | UI |
|---|---|---|---|
| `needs_permission` / `unavailable` | any | idle | Talk shows the permission explainer or "Voice unavailable" with the reason |
| `idle` | idle/completed | idle | Talk ready |
| `starting` | — | listening (pose only) | "Starting microphone…" (≤300 ms target) |
| `listening` | — | **listening**: head toward user, ring follows `inputLevel` | Pill: Listening • meter • Stop; live partial transcript in composer (muted) |
| `finalizing` | — | listening → thinking | Transcript settles; then the page sends it |
| `idle` | preparing_context / requesting / streaming / waiting_for_tool | **thinking** | Existing streaming UI |
| `speaking` | streaming/completed | **speaking**: jaw from `speechLevel`, caption highlights the current sentence | Stop speaking (Esc); Talk = barge-in |
| `idle` | waiting_for_approval | thinking (attentive) | Speech stops after "I need your approval on screen"; on-screen approval only |
| `interrupted` | any | idle | Toast with the reason ("Microphone changed — press Talk to continue") |
| `error` | any / error | error | Recoverable message plus a retry |

**Transitions that matter**
- *Barge-in*: Talk while `speaking` stops speech at once (≤100 ms). If the reply is still streaming, it is cancelled through the page's existing `ai.cancel` and shows as a cancelled turn. Listening then starts.
- *Stop*: Esc / Stop during `speaking` stops speech only. The reply text keeps streaming on screen.
- *Hands-free follow-up* (opt-in): after speaking finishes, AURA listens once more for up to 8 s with the pill visible. Silence returns it to idle. AURA never chains more than one automatic re-open without speech.
- *Concurrency*: a new `ai.sendMessage` (typed or spoken) stops the current speech. `voice.speakReply` for a cancelled or ended conversation is a no-op that returns `invalid_request`.

---

## 7. Interruptions, cancellation, devices

- **Cancellation ownership**: `VoiceSession` generations (existing) guard late completions. `speakReply` holds the streamId, and `ReplyObserver.ended(nil)` stops queued segments. The current sentence is cut immediately.
- **Interruptions**: app inactive or hidden (existing), route change (existing), `AVAudioEngineConfigurationChange`, system sleep (`NSWorkspace.willSleepNotification`), screen lock, the utterance time limit, and STT asset unavailability. Each one stops everything, emits `voice.interrupted`, and restarts nothing automatically.
- **Devices**: AURA follows the system default input and output. It has no in-app device picker in 3C-D, because the system picker is authoritative and avoids extra surface. A route change mid-utterance discards the partial transcript unless it is non-empty, in which case it is left in the composer unsent. Bluetooth HFP is handled: when AirPods switch to the headset profile, the route change stops listening, which is the expected and documented behaviour.
- **Echo**: half-duplex prevents self-hearing in v1. Hands-free barge-in is enabled only if D0 shows voice processing removes AURA's own speech well enough on built-in speakers. Otherwise `handsFreeBargeIn` stays false and the UI keeps barge-in manual.

---

## 8. Performance and battery

- The engine runs only while listening or speaking. When idle, `VoiceAudioGraph.shutDown()` stops it, so the microphone is closed and there are no audio callbacks. The macOS microphone indicator is off when idle.
- STT models load lazily on the first Talk, not at launch. The analyzer is released after 60 s idle.
- Level events: input ≤20 Hz and output ≤30 Hz, smoothed natively, sent only while active. When idle, the web side receives zero voice events per second.
- The renderer is unchanged: Astra already damps `speechLevel`. Targets during speech are the 3C-C numbers (60 fps, p95 frame ≤18 ms on the M5) with no long tasks above 50 ms.
- Synthesis runs one sentence ahead (prefetch the next buffer) to hide latency without rendering the whole reply.
- Budgets measured in D5: time-to-listen ≤300 ms, final transcript ≤700 ms after end of speech, first spoken audio ≤600 ms after the first complete sentence arrives, idle CPU unchanged from 3C-C (hidden 0%).

---

## 9. Codex frontend handoff (summary; the full brief ships with D3)

Codex owns the UX and implementation in `frontend/**`. This list is the contract and the constraints, not a design.

1. Replace the "unavailable until Phase 3" copy with a capability-driven state from `voice.getCapabilities` and `VoiceStatus.phase`.
2. Talk control in the conversation workspace (compact/expanded/focus) and the command dock: click toggles; hold ⌥Space for push-to-talk while the window is key; Esc stops listening or speaking. It needs a focus ring, an accessible name that reflects the state, and `aria-live="polite"` announcements for state changes. Live partial text is not announced.
3. A listening pill with an input meter driven by `voice.inputLevel` (Reduce Motion → static level bar) and Stop.
4. Partial transcripts render in the composer as muted, non-editable text. On `isFinal`, the composer fills and sends through the existing `useConversation` send, honouring the privacy preview and consent exactly as typed input does. An "Edit before sending" preference keeps it unsent.
5. When `autoSpeakReplies` is on, the page calls `voice.speakReply({conversationId, streamId})` after `ai.sendMessage` returns. A "Read aloud" action on any finished assistant turn calls the same method.
6. Captions: highlight the sentence from `voice.speechProgress`.
7. Astra: pass the real `speechLevel` (currently `0` in `App.tsx`), map `phase` to `CompanionState` per §6, and add an attentive variant while waiting for approval.
8. Permission UI: an explainer before the first prompt, plus denied/restricted states with Open System Settings (host method or link to be confirmed in D1) and no repeated prompting.
9. Settings: auto-speak, hands-free, voice picker (`voice.listVoices`), rate, "Allow Apple server recognition" (off; warning copy), and Edit-before-send.
10. VoiceOver: when VoiceOver is running, default auto-speak to off and say why, so two voices never talk over each other.
11. Tests: add browser checks against the mock for every phase, barge-in, approval pause, a denied permission and an interruption toast, with axe enabled.

---

## 10. Phased implementation plan (with model gates)

Each step stops at the end for review. Model switches are requested before each step that needs a different model.

| Step | Owner / model | Work | Exit criteria |
|---|---|---|---|
| **D0 spike** | Claude Code, **Opus 5.5 High** | In the sandboxed AURA.app on this Mac: `SpeechAnalyzer` authorization and asset behaviour, SF fallback on device, `AVSpeechSynthesizer.write` → player node in one voice-processing engine, AEC quality on built-in speakers, CoreAudio listener behaviour with AirPods. A throwaway probe on a spike branch; findings appended to this doc. | Answers recorded for every "verify in D0" item; final engine choices confirmed or changed |
| **D1 native services + contract** | Claude Code, **Opus 5.5 High** | Contract changes (§5.2) with mirrors, fixtures and mock in one commit; `VoiceAudioGraph`, the two `SpeechInput`s, `SynthesizerSpeechOutput`, `CoreAudioRouteMonitor`, `LiveVoiceService`, permission deep link, preferences; `AURA_DEV_VOICE_PROBE` (TTS → file → STT loopback, no microphone) | `tools/swift-test.sh` green; probe passes in the Release bundle; microphone never opens without a call |
| **D2 spoken reply pipeline** | Claude Code, **Opus 5.5 High** | `ReplyObserver` at the `AIService` emit point, `SpokenReplyPlanner`, `voice.speakReply`, approval pause, cancel/barge-in races | Unit tests for the planner and race matrix; mock-provider probe speaks a streamed reply and stops on cancel within 100 ms |
| **D3 voice UX direction** | Codex, **GPT-6 Astra Extra High** | Interaction and visual direction for §6/§9 within the existing design system (no redesign) | Owner-approved direction |
| **D4 frontend implementation** | Codex, **GPT-6.1 Sol High** | §9 items 1–11 on `codex/phase3c-d-voice` | typecheck/test/build green; browser suites with axe |
| **D5 native integration + interruption hardening** | Claude Code, **Opus 5.5 High** | Merge-review branch; real microphone and speaker runs; route/sleep/lock/inactive matrix; performance budgets (§8); fixes to native code only, with frontend issues routed through TASKS.md | Checklist in §11 executed, with results reported as measured |
| **D6 regression + docs** | Claude Code, **Sonnet 5.5 Medium** | Full regression, ARCHITECTURE.md stack row, TASKS.md, validation report | All suites green; report with verified and unverified items separated |

Nothing in D0–D6 is pushed or merged without the owner's permission.

---

## 11. Testing requirements

**Automated (no microphone)**
- Swift unit tests: the `SpokenReplyPlanner` corpus (sentences, abbreviations, numbers, fenced code, tables, links, emoji, partial-chunk boundaries); `VoiceSession` race matrix (barge-in during first buffer, cancel during prefetch, route change during finalizing, double start, inactive during speakReply); phase transitions; preference decoding; contract drift and fixtures.
- Loopback probe in the Release bundle: synthesize a known sentence to a file with `AVSpeechSynthesizer.write`, feed it to the `SpeechInput` file path, and assert the transcript (word error tolerance documented). This verifies STT and TTS in the sandbox without a microphone.
- Mock-bridge browser suites (Astra and Studio) for every phase and failure, with axe enabled.
- Secret, transcript and audio scans: no transcript text in unified logs, and no audio files in the container after a session (`find ~/Library/Containers/com.aura.app -newer …`).

**Manual on this Mac (owner present; reported as verified only when run)**
- First-run permission prompts: allow, deny, and later re-enable from System Settings.
- Microphone indicator on only while listening; off when idle; off after Stop, Esc, app switch, minimise, lock and sleep.
- Built-in microphone and speakers; AirPods (A2DP ↔ HFP switch); unplugging a USB microphone mid-utterance.
- Barge-in and approval pause with a local Ollama model (no paid inference).
- VoiceOver running while auto-speak is on; Reduce Motion meter fallback.
- Performance budgets from §8, measured with the existing probes plus new voice timings.

---

## 12. Dependencies and remaining limitations

**Dependencies:** Apple Speech, AVFoundation and CoreAudio frameworks only (no packages). On-device speech assets for the chosen locale (downloaded by the system on first use; D0 confirms the flow and what the UI shows meanwhile). The local Ollama model for live end-to-end tests. Hosted providers stay unused unless the owner approves the cost.

**Known limitations, carried forward or expected**
- On macOS 15–25, on-device recognition depends on locale support. Without it, voice input is unavailable unless the user opts into server recognition.
- Self-hearing barge-in may stay off if AEC quality on built-in speakers is insufficient (D0 decides).
- No in-app device picker; AURA follows the system defaults.
- Conversations stay in memory only (unchanged from 3C-B).
- Distribution: the installed AURA.app is **ad-hoc signed and not notarized** (Gatekeeper `spctl` rejects it; it runs locally because it was built on this Mac). Microphone and speech TCC grants are keyed to the code signature, so **rebuilding an ad-hoc-signed app may cause macOS to ask for permission again**. A Developer ID signature would fix this but needs an Apple Developer account, which needs the owner's decision.
- Still open from 3C-C and not part of this phase: VoiceOver / Reduce Motion / Reduce Transparency system toggles, pending-approval restoration after reload, hosted inference, and the dev-configuration pass.

---

## 13. Decisions requested from the owner

1. Approve the overall architecture: page sends transcripts, host speaks replies, half-duplex default.
2. Default for `autoSpeakReplies`: **off** (recommended; the user turns it on) or on.
3. Whether a "Allow Apple server recognition" opt-in should exist at all, or whether voice should be strictly on-device.
4. Push-to-talk shortcut: ⌥Space while the window is key (recommended), or another.
5. Approve D0 to start on Opus 5.5 High.

---

## 14. D0 spike findings (in progress)

Spike branch: `claude/phase3c-d-d0-spike`, `macos/Sources/AuraApp/VoiceSpike.swift`. It's opt-in (`AURA_DEV_VOICE_SPIKE`) and will never be merged.
Run on 2026-10-17: Release AURA.app (sandboxed, ad-hoc signed) on the M5 MacBook, macOS 27.2, launched with `open --env`.
Status: the no-microphone pass and two microphone passes on a Bluetooth headset are done. The built-in speaker/microphone run and the device-switch run are **still owed** (the owner will do them later).

### Verified

| Question | Result |
|---|---|
| Does `SpeechAnalyzer` need speech-recognition authorization? | **No.** File transcription succeeded with Speech = `notDetermined`. Live microphone transcription also succeeded with only the microphone granted and Speech still `notDetermined`. On macOS 26+ AURA asks for the microphone only. The Speech prompt is reserved for the `SFSpeechRecognizer` fallback on macOS 15–25. |
| On-device STT available for en-US? | Yes. `SpeechTranscriber.isAvailable` is true, and en-US plus 8 other English locales are already in `installedLocales`. `AssetInventory.status` reported `supported`, not `installed`, for the progressive preset, yet transcription ran without a download. D1 decides availability by attempting `prepareToAnalyze`, not by that status alone. A download (`assetInstallationRequest`) was not needed and not exercised. |
| File STT accuracy and speed | The synthetic sentence transcribed at 100% in 128–237 ms (3.2 s of audio). |
| `SFSpeechRecognizer` fallback | Available, with `supportsOnDeviceRecognition` true. Not exercised because Speech authorization is intentionally not granted. |
| TTS into buffers in the sandbox | `AVSpeechSynthesizer.write` works: 22.05 kHz mono Float32. Each utterance is rendered whole (first buffer ≈ total). Cold first utterance in a process: 750–880 ms. Warm short sentences: 290–310 ms. |
| Installed voices | 28 en-US voices, **all default quality**, with no enhanced or premium voices installed. The voice picker must handle this and point to System Settings to add better voices. |
| Playback through `AVAudioEngine` + player node | Works. Engine start 32 ms on built-in output and 149 ms on Bluetooth. First audible audio 138 ms (built-in) and 250 ms (Bluetooth). |
| Output metering rate | A mixer tap fires about 10 times a second whatever buffer size is requested. **Change:** compute the level envelope from the synthesized buffers (33 ms windows) and send it in step with player time, instead of tapping the mixer. |
| Audio callbacks under Swift 6 | **Crash found.** A tap closure written inside `@MainActor` code inherits main-actor isolation, and the realtime thread trips `dispatch_assert_queue` (`EXC_BREAKPOINT`). **D1 rule:** every audio, synthesizer, converter and CoreAudio callback is `@Sendable` or built in a `nonisolated` function, and a test covers it. The crash also left the spike's temp audio file behind (removed afterwards), which confirms that production must never write audio to disk. |
| Live STT cold start (Bluetooth headset) | `prepareToAnalyze` 714 ms; listening at 733 ms; first input buffer at 828 ms. **Change:** prepare the analyzer as soon as Talk is pressed (in parallel with engine start), keep `modelRetention: .lingering`, and warm the synthesizer on first Talk. The 300 ms time-to-listen target applies to warm starts only. |

### Bluetooth headset results (non-Apple ANC earbuds, hands-free profile)

Both microphone passes ran on third-party Bluetooth earbuds, which were the system default input and output. **These are not AirPods.** The earlier AirPods label was a mistake, corrected after checking `system_profiler SPAudioDataType`.

| Test | Result |
|---|---|
| Input format | 16 kHz, 2 channels (headset profile) |
| Spoken phrase, with voice processing | 44% of words ("The quick, something jumps over"). The first volatile result arrived late (5.6 s). `SpeechDetector` reported no speech ranges. |
| Echo test, voice processing **off** | Analyzer error `SFSpeechErrorDomain 1 "RecogRejected"` |
| Echo test, voice processing **on** with a player node | Engine failed: `-10875` (output unit initialize) |

| Second pass, same headset (spoken phrase) | **No input buffers at all** (input format reported as 16 kHz, 3 channels). Empty transcript, analyzer prepare 1,098 ms. The echo results repeated exactly (`RecogRejected` without voice processing; `-10875` with voice processing and a player). |

The second pass shows Bluetooth capture with voice processing is not even reliable from run to run on this headset. D1 must detect "engine running but no buffers within 500 ms", stop, and tell the user instead of listening silently.

These are Bluetooth-specific until the built-in run confirms or contradicts them. In the meantime the plan assumes:
- Hands-free barge-in stays **off on Bluetooth**.
- Voice-processing capture runs without a player node in the same engine on Bluetooth (playback uses a separate engine while not listening, which half-duplex allows).
- `SpeechDetector` is not relied on until it is shown to report speech. Endpointing uses transcriber finalization plus an energy threshold.

### Owed (owner present)

1. Built-in speakers and microphone (the Bluetooth headset disconnected, or MacBook Air Microphone/Speakers chosen in Control Center › Sound): echo test with voice processing off and on (decides `handsFreeBargeIn`), plus the spoken phrase (accuracy, volatile-result latency, `SpeechDetector`).
2. Device switch: connect, then disconnect a Bluetooth headset during the 90 s route run (CoreAudio listener timing and `AVAudioEngineConfigurationChange` behaviour while capturing).

### Practical notes

- Every rebuild of the ad-hoc-signed app changes its signature. macOS then asks again about Keychain items, and Deny is safe: the code only marks GitHub unavailable and deletes nothing. The microphone grant is also tied to the signature, so the owed runs should reuse the current spike build. A rebuild means another microphone prompt.
- The `/Applications/AURA.app` install is untouched by the spike.
