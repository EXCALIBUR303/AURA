# Phase 2.6 visual refinement handoff

Branch: `codex/phase2-visual-polish`, based directly on remote `review/phase2-validation` at `4d0b896179607e331fb75f499e06e9deb78af104`. No main merge or remote push. Phase 3 has not started.

## Changes for review

- The studio has layered limestone and timber floor edges, tall recessed window bays, a central timber feature, and quieter floor seams. Warm daylight and a cool fill give the room more depth without extra lights, postprocessing, HDRIs, textures, or dependencies.
- Four workstation silhouettes now differ: a timber electronics bench with a component board and equipment, a dual-display software desk, a violet-accented model workstation with a compute cabinet, and a sage project desk with folios. Restrained floor and furniture accents distinguish them without neon.
- Revised overview and detail camera poses frame the room and individual equipment. Existing smooth camera interpolation, orbit constraints, reduced motion, zoom, and reset behavior remain. Clicking a tabletop or monitor selects its station; the persistent keyboard-accessible navigator provides the same destinations.
- Astra retains the original 1.75 m normalization, idle animation, bounded look-at and speech jaw layers. A low-cost invisible hit area makes clicking Astra focus the companion camera and prompt. The status control provides a keyboard equivalent. The dock has quieter surfaces, clearer focus, distinct thinking/listening/speaking/error states, and a shorter scrollable reply area.
- The light interface uses consistent local SVG icons, warm neutral surfaces, restrained 140 ms hover transitions, a slimmer header, and a compact inspector. All six overview cards remain reachable at 1100×700. Detail views hide their active card and retain at most two nearby destinations (one beside Astra), with the existing collision avoidance intact.
- The inspector adds All projects / This workstation scope using **saved bridge project assignments only**. Explicit assignment remains a draft until Save. Per-project drafts survive repository and workstation changes; saved assignments provide a Visit action. Recent commits remain available in an accessible disclosure.

## Claude review follow-ups and preservation

| Review item | Phase 2.6 outcome |
| --- | --- |
| Periodic GPU sync stall | The cached renderer-string block from `0351804` remains unchanged. A browser regression check confirms no additional vendor/renderer queries across diagnostic samples. |
| Native validation probe | `3261b96` and all native files are inherited unchanged. Diagnostics retain their fields and sampling rules; an optional camera FOV supports actual 3D click tests. |
| Heading contrast over the wall | Fixed with an opaque `#f8faf7` backing and a darker italic accent. Axe scans pass in the overview and minimum-window workstation view. |
| Six cards crowding each detail view | Fixed by hiding the current card and limiting nearby destinations. All six destinations remain in the top navigator. |
| Removed PCFSoftShadowMap warning | Fixed with `shadows="percentage"` (PCFShadowMap). |
| THREE.Clock deprecation | Still emitted by R3F internals. No dependency changes or monkeypatches were introduced to suppress it. |

`macos/**`, `shared/**`, `frontend/src/platform/**`, `frontend/src/studio/Astra.tsx`, Vite configuration, dependencies/lockfile, root documents, and original assets/credits are unchanged relative to the review branch. Rendering still pauses for document/native inactivity; adaptive DPR and stable per-zone sampling remain enabled.

## Validation

Run in Linux cloud with Node 24.19.0, npm 11.9.0, Chromium 154 / SwiftShader. See `PHASE2_6_RESULTS.json` for the recorded outcomes and performance evidence.

- `npm --prefix frontend run typecheck`: passed (both TypeScript projects).
- `npm --prefix frontend test`: 8 passed, 0 failed.
- `npm --prefix frontend run build`: passed, including TypeScript checks.
- `npm --prefix frontend run inspect:avatar`: original 36,508 triangles, 72 joints, no morph targets, `Idle02_F` 31.80 s.
- `npm --prefix frontend run test:browser`: 27 checks passed, including all original 22 checks. New coverage verifies cached GPU reads, detail-card density, physical scene clicks and companion focus, assignment scope/draft retention, and minimum-window heading backing/accessibility.
- Automated WCAG A/AA: zero violations in both scans. Keyboard-only zone navigation, Cmd/Ctrl shortcuts, input editing, orbit/zoom/reset, mock streaming/cancellation/speech, GLB failure/retry, renderer failure, context loss/restoration, native command simulation, and voice unavailability pass.
- Production smoke check (`vite preview`, port 4173): all six zones settle, the original model loads, the inspector and attribution remain available; zero errors or external runtime requests. Local texture `blob:` URLs are local resources.
- Normal audited sessions: zero uncaught errors or automatic external runtime requests. The recovery tests intentionally block WebGL and the GLB in isolated sessions.

A fresh per-zone performance run uses 1100×700, device scale factor 2, two settled samples per zone, and a new page per zone so prior adaptive reductions cannot contaminate its starting DPR. These software-renderer measurements do **not** establish Mac M5 performance acceptance. Claude's earlier 60 FPS result is historical evidence for the review branch, not a new validation of these changes.

The like-for-like overview captures at 1440×960, DPR 1 show **62 → 13 draw calls**, and **79,514 → 79,794 triangles** (+0.35%). Static instancing of the plants removes repeated draw work while allowing more architectural detail. Actual software-renderer FPS was 5 before and 4 after in those single capture windows; no FPS improvement is claimed from these noisy software samples. Revalidate the ≥55 FPS / actual DPR 2 target on the M5.

| Zone | FPS (software GPU) | Draw calls | Triangles | Actual DPR |
| --- | ---: | ---: | ---: | ---: |
| studio | 2 | 13 | 79794 | 2 |
| hardware | 2 | 14 | 79802 | 2 |
| software | 2 | 14 | 79802 | 2 |
| ai-lab | 2–3 | 14 | 79802 | 2 |
| github | 1–2 | 14 | 79802 | 2 |
| companion | 2–3 | 13 | 79794 | 2 |

All 12 samples were at DPR 2. The cloud software renderer does not meet 55 FPS. No Mac numbers are inferred.

## Asset integrity and screenshots

The original gitignored GLB is unchanged and not committed. Source and production copies both hash to:

```
e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1
```

It remains 18,054,896 bytes, served through the existing `frontend/public/avatar/astra-lumen` symlink. Author XRProfXR, CC BY 4.0, and the original Sketchfab source remain visible in the footer; the source `CREDITS.txt` is unchanged.

Before/after PNGs are task artifacts outside Git (no binaries committed):

- `/workspace/aura-phase2-6/before/`: validated-review overview, hardware, software, AI, companion, and 1100×700 hardware.
- `/workspace/aura-phase2-6/after/`: matching refined views.
- `/workspace/aura-phase2-6/final-tests/`: browser results, accessibility scans, and screenshots.
- `/workspace/aura-phase2-6/performance/performance.json`: fresh per-zone measurements.

## Mac M5 review

The branch is local to this Codex checkout until separately authorized for push. A source-only patch is provided with the task artifacts for review without requiring a remote push. Apply it to a clean worktree based on the validated review branch, preserving the owner's existing checkout and licensed GLB:

```bash
cd /Users/sid/Developer/AURA
git fetch origin refs/heads/review/phase2-validation:refs/remotes/origin/review/phase2-validation
git worktree add -b review/phase2-6 /Users/sid/Developer/AURA-phase2-6 origin/review/phase2-validation
cd /Users/sid/Developer/AURA-phase2-6
# Download the supplied aura-phase2-6.patch to Downloads first.
git am /Users/sid/Downloads/aura-phase2-6.patch
cp -n /Users/sid/Developer/AURA/assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb assets/avatar/community/astra-lumen/
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run inspect:avatar
npm --prefix frontend run dev
```

Use another worktree path/branch name if either already exists. Open `http://127.0.0.1:5173/` locally. The existing strict port and loopback default are preserved. In a second terminal:

```bash
cd /Users/sid/Developer/AURA-phase2-6
export DEVELOPER_DIR=/Library/Developer/CommandLineTools # if Xcode's licence is still pending
export AURA_PHASE26_DATA_DIR="$(mktemp -d /tmp/aura-phase26.XXXXXX)"
AURA_DATA_DIR="$AURA_PHASE26_DATA_DIR" AURA_DEV_PROBE=1 AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp
```

Review dev and production separately. Quit AuraApp, then run the production mode with the same data directory:

```bash
env -u AURA_DEV_SERVER_URL AURA_DATA_DIR="$AURA_PHASE26_DATA_DIR" AURA_DEV_PROBE=1 AURA_WEB_ROOT="$PWD/frontend/dist" swift run --package-path macos AuraApp
```

Record FPS, calls, triangles, **actual DPR 2**, renderer, frame-time percentiles, and transitions in all six zones at 1100×700 and a larger desktop window, using both browser and real WKWebView. The existing probe is opt-in; inspect native logs with `/usr/bin/log show --last 3m --info --predicate 'subsystem == "com.aura.app" AND category == "probe"'`. Foreground the app during capture. Occluded windows can pause rendering.

Manually verify workstation and avatar selection, unoccluded framing, Cmd+1–6 through the real menu, companion focus, unsaved draft retention, Save/reselect, SQLite zone persistence across relaunch, idle/look-at/jaw, attribution, focus visibility, VoiceOver, Reduce Motion/Transparency, and Safari Web Inspector network/console in both launch modes.

### Pending / known limits

- **Pending:** all new-scene M5 browser and real AuraApp performance/rendering/integration checks above. No native app or Swift suite was run in Linux.
- **Pending native/owner work inherited from review:** window drag strip, Xcode licence/app target, physical menu shortcut automation, VoiceOver and native reduced-transparency/network review. These are not modified in Phase 2.6.
- R3F's upstream THREE.Clock warning remains. Voice/services retain existing Phase 2 mock/unavailable behavior.
- Detail cards may hide when the orbit or expanded reply leaves insufficient room. The six-zone top navigator stays available. The inspector scrolls at short window heights; mobile work is out of scope.
- Saved project changes use the bridge; drafts are in memory until Save. No credentials or new native APIs are introduced.

Stop at Phase 2.6 review. Do not merge main or begin Phase 3 as part of this handoff.
