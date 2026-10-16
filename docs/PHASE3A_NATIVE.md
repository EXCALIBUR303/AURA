# Phase 3A: native macOS foundation

Date: 2026-10-16 · Author: Claude Code · Branch: `claude/phase3a-native-foundation` (from `main` @ `79b8181`), local only, not pushed or merged.
Mac: Apple M5, 16 GB, macOS 27.2, built-in 60 Hz Retina display. Toolchain: Xcode 27.1 (27A9275), macOS 27.0 SDK, Swift 6.4. Everything below was measured on this Mac unless marked otherwise.

## Summary

AURA now builds as a sandboxed, hardened-runtime `AURA.app` from Xcode (Debug and Release), with the frontend bundled. The window can be dragged by its title bar, and it is a single window. The studio keeps rendering at 30 fps when AURA's window is visible but another app is active, instead of freezing. The Studio menu ticks the current zone, and ⌘1–⌘6 and ⌘K work with real key presses. GitHub, AI and voice have native foundations (protocols, state machines, Keychain storage, tests) but are not on the bridge yet.

## Commits

| Commit | Change |
|---|---|
| `1aeb619` | Xcode app target, single window, native title-bar dragging, keyboard focus on load, Tab reaches every control |
| `112e12e` | Bridge: `app.getWindowState`, `app.windowStateChanged`; `WindowStateStore` / `WindowStateObserver` |
| `14dec86` | **Frontend (`Studio.tsx`, approved cross-ownership, Codex to review):** 30 fps while visible-inactive |
| `3658930` | Studio menu ticks the current zone |
| `2c691ee` | GitHub, AI and voice service foundations + 16 tests |
| `c272293`, `8e9dc82` | DevProbe: Keychain round-trip; accessibility media queries vs macOS settings |

Files added: `macos/AURA.xcodeproj/**`, `macos/App/{Info.plist,AURA.entitlements}`, `macos/Sources/AuraApp/{AuraWebView,WindowStateObserver}.swift`, `macos/Sources/AuraCore/Lifecycle/WindowStateStore.swift`, `macos/Sources/AuraCore/Services/{GitHub,AI,Voice}/*.swift`, `macos/Tests/AuraCoreTests/FoundationTests.swift`, `tools/build-app.sh`, this report. Modified: `AuraApp.swift`, `AppModel.swift`, `StudioWebView.swift`, `DevProbe.swift`, `AppServices.swift`, `BridgeDomain.swift`, `BridgeMethod.swift`, `shared/contracts/{domain,methods,events}.ts`, `shared/bridge/mock.ts`, `shared/fixtures/bridge-messages.json`, contract/service tests, `frontend/src/studio/Studio.tsx`, root docs.

## Xcode build and launch

| Check | Result |
|---|---|
| `xcodebuild` Debug and Release (clean) | Pass, 0 warnings. Universal (arm64 + x86_64). |
| Signature | Ad-hoc, hardened runtime (Release `flags=0x10002(adhoc,runtime)`), `codesign --verify --strict` passes |
| Entitlements (Release) | `app-sandbox`, `network.client`, `device.audio-input` only (`get-task-allow` removed) |
| Info.plist | `com.aura.app` 0.1.0 (1), microphone + speech usage strings, developer-tools category |
| Bundled web | `Contents/Resources/web`; GLB SHA-256 `e9984ddc…eb76c1` matches the original; `CREDITS.txt` present |
| Production launch (`aura://`, sandboxed) | ✅ "Native connected", model ready 382–400 ms, data in the app container |
| Development launch (Debug, `AURA_DEV_SERVER_URL`, sandboxed) | ✅ loads the loopback dev server through `network.client` |
| Keychain inside the sandboxed ad-hoc app | ✅ write + read + delete round-trip (DevProbe) |

## Window

Real mouse events (posted with CGEvent at HID level) against the Release app:

| Action | Result |
|---|---|
| Drag empty bar (left and right of the zone switcher) and the AURA logo | Window moves by the drag minus ~4 px (AppKit's drag threshold) |
| Press-drag starting on a zone button, the status chip, the 3D canvas or the message box | Window does not move; canvas drag orbits the camera |
| Click a zone button right after a window drag | Navigates normally |
| Double-click empty bar | Zooms, double-click again restores (system setting: default) |
| Resize from the corner | Works; 1100×700 minimum holds |
| Yellow button / ⌘M, reopen | Minimizes and restores |
| Green button / View › Exit Full Screen | Enters and leaves full screen |
| File › New Window | Gone (single `Window` scene) |

## Lifecycle

| Window state | Render rate (on-screen readout) | CPU: AURA / WebContent / GPU process |
|---|---|---|
| Active | 60 fps, DPR 2 | 5.4–6.0 % / 19.6–21.3 % / 16.0–17.1 % |
| Visible, another app active | 28 fps (target 30), DPR 2 | 4.6 % / 17.0–18.1 % / 3.6–3.7 % |
| Minimized or hidden | 0 | 0 % / 0 % / 0 % |
| Previous behaviour (freeze), inactive | 0 | 0 % / 0.4 % / 0 % |
| Reactivated | 60 fps, DPR 2 (no adaptive drop) | as active |

State transitions logged correctly for activate, deactivate, minimize, restore, hide and unhide. A web content crash (`kill -9`) reloads the page, restores the zone and re-syncs the window state: after a crash while inactive, the page came back at 28 fps. Memory (footprint) on fresh launches: WebContent 284 → 284 MB after 20 inactive/minimize/restore cycles → 290 MB after 18 zone transitions; the old freeze build gave 290 → 284 → 288. AURA's own process plateaued at 46–48 MB, the GPU process at 108 MB. One long session that had been through many relaunches and test builds reached 371 MB in WebContent (R13).

Per zone in the Release app (DevProbe, 4 s each, 1100×732 @2×): 60 fps in all six zones, p99 19 ms, worst frame 24 ms, 12–14 draw calls, 79.6–79.8k triangles.

## Keyboard and menus

Real key events:
- ⌘1–⌘6 each navigate, persist `lastZone` and tick exactly one Studio item; clicking a zone button moves the tick too.
- ⌘K focuses the companion input (there is no palette UI yet). Digits typed there do not navigate; ⌘4 still navigates and the draft is kept.
- On launch the page takes keyboard focus; Tab and Shift-Tab move through buttons even with full keyboard access off (`tabFocusesLinks`).
- ⇧⌘Space ("Talk to Astra") never reaches AURA on this Mac: another app or system feature takes it before AURA does. Choosing the menu item works.
- After leaving full screen with fn-F or the View menu, synthesized keystrokes stopped reaching AURA until a click (R12). I couldn't confirm this with a physical keyboard, and a native re-key attempt did not change it, so no fix is shipped.

Test-method note: macOS sometimes left keyboard focus with the previously active app after a shell launch, so later key tests always clicked a non-interactive label in AURA first.

## Bridge

Audit: requests are validated (envelope, version, method, typed params) and correlated by id with a 15 s client timeout; only the trusted main-frame origin may call; native events are typed and dropped while no page is listening. New: `app.getWindowState` gives a reloaded page the current state, and the drag channel lives in an isolated content world that page scripts cannot reach. `app.activeChanged` is deprecated but still sent until Phase 3B. Listener duplication: `useBridgeEvent` unsubscribes on unmount, and a reload creates a fresh page, so there are no stale listeners.

## Service foundations

| Area | Built | Not built (later phases) |
|---|---|---|
| GitHub | `GitHubConnectionManager` (disconnected / authorizing / connected / failed: denied, expired, revoked, insufficient scopes, unavailable), device-flow `GitHubAuthenticator` protocol, `UnconfiguredGitHubAuthenticator`, Keychain `GitHubCredentialStore`, redacted `GitHubToken`, HTTP status → error mapping | HTTP authenticator, REST client, bridge methods, UI |
| AI | `AIProviderConfiguration` (loopback-only local or https remote), `AICredentialStore` (Keychain `ai.<id>.apiKey`), `AIProviderCatalog` (remote available only with a key); streaming and cancellation stay on `AIProvider`/`AIService` | Real providers (owner decision), key-entry UI |
| Voice | `VoicePermissions` (status never prompts; `SystemVoicePermissions` refuses to prompt outside a bundle with usage strings), `SpeechInput`/`SpeechOutput`, `VoiceSession` (barge-in, no self-hearing, interruptions, per-run generations) | SFSpeechRecognizer / AVSpeechSynthesizer implementations, bridge wiring |

No tokens or keys are hardcoded; nothing contacts a network.

## Tests

| Check | Result |
|---|---|
| `npm --prefix frontend run typecheck` | pass |
| `npm --prefix frontend test` | 8/8 |
| `npm --prefix frontend run build` | pass |
| `npm --prefix frontend audit` | 0 vulnerabilities |
| `inspect:avatar` | 36,508 tris, 72 joints, 0 morph targets (unchanged) |
| Codex browser suite with axe (`test:browser`, headed Chromium, M5) | 27/27, 0 page errors, 0 external requests, 0 WCAG A/AA violations |
| `tools/swift-test.sh` | 37/37 (also plain `swift test` 4/4 with the Xcode toolchain) |
| `xcodebuild` Debug + Release | pass, 0 warnings |

## Accessibility

- Native: menus and traffic-light buttons are labelled; the "AURA can't start" view exposes its heading and message as text.
- WKWebView reports `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast` identically to the macOS settings (all off on this Mac); the frontend handles the first two.
- **Not verified:** VoiceOver, and the effect of turning Reduce Motion / Reduce Transparency on (changing system settings is the owner's step).

## Remaining issues

1. R12: keyboard input after leaving full screen by keyboard or menu (needs a physical-keyboard check).
2. ⇧⌘Space is taken on this Mac (owner: keep or reassign).
3. Command Palette is only a focus shortcut (Codex).
4. Background policy is 30 fps; WebContent still uses ~17 % CPU in that state against 0.4 % when frozen (owner: 30 / 15 fps / freeze).
5. R13: watch WebContent memory in long sessions.
6. No app icon; ad-hoc signing (microphone may re-prompt after rebuilds); no notarisation.
7. Phase 2.7 frontend leftovers (inspector detail, Companion framing at 1100×700, "/" contrast).

## Phase 3B handoff (GitHub)

1. **Owner decisions:** auth method (recommended: GitHub OAuth App with device flow; the owner registers the app and provides its public client ID) and scopes (`read:user` plus `repo` only if private repositories are needed; OAuth apps have no read-only private scope).
2. **Claude Code, native:** `DeviceFlowGitHubAuthenticator` (URLSession: `POST https://github.com/login/device/code`, poll `/login/oauth/access_token` honouring `interval` and `slow_down`, `GET https://api.github.com/user` with `X-OAuth-Scopes`); real `GitHubService` (repositories, commits, pagination cursor, `gitHubError` mapping, rate limits); call `GitHubConnectionManager.restore()` at launch.
3. **Claude Code, contract (one commit):** `github.connect` → `{userCode, verificationUri, expiresAt}`, `github.disconnect`; extend `GitHubAuthStatus` with `authorizing` and `error {reason}`; emit `github.authChanged` from `GitHubConnectionManager.onChange`; mock + fixtures + tests; remove `app.activeChanged`.
4. **Codex:** connect/disconnect UI showing the user code and opening the verification URL; signed-out, authorizing, error and rate-limited states in the inspector; review `14dec86`.
5. **Owner checks before 3B starts:** the manual items in TASKS.md › Phase 3A.
