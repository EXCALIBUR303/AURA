# Stitch design analysis

Sources: `designs/stitch/stitch_aura_personal_3d_ai_developer_universe/`
- `aura_main_3d_studio/code.html`: a 45 KB single file built with the Tailwind CDN, Google Fonts, Material Symbols and inline JS
- `aura_main_3d_studio/screen.png`: 1600×1280 render of that page
- `luminous_silicon_spatial_studio/DESIGN.md`: the design system ("Luminous Silicon Spatial Studio")

The reconciled tokens are in [`designs/design-system/tokens.css`](../designs/design-system/tokens.css).

## Verdict

The visual direction is strong and worth keeping: a light, "instrument-grade" glass UI over a 3D studio, with a dark titanium HUD pill and restrained spectral accents. **The implementation is not reusable.** The 3D studio in the export is a single AI-generated photo (`<img src="https://lh3.googleusercontent.com/…">`). The layout is absolutely positioned over that bitmap, and every metric is invented. Rebuild it in React and R3F, using the export as a visual reference only.

## Keep

| Element | Where | Notes |
|---|---|---|
| **Top app bar**: traffic lights, brand, segmented zone switcher with ⌘1–⌘6, connection chip, Voice Stream and layout toggles | header | Native `NSWindow` traffic lights replace the fake HTML ones (the window uses `.hiddenTitleBar`). The segmented control becomes the zone navigator, and the native Studio menu already sends ⌘1–⌘6. |
| **Spatial zone cards** (Hardware Lab "Zone Alpha", Software "Zone Beta") anchored to points in the scene, with a leader dot | floating over the viewport | Implement as drei `<Html>` or screen-projected overlays tied to real 3D anchors, so they track the camera. |
| **Companion status pill** ("ASTRA LUMEN II · State: Working", with Idle / Listen / Working segments) | above the avatar | Maps directly to `CompanionState` in the contracts. The dark `glass-dark-pill` is the one strong dark accent. Keep it. |
| **Workstation Inspector** (right rail, 320 px): tabs Hardware / Software / AI·LLM, repository facts, project repos, recent commits, a primary action | right panel | Good information architecture. Data comes from `github.*` and `projects.*`. |
| **Command dock** (bottom): "Talk with Astra" with a Hold-Space hint, a waveform, quick prompts, a status chip and an expand chevron | bottom centre | The main voice and AI entry point. Push-to-talk on Space conflicts with text fields, so make it a native shortcut (⌘⇧Space is already wired) or Space only while the canvas is focused. |
| **Glass tiers** (chrome, HUD, modal), the titanium accents, the 4 px spacing grid, the radius scale, and uppercase mono `label-caps` | DESIGN.md | Captured in `tokens.css`. |

## Colours and typography

- **Two conflicting palettes exist.** The DESIGN.md front-matter is a generated Material-3 scheme (`primary #006483`, `tertiary #4648d4`). The DESIGN.md prose defines the real system (canvas `#F7F9FC`, cobalt `#2563EB` for actions, cyan `#0099C7` / `#00D2FF`, iris `#6366F1`, titanium `#1C1F26`). `code.html` uses a third Tailwind config (`primary #007ea4`, `tertiary #7c3aed`). **`tokens.css` follows the prose.** The M3 front-matter is ignored.
- Spectral accents are reserved for state and telemetry (≈90 % of surfaces stay neutral). Keep that discipline: it is what separates this from "sci-fi dashboard".
- **Fonts.** The Stitch pages load Inter, JetBrains Mono and Material Symbols from Google's CDN. The shipped app must not fetch fonts or icons at runtime. `tokens.css` uses the system font (SF Pro, native in WKWebView) first. If Inter or JetBrains Mono is wanted, bundle the files (both are OFL). Replace Material Symbols with SF Symbols exported as SVG, or a small bundled icon set.
- **Type scale.** The prose scale (40 / 26 / 18 / 14 / 13 / 12 px) is fine. The HTML ignores it, with 12 ad-hoc sizes, including 42 uses of 10 px, 3 of 9 px and 3 of 8 px.

## Inconsistencies to fix

1. **Fabricated telemetry and claims.** The export shows "RealityKit 3D Viewport", "Metal 3 · 120 FPS", "Ultra-low latency 0.4 ms", "DSP latency 1.2 ms", "Vulkan Metal Layer: Active", "38.4 GB / 64 GB", "LLVM 18 Passing" and "© 2025 AURA Spatial Labs". None of these are real. AURA renders with WebGL2 (three.js) in WKWebView, not RealityKit, Metal 3 directly, or Vulkan. Show only measured values (fps, memory from native), or nothing.
2. **The mock repos and commits in the screenshot** (`spatial-mesh-pipeline`, `AuraCore-Runtime`, `feat/m5-metal`, …) are invented. They must never ship as defaults. Mock data lives only in `shared/bridge/mock.ts` and is clearly labelled `mock-user`.
3. "v2.4 macOS" versus the actual 0.1.0. Version text comes from `app.getInfo`.
4. "AI Companion" appears both as a zone (⌘6) and as the persistent dock and pill. Decide in Phase 2 whether ⌘6 is a full-screen companion mode or should be dropped.
5. Zone cards overlap the avatar and clip at the inspector edge ("Software Developr…" is truncated in `screen.png`). Real anchoring and collision handling are needed.
6. Three blues are in competition: cobalt for actions, cyan `#007ea4` as the primary in the HTML, and the cyan accent. Use one action colour (cobalt).
7. The DESIGN.md mobile typography tokens (`*-mobile`) are irrelevant. AURA targets macOS windows of 1100 px and wider.

## Accessibility issues (in the export)

- **Keyboard:** 36 `<button>`s, plus 4 clickable `div`s that cannot be focused. There is one `focus:outline-none` and **no visible focus style anywhere**. Every interactive element needs `:focus-visible` (use the `--aura-focus-ring` token).
- **Labels:** only the 3 fake traffic lights have `aria-label`. Icon-only buttons (settings, layout toggles, chevrons) have none. Material Symbols ligature text ("close", "view_in_ar") would be read aloud.
- **Text size:** 10 px is the most-used size, and 8–9 px appears. The minimum for body text and labels should be 11 px. Reserve 10 px for uppercase mono `label-caps`, which DESIGN.md defines with tracking.
- **Contrast** (computed against `#F7F9FC`): the `outline` grey `#6E797F` is 4.2:1 and the cyan accent `#0099C7` is 3.1:1, both below 4.5:1 for small text. The emissive cyan `#00D2FF` is 1.7:1, and the green `#22C55E` is 2.2:1. `tokens.css` adds text-safe variants (`--aura-text-muted` 5.7:1, `--aura-accent-cyan-text` 5.0:1, `--aura-status-ok-text` 4.8:1). Status dots must also carry a text label.
- **Motion:** the infinite `animate-float` and ping animations have no `prefers-reduced-motion` handling. `tokens.css` zeroes durations under reduced motion, and `Preferences.reduceMotion` exists for the 3D layer.
- `user-select: none` on `body` blocks copying repo names and commit SHAs. Apply it only to chrome.
- Glass over a moving 3D scene: text on `rgba(255,255,255,.72)` loses contrast over bright scene areas. Prefer the elevated (0.88) tier for text-bearing panels, and honour macOS "Reduce transparency" (provide a solid fallback).

## Needs real redesign (not just restyling)

- **The 3D studio itself:** zones as physical areas (workbench, desks, AI lab) built from real geometry, with a navigable camera, lighting, and Astra placed in the scene. This is Phase 2's core work for Codex.
- **Window chrome:** the web content fills the window under a hidden title bar. CSS `-webkit-app-region` (an Electron feature) does nothing in WKWebView, so window dragging is handled natively: Claude Code owns a drag strip in the shell. The frontend must keep the top 48 px free of interactive controls except where agreed, and leave a ~80 px left inset for the real traffic lights.
- **Companion states** (idle / listening / thinking / speaking / error) mapped to what the rig can actually do: idle clip, head and eye look-at, jaw, and emissive accents. See `docs/ASSETS.md`. The rig has no facial blend shapes and no finger bones.
- **Chat / AI drawer** (`toggleChatDrawer` in the export): the export has no real conversation UI, so design one.
