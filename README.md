# AURA: Personal 3D AI Developer Universe

A native macOS app for Apple Silicon: a navigable 3D developer studio (hardware lab, software studio, AI/LLM lab, GitHub projects) with **Astra Lumen II** as an interactive AI companion. It uses a SwiftUI shell and Swift services, and hosts a React and three.js studio in WKWebView.

**Status:** Phase 3B (GitHub integration) on top of the Phase 3A native foundation and the Phase 2 studio. GitHub is live: a read-only GitHub App with device-flow sign-in and the tokens in the Keychain. AI and voice are still mocked or unavailable over the bridge; their native foundations exist. See [TASKS.md](TASKS.md) and [docs/PHASE3A_NATIVE.md](docs/PHASE3A_NATIVE.md).

## Requirements

- macOS 15+ on Apple Silicon
- Node ≥ 23.6 (native TypeScript type-stripping is used for tests). Verified with Node 26.11.
- Xcode 27.1 (Swift 6.4) for the `AURA.app` target. The Command Line Tools alone still build and test the SwiftPM package. See [ARCHITECTURE.md § Native build](ARCHITECTURE.md#native-build-the-auraapp-target).
- The Astra Lumen GLB in `assets/avatar/community/astra-lumen/`. It is not in git; see [docs/ASSETS.md](docs/ASSETS.md).

## Quick start

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open http://127.0.0.1:5173 for the studio in a browser, which uses the mock bridge. To run it inside the native shell, keep the dev server running and in a second terminal:

```bash
AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp
```

To build the sandboxed app with the frontend bundled (production mode):

```bash
tools/build-app.sh
open macos/.build/xcode/Build/Products/Release/AURA.app
```

## Checks

```bash
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
tools/swift-test.sh
```

## Layout

```
frontend/   React + R3F studio (Codex)          frontend/src/platform/  bridge glue (Claude Code)
shared/     bridge contracts, client, mock, fixtures (Claude Code)
macos/      SwiftPM: AuraCore services + AuraApp shell (Claude Code)
designs/    Stitch reference exports, design-system/tokens.css
assets/     3D assets (+ licence credits)
docs/       ASSETS.md, DESIGN_ANALYSIS.md, PHASE2_CODEX_HANDOFF.md
tools/      inspect-glb.mjs
```

Docs: [ARCHITECTURE.md](ARCHITECTURE.md) (design, contracts, conventions, risks), [AGENTS.md](AGENTS.md) (rules for all coding agents), [TASKS.md](TASKS.md) (roadmap).

## Credits

"Astra Lumen II, a rigged companion android" by [XRProfXR](https://sketchfab.com/pinckneyb), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source: [Sketchfab](https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428). The app scales the model at runtime. Details are in [CREDITS.txt](assets/avatar/community/astra-lumen/CREDITS.txt).
