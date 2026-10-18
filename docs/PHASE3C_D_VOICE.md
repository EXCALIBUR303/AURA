# Phase 3C-D: Astra voice (native implementation and Codex handoff)

Branch: `claude/phase3c-d-voice` (from `main` `e2996ba`). It is **not pushed or merged**.
Plan and D0 spike findings: [PHASE3C_D_VOICE_PLAN.md](PHASE3C_D_VOICE_PLAN.md), especially §14.
Owner: Claude Code (native, contracts, mock). The voice UI is Codex's next step (§9).

## 1. Status

| Area | State |
|---|---|
| Native voice host (`VoiceController`) | **Done**; automated tests with scripted audio |
| On-device speech recognition (SpeechAnalyzer, macOS 26+) | **Done**; verified with prerecorded (synthesized) speech through the real recogniser, no microphone |
| `SFSpeechRecognizer` fallback (macOS 15–25) | Implemented and compiled; **not run** (this Mac is on macOS 27, so the fallback path is never chosen) |
| Text-to-speech rendering (`AVSpeechSynthesizer.write`) | **Done**; real synthesis used by the tests to make the test audio |
| Speech playback through speakers (`EnginePlayback`) | Implemented; **not run in this phase**. The opt-in audible test (`AURA_AUDIBLE_VOICE_TESTS=1`) exists and was not run. D0 played the same kind of engine graph in the sandboxed app. |
| Live microphone capture (`EngineCapture`) | Implemented; **not run in this phase** (owner deferred physical tests) |
| CoreAudio device monitor | Implemented; **not run against real device switches** (deferred) |
| Bridge contract, Swift mirror, fixtures, mock | **Done**; parity and fixture tests pass |
| Voice UI | **Not started**. It belongs to Codex. The current page still says "Voice unavailable". |
| Hands-free barge-in (listening while Astra speaks) | **Unavailable by design** (`handsFreeBargeIn: false`) until echo tests pass on real devices |

## 2. What the user can do (once Codex builds the UI)

1. Press **Talk** (or hold ⌥Space for push-to-talk) → Astra shows *starting*, then *listening* once real audio arrives.
2. A live transcript shows what was heard so far.
3. The utterance ends when the user stops (push-to-talk) or after a pause in speech (auto end). There is exactly one final transcript.
4. The page sends the final transcript through the **existing** `ai.sendMessage` (same provider binding, privacy matrix, consent and approvals as typed text).
5. The reply streams as today. If speech output is on, `voice.speakReply` speaks it **sentence by sentence while it streams**: code blocks, tables, URLs and tool results are never read aloud.
6. The user can **stop speaking** (Esc), **cancel the reply** (existing Stop, which also stops speech), **mute** speech output, **cancel listening** without sending, or **end the voice session**.

## 3. Native architecture

```
                      ┌──────────── VoiceController (@MainActor, Services/Voice) ────────────┐
 voice.* methods ───▶ │ session · ListeningRun (one per utterance) · SpeakingRun (one per speech) │──▶ voice.* events
                      │ revisioned VoiceStatus · issues with recovery · stale-run guards        │
                      └──┬───────────┬──────────────┬────────────────┬──────────────┬───────────┘
          AudioInputSource   SpeechRecognitionEngine   SpeechSynthesisEngine   AudioPlayback   AudioDeviceMonitoring
          (EngineAudioInput)  (Analyzer / Legacy)       (SystemSpeechSynthesis) (EnginePlayback) (CoreAudioDeviceMonitor)
                 │                                                                     ▲
       InputHealthMonitor · SpeechActivity (pure)        SpokenReplyPlanner (pure) ────┘
                                                                ▲
 AIService ── AIReplyObserver (observe-only: started/text/state/ended/conversationChanged) ┘
 WindowStateStore.onChange ─▶ appInactive        AuraApp: sleep/lock ─▶ systemSleep, quit ─▶ shutdownNow()
```

| File | Role |
|---|---|
| `macos/Sources/AuraCore/Services/Voice/VoiceController.swift` | State machine, `VoiceEngines`, runs, issues, reply observer |
| `…/Voice/VoiceAudio.swift` | `AudioChunk` (mono Float32 + RMS/peak), capture protocols, `VoiceTiming`, `InputHealthMonitor`, `SpeechActivity` |
| `…/Voice/SpeechRecognition.swift` | `SpeechRecognitionEngine`, `AnalyzerRecognitionEngine` (macOS 26+), `LegacyRecognitionEngine` |
| `…/Voice/SpeechSynthesis.swift` | `SystemSpeechSynthesis` (write-to-buffers), 30 Hz level envelope, `EnginePlayback` |
| `…/Voice/SpokenReplyPlanner.swift` | Streamed Markdown → whole speakable sentences |
| `…/Voice/SystemAudio.swift` | `EngineAudioInput` capture, `CoreAudioDeviceMonitor`, `SystemVoicePermissions` |
| `…/Services/AI/AIReplyObserver.swift` | Observe-only hook; `AIService` calls it at its existing emit points |
| `macos/Sources/AuraCore/Bridge/BridgeDomainVoice.swift` | Swift mirror of the voice contract |
| `macos/Sources/AuraApp/VoiceSystem.swift` | Engines only inside the AURA.app bundle, System Settings URLs, sleep/lock observers |

**Rules carried from the D0 spike, all enforced:**
- Every closure AVFoundation or CoreAudio calls on its own threads is `@Sendable` or built in nonisolated code. The spike crashed when a main-actor closure ran on the realtime thread.
- **Voice processing (echo cancellation) is off.** It made the engine fail (`-10875`) on a Bluetooth headset, and half-duplex speech does not need it.
- Capture and playback use **separate engines**.
- Multi-channel input (for example 16 kHz/3 ch from a headset) is reduced to channel 0.
- Output levels come from the rendered audio (a 30 Hz envelope), not a mixer tap, which only reached about 10 Hz.
- No audio is ever written to disk.

**What the AI engine change is.** `AIService` gained a weak `replyObserver` and a `conversationChanged(_:)` helper that emits the same `ai.conversationChanged` event as before. Seven emit sites now go through that helper. No reply logic, state machine, privacy or tool behaviour changed, and all 3C-B tests pass unchanged.

## 4. Speech recognition

- **Engine choice:** `SpeechAnalyzer` + `SpeechTranscriber` (`progressiveTranscription` preset: volatile and final results) on macOS 26+. On-device only. **It needs only the microphone permission.** D0 and this phase's tests ran it with speech recognition `not_determined`.
- **Fallback:** On macOS 15–25, `SFSpeechRecognizer` with `requiresOnDeviceRecognition` (server recognition only if `allowServerRecognition` is on, default off). It needs speech-recognition permission.
- **Model:** `.lingering` retention. The model loads when Talk is pressed, in parallel with starting the microphone (D0: about 0.7–1.1 s cold). It is never loaded at launch.
- **Missing model:** If the en-US model is missing, the issue is `recognition_unavailable` with recovery `install_speech_assets` (`voice.installRecognitionAssets` downloads Apple's model through `AssetInventory`). On this Mac the model is already installed, so the download path is not exercised.
- **Transcripts:** `voice.transcript.text` is always the **whole utterance so far** (finalized segments + current volatile tail), with `seq` increasing per utterance. Identical text is not re-sent. Exactly one `isFinal: true` event follows an utterance that heard something. Partial text is never promoted to final, even if finalisation times out.
- **Audio health (`InputHealthMonitor`, per device type):**

| Transport | First audio allowance | Digital-silence allowance | Stall (buffers stop) |
|---|---|---|---|
| Built-in | 1.5 s | 2.0 s | 1.0 s |
| USB | 2.0 s | 2.5 s | 1.5 s |
| Bluetooth | 4.0 s | 3.5 s | 2.0 s |
| Other / unknown | 2.5 s | 3.0 s | 1.5 s |

  - The allowances start when **both** the microphone and the recogniser are ready, so a slow model load is not counted as a device failure.
  - *Startup latency* (no buffer yet, within the allowance) shows as `phase: starting`.
  - *No usable audio* means no buffer past the allowance (`no_audio`, "not arriving"), or only exact digital zeros past the silence allowance (`no_audio`, "only silence"). A real microphone's noise floor is far above the −100 dBFS threshold, so a quiet room is not mistaken for silence.
  - *Lost input* means buffers flowed and then stopped (`input_lost`).
  - Each case closes the microphone and offers `retry` + `choose_input`. Bluetooth messages say so.
- **Other limits:**
  - No speech for 8 s after audio is ready → `no_speech` (phase `idle`, not an error).
  - Auto end after a 1.2 s pause in speech.
  - 60 s hard cap per utterance (`time_limit`; what was heard is still delivered).
  - 10 s recogniser-start limit and 4 s finalisation limit (`recognition_failed`, retry).

## 5. Text-to-speech

- **Planner (`SpokenReplyPlanner`):**
  - Emits only complete sentences (abbreviations, decimals and list numbers handled). Output is identical however the text is chunked (tested character by character).
  - Headings and list items become sentences.
  - The first code block becomes "I've put the code on screen." and the first table "There's a table on screen."
  - Link text is spoken, never URLs. Images and inline HTML are dropped, and stray Markdown markers are removed.
  - Each reply is capped at 4,000 spoken characters; after that it says "The rest is on screen."
- **Synthesis:**
  - One `AVSpeechSynthesizer.write` per sentence.
  - Voice: `Preferences.voice.synthesisVoiceId`, otherwise the best installed voice for the locale. This Mac has only default-quality en-US voices (D0).
  - Pace: `speechRate` (0.7–1.3, default 0.85; relative to the voice's natural pace, mapped to `AVSpeechUtterance.rate` through a measured curve in `SpeechPace`).
  - The next sentence renders while the current one plays.
- **Playback:**
  - One `AVAudioEngine` + player node, kept up between the sentences of one speech and released when speech ends.
  - Starting the first sentence briefly starts the engine on the main thread (D0 measured 32 ms built-in and 149 ms Bluetooth). This may cost a frame at the start of speech and has not been measured with the scene running.
- **Levels and progress:** `voice.speechLevel` at about 30 Hz from the envelope; 0 is always sent when speech stops. `voice.speechProgress` reports `started`/`finished` per sentence.
- **Replies:**
  - `voice.speakReply` uses the text the page saw, kept for the last 6 replies, so it can start from the beginning even if called after streaming began or ended.
  - While the reply waits for an approval, Astra says "I need your approval on screen." once per wait. Speech continues when the reply does. Approvals are never answered by voice.
  - Speech stops when the reply is cancelled or fails, when its conversation is reset, ended, evicted or cleared after a GitHub change, or when a new reply starts in that conversation.
  - Voice's copies of a cleared conversation's text are dropped.

## 6. Contract (source of truth: `shared/contracts/*.ts`)

**Methods.** All are additive except `startListening`, whose params became optional.

| Method | Params | Result | Notes |
|---|---|---|---|
| `voice.getStatus` | — | `VoiceStatus` | Also refreshes permission state |
| `voice.getCapabilities` | — | `VoiceCapabilities` | |
| `voice.requestPermissions` | — | `VoiceStatus` | Shows the macOS prompt(s). Call only after the user chose to talk |
| `voice.startSession` | `{ conversationId?: string \| null }` | `VoiceStatus` | Binds voice to a conversation. Opens no microphone |
| `voice.endSession` | — | `VoiceStatus` | Stops everything and releases audio |
| `voice.startListening` | `{ mode?: "push_to_talk" \| "auto_end" }` (default `auto_end`) | `VoiceStatus` | `permission_denied` until granted. Stops speech first |
| `voice.stopListening` | — | `VoiceStatus` | Finalises (one final transcript follows if anything was heard) |
| `voice.cancelListening` | — | `VoiceStatus` | Discards the utterance |
| `voice.speak` | `{ text, interrupt? }` | `{}` | "Read aloud". Uses the planner. No-op when muted |
| `voice.speakReply` | `{ conversationId, streamId }` | `VoiceStatus` | `not_found` for unknown replies; `invalid_request` for cancelled or failed ones. No-op when muted. Calling it again for the same reply does not restart it |
| `voice.stopSpeaking` | — | `{}` | |
| `voice.setOutputMuted` | `{ muted }` | `VoiceStatus` | Muting stops current speech |
| `voice.listVoices` | `{ locale? }` | `VoiceOption[]` | Best quality first |
| `voice.openSettings` | `{ target: "microphone" \| "speech_recognition" \| "sound_input" }` | `{}` | |
| `voice.installRecognitionAssets` | — | `{}` | Returns at once; `voice.capabilitiesChanged` follows |

**Events:**
- `voice.statusChanged` (`VoiceStatus`)
- `voice.capabilitiesChanged`
- `voice.transcript { utteranceId, seq, text, isFinal }`
- `voice.inputLevel { utteranceId, level }` (≤20 Hz, listening only)
- `voice.speechLevel { level }` (≤30 Hz)
- `voice.speechProgress { speechId, streamId, segment, text, state }`

**`VoiceStatus` fields:**
- Kept from before: `microphone`, `speechRecognition`, `listening`, `speaking`.
- New:
  - `phase` and `revision`
  - `sessionActive` and `conversationId`
  - `mode` and `utteranceId`
  - `speechId` and `speakingStreamId`
  - `outputMuted`, `inputDevice { name, transport }` and `issue { code, message, recovery[], transport }`

**Phases:**

| `phase` | Meaning | Microphone open? |
|---|---|---|
| `unavailable` | No voice in this build (`swift run`) | no |
| `needs_permission` | Microphone not granted (see `issue` if denied) | no |
| `idle` | Ready; may carry a benign `issue` (`no_speech`, `time_limit`, `conversation_ended`) | no |
| `starting` | Microphone and recogniser starting; no usable audio yet | yes |
| `listening` | Usable audio arriving | yes |
| `recognizing` | Microphone closed; final transcript being produced | no |
| `thinking` | `speakReply` waiting for the reply's next complete sentence | no |
| `speaking` | Astra is speaking | no |
| `interrupted` | Stopped by the app becoming inactive, sleep/lock or a device change (`issue`) | no |
| `error` | Listening or speaking failed (`issue`) | no |

**Issue codes → recovery:**

| Code | Phase | Recovery |
|---|---|---|
| `permission_denied` | `needs_permission` | `open_microphone_settings` (or `open_speech_settings`, fallback engine only) |
| `permission_restricted` | `needs_permission` | none |
| `no_input_device` | `error` | `choose_input` |
| `input_failed` | `error` | `retry`, `choose_input` (Bluetooth named in the message) |
| `no_audio` | `error` | `retry`, `choose_input` |
| `input_lost` | `error` or `interrupted` | `retry`, `choose_input` |
| `device_changed` | `interrupted` | `retry` (`choose_input` if no device is left) |
| `recognition_unavailable` | `error` | `install_speech_assets` when downloadable |
| `recognition_failed` | `error` | `retry` |
| `synthesis_failed`, `playback_failed` | `error` | `retry` |
| `app_inactive`, `system_sleep` | `interrupted` | `retry` |
| `no_speech`, `time_limit`, `conversation_ended` | `idle` | `retry` / none |

**Ordering and duplicates (guaranteed by the host):**
- `revision` increases by exactly 1 per emitted status, and an unchanged status is never sent.
- Events from a replaced or stopped run are dropped.
- Transcripts carry `utteranceId` + `seq`, and progress carries `speechId`.
- After `shutdownNow` (app quit) nothing more is sent.

**Preferences** (`Preferences.voice`, new fields with defaults; older stores decode):
- `autoSpeakReplies: false`
- `speechRate: 0.85` (clamped to 0.7–1.3)
- `allowServerRecognition: false`

## 7. Tests (run on this branch)

| Suite | Result |
|---|---|
| `tools/swift-test.sh` (all native) | **218/218 passed**, three consecutive runs with no failures |
| Voice-specific (in the above) | 59 tests in 11 suites: lifecycle 7, listening 22, speaking 7, replies 7, end-to-end through `AppServices` 2, input health 3, speech activity 1, planner 4, audio/prefs 3, on-device recognition 2, audible 1 (opt-in, skipped) |
| Real on-device recognition with prerecorded speech | **Passed** in every run: the recogniser alone (about 0.8 s) and the full listening pipeline with auto end (about 7–8 s for the suite). Accuracy ≥ 0.8 on synthesized speech |
| `npm --prefix frontend run typecheck` | Passed |
| `npm --prefix frontend test` (bridge + mock) | **19/19** (3 new voice mock tests) |
| Browser suites with axe | Studio **28/28**, GitHub **23/23**, Astra **29/29** |
| `tools/build-app.sh Release` and `Debug` | Built, no warnings |

**Scenarios from the brief, all covered with scripted audio:**
- Failures: permission denied; no microphone input (no buffers, digital silence, stall); input startup failure (Bluetooth `-10875`, no device, hang); Bluetooth disconnection with retry on the new device; recognition failure (start, mid-utterance, finalisation timeout, missing model).
- Speech: synthesis completion (sentence order, progress, final level 0, engine released); cancellation while listening (late results ignored) and while speaking (rest dropped); barge-in and the reverse.
- Conversations: interruption by cancel, reset, new reply or GitHub clearing; approval pause; duplicate status, transcript and speakReply calls; stale runs.
- Clean-up and shutdown: microphone closed and recogniser released on every path; app shutdown during a session.
- App and integration: app inactive, through `WindowStateStore`; a spoken request through the real conversation engine with a tool call whose result is not spoken.

**Not covered by automated tests:**
- The real microphone, real speakers and real device switching.
- The macOS 15–25 fallback.
- The model-download path.
- `EnginePlayback` and `EngineCapture` against hardware.

## 8. Device issues and deferred physical acceptance tests

**Known:**
- The owner's Airdopes 141 Elite ANC (Bluetooth, hands-free profile) gave 44% accuracy on one D0 run and **no audio at all** on another.
- The host now detects the no-audio case within the Bluetooth allowance (4 s) and offers retry or another input instead of listening forever.
- Recognition quality over the 16 kHz headset profile is expected to stay lower than with the built-in microphone.

**Deferred, to run with the owner** (none of these has passed yet):
1. Built-in microphone and speakers: Talk → transcript accuracy, time to listening, auto end, final once.
2. The same on the Bluetooth earbuds: does `no_audio` / `input_failed` appear when they misbehave, and does retry or another input recover?
3. Device switch while listening and while speaking: connect, then disconnect a headset (`input_lost` / `device_changed`, then retry).
4. Speaker playback through `EnginePlayback` (or `AURA_AUDIBLE_VOICE_TESTS=1 tools/swift-test.sh --filter Audible`): levels about 30 Hz, no gaps between sentences, nothing stuck after Stop.
5. Microphone indicator: on only while `starting`/`listening`, and off after stop, cancel, error, app switch, sleep and lock.
6. Permission prompts in the installed app: first Talk, deny, re-enable in System Settings; only the microphone prompt appears on macOS 27.
7. The `voice.openSettings("sound_input")` URL opens Sound › Input on macOS 27. The URL is unverified.
8. Echo test on built-in speakers. This decides whether hands-free barge-in can ever be offered; it stays off until then.
9. Frame rate while speaking with the scene running (engine start on the first sentence).
10. VoiceOver running alongside spoken replies.

## 9. Codex handoff: premium voice UI/UX (GPT-6 Astra, Extra High)

**Scope:** `frontend/**` only. Design and build the voice experience on the existing conversation workspace and Astra character. Do not redesign the app or edit `shared/`, `macos/` or `frontend/src/platform/`. Request contract changes in `TASKS.md`.

**Required behaviour:**
1. **Never start listening by itself.** No microphone on load, zone change, reply end or model output. `voice.requestPermissions` is called only after the user pressed Talk and saw a short explainer.
2. **Capability gate:** show Talk only when `getCapabilities().recognition !== "unavailable"` and `phase !== "unavailable"`. Show "needs permission" and missing-model states honestly. Show no hands-free or "always listening" UI (`handsFreeBargeIn` is false).
3. **Controls:**
   - Talk: click → `startListening({mode:"auto_end"})`; hold ⌥Space while the window is key → `push_to_talk` and `stopListening` on release.
   - Esc: `cancelListening` while starting or listening; `stopSpeaking` while speaking.
   - Also: Stop speaking, Mute speech (`setOutputMuted`), End voice (`endSession`), and the existing Stop reply (`ai.cancel`, which also stops speech).
4. **Session:** call `startSession({conversationId})` when the workspace binds a conversation and `endSession` when it closes. When the issue is `conversation_ended`, the session is unbound.
5. **Transcript handling:**
   - Show non-final text as muted, read-only text in the composer.
   - On `isFinal`, put the text in the composer and send it through the existing `useConversation` send path, so privacy preview, consent and "reply already in progress" rules apply unchanged.
   - Offer an "Edit before sending" option.
   - Never send non-final text, and never route a transcript into an approval.
6. **Speaking replies:** when `prefs.voice.autoSpeakReplies` is on (default off) and the request was spoken, call `voice.speakReply({conversationId, streamId})` right after `ai.sendMessage` returns. "Read aloud" on a finished turn: `speakReply` (or `voice.speak({text})` if it returns `not_found`).
7. **Issues:**
   - Show `issue.message`, with one button per recovery: `retry` → `startListening`, `choose_input` → `openSettings("sound_input")`, `open_microphone_settings` → `openSettings("microphone")`, `open_speech_settings` → `openSettings("speech_recognition")`, `install_speech_assets` → `installRecognitionAssets` and wait for `voice.capabilitiesChanged`.
   - Benign issues in `idle` (`no_speech`, `time_limit`) should read as gentle hints, not errors.
8. **Ordering:** apply a status only if `revision` is higher than the last one applied. Key transcripts by `utteranceId` (keep the highest `seq`) and captions by `speechId`. Reconcile with `voice.getStatus` after reload.
9. **Settings:** auto-speak, voice picker (`listVoices`; say when only default-quality voices exist and how to add better ones in System Settings › Accessibility › Spoken Content), speech rate, and server recognition (macOS 15–25 only; explain that audio goes to Apple).
10. **Accessibility:**
    - Talk has an accessible name that reflects the state (for example "Talk to Astra", "Stop listening").
    - `aria-live="polite"` announces phase changes but not live partial text.
    - Focus rings, the 11 px minimum and text-safe tokens apply as everywhere.
    - Reduce Motion: static level bars, no pulsing.

**Animation triggers for Astra** (`CompanionState` today: idle / listening / thinking / speaking / error):

| Host signal | Suggested Astra / UI |
|---|---|
| `phase: starting` | Listening pose, ring dimmed ("warming up") |
| `phase: listening` + `voice.inputLevel` | Listening: head toward the user, ring follows the level |
| `phase: recognizing` | Listening → thinking blend |
| `ai.turnState` preparing/requesting/streaming/waiting_for_tool, or `phase: thinking` | Thinking |
| `ai.turnState: waiting_for_approval` | Attentive thinking; the approval card has focus; nothing speaks except the one notice |
| `phase: speaking` + `voice.speechLevel` | Speaking: drive the existing jaw damping (`App.tsx` passes `speechLevel={0}` today) |
| `voice.speechProgress started` | Caption the sentence; optional subtle gesture |
| `phase: interrupted` | Idle + short toast with the reason |
| `phase: error` | Error state + recovery buttons |

**Tests to update or add (frontend):**
- `astra.browser.mjs` "truthful about unavailable voice" and `studio.browser.mjs` "Voice unavailable" checks assume no voice. Change them for the new UI and keep the native-unavailable path (`phase: unavailable`) covered.
- The mock supports the full flow. Use `createMockTransport({ voiceGranted: true })` and `voiceIssue: "no_audio" | "input_failed" | "input_lost" | "no_speech" | "recognition_unavailable"` to design and test each state, with axe enabled.

**Limits to keep visible in the UI:**
- No hands-free barge-in.
- Speech is half-duplex.
- Bluetooth headsets may be unreliable.
- Spoken replies skip code, tables, links and tool output.
- Long replies stop after about 4,000 characters ("The rest is on screen").

## 10. Files changed on this branch

- **Contracts and mock:** `shared/contracts/domain.ts`, `methods.ts`, `events.ts`; `shared/bridge/mock.ts`; `shared/fixtures/bridge-messages.json`; `shared/test/bridge.test.ts`.
- **Native, new:** `macos/Sources/AuraCore/Bridge/BridgeDomainVoice.swift`, `Services/Voice/{VoiceController,VoiceAudio,SpeechRecognition,SpeechSynthesis,SpokenReplyPlanner,SystemAudio}.swift`, `Services/AI/AIReplyObserver.swift`, `macos/Sources/AuraApp/VoiceSystem.swift`.
- **Native, changed:** `Bridge/BridgeDomain.swift` (voice preferences; voice types moved), `Bridge/BridgeMethod.swift`, `AppServices.swift`, `Services/Services.swift`, `Services/AI/AIService.swift`, `Services/AI/AIConversation.swift` (observer calls only), `Lifecycle/WindowStateStore.swift`, `AuraApp/AppModel.swift`, `AuraApp/AuraApp.swift`.
- **Native, removed:** `Services/Voice/VoiceSession.swift` (replaced by `VoiceController`).
- **Tests:** `macos/Tests/AuraCoreTests/VoiceTests.swift` (new), `ContractTests.swift`, `ServiceTests.swift`, `FoundationTests.swift` and `AIToolAndVoiceContractTests.swift` (old voice tests moved to `VoiceTests.swift`).
- **Docs:** this file, `docs/PHASE3C_D_VOICE_PLAN.md` (§14 findings), `ARCHITECTURE.md`, `TASKS.md`.
- **Unchanged:** `/Applications/AURA.app` (not reinstalled), entitlements, Info.plist, the bundle identifier, the Astra GLB and its credit.
