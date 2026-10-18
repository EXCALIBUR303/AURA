# Phase 3C-D: real audio validation and speech clarity

- **Branch:** `claude/phase3c-d-real-audio`, based on `review/phase3c-d-voice-validation` (PR #2 head `6aed294`, not merged when this work started). Commits: `823947c` (dev-only live observer), `5216586` (speech clarity), plus this report. Not pushed.
- **Environment:** M5 MacBook Air, macOS 27.2, Xcode 27.1. Sandboxed, ad-hoc signed Release `AURA.app` built from the worktree. `/Applications/AURA.app` untouched (md5 of its executable unchanged).
- **Status:** built-in microphone and wired-headphone playback were exercised with the owner present. **Real voice is not fully accepted**: Bluetooth, device switching, no-audio hardware and several controls were not tested (§6).

## 1. How it was measured

`AURA_DEV_VOICE_LIVE=1` (dev only, `LiveVoiceObserver.swift`) keeps the real system engines and records voice events, UI clicks, level summaries and frame samples to a JSON-lines file in the app container's tmp folder. Transcripts spoken during the tests were in that file; it was deleted afterwards. Preferences changed during testing were restored from a backup taken first.

## 2. Built-in microphone (owner present)

| Test | Result |
|---|---|
| macOS microphone permission | Passed: AURA's explainer, then the real prompt, allowed by the owner; orange dot on, then off (owner report) |
| Tap-to-talk, live and final text | Passed: listening 254–360 ms after the click (cold), live partials, one final 50–95 ms after the pause |
| Hold ⌥Space | Passed: kept listening through pauses, one final 50 ms after release |
| Choose microphone | Passed: opened System Settings › Sound › Input (owner report) |
| Esc cancel | Passed by owner report only; the recorder did not capture those runs |
| Accuracy | "GitHub" was misheard ("guitar", "Githav"). Everything else was transcribed correctly |
| Mic cleanup | Status returned to idle and the indicator went off after every session |
| No-audio detection, device switching | **Not tested** (owner skipped) |

## 3. Speech rate: measured, not multiplied

`AVSpeechUtterance.rate` is not linear. A 35-word passage rendered with `AVSpeechSynthesizer.write`, timed by the audio (words per minute):

| native rate | 0.0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 (default) | 0.55 | 0.6 |
|---|---|---|---|---|---|---|---|---|
| Simone (premium) | 109 | 127 | 142 | 160 | 177 | 195 | 253 | 312 |
| Samantha (compact) | | | | 164 | 179 | 196 | 254 | 312 |
| Reed (Eloquence) | 72 | 85 | 99 | 122 | 143 | 174 | 221 | 282 |

The old mapping (`0.5 × speechRate`) turned the top setting, 1.2, into 0.6, about 310 words a minute. `speechRate` is now a pace relative to the voice's natural pace, 0.7–1.3 (default 0.85). `SpeechPace` finds the native rate by interpolating a measured curve per voice family (Apple/Siri vs Eloquence). Real test: pace 0.85 rendered 10–20% slower than 1.0 (asserted 0.80–0.90). The owner heard 0.85× through wired headphones: **clear, pace good**.

## 4. Clarity changes

- **Pauses:** one sentence is rendered per utterance, which lost the ≈0.33 s gap the synthesizer leaves between sentences. It is added back as silence: 0.36 s ÷ pace after a sentence, 0.68 s ÷ pace after paragraphs, list items and on-screen notices, none after the last.
- **Pronunciation** (`SpeechPronunciation`, audio only; captions keep the original): file names and paths, camelCase and snake_case, versions, `#42`, flags, commit hashes, and terms such as macOS, SwiftUI, WKWebView, npm. Each rule was checked by synthesising the phrase and recognising it on device. Example: "package.json and main.swift" was heard as "Maine Swift" before and correctly after. A "yammel" rule was dropped because it was recognised worse than plain YAML.
- **Recognition vocabulary:** AURA terms are passed as contextual strings. **Not yet verified with live speech.**
- **Voices:** novelty and Personal Voice entries are never listed or chosen. A missing saved voice falls back to the best installed one. **Inside the sandbox macOS reports 180 voices and none enhanced or premium**, so Astra uses Samantha (compact). Better voices (for example Ava Premium) need a free download in System Settings › Accessibility › Spoken Content; none were downloaded.
- **Controls:** `voice.pauseSpeaking`, `voice.resumeSpeaking`, `voice.replay`, and `speechPaused` and `canReplay` on the status. Captions now start when audio starts.
- **Frontend wiring** (small, existing components): Pause/Resume and Replay in the rail, a 0.7–1.3 pace slider, Preview voice. No Codex handoff is needed.

## 5. Playback and latency

| Item | Result |
|---|---|
| Intelligibility, pace | Clear, good at 0.85× (owner) |
| Clicks or clipping | None heard (owner); rendered peak 0.77 |
| First sentence latency | 1.17 s after the click (cold engine) |
| Speech while AURA is not active | Stopped within about 180 ms, with the reason shown (`app_inactive`) |
| Pause, resume, replay, stop by ear | **Not run** (owner skipped); automated only |
| Frame rate on the M5 while listening and speaking | 60 fps, p95 17–18 ms; speaking sample 60 fps (1 sample, 0 missed); 12–14 draw calls, 79,610–79,802 triangles |

The idle samples showed a few frames over 20.9 ms in a 60-frame window (typical missed count 0–2); the 55 fps target held in every sample.

## 6. Not tested

Airdopes earbuds and error -10875 on hardware, Bluetooth disconnect, input/output switching, no-audio detection, the GitHub vocabulary fix with live speech, pause/resume/replay by ear, real sleep and lock, enhanced voices, VoiceOver with speech, the macOS 15–25 recogniser. Hands-free barge-in stays unavailable.

## 7. Automated regression

| Suite | Result |
|---|---|
| Swift | 235/235, no warnings |
| Bridge | 20/20 |
| Voice controller | 19/19 |
| Chromium: voice, Astra, GitHub, Studio | 21, 29, 23, 28, all passing |
| Typecheck, Release and Debug builds, `swift build` | Clean |

## 8. Files changed

`shared/contracts/{domain,methods}.ts`, `shared/bridge/mock.ts`, `shared/fixtures/bridge-messages.json`, `shared/test/bridge.test.ts`; `macos/Sources/AuraCore` (Bridge, AppServices, Services, Voice: new `SpeechPace`, `SpeechPronunciation`; changed controller, synthesis, planner, recognition); `macos/Sources/AuraApp` (`LiveVoiceObserver`, fixture and probe hooks); `macos/Tests` (`VoiceClarityTests`, updated defaults); `frontend/src/companion/voice/*` and tests; `docs/PHASE3C_D_VOICE.md`.
