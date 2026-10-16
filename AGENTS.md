# AGENTS.md: rules for coding agents on AURA

Two agents build AURA: **Codex** (frontend and 3D) and **Claude Code** (native, contracts, services). This file is the shared rulebook. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything.

## Ownership (do not edit the other agent's paths)

| Codex | Claude Code |
|---|---|
| `frontend/**` **except** `frontend/src/platform/**` | `frontend/src/platform/**` |
| `designs/design-system/tokens.css` | `shared/**` (contracts, bridge client, mock, fixtures, tests) |
| Visual and 3D assets added under `frontend/public/` | `macos/**`, `tools/**` |
| May append to `TASKS.md` | Root docs, `.gitignore`, `.env.example` |

Read-only for both: `designs/stitch/**` and `assets/**`. Exception: adding a new asset together with its licence and credit file.

**Need something across the line?** Add an entry under "Bridge requests" (or "Native requests") in `TASKS.md` describing the method, event or field and why. Stub it locally in your own code until it lands. Never hand-edit `shared/contracts` from the frontend side.

## Non-negotiables

- **Never fabricate.** No invented GitHub data, metrics, fps, benchmark numbers or test results, in code, UI copy, commits or reports. Mock data comes only from `shared/bridge/mock.ts` and is visibly labelled (`mock-user`, `.invalid` URLs). UI shows measured values or nothing.
- **No secrets in files.** Tokens and API keys live in the macOS Keychain via the native `SecretStore`. They never go in `.env*`, source, fixtures, logs, or bridge payloads.
- **No runtime network fetches for assets.** Fonts, icons, HDRIs and Draco/KTX2 decoders are bundled. Pass local paths to drei helpers that default to CDNs.
- **No new dependencies without a reason** recorded in the commit message (and in ARCHITECTURE.md's stack table for anything significant). No paid services without the owner's approval.
- **Preserve attribution.** The Astra Lumen II credit (CC BY 4.0) stays visible in the app. Any modification of the GLB is recorded in its `CREDITS.txt`.
- **Do not delete or restructure existing files** you do not own. Do not push to GitHub, and do not commit binaries (`*.glb`, `screen.png`, …) without explicit approval.
- **Report honestly.** If a test fails or something was not verified (for example, it was not tested inside `AuraApp`), say so.

## Frontend conventions (Codex)

- TypeScript strict, `erasableSyntaxOnly` (no enums, namespaces or parameter properties). Use `import type` for types.
- Talk to the host only through `frontend/src/platform/bridge.ts` (`bridge.call`, `useBridgeEvent`). Never touch `window.webkit` directly.
- Handle bridge failures by `error.code` (`BridgeCallError`). Expect `unavailable` for voice until Phase 3.
- Use the logger from `platform/log.ts`, not raw `console.*`, for anything worth keeping. Put no personal data in log messages.
- Respect `Preferences.reduceMotion`, `prefers-reduced-motion` and `Preferences.graphics.maxPixelRatio`.
- Accessibility: every interactive element is focusable, has a visible `:focus-visible` ring and an accessible name. Minimum text size is 11 px (10 px only for uppercase `label-caps`). Use the text-safe colour tokens.
- Every 3D change reports measured fps, draw calls and triangles in its summary, in both the browser and `AuraApp` when possible.

## Native conventions (Claude Code)

- Swift 6 language mode, strict concurrency, zero warnings. UI and bridge code is `@MainActor`; services are `Sendable`.
- Services throw `AuraError`. The router maps errors to `BridgeError`. No `fatalError` / `try!` on input paths.
- `os.Logger` (subsystem `com.aura.app`): remote and user data is `.private`.
- Every bridge change follows the checklist in ARCHITECTURE.md § Adding a bridge method, in one commit.
- SwiftUI macros work with the Xcode toolchain. Keep `swift build --package-path macos` working too: it builds the unbundled dev executable.

## Commands

```bash
npm --prefix frontend install
npm --prefix frontend run dev            # browser + mock bridge
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run inspect:avatar
swift build --package-path macos
tools/swift-test.sh
AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp
tools/build-app.sh                       # frontend + AURA.app (Release)
```

Before handing work back, run `typecheck`, `test` and `build` (frontend) and/or `tools/swift-test.sh` (native), and report the results verbatim.

## Git

- `main` holds integrated, passing work only. Agents work on their own branches in separate worktrees:
  - Codex: branch `codex/<topic>`, for example in worktree `~/Developer/AURA-codex`
  - Claude Code: branch `claude/<topic>`, for example in `~/Developer/AURA-claude`
- The owner merges into `main` after review. Rebase on `main` before asking for a merge.
- Small commits with imperative subjects (`frontend: add zone camera rig`). Nothing is pushed without the owner's authorisation.
- Gitignored assets are not present in a new worktree. Copy them per `docs/ASSETS.md`.
