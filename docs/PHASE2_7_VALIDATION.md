# Phase 2.7: final Mac M5 validation

Date: 2026-10-16 · Reviewer: Claude Code
Subject: `codex/phase2-visual-polish` @ `d122c079f2d7c1946a0cc1e5af811054d384a0d1` (built on `review/phase2-validation` `4d0b896`)
Review branch: local `review/phase2.7-validation` in worktree `~/Developer/AURA-phase27` = `d122c07` + `defe5a9` (one fix). Not pushed, not merged. `main` is untouched at `b225db5`.

## Summary

Phase 2.6 works on the M5. All six zones render at **60 fps at actual DPR 2**, and nothing triggers adaptive DPR reduction. This holds in Chromium at 1470×956 and 1100×700, and in the real WKWebView with both the dev server and the production `aura://` build. Normal interaction (orbit and zoom) stays at **58.8–60 fps**. Draw calls fell from 40–62 (Phase 2.5) to **12–14**.

With vsync off the scene runs at **446–495 fps** (≈2.0–2.2 ms/frame), which is about 7–8× headroom over 60 Hz. Every automated check passes: 27/27 browser checks, axe 0 violations, 8/8 bridge, and 19/19 Swift (now on the real Xcode toolchain).

I found and fixed one stall: a shader recompiled whenever you returned to a workstation zone. Two items remain open: **window dragging does not work** (the known missing native drag strip), and **rendering pauses whenever AURA is not the active app**. Both are listed below.

## Environment

| | |
|---|---|
| Mac | Apple M5, 16 GB, built-in Liquid Retina 2560×1664. 60 Hz (rAF interval 16.67 ms). macOS 27.2. |
| Toolchain | **Xcode 27.1 (27A9275), licence accepted.** Swift 6.4. Node 26.11.1 / npm 11.20.0 (`npm ci`). |
| Browser | Playwright 1.64.1 Chromium 156.0.8078.4, **headed**, renderer `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`, background throttling off |
| Native | `AuraApp` via `swift build` (Xcode toolchain), system WKWebView (renderer masked as "Apple GPU"), window 1100×728 @ 2×. Menu and drag tests used a throwaway ad-hoc bundle (`com.aura.app.dev`) around the same binary, so UI automation could address it. |

## Repository and asset

- `origin/codex/phase2-visual-polish` = `d122c07`, verified. Its parent is `4d0b896` (review branch), so the Phase 2.5 fixes are included. Codex changed only `frontend/**`.
- GLB: symlinked from the original (not copied). SHA-256 `e9984ddc…eb76c1`, 18,054,896 bytes, identical in `dist/`. Inspection: 1 mesh, 36,508 tris; `Material_001` (baseColor + metallicRoughness, `KHR_materials_clearcoat`, opaque); textures 2048² + 64² PNG; 72-joint skin; 0 morph targets; 1 clip `Idle02_F`, 31.80 s, 283 channels. `CREDITS.txt` is unchanged and the CC BY 4.0 credit is visible in the footer.

## Tests

| Check | Result |
|---|---|
| `typecheck` (TS 7, both projects) | pass |
| `npm test` (bridge contracts) | 8/8 |
| `build` | pass (JS 1.41 MB / 399 kB gzip) |
| `npm audit` | 0 vulnerabilities |
| `inspect:avatar` | matches the asset record above |
| `test:browser` (27 checks incl. axe) | **27/27**, before and after the fix. 0 page errors, 0 external requests. |
| axe WCAG A/AA (overview + 1100×700 workstation) | 0 violations. 19–20 "incomplete" contrast nodes over the canvas, measured by hand below. |
| `swift build` / `tools/swift-test.sh` (Xcode toolchain) | pass / 19/19 |

## Performance (measured on this M5)

Method: a fresh page per zone, waiting for `loaded` and `cameraSettled`, then 1.5 s idle, then 5 s of `requestAnimationFrame` intervals. "Missed" means intervals over 20.9 ms. Draw calls and triangles come from `renderer.info` and include shadows. Browser zone rows were captured before the ring fix. After the fix, Studio and Companion each gain one draw call (13 → 14).

**Chromium, vsync on, DPR 2 (all samples at actual DPR 2)**

| Zone | Calls | Tris | 1470×956 fps / p99 / max ms | 1100×700 fps / p99 / max ms |
|---|---:|---:|---|---|
| studio | 13 | 79,794 | 60.0 / 17.7 / 17.8 | 60.0 / 17.7 / 17.7 |
| hardware | 14 | 79,802 | 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.7 |
| software | 14 | 79,802 | 60.0 / 17.7 / 17.7 | 60.0 / 17.8 / 17.8 |
| ai-lab | 14 | 79,802 | 60.0 / 17.7 / 17.8 | 60.0 / 17.7 / 17.8 |
| github | 14 | 79,802 | 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.7 |
| companion | 13 | 79,794 | 60.0 / 17.7 / 17.7 | 60.0 / 17.7 / 17.8 |
| orbit drag + wheel zoom | — | — | 58.8 / 17.8 / 99.9 (0.68 % missed) | 60.0 / 17.7 / 17.7 |
| zone transitions (6) | — | — | 59.5 / 17.7 / 66.6 (0.47 %) | 59.3 / 17.7 / 100 (0.47 %) |

JS heap 94–134 MB. Model ready (`loadMs`) 426–818 ms. Wall time from navigation to a settled camera: 0.97–1.45 s.

**Chromium, vsync off (headroom), 1470×956 @ 2×.** Idle zones ran at 446–495 fps (mean 2.02–2.24 ms, p99 ≤ 3.7 ms, worst ≤ 8.9 ms), with no long tasks. Orbit and zoom ran at 389 fps (p99 6.4 ms, worst 26 ms). The 60 fps figures above are therefore the **display cap**, and the GPU has large headroom.

**Transition stall (found and fixed, `defe5a9`).** With vsync off, every transition into Hardware took 747–870 ms, reproduced in 6 of 6 passes. A Chromium trace put 705 ms in `GLES2Implementation::GetProgramiv` inside R3F's frame loop. The cause: the active-workstation floor ring was conditionally mounted, so leaving the workstation zones disposed its material, and the next visit relinked its shader. Keeping it mounted at opacity 0 fixed it. Repeat transitions now take ≤ 45 ms uncapped (3 runs × 2 passes). The first-ever Hardware visit takes 107–109 ms uncapped (was ~900 ms). With vsync on, the same event was a single ~33 ms frame. The 67–100 ms transition and orbit frames in the vsync table were seen only in the run where Playwright was clicking and polling at the same time; in dedicated re-runs the worst was one 33 ms frame.

**AuraApp WKWebView, 1100×728 @ 2×, zones driven through native `app.command` (after the fix)**

| Zone | Calls | Tris | Dev server fps / p99 / max / missed | `aura://` production fps / p99 / max / missed |
|---|---:|---:|---|---|
| studio | 14 | 79,802 | 60 / 19 / 21 / 1 | 60 / 19 / 20 / 0 |
| hardware | 14 | 79,802 | 60 / 19 / 20 / 0 | 60 / 18 / 19 / 0 |
| software | 12 | 79,610 | 60 / 19 / 26 / 1 | 60 / 19 / 19 / 0 |
| ai-lab | 14 | 79,802 | 60 / 18 / 19 / 0 | 60 / 18 / 19 / 0 |
| github | 14 | 79,802 | 60 / 18 / 19 / 0 | 60 / 18 / 19 / 0 |
| companion | 14 | 79,802 | 60 / 19 / 20 / 0 | 60 / 18 / 19 / 0 |

Model ready 399–453 ms. WebKit rounds timers to 1 ms and has no Long Tasks API, so WebKit long-task data is *unavailable*, not zero. The GPU name is masked. One earlier dev run stopped settling after Software. It did not reproduce and fits "rendering pauses when the app is inactive" (below).

## Native application

| Item | Result |
|---|---|
| Launch (dev server and production `aura://`, CSP active) | ✅ "Native connected", model 1.75 m, `Idle02_F`, attribution visible |
| Real AppKit **Studio menu** (Hardware Lab, Command Palette) | ✅ zone changes. Command Palette focuses the "Message Astra" field. Menu lists all 6 zones plus Talk to Astra and Command Palette. |
| Physical ⌘1–⌘6 keystrokes | ⚠️ not pressed physically; the menu items they are bound to were invoked and work |
| Zone persistence (native SQLite) across relaunch | ✅ (restored companion, then hardware) |
| Local asset loading (GLB via dev server and `aura://`) | ✅ |
| **Window dragging** | ❌ dragging the empty top bar does not move the window (bounds unchanged). Native drag strip not implemented (Claude Code task). |
| Traffic lights | Present in the accessibility tree at (10, 7) and left clear by the 80 px inset. Not visible in the background window capture; check them visually on screen. |
| Accessibility tree | ✅ web content exposed once active: 70 elements, with named zone buttons, "Message Astra", "Reset overview", etc. VoiceOver itself not run. |
| Rendering when AURA is not the active app | ⚠️ **paused entirely** (`frameloop="never"`; the diagnostics chip shows "0 fps"). A visible AURA window freezes when you click into another app. Product decision needed. |
| Xcode `.app` target, signing, Info.plist privacy strings | not built (Phase 3 scope). Xcode itself is now usable. |

## Visual, interaction and accessibility

- Screenshots (M5, DPR 2): overview, software, AI Lab and Companion at 1470×956 and 1100×700, plus the native window. The room, workstation differentiation, card density (active card hidden, ≤ 2 nearby) and heading backing all read well.
- Heading contrast against **measured** rendered pixels: eyebrow and subtitle 5.7:1 in all zones at both sizes (Phase 2.5 issue fixed). The only element under 4.5:1 is the decorative "/" separator (3.0:1).
- Live resize at 1100×700, 1280×800 and 1470×956: no page overflow, the canvas re-fits at a 2× backing store, no overlapping cards.
- Covered by the passing suite on this Mac: six zones by buttons, hotspots, keys and 3D clicks; Astra click focuses the companion; orbit, zoom and reset; workstation scope filter; draft retention and save; mock AI streaming and cancel; speech jaw; loading state; missing-GLB retry; WebGL-unavailable and context-loss recovery; keyboard-only navigation with visible focus.

## Remaining issues

| # | Owner | Severity | Issue |
|---|---|---|---|
| 1 | Claude Code | **High (UX)** | Window cannot be dragged (no native drag strip for the hidden title bar) |
| 2 | Owner / Codex | Medium | Rendering pauses completely while AURA is inactive. Consider throttling (e.g. 15–30 fps) instead of freezing, or confirm the freeze is intended. |
| 3 | Codex | Low | The inspector's repository detail stays on `sample-firmware` ("Mock repository for the Hardware Lab") in other zones and doesn't follow zone context |
| 4 | Codex | Low | Companion view at 1100×700: Astra's feet touch the dock's top edge |
| 5 | Codex | Low | Decorative "/" separator in the eyebrow is 3.0:1. Mark it `aria-hidden` or darken it. |
| 6 | Upstream | Info | `THREE.Clock` deprecation warning from @react-three/fiber internals |
| 7 | — | Not verified | VoiceOver, Reduce Motion/Transparency at the OS level, Safari Web Inspector network panel, physical ⌘-key presses |

## Phase 3 readiness

**Ready, with one native prerequisite first.** The frontend meets the ≥55 fps target with large headroom, all checks pass, and Xcode is now usable. I recommend this order:
1. Owner merges `codex/phase2-visual-polish` + `review/phase2.7-validation`.
2. Claude Code builds the Xcode app target and the window drag strip first (issue 1), since voice permissions need the bundle anyway.
3. Phase 3 services (GitHub, voice).

Codex can address issues 2–5 in parallel.
