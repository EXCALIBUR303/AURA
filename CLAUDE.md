# CLAUDE.md

@AGENTS.md

## Claude Code specifics

Claude Code owns the native app, shared contracts, services (GitHub, AI, voice), persistence, security, the native↔web bridge, integration, and native testing. See the ownership table above. Do not edit Codex-owned frontend files. Integration fixes there go through `TASKS.md` or the owner.

- The source of truth for the bridge is `shared/contracts/*.ts`. The Swift mirror is `macos/Sources/AuraCore/Bridge/`. `swift test` fails on name drift. Keep the fixtures in `shared/fixtures/` covering every new message shape.
- Composition root: `macos/Sources/AuraCore/AppServices.swift`. Register every method there.
- To verify behaviour inside WKWebView, launch `AuraApp` against the dev server or `frontend/dist`, then read `/usr/bin/log show --last 2m --info --predicate 'subsystem == "com.aura.app"'`. Note that the zsh builtin `log` shadows `/usr/bin/log`. The validation scene logs a one-line `avatar diagnostics …` notice about 5 s after load.
- This Mac has Command Line Tools only (as of 2026-10-16). Do not write code that needs SwiftUI macros, Info.plist keys, or entitlements until the Xcode app target exists.
