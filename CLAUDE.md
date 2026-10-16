# CLAUDE.md

@AGENTS.md

## Claude Code specifics

Claude Code owns the native app, shared contracts, services (GitHub, AI, voice), persistence, security, the native↔web bridge, integration, and native testing. See the ownership table above. Do not edit Codex-owned frontend files. Integration fixes there go through `TASKS.md` or the owner.

- The source of truth for the bridge is `shared/contracts/*.ts`. The Swift mirror is `macos/Sources/AuraCore/Bridge/`. `swift test` fails on name drift. Keep the fixtures in `shared/fixtures/` covering every new message shape.
- Composition root: `macos/Sources/AuraCore/AppServices.swift`. Register every method there.
- To verify behaviour inside WKWebView, launch `AuraApp` against the dev server or `frontend/dist`, then read `/usr/bin/log show --last 2m --info --predicate 'subsystem == "com.aura.app"'`. Note that the zsh builtin `log` shadows `/usr/bin/log`. The validation scene logs a one-line `avatar diagnostics …` notice about 5 s after load.
- GitHub (Phase 3B): `AURA_DEV_GITHUB_PROBE=1` checks the live integration from inside the app. It logs the device code if a sign-in is needed, then installation permissions, repository counts and pagination; add `AURA_DEV_GITHUB_PROBE_REFRESH=1` to rotate the token. Read the results from log category `github-probe`. Never log tokens or device codes, and log repository names only as `.private`. Details are in docs/PHASE3B_GITHUB.md.
- Xcode 27.1 is installed and `macos/AURA.xcodeproj` builds the sandboxed `AURA.app` (Info.plist and entitlements in `macos/App/`). Verify native behaviour in that bundle (`tools/build-app.sh`), not only under `swift run`: sandbox, Keychain and permissions differ.
