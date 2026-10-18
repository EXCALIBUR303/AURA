# Phase 3C-D: voice native integration validation

- **Review branch:** `review/phase3c-d-voice-validation`, a worktree at `~/Developer/AURA-phase3d`.
- **Source:** `codex/phase3c-d-voice-experience` at `73b6ffd95ac1aebd8bc23c92eb68d3e4f4e7dbd5`, verified exactly. It contains the native voice commit `4087d11`.
- **Changed on this branch:** `faaaa68` (the in-app voice probe and fixtures) and this report. Nothing is pushed or merged.
- **Environment:** M5 MacBook, macOS 27.2, Xcode 27.1, Node 26.11.1.
- **Builds used:** sandboxed, ad-hoc signed Release and Debug `AURA.app` built from the worktree. `/Applications/AURA.app` was not touched.
- **Status:** integration validated with deterministic fixtures. **This is not full voice acceptance.** The physical microphone, Bluetooth, speaker and device-switch tests are still deferred (§7).

## 1. How this was validated without audio hardware

- **New probe mode.** `AURA_DEV_VOICE_PROBE=<scenario>` (development only, `faaaa68`) runs the real app with fixture voice engines:
  - **Microphone:** prerecorded speech. The fixture sentence is synthesized once by the real `AVSpeechSynthesizer` and fed as about 100 ms chunks in real time, followed by room tone.
  - **Recognition:** the real on-device `SpeechAnalyzer`.
  - **Synthesis:** the real `AVSpeechSynthesizer`.
  - **Playback:** silent, but timed to the rendered audio, with levels from its 30 Hz envelope.
  - **Permissions and devices:** scripted.
  - Nothing opens the microphone or plays sound. Logs show `fixture: capture opened … — no microphone`.
- **The probe drives the real page:**
  - Controls: Talk, hold ⌥Space, Esc, Send, Read aloud, Mute, End voice, recovery buttons.
  - Path: through the real bridge and the native `VoiceController`.
  - It records every `voice.*`/`ai.*` event and samples frames with `requestAnimationFrame`.
- **Isolation from your data:**
  - Probe launches skip the GitHub Keychain read, so there is no Keychain prompt.
  - They use the built-in mock AI provider: no network and no cost.
  - They restore the preferences they change. Your preferences were also restored from a backup taken before testing (§6).
- **Real mouse and keyboard.** A separate `manual` fixture launch was driven with real clicks and a real ⌥Space hold, using computer use with your approval.

## 2. Results by area

| # | Area | Result | Evidence |
|---|---|---|---|
| 1 | Native bridge: 15 methods, 6 events | **Pass** | All 15 methods answer through the real bridge. `speakReply` with an unknown stream correctly returns `not_found`. All 6 events observed in-app: `statusChanged`, `capabilitiesChanged`, `transcript`, `inputLevel`, `speechLevel`, `speechProgress`. Swift parity and fixture tests pass |
| 2 | Session lifecycle and transitions | **Pass** | Phases idle → starting → listening → recognizing → idle, then thinking → speaking → idle. Revisions strictly increasing. End voice gives `sessionActive: false`. A conversation reset re-binds cleanly |
| 3 | Push-to-talk and tap-to-talk | **Pass** | Tap: listening at 931–975 ms (cold) and auto end after the pause. Hold ⌥Space: `push_to_talk`, still listening after a 6 s pause, one final on release. A **real ⌥Space hold** (computer use) also worked |
| 4 | Live and final transcripts | **Pass** | 19 live updates and exactly 1 final per utterance. Real on-device accuracy on the fixture: 100% (Release, Debug and push-to-talk). Defaults (Edit before sending on, auto-speak off): the final becomes a "VOICE DRAFT · NOT SENT" and **no AI request** is made |
| 5 | Streaming reply + TTS coordination | **Pass** | Auto-speak on with editing off: 1 final → 1 `ai.sendMessage` → `voice.speakReply` of **the same stream**. 146 level events, final level 0, caption shown. A typed request with auto-speak on stayed silent |
| 6 | Stop, Mute, Esc, End voice | **Pass** | Esc while speaking stopped it about 43 ms after the key, with no late sentences. Mute made Read aloud silent, and unmuting did not resume. Esc while listening cancelled with no final and no send. The Cancel button works. End voice closed the session. Stop reply / conversation reset stopped speech within about 5 ms |
| 7 | Device-error and permission recovery | **Pass** | Details in §3 |
| 8 | Keychain, GitHub permissions, tool security | **Pass (code and tests); in-app re-check pending** | No changes since `main` to `Security/`, `Services/GitHub/`, tool policy and executor, provider registry, context builder, entitlements or `Info.plist`. Voice code has no Keychain, secret or network use. The 69 security, tool-policy and conversation tests pass. The in-app GitHub check was not repeated, because a new ad-hoc signature triggers a Keychain prompt (§7) |
| 9 | Astra audio-driven animation | **Pass (data path)** | Native `voice.inputLevel` (200 events) and `voice.speechLevel` (146) reached the shared sample object. The level meter lit 15 input and up to 20 output segments; the Astra jaw and ring read the same object. **Jaw-bone motion itself was not measured in-app** (no exposed probe) |
| 10 | Regression | **Pass** | §4 |
| 11 | Scene performance with voice active | **Pass** | §5 |
| 12 | Accessibility and reduced motion | **Pass (programmatic)** | 25 axe scans from this run (voice 9, Astra 7, GitHub 7, Studio 2), 0 violations. In-app reduced motion gives a static meter (`data-static=true`, all segments on, "Input active"/"Output active" labels); the jaw is set to 0 in code. System VoiceOver, Reduce Motion and Reduce Transparency toggles are **not** run (§7) |

## 3. Failure and permission scenarios (in-app, fixtures)

| Scenario | Outcome | Time to detect | UI recovery | Auto-restart |
|---|---|---|---|---|
| No audio from the device | `error` / `no_audio` | 2.2 s (1.5 s built-in allowance + model start) | Talk again, Choose microphone | No |
| Digital silence | `error` / `no_audio` ("only silence") | 2.7 s | Talk again, Choose microphone | No |
| Audio stops mid-utterance | `error` / `input_lost` | 3.7 s | Talk again, Choose microphone | No |
| Bluetooth engine start failure (`-10875`) | `error` / `input_failed`, transport `bluetooth` | 84 ms | Talk again, Choose microphone | No |
| Input device switched while listening | `interrupted` / `device_changed` | — | Talk again | No |
| AURA hidden while listening (real ⌘H path) | `interrupted` / `app_inactive` | immediate | Talk again | No |
| Mac sleep notification (real `NSWorkspace.willSleep`) | `interrupted` / `system_sleep` | immediate | Talk again | No |
| Microphone denied | Talk hidden; "Microphone access denied"; `startListening` → `permission_denied` | — | Microphone settings | — |
| First run (not determined) | Explainer shown; Continue grants **without** opening capture; a fresh Talk listens; only the microphone is requested (`speechRecognition` stays `not_determined`) | — | — | No |
| Speech model missing | `recognition_unavailable` | — | Download speech model → `capabilitiesChanged` → Talk works | — |

In every case the microphone indicator in the rail ends as "Microphone off", and no final transcript or AI request was produced. "Choose microphone" calls `voice.openSettings("sound_input")`. Probe mode logs the call and does not open System Settings.

## 4. Regression (review worktree)

| Suite | Result |
|---|---|
| `npm --prefix frontend run typecheck` | Passed |
| `npm --prefix frontend test` (bridge + mock) | 19/19 |
| `npm --prefix frontend run test:voice` (controller) | 18/18, 0 skipped |
| Chromium with axe: voice / Astra / GitHub / Studio | 20/20, 29/29, 23/23, 28/28 (100/100); 25 axe scans, 0 violations |
| `tools/swift-test.sh` | 218/218, 0 warnings |
| `tools/build-app.sh Release` / `Debug` | Built, no warnings |
| In-app probes: Release (12 scenarios) and Debug + Vite (flow) | All checks passed (§2–3) |

The last full run predates the probe-only commit `faaaa68`. **A final routine regression is still pending** (§8).

## 5. Performance (M5, bundled Release app, DPR 2, no physical recording)

| Condition | fps | p95 frame | Missed (>20.9 ms) | Draw calls / triangles |
|---|---|---|---|---|
| Idle, voice rail visible | 60 | 18 ms | 0 | 14 / 79,802 |
| Listening (fixture audio + live recognition) | 60 | 18 ms | 0 | 12 / 79,610 |
| Speaking (silent playback, levels + captions) | 60 | 18 ms | 0 | 12 / 79,610 |
| Six zones, voice idle | 60 each | 18 ms | 0 | 14 / 79,802 (software 12 / 79,610) |
| Debug + Vite, six zones | 60 each | — | — | — |

- **Not measured:** `EnginePlayback`'s first-sentence engine start on real speakers. Fixture playback is silent, so it never starts that engine.
- **Response times:** Esc → speech stopped took about 43 ms. A warm push-to-talk start (model already loaded) opened in about 14 ms.

## 6. Defects and changes

- **Integration defects in Codex's voice frontend or the native voice host: none found.** No fix to `frontend/`, `shared/` or the native voice services was needed.
- **Checked, not a defect:**
  - A first click on Talk while AURA is in the background only activates AURA. "Add context" behaves the same way, so this is standard macOS first-click behaviour and not voice-specific. The second click starts listening.
  - A programmatic unhide leaves AURA visible but inactive. Voice then correctly refuses to listen until the user activates the app.
- **Probe hygiene (my test code):**
  - One probe run I killed midway left your default provider set to `mock` and changed the last zone.
  - Fixed by restoring the `preferences` row from the pre-test backup with every AURA process stopped. The row is byte-identical to the backup (default provider `null`, last zone `software`), and AI providers are unchanged.
  - The probe now also restores the last zone, and documents that runs must not be interrupted.
- **Added:** `faaaa68`, development-only probe and fixtures. It is gated by the environment variable and inactive in normal launches.

## 7. Pending, device-dependent or owner-present (not passed)

- **Physical audio:**
  - The real microphone (built-in and the Airdopes 141 Elite ANC earbuds), accuracy and latency.
  - The Bluetooth no-audio and disconnection paths on hardware.
  - Device switching during capture and speech.
  - **Speaker playback through `EnginePlayback`**, including first-sentence engine start and frame rate.
  - The echo test. Hands-free barge-in stays unavailable regardless.
- **System prompts and links:**
  - The real macOS microphone indicator.
  - The real TCC prompt, denial and re-enabling.
  - The `x-apple.systempreferences` Sound › Input link.
- **Lifecycle:** real sleep, screen lock and app quit during a session.
- **Accessibility:** system VoiceOver alongside speech, and the Reduce Motion / Reduce Transparency system toggles.
- **Other paths:** the macOS 15–25 `SFSpeechRecognizer` fallback, and a real speech-model download.
- **In-app GitHub/Keychain re-check on this build.** It needs one Keychain prompt for the new ad-hoc signature. The code is unchanged since the 3C-C validation, where it passed.
- **Hosted (billable) inference:** not requested and not run.

## 8. Next step

The final routine regression on the review branch (`typecheck`, `test`, `test:voice`, four browser suites with axe, `swift-test.sh`, Release and Debug builds) and the closing of this report. Recommended model: **Claude Sonnet 5.5, Medium effort**.

## 9. Artifacts (outside git)

- **Probe logs:** `/private/tmp/claude-501/-Users-sid-Developer-AURA/4d85b2c6-54f1-4346-9d0a-57929727d160/scratchpad/p3d/` (`flow.log`, `debug-flow.log`, per-scenario logs).
- **Browser suite logs:** the `test:*.log` files in the same folder.
- **Screenshots:** in that folder's `screens/`: `listening-after-real-click.jpg`, `voice-draft-not-sent.jpg`, `after-option-space-hold.jpg`.
- **Preferences backup:** `db-backup/` in the same folder.
