# Phase 3C-D — Astra voice frontend

## Current checkpoint: Phases 3–4 implementation

The production voice frontend and existing-rig reactions are implemented. This is
the implementation checkpoint before the owner's required **Phase 5 visual audit**,
not the final release or native hardware acceptance report. Phases 0–2 were saved
in `ce0fa3eef6a3690e66b6670473115506bcc1a3e1` and continued without restarting.

- Branch: `codex/phase3c-d-voice-experience`, created directly from remote
  `claude/phase3c-d-voice`.
- Verified native tip: `4087d11a9a377232e0f7acb40ec75a620f837969` (`4087d11`).
- Source includes the prior Codex frontend `db5bb301e19815fdebb54ff3036448e70b994e57`
  and Claude's merged Mac validation fixes. No cherry-pick, reset or redesign of
  those changes was performed.
- No push, merge, native service edit, platform edit or contract change.
- `/Applications/AURA.app` has not been touched.

## Production frontend implementation

- `companion/voice/VoiceController.ts`: native-only coordinator for all 15 voice
  methods and six events. It applies revisioned method replies/events through one
  cursor, handles pre-return transcripts, claims final text once, filters utterance
  seq and speech segments, reconciles restored capture, and serializes session
  bind/end operations including StrictMode cleanup.
- `useVoice.ts`: React subscription and physical-key handling. Hold ⌥Space,
  release to finish, Esc to cancel input or stop speech; native inactive/hidden
  events and browser focus loss invalidate capture intents. No automatic restart.
- `VoiceRail.tsx` / `voice.css`: capability-gated Talk, Finish, Cancel, output mute,
  Stop speaking, End voice, live read-only transcript, sentence captions, scalar
  input/output levels, exact native recovery buttons and typed bridge failures.
- `VoiceSettings.tsx` (lazy): native voice preferences, installed voice options and
  quality, rate, output automation, fallback-only Apple server opt-in, input settings,
  and an explicit page-local Edit before sending option (default on).
- `CompanionWorkspace.tsx`: explicit permission explainer; final speech goes through
  the existing composer/send path. Typed drafts are preserved, occupied/busy drafts
  retain a separate unsent transcript, and completed assistant turns can be read
  aloud. Context changes and session management close voice before changing scope.
- `useConversation.ts`: a frontend-only `ensureConversation` for first Talk without
  inference; successful send now returns the accepted conversation/stream identifiers
  so auto-speech targets that exact reply. Existing privacy, stream, tool and approval
  logic remains in charge. Typed requests never auto-speak.
- `App.tsx`, `Studio.tsx`, `Astra.tsx`: a stable audio sample object connects native
  levels to the existing floor ring and jaw. Audio samples do not update App state.
  Phase changes reuse existing listening/thinking/speaking/error poses. Reduced
  motion freezes jaw/head/idle motion and uses static level segments. No new 3D
  geometry, materials, lights, textures, shaders or decoder dependencies.

The microphone is requested only after Talk and a second explanation action.
Granting permission requires a fresh Talk gesture. Denied/restricted permissions
are not repeatedly prompted. No browser capture, browser speech synthesis, paid
speech service, always-on listening or hands-free barge-in was added.

Output mute is session-local and separate from saved auto-speak preferences.
Stopping speech leaves the text reply running; Stop reply cancels through the
existing AI path. End voice keeps the text conversation and draft. Read aloud
falls back to native `voice.speak` only on `not_found`, with assistant reply text,
never tool results or cancelled/failed replies. Native planning remains responsible
for speech omissions and the character limit.

### Implementation verification

TypeScript and production build pass. Controller tests pass **18/18**; the shared
bridge suite passes **19/19** (also invoked directly with `node shared/test/bridge.test.ts`
to show each test under this environment's Node runner). Existing Astra browser
regressions pass **29/29**. Voice browser integration passes **18/18**, and the full
Studio suite passes **28/28, zero skipped**. These three browser suites total **75
checks** and **16 axe scans with zero violations** (voice 7, Astra 7, Studio 2).

The native-shaped unavailable-host regression found an automatic bind retry loop:
when voice snapshots failed, creating a text conversation could repeatedly attempt
`startSession`. The coordinator now requires a known available status and suppresses
automatic retries after a binding failure. A fresh Talk action can retry; an older
host rejecting all voice methods keeps text replies fully usable. Both controller
and browser regressions cover this. No native contract was changed.

Short-window controls were compacted to retain at least a 96 px message area while
speaking at 1100×700. Secondary editing/provider controls remain reachable through
the existing settings actions. Read-only partial text retains its own focus ring.

| Current evidence | Location outside Git |
|---|---|
| Voice: 18 checks, 7 axe scans, no page errors/external requests/browser capture | `/workspace/aura-phase3c-d/implementation/results.json` |
| Astra: 29 checks, 7 axe scans, no page errors/external requests | `/workspace/aura-phase3c-d/astra/results.json` |
| Studio: 28 checks, 0 skipped, 2 axe scans, no browser errors/external requests | `/workspace/aura-phase3c-d/studio/results.json` |
| Production voice screenshots | `/workspace/aura-phase3c-d/implementation/{scene-speaking,scene-1100,transcript-review,permission,settings,no-audio,voice-1100}.png` |

Actual GLB rendering with shared-mock TTS was checked: jaw >0.005 rad while metered
output played, settled after Stop, and exactly 0 under Reduce Motion. One canvas,
72 joints, original idle, 14 draw calls and 79,802 triangles were retained. The final
voice test's cloud sample was **2 fps / DPR 1 / ANGLE SwiftShader**; it is a software
renderer functional test with no Mac performance conclusion. Native microphone,
speaker playback, real TTS metering and M5 ≥55 fps still require the Mac checks below.

Production build: **1,064 modules**, initial JS **1,388.45 kB / 385.72 kB gzip**, CSS
**62.22 kB / 13.17 kB gzip**, lazy Voice Settings **5.16 kB / 1.90 kB gzip**. No chunk
size warning. The native base's initial JS was 1,362.98 / 378.78 kB gzip; the initial
increase is about 25.47 kB / 6.94 kB gzip. No dependencies were added.

This is implementation verification. The required Phase 6 matrix (including a
fresh complete GitHub suite after any Phase 5 refinements) remains pending.
The frontend-owned controller tests run with `npm --prefix frontend run test:voice`;
the UI tests with `npm --prefix frontend run test:voice:browser` (external Playwright/
axe module paths as in the design test command below). The application still runs
from the existing `npm --prefix frontend run dev` entry.

Native Swift, shared contracts/mock, `frontend/src/platform`, original assets,
credential storage and permission policies remain unchanged. New dependencies:
**none**. `frontend/package.json` adds only voice test scripts; the Node TypeScript
configuration also checks frontend controller tests. Existing Astra and Studio
browser assertions now reflect available voice while retaining unavailable-host
coverage.

### Remaining phase checkpoints

1. **Phase 5: GPT-6 Astra / Extra High.** Audit the running production voice UI and
   refine hierarchy, status/caption clarity, ergonomics, panel spacing and motion.
   Preserve the working controller/bridge integration. Screenshots below and the
   original design study are references; do not replace native code for cosmetics.
2. **Phase 6: GPT-6 Luna / Medium.** Perform the full specified regression and
   accessibility matrix, including GitHub, permission/device failures, cancellation,
   all window sizes and reduced motion. Implementation checks below do not mark
   that phase complete.
3. **Phase 7: GPT-6.1 Sol / High.** Final combined engineering review and exact
   commit/handoff, then stop for owner review. No push or merge without approval.

Physical microphone/speakers, real Bluetooth switching, OS permission prompts,
SpeechAnalyzer/fallback/downloads, VoiceOver and Mac M5 performance remain pending
as specified in the native acceptance section at the end of this document.

## Completed in Phases 0–2

Read `AGENTS.md`, `ARCHITECTURE.md`, `TASKS.md`, the native voice handoff §§6/9,
all 15 voice methods and six events, Swift controller/wiring, shared browser mock,
wire fixtures/tests, the existing conversation send path and original Astra rig.

Selected an **integrated voice rail** after comparing a scene-side control and a
separate voice stage. The rail keeps controls and transcript beside the existing
composer; the studio remains visible. No extra camera moves, geometry, lighting,
particles or postprocessing are proposed.

The [design specification](../frontend/design/VOICE_EXPERIENCE.md) defines:

- Compact/expanded/focus placement, input/output level indicators and clear phase labels.
- Talk, tap/hold modes, Finish, Cancel, Stop speech, Mute/Unmute and End voice.
- Live/final text, explicit transcript review, preserved typed drafts and read aloud.
- Permission explanation, capability gates, native recovery mapping and voice settings.
- Revision/utterance/sequence filtering, exactly-once sends, early events, session
  rebinding, late key release, inactive-window cancellation and privacy invalidation.
- Native approval priority, exact accepted stream id for speakReply, and truthful
  download/status recovery without inventing native fields.
- Existing head/eye/jaw integration plan, reduced motion and stable scene performance.

Representative interactive prototypes cover 17 snapshots, including all native
phases plus permission denial/restriction, unavailable microphone, Bluetooth loss,
no speech, missing assets and final transcript review. Transcript, caption, level
and installed-voice examples come from shared contract fixtures. The prototype
labels these as fixtures, blocks native bridge use and never captures audio, sends
messages, opens settings or mutates native preferences.

## Files added for the design checkpoint

| File | Purpose |
|---|---|
| `frontend/design/VOICE_EXPERIENCE.md` | Direction, component/state specifications, contracts, lifecycle and implementation plan |
| `frontend/voice-design.html` | Isolated Vite design entry; not in the production build |
| `frontend/src/voice-design/main.tsx` | Browser-only prototype entry and native guard |
| `frontend/src/voice-design/VoiceDesignPreview.tsx` | Interactive design snapshots, shared fixture text and original studio |
| `frontend/src/voice-design/voice-design.css` | Scoped design styles; no production CSS change |
| `frontend/test/voice-design.browser.mjs` | Prototype interactions, layout, accessibility and no-mutation checks |
| `docs/PHASE3C_D_VOICE_EXPERIENCE.md` | This checkpoint and continuing handoff |
| `TASKS.md` | Appended checkpoint status |

New dependencies: **none**. No runtime CDN request, tracked screenshot or binary.
No change to production entry, application components, native/shared/platform files,
existing tests, lockfile or original GLB.

## Verification at the design checkpoint

| Check | Result |
|---|---|
| `npm --prefix frontend run typecheck` | Passed (application and Node configs) |
| `npm --prefix frontend test` | 19 tests, 19 pass, 0 fail, 0 skipped; includes three shared mock voice tests |
| `npm --prefix frontend run build` | Passed, 1,059 modules, no chunk-size warning |
| `frontend/test/voice-design.browser.mjs` | 13/13 passed; all 17 snapshots, interaction previews, four desktop sizes × three layouts, reduced motion, asset/credit and no-mutation checks |
| Axe in the above suite | Nine scans, zero violations: idle, listening, speaking, permission explainer, denied, no device, missing model, error and settings |
| Final heading/layout recheck | 6/6 passed: compact/expanded/focus at 1100×700 and 1440×900, after the final heading adjustment; three additional 1100×700 axe scans, zero violations |
| Production baseline browser smoke | Original studio and model loaded; no page errors; before screenshot captured |
| Source/built GLB SHA-256 | Both match the original checksum below |
| Ownership diff from native tip | No changes to `macos/`, `shared/`, `frontend/src/platform/`, assets or production application files |

The prototype's fixture import path and inherited button-hover contrast were fixed
during inspection. Final browser evidence has zero page errors, failed HTTP responses,
external asset requests, microphone requests or voice/AI/preference mutations. The
short-window intro was reduced and the focus heading condensed to keep Astra's face
visible. Final targeted layout evidence is recorded with the screenshots.

Production bundle remains the validated source application: initial JS 1,362.98 kB
(378.78 kB gzip), CSS 55.79 kB (12.06 kB gzip), with its existing lazy Markdown,
context and provider chunks. The design entry adds no production bundle cost.

Design browser diagnostics: ANGLE/SwiftShader, DPR 1, final sample 3 fps, 14 draw
calls, 79,802 scene triangles; one 36,508-triangle avatar, 72 joints, zero morphs,
`Idle02_F`, 1.75 m. This is a software-rendered screenshot/test session, not a
performance benchmark or comparison with the M5. No 3D source was changed.

Evidence directory (outside Git): `/workspace/aura-phase3c-d/design/`.
`results.json` contains the 13 checks, nine scans and render diagnostics;
`axe-*.json` contains full scan output; `layout-final.json` contains the six final
layout checks. Twelve axe scans in total returned zero violations. Screenshots include:

- `before-production-1440.png`: unchanged application before voice integration.
- `idle-1440.png`, `listening-1440.png`, `speaking-1440.png`: design states.
- `permission-1440.png`, `settings-1440.png`, `no-audio-1440.png`: permission/settings/recovery.
- `compact-1100.png`, `expanded-1100.png`, `focus-1100.png`: shortest desktop window.
- `compact-1440.png`, `expanded-1440.png`, `focus-1440.png`: larger desktop layouts.
- `level-sample-1440.png`: explicitly labelled level fixture with Reduce Motion off.

The prototype is not a real voice or native integration test. Full functional
voice tests and Astra/GitHub/studio regression suites belong to the production
implementation and the mandated Phase 6 model checkpoint.

### Inspect the prototype locally

From this branch's repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open `http://127.0.0.1:5173/voice-design.html` in a browser. The normal application is
at `/`. Use the labelled State selector, three layout buttons, permission/settings
dialogs and ⌥Space/Esc to inspect the interaction prototypes. No public preview URL
is created in the cloud setup chat. This entry is deliberately excluded from the
production build; it is not the future shipping voice interface.

Prototype test (Playwright and axe installed outside the repo in the cloud):

```bash
cd frontend
AURA_PLAYWRIGHT_MODULE=/workspace/.aura-preview-browser/node_modules/playwright/index.mjs \
AURA_AXE_MODULE=/workspace/.aura-preview-browser/node_modules/@axe-core/playwright/dist/index.mjs \
AURA_CHROMIUM_PATH=/usr/bin/chromium \
AURA_SOFTWARE_GPU=1 \
AURA_ARTIFACTS=/workspace/aura-phase3c-d/design \
node test/voice-design.browser.mjs
```

On a Mac with Playwright/axe available, use their installed module paths; omit the
Linux Chromium path and SwiftShader flag. Prototype checks still do not validate
native hardware.

## Preserved asset and validation fixes

Original model URL:
`/avatar/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb` through the existing
public symlink. Original SHA-256:
`e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1`.
The ignored local GLB and source `CREDITS.txt` are unchanged. The prototype and the
application both show the original title, XRProfXR, CC BY 4.0 and source link.

Preserve Claude's provider-selection recovery, contrast backing for zone headings,
provider-settings copy, tool path normalization, soak probe selectors and performance
sampler. Native source reports earlier 60 fps M5 acceptance for 3C-C; **this checkpoint
has not revalidated Mac performance**, especially native speech engine startup.

## Original design continuation plan (implemented in Phases 3–4)

At the design checkpoint the recommended model was **GPT-6.1 Sol, High**. That
continuation is now implemented on this branch; the following checklist records
its original scope. The next active checkpoint is Phase 5, described above.

1. Implement a frontend-owned voice controller around `platform/bridge.ts`; subscribe
   before snapshots, revision/run/sequence guards, explicit gestures and reliable cleanup.
2. Integrate the rail, permissions, settings, live/final text and read-aloud controls
   into the existing CompanionWorkspace. Reuse `useConversation.send` and its guards;
   expose accepted identifiers in a frontend-only return/callback for speakReply.
3. Preserve drafts and session/provider/context/consent rules. Never submit partial
   text, never voice-approve, never silently start capture after permission/recovery.
4. Connect actual native level events to the existing rig through a stable sample
   channel, keeping 20/30 Hz updates outside App/Studio React state. Reduced motion
   suppresses jaw/head/level movement.
5. Update frontend tests for the new UI, retaining unavailable-host coverage. Leave
   shared mock/contracts, platform and Swift unchanged; request gaps in TASKS.
6. Stop before Phase 5 for **GPT-6 Astra / Extra High**. Phase 6 then requires
   **GPT-6 Luna / Medium**, and Phase 7 **GPT-6.1 Sol / High**.

The sample page is a visual reference. Its scenario controls, fixture snapshots and
local state transitions must not become a production substitute for native events.

## Native Mac M5 validation — pending after implementation

Claude should validate the final frontend commit, not accept this prototype as a
voice implementation. Final exact branch/hash and complete test results will be
recorded at Phase 7. The native handoff's §8 remains authoritative for physical tests.

From the final review checkout (after explicit push approval):

```bash
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run test:voice
npm --prefix frontend run build
tools/swift-test.sh
tools/build-app.sh Release
open macos/.build/xcode/Build/Products/Release/AURA.app
```

Use the built, bundled app for live voice: `swift run` intentionally has unavailable
voice engines. Do **not** overwrite `/Applications/AURA.app`. Preserve/copy the licensed
ignored GLB per `docs/ASSETS.md` into a new checkout before building.

Pending owner-present checks: built-in microphone and speaker accuracy/latency,
Bluetooth no-audio and disconnection recovery, switch input/output during capture and
speech, actual OS microphone indicator cleanup, first permission/denial/reenablement,
fallback recognition on macOS 15–25, missing model download, Sound → Input link,
speaker sentence playback and stopping, app switch/sleep/lock/quit, VoiceOver alongside
speech, system Reduce Motion/Transparency and full-screen shortcuts. Keep hands-free
barge-in unavailable regardless of whether an echo test passes in one run.

Measure per-zone FPS, draw calls, triangles and DPR on M5 in the bundled app while
listening, streaming and speaking, including first-sentence engine startup. Compare
against the preserved baseline and ≥55 fps target. Cloud SwiftShader results are
not Mac performance acceptance. Live provider tests must obey existing cost and
credential permissions; local native voice alone does not verify hosted inference.

For native voice acceptance, keep the implementation defaults (auto-speak off,
Edit before sending on) for the first permission/recognition run. Verify that the
permission explainer's Continue action grants access without opening capture, and
that a fresh Talk produces a final editable draft with no AI request until Send.
Then opt into auto-speak, turn editing off, and verify one native final → one AI
send → the matching speakReply stream; repeat with read-only tools and a source
approval that can only be answered on screen. A typed request must remain silent.

Hold/release ⌥Space, release while starting, Esc, Cancel, Stop speaking, Mute/Unmute,
End voice, context/settings dialogs, conversation reset/switch/end, app inactivity,
sleep/lock and GitHub access loss all need owner-present acceptance with the macOS
microphone indicator observed. Test no-speech and Bluetooth failure recovery without
automatic restart. Confirm that Stop speaking keeps text streaming while Stop reply
cancels it, and that unmuting never resumes speech by itself. Exercise both short
desktop windows and focus/compact layouts with keyboard and VoiceOver.
