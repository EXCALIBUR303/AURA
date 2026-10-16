# Phase 2 handoff: Codex

You are Codex, owner of the AURA frontend and 3D studio. Read `AGENTS.md` (rules and ownership), `ARCHITECTURE.md` (bridge, conventions, risks), `docs/DESIGN_ANALYSIS.md` (what to keep and fix from Stitch) and `docs/ASSETS.md` (what the Astra model actually contains) before writing code.

## 0. Setup

```bash
cd ~/Developer/AURA
git worktree add -b codex/phase2-studio ../AURA-codex main
cp assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb \
   ../AURA-codex/assets/avatar/community/astra-lumen/
cd ../AURA-codex
npm --prefix frontend install
npm --prefix frontend run inspect:avatar     # must list clip "Idle02_F"
npm --prefix frontend run dev                # http://127.0.0.1:5173 (strict port; stop other dev servers)
```

Design references (gitignored, so read them from the main checkout): `~/Developer/AURA/designs/stitch/stitch_aura_personal_3d_ai_developer_universe/aura_main_3d_studio/screen.png` and `code.html`. Tokens: `designs/design-system/tokens.css`, imported as `@aura/design-tokens`.

To test inside the real WKWebView (do this before claiming anything works), run from the main checkout or your worktree:

```bash
AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp
/usr/bin/log show --last 2m --info --predicate 'subsystem == "com.aura.app"'
```

## 1. Goal

Replace the Phase 1 validation scene with the real **interactive 3D studio**: a navigable space with the hardware lab, software studio, AI/LLM lab and GitHub projects area, Astra Lumen II standing in it as the companion, and the Stitch UI shell rebuilt properly over it. All data comes from the **mock bridge**. No real GitHub, AI or voice yet.

## 2. Scope

**A. Studio scene** (`frontend/src/studio/…`; structure is up to you)
- Real-time geometry built from primitives, procedural or instanced meshes, and baked or simple materials. **Do not use the Stitch photo or any background bitmap as the scene.** Downloaded models or HDRIs need a licence check and a credit file, so ask the owner first.
- Six zones keyed by `ZoneId` (`studio` overview, `hardware`, `software`, `ai-lab`, `github`, `companion`), each defined as data: label, world anchor, camera pose, accent token.
- Lighting that reads as the Stitch "luminous daylight studio". No CDN `<Environment preset>`. If you want an HDRI, bundle a small one locally.

**B. Camera and navigation**
- Animated transitions between zone camera poses, a constrained orbit within a zone, a reset to overview, and a click on a zone hotspot to travel there.
- Inside `AuraApp`, ⌘1–⌘6 are **native menu shortcuts** that arrive as `app.command` `{command:"navigate", zone}` via `useBridgeEvent`. In a plain browser (`bridge.transportKind === "mock"`), bind the same keys yourself. Do not bind them when native, or they fire twice.
- Persist the current zone with `bridge.call("prefs.update", { lastZone })`, and restore it from `prefs.get` on start.

**C. Astra Lumen II** (facts in `docs/ASSETS.md`)
- Load `/avatar/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb` with `useGLTF(url, false)`. The `false` disables the Draco CDN decoder.
- **Normalise the scale**: it loads 3.34 m tall, so target ≈ 1.75 m, and stand it on the floor.
- Play `Idle02_F` (the only clip) in a loop. Do not reference clip names that do not exist.
- Procedural layer on top of the clip: head and eye look-at (`CC_Base_Head_039`, `CC_Base_L_Eye_047` / `CC_Base_R_Eye_046`) toward the camera or cursor, with clamped angles. Add jaw open (`CC_Base_JawRoot_041`) driven by `voice.speechLevel` (the mock emits it after `voice.speak` in a browser).
- Visual states for `CompanionState` (`idle | listening | thinking | speaking | error`) using what the rig allows: posture and look-at changes, emissive or rim accents, the HUD pill. There are no facial blend shapes and no finger bones.

**D. UI shell** (from Stitch, restyled with tokens)
- Top app bar with the zone navigator. Leave an **80 px left inset** for the native traffic lights. Mark empty top-bar areas with `data-aura-drag-region` (Claude Code wires native window dragging to that attribute).
- Spatial zone cards anchored to 3D points (drei `<Html>` or projected overlays) that do not overlap the avatar or clip at the panels.
- Workstation inspector (right rail): `github.listRepositories`, `github.listCommits` and `projects.list|update` from the mock.
- Command dock: a "Talk with Astra" control, quick prompts, and a minimal streamed reply view using `ai.chat` with `ai.chunk` / `ai.done` / `ai.error`. Voice must degrade gracefully: inside `AuraApp`, every `voice.*` action returns `code: "unavailable"` until Phase 3, so show that state rather than an error toast loop.
- Companion status pill.
- Visible attribution for the model (the same text as the Phase 1 footer, or a credits popover reachable in one click).
- Add `motion` (`npm i motion`) when you build the first animated component. Honour `prefers-reduced-motion` and `Preferences.reduceMotion`.

**E. Quality bars**
- Fix every accessibility issue listed in `docs/DESIGN_ANALYSIS.md`: focus rings, names, sizes, contrast tokens, reduced motion, and text selectable where useful.
- **Remove all fabricated telemetry and claims** (RealityKit, Metal 3, 120 FPS, latency figures, memory figures, fake repos, © lines). Show only measured values.
- Keep a diagnostics path: keep `window.__AURA_DIAGNOSTICS__` (extend it with `drawCalls` and per-zone fps), or a `?probe` dev route reusing the Phase 1 scene.
- Handle `webglcontextlost` / `webglcontextrestored` (at minimum, show a recoverable state and do not white-screen).
- The cap is `dpr={[1, prefs.graphics.maxPixelRatio]}`. Add adaptive quality if fps drops below 55.

## 3. Out of scope

Native code (`macos/**`), bridge contracts (`shared/**`), `frontend/src/platform/**`, real GitHub, AI or voice, settings windows, mobile layouts (target windows of 1100×700 and larger), and new paid services. If you need a new bridge method, event or field, add it to `TASKS.md` → "Bridge requests" and stub it locally.

## 4. Acceptance criteria

1. `npm --prefix frontend run typecheck`, `npm --prefix frontend test` and `npm --prefix frontend run build` all pass.
2. The studio runs in the browser (mock) **and** in `AuraApp` (dev server). Report both.
3. All six zones are reachable by click, by hotspot, and by ⌘1–⌘6 (native) or keys (browser). The last zone survives a reload.
4. Astra is human-scale, idles, looks at the camera or cursor, and reacts to `voice.speechLevel` (mock).
5. There are zero network requests to non-localhost hosts (check the Network panel; in `AuraApp`, use Develop → Safari Web Inspector, which is enabled in dev).
6. Measured fps (≥ 55 target at DPR 2), draw calls and triangles per zone, from both the browser and `AuraApp`, are in your summary. Do not estimate.
7. Keyboard-only navigation works, with visible focus throughout.

## 5. Report back with

What you built (files), what you tested and how, the measured performance numbers, known issues, any bridge or native requests you filed, and screenshots of the overview and one zone. Do not merge to `main` and do not push. The owner reviews `codex/phase2-studio`.
