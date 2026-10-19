# Phase 4 Codex → Claude checkpoint

**M7 visual polish and frontend integration preparation.**
Branch `codex/phase4-living-universe`, M6 base
`a22d343ff757b9b59057db4525669ccb098648eb`. Use `git log -1` for the M7 tip.
No push, merge, cherry-pick or app installation is authorized/performed in M7.

Claude's `claude/phase4-native-foundation` was fetched and verified at
`694726313c85e48cfea26c693944c14edc67b768`, descending from the M6 base.
Its `PHASE4_NATIVE_INTEGRATION.md` §§5–8 reports 57–60 FPS on the M5 over repeat
visits, stable resources, a five-second first Living visit, refused WKWebView
pointer lock and stalled inactive camera travel. That is **baseline evidence from
Claude**, not Mac revalidation of M7. The native branch remains unmerged here.

M7 uses actual before/after browser renders to refine wood/stone surfaces, room
palettes, light balance, sign hierarchy and camera framing. The Living floor's
coplanar finish/slab defect is fixed. Compact companion placement frees the centre
and moves aside for room/equipment panels without remounting it or changing voice.
Original equipment fans, bounded display motion and every room interaction remain.
No new mesh, GLB, texture download, dependency, postprocessing or shadow map.

Explore now defaults to drag-to-look, WASD movement and arrow-key look; E opens
passages, Esc returns to Inspect. Optional pointer capture is a separate action,
and its denial leaves Explore usable. Focus, hidden/inactive state and dialogs
release input. Cancelled drags/presses cannot activate equipment or a portal.
Authorized travel finishes at its checked loaded destination on deactivation,
including travel that becomes ready while hidden; restoration never replays a
large time delta. The renderer's existing background/hidden policy stays intact.

Living loading now has download/decode and readiness/settle diagnostics plus a
bounded 8.1 MB local-byte preload after the Atrium settles. It allocates no extra
room geometry/textures and does not open floors. M6 resource pins/disposal survive.
The five-second native cold visit requires a fresh native probe to attribute and
measure the remaining upload/compile work; cloud timings cannot establish that.

P4-N1 preparation is implemented as frontend restore and explicit-user-change
hooks. **Persistence is not wired on this unmerged branch.** Settings correctly say
session-only. `frontend/WORLD_PREFERENCES_INTEGRATION.md` gives exact mapping,
queue/debounce, schema/failure handling and integrated-test requirements, using
Claude's actual contracts after owner-approved integration. No duplicated contract.

M7 results and screenshot evidence are recorded in `PHASE4_LIVING_UNIVERSE.md`.
The full voice test suites and the existing microphone browser scenario are
explicitly frozen by the owner; they are not counted as passes.

**Stop after M7. Recommended M8: GPT-6 Luna / Medium for independent visual and
interaction QA.** Do not start until the owner continues. Native M5 revalidation,
VoiceOver/system settings, cold upload/compile analysis, preference wiring after
integration and portal draw-call budget debt remain open. M9 remains the later
engineering/handoff checkpoint. No voice work resumes without owner instruction.

Ignored assets still require the verified original bundle on a new checkout:
`frontend/asset-pipeline/README.md`. Equipment uses the M6 digest
`916fe968d6af527429666f90ee9bd933914d6a1b2b6b816e1cbe2a1f323f90f2`, not M4's
historical digest. The other world assets, original Astra and visible CC BY credits
are unchanged. No screenshot or binary asset is committed.

## Preserve the current native baseline

- Six native ZoneIds and Cmd+1–6; project-zone assignment and AI context schema.
- GitHub read-only permissions, auth clearing, Keychain/provider sheets, source
  privacy and explicit approvals. Outstanding approval restore still safely uses
  Stop/send again until the existing atomic snapshot request is resolved.
- All **18** main voice methods, six events, pause/resume/replay and measured pace
  0.7–1.3/default 0.85. No browser capture, always-on input or hands-free barge-in.
- Original Astra GLB and visible CC BY 4.0/title/creator/source; one Canvas,
  window throttling/suspension, DPR limit, reduceMotion and existing diagnostics.

## Requested native coordination — no Codex contract edits

1. **P4-N1, optional versioned world preferences.** Exact proposed fields/defaults/
   bounds and patch/migration requirements are in
   [WORLD_ARCHITECTURE.md](WORLD_ARCHITECTURE.md#preferences-and-native-request-p4-n1).
   Use existing prefs methods/events, keep lastZone separate, and preserve old
   preferences. Claude owns TS/Swift/mocks/fixtures/parity/migration tests. Until
   landed, frontend world settings are explicitly session-only.
2. **P4-N2, Explore acceptance.** Claude confirmed pointer-lock refusal in Release
   WKWebView. Validate the new primary drag/WASD/arrows/E/Esc path in Debug + loopback
   and Release + aura://, including focus, object clicks after dragging and window
   deactivation. Pointer capture remains optional; no native permission change is
   needed for drag Explore.

M7 update: P4-N1 is implemented by Claude on the fetched native branch; use that
contract, not the older proposal. P4-N2 is resolved by frontend drag Explore after
Claude confirmed native refusal. Native validation of the new input remains pending.
No new local-model-management or media/game service is requested this phase.

## Validation responsibilities

M0 cloud results and source-reported Mac evidence are in
[PHASE4_LIVING_UNIVERSE.md](PHASE4_LIVING_UNIVERSE.md#audit-verification).
Do not reuse the older Phase 3C-D frontend's 15-method contract or pre-validation
status as the current baseline; main has newer native validation and real-audio fixes.

At final M9, Codex must provide exact branch/hash, frontend type/build/unit/bridge/
browser/axe results, licensed asset manifest and room screenshots. Include all room
connections/camera modes/input priority/GLB failure/retry/context-loss/reduced-motion/
resource-lifecycle checks and existing non-voice Astra/GitHub regressions. Voice
regression remains frozen unless the owner explicitly resumes it.

Claude's eventual native validation must include (voice items stay frozen until
separately authorized):

- Release and Debug builds, Swift contract/security tests, native menus and preserved
  project/context/credential/approval flows in all new physical destinations.
- Drag Explore, WASD/arrows, collision clearance, Esc/focus/full-screen and typing;
  keyboard-only room map and usable controls with WebGL/asset failure.
- Explicit native mic consent, physical input/output and deferred Bluetooth/device
  switching/sleep/lock checks from `PHASE3C_D_REAL_AUDIO.md`; Pause/Resume/Replay and
  no automatic capture after room/game transitions.
- VoiceOver, system Reduce Motion/Transparency, active/inactive/hidden window behavior
  and small/large desktop layouts with dialogs and side panels.
- Active M5 target ≥55 fps (aim 60), DPR and render counters in every room, light mode,
  camera mode and room transition; repeated visits and game exits
  for resource growth. Separate load/cinematic timing from steady-state samples.
- Native preference default decoding, bounded patches and layout migration only
  after approved contracts exist; no loss of existing projects/voice/AI settings.

Claude's fetched Phase 4 report records 57–60 fps under specified M5 conditions
for M3–M6. M7 has not been benchmarked on the Mac. Software-rendered cloud screenshots cannot pass native
performance or hardware voice acceptance. Push, merge and app installation remain
separate owner permissions.

## Native M7 recheck after approved integration

Do not merge/cherry-pick as part of this checkpoint. Once the owner approves an
integration branch containing M7 and Claude's native foundation, verify the five
original GLBs against the committed manifests/credits, then run from its root:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run build
tools/build-app.sh Release
open -n --env AURA_DEV_WORLD_PROBE=1 macos/.build/xcode/Build/Products/Release/AURA.app
/usr/bin/log stream --level info --predicate 'subsystem == "com.aura.app" AND category == "world-probe"'
```

This launches the build product, without copying to `/Applications/AURA.app`.
Repeat Claude's 1280×800/DPR2 active-window route, record FPS/calls/triangles and
resource counts, direct cold Living load and Atrium-prefetched Living load. Record
the first displayed frame separately from frontend ready/settled timestamps.
Deactivate, hide and restore mid-travel and mid-drag; confirm no stuck travel,
resumed key/drag or accidental portal selection. Do not exercise voice controls
or run voice suites while the freeze is in force. Persistent preferences require
the separate adapter work in `frontend/WORLD_PREFERENCES_INTEGRATION.md` before
relaunch/save behavior can be accepted.
