# Phase 3C-D — Astra voice frontend

## Final frontend handoff — Phases 0–7 complete locally

The production voice frontend, visual refinement and final engineering review are
complete for owner review. Implementation is at
`55914f157b99c5373939187f701c477552d9e933`; the full regression record was committed
in `72ac207a157a62da0e32bc3d143237d5b67c0aa3`. Subsequent handoff changes are
documentation only. Use the final commit reported with this handoff, or
`git rev-parse HEAD` on this branch, as the exact checkout to validate.

Talk/hold ⌥Space, live and editable final transcripts, speech playback controls,
permissions, device recovery and voice settings use the native typed bridge.
Existing Astra jaw/ring feedback uses actual native level samples. Browser checks
use the shared native-shaped mock in Chromium on Linux; AURA.app, physical audio,
system accessibility and Mac hardware acceptance remain pending. No additional
phase is started.

- Branch: `codex/phase3c-d-voice-experience`, created directly from remote
  `claude/phase3c-d-voice`.
- Verified native tip: `4087d11a9a377232e0f7acb40ec75a620f837969` (`4087d11`).
- Source includes the prior Codex frontend `db5bb301e19815fdebb54ff3036448e70b994e57`
  and Claude's merged Mac validation fixes. No cherry-pick, reset or redesign of
  those changes was performed.
- No push, merge, native service edit, platform edit or contract change.
- `/Applications/AURA.app` has not been touched.

## Phase 7 engineering review and changed files

Reviewed status/transcript/caption ordering, cancellation and session cleanup,
conversation/provider/repository binding, microphone gestures, approval separation,
native setting/recovery targets, actual audio sample flow and production packaging.
No additional implementation defect was identified; Phase 6 evidence applies to
the unchanged production code. The 100-check browser matrix was not repeated for
documentation changes.

Final package checks pass: every local script/style/icon referenced by built
`index.html` exists, the lazy Voice Settings chunk exists, the design entry is absent,
and original source/built GLB digests and bundled credit match. No direct browser
microphone/speech APIs or WebKit calls appear in the production voice UI. Protected
paths and lockfile are unchanged; no model, screenshot, private-key or certificate
file was added to the branch. The final production source matches the tested Phase 5
commit exactly.

The final evidence audit corrected one reporting error: the Phase 6 voice artifact's
last SwiftShader sample is **1 fps**, while the earlier Phase 5 sample was **2 fps**.
Both retain 14 draw calls and 79,802 triangles. Neither validates Mac performance.

All 24 changed paths relative to native base `4087d11`:

| Area | Files |
|---|---|
| App/conversation | `frontend/src/App.tsx`, `frontend/src/companion/CompanionWorkspace.tsx`, `frontend/src/companion/useConversation.ts` |
| Voice | `frontend/src/companion/voice/{VoiceController.ts,VoiceRail.tsx,VoiceSettings.tsx,useVoice.ts,voice.css}` |
| Existing 3D | `frontend/src/studio/{Astra.tsx,Studio.tsx}` |
| Production tests | `frontend/test/{astra.browser.mjs,studio.browser.mjs,voice-controller.test.ts,voice.browser.mjs}` |
| Design reference | `frontend/design/VOICE_EXPERIENCE.md`, `frontend/voice-design.html`, `frontend/src/voice-design/{main.tsx,VoiceDesignPreview.tsx,voice-design.css}`, `frontend/test/voice-design.browser.mjs` |
| Test configuration | `frontend/package.json`, `frontend/tsconfig.node.json` |
| Handoff | `docs/PHASE3C_D_VOICE_EXPERIENCE.md`, appended `TASKS.md` entries |

No dependencies were added or updated; the lockfile is unchanged. The design study
is a separate browser-only Vite entry and is excluded from the production build.
The build retains the lazy Voice Settings chunk, local original GLB/credit, existing
Markdown/context/provider chunks, and existing CSP/native scheme handling.

Known inherited limitation: a reload during an outstanding source approval cannot
restore an approval payload from the current host snapshot. The UI safely offers
Stop/send again; it never invents or accepts consent. The atomic approval snapshot
request remains in `TASKS.md` for Claude. Browser regression covers this fallback.

## Phase 6 regression results

- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend test`: passed. The Node launcher reports its grouped
  bridge file as one test in this runner; direct `node shared/test/bridge.test.ts`
  confirms **19/19**, zero failed or skipped.
- `npm --prefix frontend run test:voice`: **18/18**, zero failed or skipped.
- `npm --prefix frontend run build`: passed, 1,064 modules, no chunk-size warning.
- Full Chromium suites: voice **20/20**, Astra **29/29**, GitHub **23/23**, and
  Studio **28/28, zero skipped**. Total: **100/100 browser checks**.
- Axe scans: voice 9, Astra 7, GitHub 7 and Studio 1. **24 scans, zero violations.**
  Each browser suite reported zero page errors and zero external asset requests.
- Voice coverage includes permission explainer and denial, native-unavailable and
  older-host failure, no audio, no speech, lost Bluetooth input, recognition model
  installation, mute, typed/editable drafts, auto-speak identity, cancel/stop/end,
  keyboard focus, four desktop sizes, reduced-motion jaw settling and long captions
  in compact/expanded/focus layouts.
- Astra regression covers tool/approval privacy boundaries, conversation recovery,
  repository scoping, typed keyboard navigation, resizing and Markdown rendering.
  GitHub covers disconnect/connect/device auth, repository metadata, search/filter/
  sorting/pagination, rate limits, errors, permissions and confirmation. Studio
  covers the original GLB, attribution, six workstations, camera/mouse/keyboard,
  window layouts, WebGL loss/recovery and reduced motion.
- The source and production GLB checksums match at
  `e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1`. Original
  XRProfXR and CC BY 4.0 credit remains visible. `macos/`, `shared/`,
  `frontend/src/platform/` and `assets/` have no changes from native base `4087d11`.

Evidence is outside Git under `/workspace/aura-phase3c-d/phase6/`:

| Suite | Results and screenshots |
|---|---|
| Voice | `voice/results.json`, nine `axe-*.json`, state and layout screenshots |
| Astra | `astra/results.json`, seven axe scans and conversation/approval screenshots |
| GitHub | `github/github-results.json`, seven `accessibility-*.json` and auth/repository screenshots |
| Studio | `studio/results.json`, accessibility scan and six-zone/3D screenshots |

All browser runs used Chromium with ANGLE/SwiftShader. The final voice scene sample
was 1 fps at DPR 1, with 14 draw calls and 79,802 scene triangles. This is a
software-renderer functional result, not a performance benchmark. **Mac M5 ≥55 fps
and all native voice acceptance remain pending.**

## Phase 5 refinements

- Quiet voice states use a neutral rail with one explicit microphone status. The
  level display appears only during starting, listening or speaking. Listening
  stays teal; output and preparation of spoken replies use blue.
- Stop speaking is the primary playback action, preceding the secondary Talk
  control in both visual and keyboard order. Its tooltip explains that Talk stops
  speech and starts listening. Color changes are immediate to avoid a transient
  white-on-white label during the filled-to-outline transition. Existing restrained
  hover effects and global Reduce Motion rules remain in place.
- Mute is stated in text in compact and expanded views. Read aloud is disabled
  while muted, with an explanation, rather than accepting a silent action. No
  session mute or saved auto-speak behavior was changed.
- Live text and final voice drafts are explicitly marked **not sent**. The final
  draft label now sits inside the composer, so short-window and compact layouts
  cannot hide it with secondary preferences.
- Captions are a named, keyboard-focusable region with a visible focus ring and
  keyboard scrolling. Short windows cap caption height at 76 px and reserve at
  least 96 px for conversation messages. The composer can shrink and scroll when
  necessary instead of squeezing away the message area.
- Stop, Cancel and End return keyboard focus to an available voice control if
  their originating button disappears. They do not override focus already moved
  elsewhere. Compact headers now describe the session, and voice settings use the
  existing action accent with stable device-control spacing.

Changes are confined to `CompanionWorkspace.tsx`, `voice/VoiceRail.tsx`,
`voice/voice.css`, `test/voice.browser.mjs`, this handoff and an appended `TASKS.md`
entry. The coordinator, React voice hook, conversation service, Studio/Astra code,
native source, shared contracts, platform adapter, assets and dependencies were
not changed in Phase 5.

### Phase 5 verification and screenshots

- TypeScript and production build: passed, 1,064 modules, no chunk-size warning.
  Initial JS is 1,389.26 kB / 385.94 kB gzip; CSS is 63.38 kB / 13.37 kB gzip.
  Lazy Voice Settings remains 5.16 kB / 1.90 kB gzip. No new dependencies.
- Frontend voice controller: **18/18**, zero failed or skipped.
- Shared bridge: **19/19**, zero failed or skipped. `npm --prefix frontend test`
  passes; direct `node shared/test/bridge.test.ts` also confirms each test because
  the sandbox's Node runner otherwise reports the containing file as one test.
- Updated production voice browser suite: **20/20**, zero failed; **nine axe scans,
  zero violations**. Covers native-shaped shared mocks only. No browser microphone
  calls, page errors or external asset requests occurred.
- The suite now covers visible mute and disabled Read aloud, short-window unsent
  draft guidance, keyboard focus after End/Cancel/Stop, and scrolling a long spoken
  sentence in compact/expanded/focus at 1100×700, 1280×800, 1440×900 and 1728×1117.
  A preceding focused visual audit also verified these 12 layout combinations.
- Original GLB loading, jaw response, Stop settling and Reduce Motion still pass.
  The final cloud sample was **2 fps, DPR 1, ANGLE SwiftShader**, with one canvas,
  **14 draw calls and 79,802 triangles**. This software-renderer observation is not
  Mac M5 performance acceptance. The source and built GLB retain SHA-256
  `e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1`;
  original XRProfXR / CC BY 4.0 attribution remains visible.

| Evidence outside Git | Location |
|---|---|
| Final 20-check voice results and nine axe scans | `/workspace/aura-phase3c-d/quality/final/results.json` and `axe-*.json` |
| Before: production idle, compact, mute, listening and short-window settings | `/workspace/aura-phase3c-d/quality/before-*.png` |
| Before: production playback | `/workspace/aura-phase3c-d/implementation/scene-speaking.png` |
| After: production playback with original Astra | `/workspace/aura-phase3c-d/quality/final/scene-speaking.png` and `scene-1100.png` |
| After: short-window final draft and compact mute | `/workspace/aura-phase3c-d/quality/final/transcript-review-1100.png` and `muted-compact.png` |
| After: long captions across layouts | `/workspace/aura-phase3c-d/quality/final/long-caption-{expanded,focus,compact}-{1100,1440}.png` |
| Focused audit: idle/listening/settings and layout evidence | `/workspace/aura-phase3c-d/quality/layouts/` |

Screenshots contain the offline shared mock, never real microphone capture,
live inference or private repository data. No screenshots or binaries are committed.
Existing Node, Chromium, Playwright and axe installations were reused; only the
existing Vite service needed restarting. No environment configuration changes were
needed. No public preview link was attempted.

Phase 6 completed the full Astra, GitHub and Studio regression matrix, as recorded
above. Earlier results below are retained as historical evidence. Mac physical
voice and system accessibility acceptance remain pending under the instructions
at the end of this handoff.

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

### Phases 3–4 implementation verification (historical checkpoint)

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

### Frontend completion boundary

Phases 0–7 are complete locally. Stop for owner review. Publishing this branch
requires explicit push approval; merging requires separate approval. The native
acceptance below is the next validation task, not another frontend design phase.

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
its original scope. The required model checkpoints and frontend phases are now
complete; no part of this historical checklist should restart implementation.

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

## Claude Code native Mac M5 validation — pending

Claude should validate the final feature branch commit reported with this handoff.
The native handoff's §8 remains authoritative for physical tests. This branch is
currently local to Codex and cannot be fetched until the owner authorizes its push.

After an owner-approved push, use a clean Mac checkout and a new review branch
(if that name already exists, inspect it instead of resetting or overwriting it):

```bash
git fetch origin codex/phase3c-d-voice-experience
git switch -c review/phase3c-d-voice-validation origin/codex/phase3c-d-voice-experience
git status --short
git rev-parse HEAD
git merge-base --is-ancestor 4087d11a9a377232e0f7acb40ec75a620f837969 HEAD
git merge-base --is-ancestor 55914f157b99c5373939187f701c477552d9e933 HEAD
```

Compare HEAD with the exact final hash in the owner's handoff. Before any native
validation fix, `git diff 4087d11 -- macos shared frontend/src/platform assets`
should be empty. Preserve the licensed ignored GLB; copy it from the existing Mac
checkout according to `docs/ASSETS.md` only if it is missing. Check Node ≥23.6 and
the original asset before installing/building:

```bash
node --version
shasum -a 256 assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb
```

Expected GLB digest: `e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1`.
From the repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run test:voice
tools/swift-test.sh
tools/build-app.sh Release
open macos/.build/xcode/Build/Products/Release/AURA.app
```

Use the built, bundled app for live voice: `swift run` intentionally has unavailable
voice engines. Do **not** overwrite `/Applications/AURA.app`. Preserve/copy the licensed
ignored GLB per `docs/ASSETS.md` into a new checkout before building. The build-app
script runs the frontend production build before Xcode. Record exact HEAD, macOS,
Xcode, Node, device names, test output and measured scene results in a separate
native validation report. Run Debug/WKWebView development validation as a separate
pass after Release using the repository's existing Xcode scheme and Vite workflow.

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
