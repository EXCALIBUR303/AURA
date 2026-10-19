# AURA Phase 4 — final Codex frontend handoff (M9)

The frontend milestones M3–M9 are ready for owner review. **Integrated Phase 4
acceptance is pending.** Native preference wiring and final Mac validation remain
open. Voice development and testing are frozen. No new phase starts from this report.

## Delivery and branch state

Repository: `https://github.com/EXCALIBUR303/AURA`.
Codex branch: `codex/phase4-living-universe`.

| Checkpoint | Exact commit |
|---|---|
| Published M6 baseline | `a22d343ff757b9b59057db4525669ccb098648eb` |
| Claude native foundation, reviewed but unmerged | `694726313c85e48cfea26c693944c14edc67b768` |
| M7 room/input/loading implementation | `35a499d9dc19d5151632baaeedb965b79316f443` |
| M8 regression alignment and evidence | `a9fe3e3e4d45d05fe3bcd4e4c9ddbb6f34754af7` |
| Final M9 documentation commit | Read `git log -1`; exact id is also in the downloadable M9 README/metadata |

A read-only origin check during M9 found Codex still at the published M6 commit and
Claude at the exact native commit above. M7–M9 have **not been pushed**. The M9 Git
bundle carries only the Codex commits after M6; it needs that baseline history.
It contains text/source commits, not ignored models or screenshots. No merge,
cherry-pick, force push, main update or app installation was performed.

## Implemented behavior

- Four separate physical rooms: developer Project Hub, central Atrium, warm Living
  Space and blue/slate Gaming Space. Actual M6/M7 rendered comparisons drove surface,
  lighting, sign, floor-depth and camera refinements; one Canvas remains.
- Four authored developer stations with real fan rotors, state-backed monitor atlas,
  object selection/inspection, keyboard alternatives and exact return to the prior
  camera. Six native ZoneIds stay separate from frontend RoomIds.
- Lazy room/model loading, safe corridors, E passages, map travel, collision checks,
  cancellation/retry and bounded current/adjacent retention. M6 rendered-room pins
  protect GLB disposal across the DOM and R3F roots.
- Inspect/orbit/zoom and primary **drag-to-look Explore**, WASD, arrow-key look, E,
  Esc. Optional pointer capture has its own action; denial leaves drag Explore usable.
  Focus/modal/lifecycle gates release keys and drags; interrupted presses do not
  select equipment or portals on restore.
- Loaded, checked camera travel completes on native deactivation/hidden state without
  requiring another active frame. Existing inactive throttling and hidden suspension
  remain. Browser mock lifecycle coverage passes; WKWebView revalidation is pending.
- Living local-byte warmup after 700 ms idle in the Atrium, bounded to 8.1 MB, with
  no parsed third room or speculative GPU allocation. Download/decode and room
  ready/settled timings are measured separately; they do not time GPU upload.
- Bounded static/hybrid/floating displays, intensity, daylight/sunset/night and
  Reduce Motion precedence. Living lamp/curtain/palette/chair controls are real
  session state. Compact companion/panels preserve drafts and stay separated.
- A truthful upcoming-games catalogue and an isolated lifecycle interface. No game
  is installed, no Play/save/media capability is claimed, and no game work is added.

## Verified evidence

| Scope | Saved result |
|---|---|
| TypeScript app/node and production build | Pass, 1,099 modules; M8 build uses the same runtime as M7 |
| World controller/settings/collision | 26/26 pass |
| Shared bridge, excluding four `mock voice` cases | 16/16 pass on the Codex contract |
| Generic game lifecycle unit tests | 6/6 pass; synthetic input/runtime hooks, no voice methods/engines |
| M7 world/polish/equipment/rooms/customization browser suites | 46 pass; 21 zero-violation axe scans; one microphone scenario excluded |
| Final M7 affected loading/layout rechecks | 4 repeat passes; 5 clean repeat axe scans; not added to unique counts |
| M8 Design / GitHub / Astra / Studio browser checks | 13 / 23 / 28 / 26 pass = 90; three voice-specific checks excluded |
| M8 accessibility scans | **20**, all zero violations: Design 5 + GitHub 7 + Astra 6 + Studio 2 |
| Six-zone cloud diagnostic audit | Completed at DPR 2, 2–4 FPS on SwiftShader; not M5 acceptance |
| Five original asset hashes / visible attribution | Match; original GLBs and credit files unchanged |

The earlier M8 report said 19 axe scans because it omitted Studio's saved
`accessibility-1100.json`. M9 corrected the count from existing zero-violation JSON;
no new scan was run. M7 and M8 browser groups are separate scopes, not proof that
all 136 checks are unique. Each group reports no page errors or external requests.
Tests use the shared mock; no live GitHub, AI or native authentication is claimed.

M8 changed two stale test assumptions: dock containment now covers the intended
side placement and inspector separation; wheel zoom is measured from the clear
Hub overview after orbit, preserving collision protection. M9 changes documentation
and the asset checksum checklist only. Passing runtime checks were not restarted.

Evidence folders outside Git: `/workspace/aura-phase4/m7/` and `/workspace/aura-phase4/m8/`.
The M9 review ZIP includes actual before/after rooms, laptop layouts, raw results,
all 20 M8 axe JSON files, cloud diagnostics and logs. Historical M7/M8 ZIPs are retained.

## Original assets and licences

All five GLBs are ignored. Preserve originals; copy verified files into a new
worktree. The final checksum checklist is root-relative:

```bash
shasum -a 256 -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt
```

| File (relative to repo root) | Bytes | Rights / SHA-256 |
|---|---:|---|
| `frontend/public/world/workstation.glb` | 999,936 | Original Project AURA; `916fe968d6af527429666f90ee9bd933914d6a1b2b6b816e1cbe2a1f323f90f2` |
| `frontend/public/world/room-kit.glb` | 741,932 | Original Project AURA; `04b88b088f2511cda8910dc58c281024ad39de6da87810f4fe33a6496892e2a2` |
| `frontend/public/world/GlamVelvetSofa.glb` | 3,149,844 | Eric Chadwick / Wayfair, CC BY 4.0; `67202c74a1a33377771f162dc7fad612a6c9bd51ee15124c488e9851d9ac5266` |
| `frontend/public/world/SheenChair.glb` | 4,125,648 | Eric Chadwick / Wayfair, CC0; `f0af2a2b102d28d540236306ae19f8fb36842df76bd38cf76f063f9bd2853399` |
| `assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb` | 18,054,896 | XRProfXR, CC BY 4.0; `e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1` |

Kit manifests, original rights and modification notes are in `frontend/public/world/`.
Keep `CREDITS.txt`, `FURNITURE_CREDITS.txt` and Astra's separate `CREDITS.txt` with any
asset transfer. The footer preserves Astra title/creator/source/license; World asset
credits preserve sofa/chair attribution and runtime recolouring/recentering notes.
Source GLBs are unchanged. The M6 workstation hash above supersedes historical M4.
No binary was committed or pushed. The previously supplied original-world asset ZIP
is separate from the code/review bundle; Astra remains a separately provided asset.

## Acceptance and pending owners

| Criterion | Frontend evidence / remaining acceptance |
|---|---|
| Four-room visual composition and panel fit | Actual screenshots plus 1100×700, 1280×800, 1440×900 layout checks pass; native window/VoiceOver review pending |
| Explore, collision, E/Esc and selection | Browser input/typing/modal/drag checks pass; physical Mac input and Debug/Release WKWebView pending |
| Deactivate/hide/restore camera travel | Native-shaped browser events pass; verify actual window lifecycle on final integrated build |
| Model loading, cancellation, GLB retry, context loss | Browser checks pass; native `aura://` failure/recovery and long soak pending |
| One Canvas, bounded rooms and resources | 20 visits/12 furniture cycles pass; M6 native repeat resources stable; final M7 native soak pending |
| Project/repository/context and six workspace views | Existing typed mock regressions pass; live native GitHub/AI regression pending; source permissions unchanged |
| Presentation and room settings | Session controls pass; P4-N1 live persistence/sync/debounce is **not wired** |
| Native world-preference contract | Implemented by Claude on `6947263` only; current Codex contracts lack it; requires approved integration |
| Active M5 target ≥55 FPS | Claude measured M3–M6 at 57–60; no M7/M8 Mac revalidation; software FPS cannot pass this gate |
| First Living load | M7 staged diagnostics/preload implemented; native five-second cold visit remains unverified until first-frame/upload/compile timing |
| Rendering budgets | Matched M7 Atrium+Hub 73 calls (old 75), Living 52, Gaming 70; Gaming+Atrium can reach72. Doorway budgets remain native profiling debt |
| System Reduce Motion/Transparency and accessibility | Automated browser scans/motion checks pass; native VoiceOver, display scaling and system settings pending |
| Voice and hardware acceptance | **Frozen**; no new voice implementation or hardware validation; deferred real-audio issues remain open |

Claude's M6 native baseline (§6 in his report): M5, macOS27.2, Release `aura://`,
1280×800/DPR 2, active frontmost,57–60 FPS over repeat visits; 59 geometries/17 textures/
30 programs at each cycle end. First Living travel 5.0 s; inactive travel stalled while
rendering at the deliberate≈28 FPS. These are Claude's baseline facts, not final
Codex measurements. M7 addresses the frontend behavior; the Mac must verify it.

## Mac review now — import the unpublished commits without merging

Download and unzip `AURA-Phase4-M9-Handoff.zip` to
`~/Downloads/AURA-Phase4-M9-Handoff`. In that folder, first verify `SHA256SUMS.txt`.
The generated README/metadata records the final full M9 commit and bundle SHA-256.
These commands create a separate frontend-review worktree and leave main/Claude intact:

```bash
cd ~/Downloads/AURA-Phase4-M9-Handoff
shasum -a 256 -c SHA256SUMS.txt
cd ~/Developer/AURA
git fetch origin codex/phase4-living-universe claude/phase4-native-foundation
git cat-file -e 'a22d343ff757b9b59057db4525669ccb098648eb^{commit}'
git bundle verify ~/Downloads/AURA-Phase4-M9-Handoff/AURA-Phase4-M9-Code.bundle
git fetch ~/Downloads/AURA-Phase4-M9-Handoff/AURA-Phase4-M9-Code.bundle refs/heads/codex/phase4-living-universe:refs/remotes/codex-handoff/phase4-living-universe
git worktree add -b review/phase4-m9-frontend ~/Developer/AURA-phase4-m9-frontend refs/remotes/codex-handoff/phase4-living-universe
cd ~/Developer/AURA-phase4-m9-frontend
git rev-parse HEAD
```

Use an unused worktree/branch name; if a path already exists, inspect/reuse it rather
than overwriting it. The printed HEAD must equal the M9 README id. The bundle needs
M6, so do not treat it as a standalone repository clone or update origin/main.

Claude's report names `~/Developer/AURA-phase4` as the validated asset source.
Copy from that worktree if it still contains the verified originals:

```bash
mkdir -p frontend/public/world assets/avatar/community/astra-lumen
cp -n ~/Developer/AURA-phase4/frontend/public/world/workstation.glb frontend/public/world/
cp -n ~/Developer/AURA-phase4/frontend/public/world/room-kit.glb frontend/public/world/
cp -n ~/Developer/AURA-phase4/frontend/public/world/GlamVelvetSofa.glb frontend/public/world/
cp -n ~/Developer/AURA-phase4/frontend/public/world/SheenChair.glb frontend/public/world/
cp -n ~/Developer/AURA-phase4/assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb assets/avatar/community/astra-lumen/
shasum -a 256 -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt
npm --prefix frontend ci
npm --prefix frontend run build
node --test --test-isolation=none --test-skip-pattern='mock voice' shared/test/bridge.test.ts
node --test --test-isolation=none frontend/test/world.test.ts frontend/test/games.test.ts
npm --prefix frontend run dev -- --host 127.0.0.1
```

Node≥23.6 is required. If the validated asset path is gone, use the original asset
bundle and the separately licensed Astra copy, preserving credits. Do not regenerate
or substitute a model to make a hash pass. A browser at `http://127.0.0.1:5173` is
labelled Browser mock and can review the final world; this is not native validation.

Optional broad browser replay: the review ZIP's `validation/run-nonvoice-browsers.py`
is a portable adapter around existing suites. It excludes the three legacy
voice-specific cases and records them as frozen; it does not alter tracked tests.
It supports `--list` to inspect the planned checks before any browser runs.
Playwright1.64.1 and axe adapter4.14.0 were installed outside this cloud checkout.
If matching tools are not already available, install them in a disposable directory:

```bash
mkdir -p /tmp/aura-phase4-browser-tools
npm --prefix /tmp/aura-phase4-browser-tools install --no-save --package-lock=false playwright@1.64.1 @axe-core/playwright@4.14.0
/tmp/aura-phase4-browser-tools/node_modules/.bin/playwright install chromium
export AURA_PLAYWRIGHT_MODULE=/tmp/aura-phase4-browser-tools/node_modules/playwright/index.mjs
export AURA_AXE_MODULE=/tmp/aura-phase4-browser-tools/node_modules/@axe-core/playwright/dist/index.mjs
export AURA_ARTIFACTS=/tmp/aura-phase4-m9-browser-review
python3 ~/Downloads/AURA-Phase4-M9-Handoff/validation/run-nonvoice-browsers.py --list
python3 ~/Downloads/AURA-Phase4-M9-Handoff/validation/run-nonvoice-browsers.py
```

Use Playwright's Mac Chromium by default; the cloud's `/usr/bin/chromium` and
SwiftShader flags are not Mac requirements. Do not run unfiltered `npm test`,
`test:astra`, `test:browser`, `test:voice`, voice-design or hardware voice suites
while the freeze remains in force.

## Native integration — only after separate owner approval

Neither this handoff nor bundle import authorizes a merge/cherry-pick. On a future
approved integration branch, combine the Codex tip with Claude's exact foundation,
retain Claude-owned files as authoritative, and implement the frontend adapter in
`frontend/WORLD_PREFERENCES_INTEGRATION.md` using his actual shared types. Do not
copy a second contract or bypass typing to send unsupported patches.

Required adapter work: one launch read coordinated with workspace navigation;
version/room validation; restore without capture or save echo; explicit changed-field
writes;≈300 ms slider debounce; settled room saves; `prefs.changed` reconciliation;
`invalid_request` authoritative reread; truthful persistence/failure copy. Room
options remain session-only. Preserve lastZone/Cmd+1–6 separately and avoid late
restore overwriting a newer user navigation. Add integrated mock/native checks
before declaring P4-N1 frontend complete.

## Exact future native validation on the Mac M5

Run only in the approved integrated worktree. Quit other AURA instances before
measuring to avoid shared database/GPU interference; back up the existing AURA
container with the app closed. Preserve the installed `/Applications/AURA.app`.
The probe skips GitHub Keychain restore and makes no voice/AI/GitHub calls; it is
not evidence of those live flows. Initial UI navigation may save world preferences
once a future adapter is wired, so do not assume the database stays byte-identical.

```bash
shasum -a 256 -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt
tools/check-assets.sh
tools/build-app.sh Release
open -n --env AURA_DEV_WORLD_PROBE=1 macos/.build/xcode/Build/Products/Release/AURA.app
/usr/bin/log show --last 10m --info --predicate 'subsystem == "com.aura.app" AND category == "world-probe"'
```

`check-assets.sh` and the probe exist on Claude's branch, not the unmerged Codex
review branch. Launch only the build product. Run `tools/build-app.sh Debug` for a
separate Debug/loopback input check. Keep all voice controls/hardware tests frozen.
Do not run the full Swift suite while frozen; a narrowly scoped non-voice example
on the integrated branch is:

```bash
tools/swift-test.sh --filter 'WorldPreferencesTests/(worldPatchMergesOneLevelAndClampsIntensity|invalidWorldPatchesAreRejectedWithoutWriting|roomIdFormat)|GitHubRedirectTests|GitHubPermissionPolicyTests'
```

This command is provided from inspected suite names; it has not been executed in
this Linux session. Broader migration/parity tests require reviewing their scope
against the voice freeze before selection.

Native acceptance checklist:

1. Repeat Hub→Atrium→Living→Atrium→Gaming→Atrium→Hub at 1280×800/DPR 2, active/frontmost.
   Record actual render FPS/calls/triangles/resources per room, repeat cycles and a
   longer soak; distinguish rendered FPS from rAF. Target ≥55 FPS, aim 60.
2. Measure direct cold Living and Atrium-prefetched Living first presented frames;
   record ready/settled diagnostics separately from shader compilation/GPU upload.
   Compare equivalent fresh launches; do not claim the old 5 s cold case is fixed yet.
3. Physically use drag/WASD/arrows/E/Esc, object click/inspect/return, wheel/orbit and
   keyboard map. Type into editors and open dialogs; no unintended camera movement.
4. Deactivate, minimize/hide and restore mid-travel, during load and during a held
   key/drag. Verify arrival, no stale movement or accidental portal click and the
   original inactive/hidden render policy.
5. Validate native missing-GLB/retry/context-loss paths, 1100×700 through 1728×1117
   panels/dialogs, VoiceOver and system Reduce Motion/Transparency/display scaling.
6. After the adapter exists, test relaunch/defaults, unknown room, newer schema,
   debounced writes, concurrent prefs changes and save errors. Inspect live
   GitHub/AI/context/consent behavior only in explicitly permitted read-only flows.
7. Preserve keys, permissions, native services and the known approval-restoration
   fallback (Stop then send again). No automatic source consent or game install.

Record exact integrated commit/build/macOS/window/DPR, pass/fail evidence and any
remaining issue. Phase 4 cannot be marked fully accepted until those native and
integration gates pass. Stop after the M9 handoff for the owner's review.
