# Phase 2 completion and Mac M5 handoff

Review branch: `codex/phase2-studio` in `EXCALIBUR303/AURA`. Main is not merged. Phase 3 is not started. Full Phase 2 acceptance remains open for the native and target-GPU checks below.

## Acceptance audit against docs/PHASE2_CODEX_HANDOFF.md

| Criterion | Browser/cloud evidence | Native macOS status |
| --- | --- | --- |
| 1. TypeScript, bridge tests, production build | Passed: `typecheck`, `test` (8 passed, 0 failed), `build`. | Native Swift build/tests are separately **pending** on the M5. |
| 2. Studio runs in browser and AuraApp | Browser mock studio and actual WebGL2 rendering pass. | **Pending:** launch AuraApp with the dev server and inspect WKWebView errors; also check the built `aura://` route. |
| 3. Six zones by buttons, hotspots, shortcuts; last zone restored | All six buttons and hotspots work at 1440×960 and 1100×700; Cmd/Ctrl+1–6 and reload restoration pass. Mouse orbit, wheel zoom, reset and keyboard-only Tab/Enter navigation pass. Simulated native commands cover all six zones without duplicate browser bindings. | **Pending:** real Studio menu/Cmd+1–6, native focus commands, and SQLite-backed zone persistence after relaunch. A simulated transport does not validate AppKit/WebKit. |
| 4. Human-scale Astra, idle, look-at, speech-level jaw | Actual supplied GLB loads at 1.75 m, `Idle02_F` advances, bounded head/eye layers follow the camera, and mock speech produces nonzero jaw movement. Credits remain visible. | **Pending:** visual rig/animation and scale inspection in WKWebView; no Mac rendering behavior is claimed. Voice remains a Phase 2 unavailable stub in AuraApp. |
| 5. No automatic nonlocal asset/runtime requests | Browser audit records zero unexpected HTTP/WebSocket destinations, console errors or failed normal requests. Local SVGs and embedded textures; no CDN decoders. Attribution links are external only when clicked. | **Pending:** Safari Web Inspector Network checks in dev and built-file modes, including asset and HMR requests. |
| 6. Per-zone FPS, draw calls, triangles; ≥55 FPS at DPR 2 | Actual cloud samples are recorded in `PHASE2_RESULTS.json` and below. They do **not** meet 55 FPS on software rendering. The audit starts a fresh page per zone so adaptive quality in an earlier zone cannot silently lower the next zone's starting DPR. | **Pending:** M5 browser and AuraApp measurements in every zone at actual DPR 2, ≥55 FPS target. Adaptive DPR does not establish performance acceptance. |
| 7. Keyboard-only use with visible focus | Focus and Tab/Enter navigation pass for all zones; controls have accessible names. Axe reports zero violations; contrast over glass remains a manual review item. | **Pending:** native keyboard/focus behavior, VoiceOver, system reduced motion/transparency, and visual contrast review in Safari/WKWebView. |

## Frontend work delivered

- `src/studio/`: procedural instanced daylight room, four workstations and companion platform; six data-defined zones; animated/constrained camera; native events and browser-only shortcuts; ordered bridge saves and mock-browser reload restoration; normalized Astra, idle and additive bone layers; adaptive DPR and measured diagnostics.
- `src/components/`, `src/App.tsx`, `src/studio.css`: inspector repositories/commits/project editing, streamed mock replies/cancellation/error states, graceful voice unavailability, companion status, accessible controls, reduced-motion support, 80 px native traffic-light inset, empty `data-aura-drag-region` surfaces, local icons and visible attribution.
- `test/`: browser acceptance/accessibility/recovery checks and per-zone performance capture. `package.json` fixes Node 24 TypeScript test discovery using explicit files. `motion` 14.3.0 supplies the transitions requested in the handoff; no other application dependencies were added.
- Completion fixes: projected cards avoid actual dock/header/diagnostic bounds and the human-scale avatar silhouette, including the minimum window; per-zone performance windows exclude model loading and camera transitions; renderer startup failures show a usable error; actual mouse camera movement is observable in diagnostics.

`shared/**`, `macos/**`, `frontend/src/platform/**`, reference designs and the asset credit file remain unchanged. `TASKS.md` is append-only. No new bridge API was needed. The root-document owner has an existing request to update ARCHITECTURE.md's motion entry from "not installed yet" to 14.3.0.

The original companion validation view is retained at `?probe`. `window.__AURA_DIAGNOSTICS__` retains avatar details, actual renderer/FPS/DPR/call/triangle counts, per-zone histories, context state and rig telemetry; camera pose was added to verify mouse interactions. The UI does not display invented repositories, FPS, latency or memory claims. Product records come from the existing mock bridge.

## Asset and license

The GLB remains **gitignored and is not part of the code commit**. Use the owner's existing licensed model on the Mac; do not substitute another character. The cloud copy and production-build copy match the upload:

```
File: astra_lumen_ii_a_rigged_companion_android.glb
Bytes: 18054896
SHA-256: e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1
```

It is served by the existing `frontend/public/avatar/astra-lumen` symlink. Inspection confirms 36,508 triangles, 72 joints, no morph targets and the sole `Idle02_F` clip (31.80 s, 283 tracks). Runtime scaling and bone layers do not modify the file. The existing `CREDITS.txt` and embedded CC BY 4.0 metadata are unchanged; author, license and original-source links are visible in the footer.

## Current validation evidence

The expanded browser audit passed **22 checks**. See `PHASE2_RESULTS.json` for the current test outcomes, automated accessibility result, asset integrity and exact software-renderer samples. Screenshots and detailed raw audit files are cloud task artifacts under `/workspace/aura-phase2-completion/`; binaries are not committed. Node 24.19.0 and npm 11.9.0 were used. The required test runner summary is:

```
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Intentional GLB failures and blocked WebGL are exercised in isolated browser contexts to verify useful error states and recovery. They are expected test conditions, not unreported failures during normal application loading. Real Swift tests and AuraApp checks were not run on Linux.

## Measured cloud performance

Current completion run: Chromium 154, Linux SwiftShader, window 1100×700, device scale factor 2. Each zone starts in a fresh page; each row contains the first two approximately one-second samples after the model is loaded and the camera has settled. Adaptive quality stays enabled. All recorded samples below were at actual DPR 2. These are software-renderer measurements, not M5 or WKWebView results.

| Zone | Measured FPS | Draw calls | Scene triangles | Actual DPR |
| --- | ---: | ---: | ---: | ---: |
| studio | 2–3 | 62 | 79,514 | 2 |
| hardware | 1–2 | 40 | 78,098 | 2 |
| software | 3 | 47 | 78,570 | 2 |
| ai-lab | 2–4 | 48 | 78,570 | 2 |
| github | 2–3 | 55 | 79,042 | 2 |
| companion | 3 | 40 | 78,098 | 2 |

The cloud software renderer does **not** meet the ≥55 FPS target. Calls and triangles are actual renderer counters, including shadow work. The target remains pending on the M5 browser and AuraApp. No Mac numbers are estimated; do not use the cloud values as evidence of M5 performance.


## Known limitations and pending native work

- The 55 FPS target is not validated on Apple Silicon. Cloud software-renderer results are not a substitute; no Mac numbers are inferred from Phase 1.
- Native window dragging requires the native owner's drag-strip implementation and Mac validation. Frontend drag attributes and traffic-light clearance are present, but a CSS attribute does not implement NSWindow dragging. Review the native strip/top-bar hit regions together on the M5.
- Voice remains unavailable in the native Phase 2 stub. No real GitHub, AI or voice services or credentials are configured by this change. Browser mock project records last only for that session; mock last-zone persistence uses localStorage when available.
- Space can be insufficient for every projected card when the reply panel is expanded or the camera points away from zones. Cards hide when no collision-free position fits; the persistent six-zone navigator remains available. All six hotspots are tested from the overview at the supported minimum window.
- Automated accessibility checks cannot fully evaluate moving 3D content or translucent backgrounds. Manual Mac contrast, reduced-transparency and assistive-technology checks remain pending.
- This cloud setup chat provides no public interactive preview URL. None is being created as part of this handoff.

## Exact Mac M5 validation

Prerequisites: Apple Silicon M5, macOS 15+, Node ≥23.6 (Node 24+ is suitable), npm and Swift 6 Command Line Tools or Xcode. No API keys are needed for Phase 2. Preserve the owner's existing working tree and asset by reviewing in a separate local worktree; do not reset or overwrite their existing checkout.

### 1. Fetch the branch and copy the licensed model

Run on the Mac:

```bash
cd /Users/sid/Developer/AURA
git fetch origin main codex/phase2-studio
git worktree add --detach /Users/sid/Developer/AURA-phase2-review origin/codex/phase2-studio
cp -n /Users/sid/Developer/AURA/assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb /Users/sid/Developer/AURA-phase2-review/assets/avatar/community/astra-lumen/
cd /Users/sid/Developer/AURA-phase2-review
node --version
swift --version
npm --prefix frontend ci
shasum -a 256 assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb
npm --prefix frontend run inspect:avatar
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
swift build --package-path macos
tools/swift-test.sh
```

Use a different review directory if that path already exists; do not delete an existing worktree. Verify the model hash above and that inspection lists `Idle02_F`.

### 2. Run the browser studio

Terminal A:

```bash
cd /Users/sid/Developer/AURA-phase2-review
npm --prefix frontend run dev
```

Vite uses strict port 5173; reuse a healthy instance or stop only a stale AURA server if that port is occupied. The repository's Mac-safe default binds loopback. Open on the Mac with `open http://127.0.0.1:5173/`. Verify all six zones by top-bar buttons, visible overview hotspots, Cmd+1–6, and Tab/Enter. Drag to orbit, scroll to zoom, reset, navigate to another zone and reload. Check Astra's scale, idle/look-at, mock transcript and "Animate mock speech" jaw response; save/reselect a project's note, pin and zone.

### 3. Run the actual WKWebView shell

Terminal B:

```bash
cd /Users/sid/Developer/AURA-phase2-review
AURA_PHASE2_DATA_DIR="$(mktemp -d /tmp/aura-phase2-m5.XXXXXX)"
AURA_DATA_DIR="$AURA_PHASE2_DATA_DIR" AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp
```

Keep Terminal A running. Verify Studio menu/Cmd+1–6 fire once, Cmd+Shift+Space focuses the companion, Cmd+K focuses its prompt, voice reports unavailable without repeated errors, and the traffic lights/focus/drag regions behave correctly. Quit and rerun the same launch command with the **same** `AURA_PHASE2_DATA_DIR` to test native zone persistence. This isolates review data from the owner's ordinary AURA database.

Enable Safari's developer menu if needed, then inspect AuraApp's WKWebView from Safari → Develop → this Mac → AuraApp. Confirm no unexpected console errors and no automatic external network requests. Check the real model URL contains GLB bytes and no decoder/CDN URLs are fetched. Logs can be inspected with:

```bash
/usr/bin/log show --last 2m --info --predicate 'subsystem == "com.aura.app"'
```

After quitting the dev-server-backed AuraApp, also test built assets:

```bash
env -u AURA_DEV_SERVER_URL AURA_DATA_DIR="$AURA_PHASE2_DATA_DIR" AURA_WEB_ROOT="$PWD/frontend/dist" swift run --package-path macos AuraApp
```

This second launch omits `AURA_DEV_SERVER_URL`, so it should use `aura://` built files. Inspect loading, attribution, context recovery and asset requests again.

### 4. Record actual M5 browser and AuraApp performance

For each of studio, hardware, software, ai-lab, github and companion, wait until `status === "loaded"` and `cameraSettled === true`; inspect the diagnostics panel and evaluate `JSON.stringify(window.__AURA_DIAGNOSTICS__, null, 2)` in the browser/Safari console. Save per-zone samples with FPS, draw calls, triangles, actual `pixelRatio`, renderer and window size for both the ordinary browser and AuraApp. Use DPR 2, target ≥55 FPS. Adaptive DPR remains enabled: a lower-ratio sample is not a passing DPR-2 result. Relaunch/reload for fresh DPR-2 windows if needed; record any automatic reduction as a performance issue. Test at 1100×700 and a representative larger window.

Manually review VoiceOver, visible focus, reduced motion, reduced transparency, scene-card placement and contrast over the moving scene. Record Mac results against each pending criterion above before declaring full Phase 2 acceptance.

### 5. Optional automated browser audit on the Mac

With Terminal A running:

```bash
npm install --prefix /tmp/aura-browser playwright @axe-core/playwright
/tmp/aura-browser/node_modules/.bin/playwright install chromium
export AURA_PLAYWRIGHT_MODULE=/tmp/aura-browser/node_modules/playwright/index.mjs
export AURA_AXE_MODULE=/tmp/aura-browser/node_modules/@axe-core/playwright/dist/index.mjs
export AURA_ARTIFACTS=/Users/sid/Developer/AURA-phase2-review-artifacts
unset AURA_SOFTWARE_GPU AURA_CHROMIUM_PATH
npm --prefix frontend run test:browser
npm --prefix frontend run audit:performance
```

Inspect the recorded renderer: a software fallback is not an M5 GPU measurement. The simulated-native test is an integration test double and does not replace steps 3–4. No Phase 3 work should begin as part of this handoff.
