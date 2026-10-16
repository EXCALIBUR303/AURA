# Phase 2.5: Mac M5 validation and integration review

Date: 2026-10-16 · Reviewer: Claude Code · Subject: `codex/phase2-studio` @ `74c0989` (not merged; nothing pushed)
Review branch: local `review/phase2-validation` (worktree `~/Developer/AURA-review`) = `74c0989` + 2 review commits.

## Verdict

Phase 2 **works on the target Mac**. Every zone holds a steady 60 fps at DPR 2 in Chromium and in the real WKWebView (`AuraApp`), both with the dev server and with the production `aura://` build. All automated checks pass. During review I found and fixed one real performance bug (a once-per-second GPU sync stall). Three frontend issues remain for Codex: heading contrast over the scene, zone-card density, and three.js warnings. Two native items remain for Claude Code: window dragging and the Xcode app target. **I recommend accepting Phase 2 with those follow-ups, and starting Phase 3 once the Xcode licence is accepted.**

## Environment (measured, not assumed)

| | |
|---|---|
| Hardware | Apple M5, 16 GB, built-in Liquid Retina 2560×1664. rAF interval 16.67 ms, so the display refreshes at 60 Hz. |
| OS | macOS 27.2 |
| Node / npm | 26.11.1 / 11.20.0 (`npm ci` from the lockfile) |
| Browser | Playwright 1.64.1 Chromium 156.0.8078.4, **headed**, background throttling disabled. Renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`. |
| WebKit | System WKWebView in `AuraApp` (renderer is masked as "Apple GPU") |
| Swift | 6.4 from the Command Line Tools. **Xcode 27.1 is installed, but its licence is not accepted**, so `/usr/bin/git`, `swift` and `xcodebuild` fail through `xcrun` until `sudo xcodebuild -license accept` is run. The review used `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. |

## Repository and asset

- `origin` = `github.com/EXCALIBUR303/AURA` (private). Commit `74c0989d3dd151877cf91e0f630124ea2268b3bf` exists and is the only commit on `origin/codex/phase2-studio` after `main` (`b225db5`). The `main` checkout was clean and untouched.
- Codex stayed inside its ownership: `frontend/**`, plus an append to `TASKS.md`. Nothing changed in `shared/`, `macos/` or `frontend/src/platform/`.
- GLB: the review worktree **symlinks** the original file (it is not copied). SHA-256 `e9984ddc…eb76c1`, 18,054,896 bytes. This matches Codex's record, the `dist/` copy, and the original. `CREDITS.txt` is unchanged and the attribution is visible in the UI.

## Automated checks

| Check | Result |
|---|---|
| `npm ci`, `npm audit` | ok, 0 vulnerabilities (npm 11 skipped `fsevents`' install script; no effect observed) |
| `inspect:avatar` | 36,508 tris, 72 joints, 0 morph targets, `Idle02_F` 31.80 s |
| `typecheck` (TS 7) | pass |
| `npm test` (bridge) | 8/8 |
| `build` | pass (JS 1.40 MB / 397 kB gzip) |
| `test:browser` (Codex suite + axe) | **22/22**, before and after review fixes. 0 page errors, 0 external requests. |
| axe WCAG A/AA | 0 violations, 31 rules pass. 41 nodes "incomplete" (contrast over the canvas), reviewed by hand below. |
| `swift build` | pass, 0 warnings |
| `tools/swift-test.sh` | 19/19 |

## Measured performance (Apple M5)

The method: a fresh page per zone, waiting until `status=loaded` and `cameraSettled`, then 1.5 s idle, then 4–5 s of `requestAnimationFrame` intervals. Draw calls and triangles come from `renderer.info` and include shadow passes. "Missed" means intervals over 20.9 ms (a dropped 60 Hz vsync).

**Chromium, vsync-locked, DPR 2.** All 12 zone samples are at actual DPR 2, with no adaptive reduction.

| Zone | Draw calls | Triangles | 1440×900 fps / p99 / max ms | 1100×700 fps / p99 / max ms |
|---|---:|---:|---|---|
| studio | 62 | 79,514 | 60.0 / 17.6 / 17.7 | 60.0 / 17.7 / 17.7 |
| hardware | 40–41 | 78,098 | 58.2 / 17.7 / **117.6** → after fix 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.7 |
| software | 47 | 78,570 | 60.0 / 17.7 / 17.7 | 60.0 / 17.6 / 17.8 |
| ai-lab | 48 | 78,570 | 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.8 |
| github | 55 | 79,042 | 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.7 |
| companion | 40 | 78,098 | 60.0 / 17.7 / 17.7 | 60.0 / 17.6 / 17.7 |
| zone-to-zone transitions | — | — | 59.9 / 17.7 / 33.2 (1 frame) | 59.9 / 17.7 / 33.3 (1 frame) |

JS heap 93–135 MB. GLB fetch 70 ms (local). In AuraApp, model-ready `loadMs` was 423–1,093 ms across 4 launches.

**Chromium, vsync off (headroom), 1440×900 @ DPR 2**

| | before fix | after fix |
|---|---|---|
| mean frame time | 2.0–2.2 ms (≈ 450–490 fps) | 2.2–2.5 ms (≈ 405–465 fps) |
| worst frame | **142–313 ms** | **11–14 ms** |
| long tasks | 4 per 4 s window, **145–314 ms each** | none |

This leaves roughly 7× GPU/CPU headroom over 60 Hz for the current scene.

**AuraApp (real WKWebView), 1100×728 window @ DPR 2, zones driven through the native `app.command` path**

| Zone | Calls | Tris | Dev server: fps / p99 / max / missed | `aura://` build: fps / p99 / max / missed |
|---|---:|---:|---|---|
| studio | 62 | 79,514 | 60 / 18 / 18 / 0 | 60 / 18 / 18 / 0 |
| hardware | 40 | 78,098 | 60 / 18 / 20 / 0 | 60 / 18 / 18 / 0 |
| software | 47 | 78,570 | 60 / 18 / 19 / 0 | 60 / 18 / 18 / 0 |
| ai-lab | 48 | 78,570 | 60 / 18 / 20 / 0 | 60 / 18 / 21 / 1 |
| github | 55 | 79,042 | 60 / 18 / 20 / 0 | 60 / 18 / 20 / 0 |
| companion | 40 | 78,098 | 60 / 18 / 20 / 0 | 60 / 18 / 19 / 0 |

WebKit clamps `performance.now()` to 1 ms (hence the integer values) and does not implement the Long Tasks API, so the WebKit long-task data is "not available", not "zero". The AuraApp runs included the review fix (the dev server served the patched code).

## Native (AuraApp) validation

| Item | Result |
|---|---|
| Launch, dev server (`AURA_DEV_SERVER_URL`) | ✅ "Native connected", model 1.75 m, `Idle02_F` |
| Launch, production (`AURA_WEB_ROOT`, `aura://app/index.html`, CSP active) | ✅ loads in 851–872 ms, all zones render |
| Native `app.command` navigation for all 6 zones (the path ⌘1–⌘6 call) | ✅ every zone settled, once each |
| Zone persistence in native SQLite across relaunch | ✅ `lastZone` written to `kv`, restored on the next launch (companion, then software) |
| Physical ⌘1–⌘6 key presses through the AppKit menu | ⚠️ not exercised. The bare SwiftPM executable has no bundle ID for UI automation. The code below the menu is validated. |
| Window dragging under the hidden title bar | ❌ not implemented (known risk R10; native task) |
| VoiceOver, Reduce Transparency, Safari Web Inspector network panel | ⚠️ not done in this pass. Network: production CSP is `default-src 'self'`, and Chromium shows 0 external requests. |
| Occluded window | WebKit pauses rAF when the window is fully covered (good for power). The probe now times out instead of hanging. |
| Xcode app target / `.app` bundle | ❌ blocked: Xcode licence not accepted |

## Issues

| # | Owner | Severity | Issue | Status |
|---|---|---|---|---|
| 1 | Codex (fixed in review) | High (perf) | `Measurements` called `getParameter(UNMASKED_*)` every second. This synchronous GPU round-trip stalls the main thread until queued frames drain: 145–314 ms long tasks with vsync off, and a 118 ms frame at 60 Hz. | **Fixed** in `0351804` (strings cached). Codex should adopt it. |
| 2 | Codex | Medium (a11y) | The viewport heading sits on the 3D scene with no backing. In all five zone views, the muted text (eyebrow 10 px, subtitle 12 px, hint 11 px) is **3.2:1** over the wall (rgb 182,193,198, measured by `readPixels`), and the italic accent (26 px) is **2.7:1**. That is below AA (4.5:1, or 3:1 for large text). The overview passes (5.2:1 / 4.5:1). | Open. Add a glass backing plate or halo, or darken the tokens in zone views. |
| 3 | Codex | Medium (UX) | All six zone cards stay visible in zone views. The current zone's own card covers the workstation the camera frames (e.g. Software at 1100×700), and the cards cover much of the 780 px viewport. | Open. Hide or collapse the active zone's card. Consider showing only nearby cards in zone views. |
| 4 | Codex | Low | Console warning "PCFSoftShadowMap has been removed. Using PCFShadowMap" comes from `<Canvas shadows>` (`Studio.tsx:203`). A second warning, "THREE.Clock deprecated", comes from @react-three/fiber internals (upstream, not ours). | Open. Use `shadows="percentage"` (PCFShadowMap) to silence the first. Track R3F for the second. |
| 5 | Claude Code | Medium | Window dragging: the hidden title bar plus a full-bleed web view means the window can't be dragged. The frontend's `data-aura-drag-region` hook is in place. | Open (native) |
| 6 | Owner | Blocker for Phase 3 | Xcode licence not accepted, so Xcode tools are unusable. Voice needs the `.app` bundle. | Run `sudo xcodebuild -license accept` |
| 7 | Claude Code | Low (docs) | ARCHITECTURE.md still says `motion` is "not installed yet". It is now 14.3.0 (Codex request in TASKS.md). | Open; do it at merge time |
| 8 | Codex | Info | The hidden Claude/Electron preview pane pauses rendering, so the GLB request starts only when the page is shown. This is not an app bug, but don't measure in background tabs. | — |

## Recommendation

- **Phase 2: accept**, conditional on the issue 1 fix being adopted, and with issues 2–4 queued for Codex (small, frontend-only, can run alongside Phase 3).
- **Phase 3: ready to start** once (a) you accept the Xcode licence and (b) `review/phase2-validation` and `codex/phase2-studio` are merged by you. The first Phase 3 task should be the Xcode app target, which unblocks voice permissions, together with the window drag strip.

## Reproduce

```bash
cd ~/Developer/AURA-review
export DEVELOPER_DIR=/Library/Developer/CommandLineTools   # until the Xcode licence is accepted
npm --prefix frontend run dev                               # http://127.0.0.1:5173/
AURA_DEV_PROBE=1 AURA_DEV_SERVER_URL=http://127.0.0.1:5173 AURA_DATA_DIR=$(mktemp -d) swift run --package-path macos AuraApp
/usr/bin/log show --last 3m --info --predicate 'subsystem == "com.aura.app" AND category == "probe"'
```
