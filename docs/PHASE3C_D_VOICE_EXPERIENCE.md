# Phase 3C-D — Astra voice frontend

## Current checkpoint: design complete, production implementation pending

This is the **Phases 0–2 design handoff**, not the final voice implementation or
hardware acceptance report. The owner requires a manual model checkpoint before
Phases 3–4. No voice controls have been wired into the production application yet.

- Branch: `codex/phase3c-d-voice-experience`, created directly from remote
  `claude/phase3c-d-voice`.
- Verified native tip: `4087d11a9a377232e0f7acb40ec75a620f837969` (`4087d11`).
- Source includes the prior Codex frontend `db5bb301e19815fdebb54ff3036448e70b994e57`
  and Claude's merged Mac validation fixes. No cherry-pick, reset or redesign of
  those changes was performed.
- No push, merge, native service edit, platform edit or contract change.
- `/Applications/AURA.app` has not been touched.

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

## Next implementation task (Phases 3–4)

Recommended model: **GPT-6.1 Sol, High**. Continue on this branch; do not repeat the
fetch/review/design work. Read the design specification's race/lifecycle decisions
before writing a controller.

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
