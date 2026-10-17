# AURA architecture

AURA is a native macOS app (SwiftUI shell plus Swift services) that hosts a React / three.js studio in a single `WKWebView`. The web layer owns everything visual. The native layer owns everything privileged: network credentials, files, the microphone, speech, persistence and OS integration. The two layers talk only through a typed, versioned JSON bridge.

```
┌──────────────────────────── AuraApp (SwiftUI, AppKit) ────────────────────────────┐
│  Window · menus (⌘1–⌘6) · lifecycle            AppServices (composition root)     │
│  ┌──────────────────────── WKWebView ────────────────────────┐  ┌──────────────┐  │
│  │  React 19 · R3F 9 · drei 10 · three r186                  │  │ BridgeRouter │  │
│  │  frontend/src  (studio, UI)                               │  │  ├ prefs ─┐  │  │
│  │      │                                                    │  │  ├ projects├─▶ SQLite (AppStore)
│  │  frontend/src/platform  ──▶  shared/bridge client ────────┼─▶│  ├ github ──▶ GitHubService ─▶ Keychain token
│  │                                  ▲                        │  │  ├ ai ──────▶ AIService ─▶ AIProvider(s)
│  │                window.__AURA_BRIDGE__.dispatch(event) ◀───┼──│  ├ voice ───▶ VoiceService (Speech, AVSpeech)
│  └────────────────────────────────────────────────────────────┘  │  └ log ─────▶ os.Logger │
│   aura://app/…  ◀── AppSchemeHandler (frontend/dist)            └──────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Stack (installed and verified 2026-10-16)

| Layer | Choice | Version | Why |
|---|---|---|---|
| Shell | SwiftUI and AppKit: SwiftPM package (`AuraCore`, dev executable `AuraApp`) plus the Xcode app target `AURA.app` | Swift 6.4, Xcode 27.1, macOS 15+ target | Native menus, windows, permissions and Keychain. The app target compiles `Sources/AuraApp` against the local `AuraCore` package. |
| Web host | WKWebView, `WKScriptMessageHandlerWithReply`, custom `aura://` scheme | system WebKit | No Electron, no bundled Chromium. The custom scheme gives a real origin for fetch, CSP and modules. |
| UI | React, TypeScript, Vite | 19.3.1 / TS 7.0.2 / Vite 8.3.4 | TS 7 (native `tsc`) verified working. |
| 3D | three, @react-three/fiber, @react-three/drei | 0.186.1 / 9.8.2 / 10.7.9 | R3F 9 requires React <19.4. Do not bump React past 19.3.x without bumping R3F. |
| UI motion | `motion` | 14.3.0 | Installed by Codex in Phase 2 for the dock and reply transitions. |
| Persistence | System SQLite via `import SQLite3` | macOS SQLite 3.54 | No ORM dependency. The schema is tiny. |
| Secrets | Keychain generic passwords | — | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, not synced. |
| Speech | `Speech` (SFSpeechRecognizer) and `AVSpeechSynthesizer` | Phase 3 | Requires the signed .app bundle (see Native build). |
| GitHub | REST via ephemeral `URLSession` | Phase 3B | GitHub App "AURA Developer Companion", device flow, Metadata + Contents read-only. No client secret. See docs/PHASE3B_GITHUB.md. |
| LLMs | `AIProvider` protocol; one adapter, OpenAI-compatible chat completions with SSE and tool calling (hosted APIs and local runtimes such as Ollama), plus an offline mock | Phase 3C-A/B | Local first. No paid service without approval. See docs/PHASE3C_AI_FOUNDATION.md and docs/PHASE3C_B_ASTRA_INTELLIGENCE.md. |

Everything else is deliberately absent: no state library, no CSS framework, no runtime validation library, no native package dependencies. Add one only when a concrete need appears, and record it here.

## Repository layout and ownership

| Path | Owner | Contents |
|---|---|---|
| `frontend/` (except `src/platform/`) | **Codex** | Vite app: studio scene, camera, Astra integration, zones, UI components, micro-interactions |
| `frontend/src/platform/` | Claude Code | Bridge singleton, `useBridgeEvent`, logger. This is the only place the frontend touches `@aura/bridge`. |
| `shared/contracts/` | Claude Code | **Source of truth** for bridge types: domain, methods, events, errors, envelope |
| `shared/bridge/` | Claude Code | Transport-agnostic client, WebKit transport, in-browser mock |
| `shared/fixtures/`, `shared/test/` | Claude Code | Wire fixtures decoded by both TS and Swift tests |
| `macos/` | Claude Code | `AuraCore` (bridge router, services, persistence, security, logging, config) and `AuraApp` (SwiftUI shell, web view, scheme handler) |
| `designs/design-system/tokens.css` | Codex (Claude Code created v1) | Design tokens as CSS custom properties |
| `designs/stitch/`, `assets/` | Read-only reference | Do not edit generated exports. Asset changes must be recorded in `CREDITS.txt`. |
| `tools/` | Claude Code | Dependency-free scripts (`inspect-glb.mjs`) |
| Root docs | Claude Code (Codex may append to `TASKS.md`) | |

Cross-boundary change protocol: if Codex needs a new bridge method, event or field, it adds a request to `TASKS.md` under "Bridge requests" and uses a local stub meanwhile. Claude Code then makes the contract change in **one commit**, covering `shared/contracts` + Swift mirror + mock + fixtures + tests. Neither agent edits the other's paths.

Empty placeholder directories from the original scaffold (`services/`, `assets/avatar/{models,textures,animations,references}`, `designs/references`) are left in place. Native services live in `macos/Sources/AuraCore/Services/`, not in `services/`.

## Bridge protocol (v1)

All messages are JSON **strings**, which avoids `NSNumber`/`Bool` ambiguity in WebKit's object bridging.

| Direction | Mechanism | Shape |
|---|---|---|
| web → native request | `webkit.messageHandlers.aura.postMessage(json)`, which returns a Promise | `{kind:"request", v:1, id, method, params}` |
| native → web reply | the reply handler resolves that Promise | `{kind:"response", v:1, id, ok:true, result}` or `{…, ok:false, error:{code, message, retryable}}` |
| native → web event | `callAsyncJavaScript("window.__AURA_BRIDGE__?.dispatch(message)", arguments:)` | `{kind:"event", v:1, event, payload}` |

- **Methods** (see `shared/contracts/methods.ts`): `app.getInfo|getWindowState`, `prefs.get|update`, `github.getAuthStatus|connect|disconnect|refresh|listRepositories|getRepository|listBranches|listCommits`, `github.listFiles` (paths only), `projects.list|update|suggestZones`, `ai.listProviders|saveProvider|removeProvider|requestCredential|deleteCredential|validateProvider|previewContext|chat|cancel`, `ai.startConversation|listConversations|getConversation|sendMessage|setConversationRepository|resetConversation|endConversation|respondToApproval` (Phase 3C-B), `voice.getStatus|requestPermissions|startListening|stopListening|speak|stopSpeaking`, `log.write`.
- **Events** (`events.ts`): `app.command` (menu and shortcut actions), `app.windowStateChanged` (`app.activeChanged` was removed in Phase 3B), `prefs.changed`, `github.authChanged` (every connection state change), `ai.chunk|done|error` (numbered by `seq`), `ai.turnState|toolActivity|approvalRequested` (conversation replies, same `seq`), `ai.conversationChanged`, `ai.providersChanged`, `voice.statusChanged|transcript|speechLevel`.
- Streaming (LLM output, transcripts) is always a request that returns a `streamId` immediately, followed by events. No request stays open longer than the client timeout (15 s).
- Versioning: `v` must equal `BRIDGE_PROTOCOL_VERSION` (1), or the host replies `unsupported_version`. Additive changes (new optional fields, new methods or events) keep v1. Renames and removals bump the version.
- Drift protection: `ContractParityTests` parses the TS files and fails if method, event, error-code or zone names differ from the Swift enums. Both test suites decode `shared/fixtures/bridge-messages.json`.

### Adding a bridge method (checklist)

1. `shared/contracts/methods.ts` (and `domain.ts` types).
2. `macos/Sources/AuraCore/Bridge/BridgeMethod.swift` and the mirrored types in `BridgeDomain.swift`.
3. Register a handler in `AppServices.registerHandlers()` (the test `everyMethodHasAHandler` enforces this).
4. Add the mock in `shared/bridge/mock.ts` (the `Handlers` mapped type forces this at compile time).
5. Add a fixture to `shared/fixtures/bridge-messages.json`, and tests on both sides.

## Conventions

**Configuration.** Non-secret runtime config comes from env vars read once at launch (`AppConfiguration.load`): `AURA_DEV_SERVER_URL` (loopback http only, enforced), `AURA_WEB_ROOT`, `AURA_DATA_DIR`, `AURA_GITHUB_CLIENT_ID` (public GitHub App client ID for `swift run`; the app bundle reads `AURAGitHubClientID` from Info.plist). The frontend reads only `VITE_AURA_BRIDGE`. User-facing settings live in `Preferences`, which is persisted in SQLite and exposed via `prefs.*`. See `.env.example`.

**Errors.** Native services throw `AuraError`. The router maps every error to a `BridgeError {code, message, retryable}`; unknown error types become `internal` with only the type name, so messages never carry secrets. The router never crashes on bad input: malformed JSON gives `invalid_request`, an unknown method gives `unknown_method`, and bad params give `invalid_request`. In the frontend, `bridge.call` throws `BridgeCallError` with `.code`, and UI logic branches on `code`, never on `message`.

**Logging.** Native code uses `os.Logger`, subsystem `com.aura.app`, with categories `app`, `bridge`, `web`, `github`, `ai`, `voice`, `persistence`, `security`. User and remote data is interpolated as `.private`; only identifiers we control are `.public`. The frontend uses `platform/log.ts`, which writes to the console and, inside the app, forwards info and above through `log.write` into category `web`. To watch both sides:
```bash
/usr/bin/log stream --level info --predicate 'subsystem == "com.aura.app"'
```

**Security requirements.**
- Secrets (GitHub token, provider API keys) live only in the Keychain (`SecretStore`). They never go in env files, SQLite, logs, or across the bridge. The web side sees derived state only.
- The bridge accepts messages only from the **main frame** of the **expected origin** (`aura://app`, or the configured loopback dev server).
- The web view cannot navigate away from the app origin. External links open in the default browser, and `window.open` never creates a second web view.
- `aura://` responses carry a strict CSP (`default-src 'self'`, no remote scripts, fonts or frames) plus `nosniff`. The scheme handler blocks path traversal outside the web root.
- No runtime CDN requests. Fonts, icons, decoders (Draco/KTX2/Meshopt) and HDRIs must be bundled. drei helpers that default to CDNs (`useGLTF` Draco path, `<Environment preset>`) must be given local paths.
- Treat content rendered in the web view (READMEs, commit messages, model output) as untrusted. Never use `dangerouslySetInnerHTML` with it. Use a sanitising markdown renderer.
- `isInspectable` is enabled only in development.

**Window and lifecycle.** One window (`Window` scene, so no File › New Window). `WindowStateObserver` reports `{active, visible}` (app activation, occlusion, minimize, hide) to `WindowStateStore`, which answers `app.getWindowState` and emits `app.windowStateChanged` on change. The studio renders at full rate while active, at 30 fps while only visible, and not at all while hidden. Window dragging: the page marks empty title-bar areas with `data-aura-drag-region`; a script in an isolated content world reports presses there, and `AuraWebView` starts `NSWindow.performDrag` from the press's next mouse-dragged event (AppKit ignores a drag started outside a live event).

**GitHub (Phase 3B).** `LiveGitHubService` serves the bridge in the app:
- `GitHubConnectionManager` owns the state machine (`disconnected`, `authorizing`, `connected`, `rate_limited`, `expired`, `error`), the launch restore, connect and disconnect.
- `GitHubDeviceFlowClient` handles the device flow and token refresh against github.com.
- `GitHubAPIClient` is an actor holding the Keychain credentials. It refreshes tokens, retries once after a 401, honours the rate limit, keeps an in-memory ETag cache and only accepts the `api.github.com` host. Redirects are followed only within the exact origin, and `GitHubPermissionPolicy` refuses (and signs out of) any installation granting more than read access (Phase 3C-A).
- `ProjectZoneClassifier` produces `projects.suggestZones`. Suggestions are never applied automatically.

Tests use `MockGitHubService`. Details and the security boundaries are in docs/PHASE3B_GITHUB.md.

**AI (Phase 3C-A).** `AIService` runs streams (validation, limits, retries before first output, ~30/s coalescing, `seq`, exactly one terminal event). `AIProviderRegistry` holds provider settings (SQLite `kv ai.providers`) and Keychain key state; keys are entered only in the native `CredentialPrompt` and never cross the bridge. `AIContextBuilder` fetches workspace context natively under the user's sharing preferences and fences untrusted text; `AIToolPolicy` defines the (not yet executed) tool allowlist and approval rules. All AI HTTP uses an ephemeral session with same-origin redirects only (`Networking/RedirectPolicy`, shared with GitHub). Details and the Codex handoff: docs/PHASE3C_AI_FOUNDATION.md.

**Astra conversations (Phase 3C-B).** Host-owned conversations (`AIConversation.swift`) are bound to one provider fingerprint, model and repository, kept in memory only (bounded), and run model → tool → model rounds with explicit `AITurnState`s. Tools are read-only: `AIToolPolicy` (allowlist and arguments) → `AIToolExecutor` (accessible repository, conversation scope, `AIPrivacyGate`, timeouts, budgets) → `GitHubService` GET reads (`GitHubRepositoryContent.swift`). Private source for a cloud provider waits for `ai.respondToApproval`. Source and tool results are framed by a per-conversation random boundary. Details and the Codex 3C-C handoff: docs/PHASE3C_B_ASTRA_INTELLIGENCE.md.

**Voice (Phase 3A foundation, 3C-A contracts).** `VoicePermissions`, `SpeechInput`/`SpeechOutput`, `AudioRouteMonitor`, `VoiceSession` (barge-in, route changes and inactivity stop everything, never auto-restart). Not wired to the bridge yet: it still serves `UnavailableVoiceService`.

**Persistence.** `~/Library/Application Support/AURA/aura.sqlite` (WAL); inside the sandboxed `AURA.app` that is `~/Library/Containers/com.aura.app/Data/Library/Application Support/AURA/`. Schema v1: `kv` (preferences JSON) and `projects` (app-local repo metadata). Migrations run through `PRAGMA user_version`. Nothing fetched from GitHub is persisted yet; caching is a Phase 3 decision.

## Development and test commands

```bash
# frontend (Node ≥ 23.6)
npm --prefix frontend install
npm --prefix frontend run dev          # http://127.0.0.1:5173, mock bridge in a browser
npm --prefix frontend run typecheck    # app + shared + tests (tsc 7)
npm --prefix frontend test             # shared contract/bridge tests (node --test)
npm --prefix frontend run build        # typecheck + vite build → frontend/dist
npm --prefix frontend run inspect:avatar

# native
swift build --package-path macos
tools/swift-test.sh                    # = swift test (the plugin-path workaround is now only needed with the CLT)
AURA_DEV_SERVER_URL=http://127.0.0.1:5173 swift run --package-path macos AuraApp   # live dev, unbundled
AURA_WEB_ROOT="$PWD/frontend/dist" swift run --package-path macos AuraApp           # built files via aura://
tools/build-app.sh                     # frontend build + AURA.app (Release) → macos/.build/xcode/Build/Products/Release
tools/build-app.sh Debug               # Debug AURA.app; Xcode's Run (scheme AURA) loads the dev server
open macos/AURA.xcodeproj              # Xcode: scheme AURA, Run = Debug + AURA_DEV_SERVER_URL
```

## Native build: the AURA.app target

`macos/AURA.xcodeproj` (hand-written, no generator) has one app target, `AURA` (`com.aura.app`), built with Xcode 27.1:
- Sources: `macos/Sources/AuraApp` (synchronized folder), linked against the `AuraCore` product of the local package. The SwiftPM `AuraApp` executable builds the same files for quick unbundled runs.
- `macos/App/Info.plist`: microphone and speech-recognition usage strings, developer-tools category. `macos/App/AURA.entitlements`: App Sandbox, `network.client` (loopback dev server, the GitHub API since Phase 3B, AI later), `device.audio-input`.
- Hardened runtime; ad-hoc signing ("Sign to Run Locally", no team). Release drops `get-task-allow`. Ad-hoc signatures change on every build, so macOS may ask for microphone access again after a rebuild.
- Build phase "Embed frontend" copies `frontend/dist` to `Contents/Resources/web` (required for Release; Debug warns and relies on the dev server). `AppConfiguration` serves it through `aura://app/`.
- Sandbox consequences: the app has its own data container and Keychain items (separate from `swift run`), and `AURA_WEB_ROOT` outside the bundle is unreadable to it.

Not done yet: app icon, Developer ID signing and notarisation (Phase 5).

## Technical risks

| # | Risk | Status / evidence | Mitigation / next check |
|---|---|---|---|
| R1 | **WKWebView 3D performance** under a full studio scene | Partly measured. A single 36.5k-tri avatar with clearcoat, 2 lights, pixel ratio 2 ran at **60 fps** in WKWebView (`AuraApp`, dev and `aura://`, M5, 16 GB). The GLB load took **485 ms** (`aura://`) and **750 ms** (dev server). That is far from a full scene. | Codex reports the fps and draw calls of every new zone. Budget: hold 60 fps at pixel ratio 2 with all zones. Add an adaptive-quality fallback (`Preferences.graphics`). |
| R2 | **rAF may be capped at 60 Hz** in WKWebView even on 120 Hz ProMotion | 60 fps measured. We can't yet tell whether that is a cap or the display rate. | Test on the built-in display versus an external one. Treat 60 as the target. |
| R3 | ~~No Xcode~~ | Resolved in Phase 3A: Xcode 27.1 and the `AURA.app` target | Developer ID signing and notarisation remain (Phase 5). |
| R4 | The avatar has **one idle clip**, **no blend shapes**, **no finger bones**, and loads at **3.34 m** | Verified in `docs/ASSETS.md` | Normalise the scale. Drive procedural look-at and jaw. Source and retarget clips (licence check). |
| R5 | The GPU name is masked (`"Apple GPU"`) in WKWebView | Verified | Get hardware info natively if needed. |
| R6 | WebGL context loss or web-process termination (memory pressure, GPU reset) | The shell reloads on `webViewWebContentProcessDidTerminate`. Context loss is unhandled. | The frontend handles `webglcontextlost` / `restored`. Persist the UI state needed to resume. |
| R7 | The scheme handler reads files synchronously on the main thread | Acceptable for 17 MB (tens of ms) | Move to a background read if it shows up in profiles. Compress textures (KTX2). |
| R8 | Large binaries are gitignored (no Git LFS), so worktrees lack the GLB | Known | Copy them per `docs/ASSETS.md`. Install `git lfs` before the first push if the assets should be versioned. |
| R9 | TypeScript 7 / Vite 8 are recent majors, and plugins may lag | Typecheck and build pass today | Pin via lockfile. Fall back to TS 6 if a tool breaks. |
| R10 | Window dragging with the hidden title bar | Resolved in Phase 3A (`data-aura-drag-region` → `performDrag`), verified with real mouse events | Keep empty top-bar areas marked. |
| R11 | CLT `swift test` macro-plugin lookup is flaky | With the Xcode toolchain plain `swift test` passed 4/4 | `tools/swift-test.sh` stays for CLT-only machines. |
| R12 | After leaving full screen by keyboard, keystrokes might not reach AURA until a click | Seen only with synthesized input. With the physical keyboard (`AURA_DEV_INPUT_LOG=1`), fn-F in and out left AURA key with the web view as first responder; no shortcut press after the exit was recorded, so not verified end to end. No workaround applied. | Owner: fn-F, fn-F, then ⌘4 without switching apps; read the `input` log. |
| R13 | Web content memory over long sessions | Phase 3A soak (20 min, 52 cycles): WebKit Malloc rose 58 → 130 MB in a GC sawtooth and fell to 42 MB on `notifyutil -p org.WebKit.lowMemory`; graphics stayed within 214–374 MB; DOM nodes, draw calls and triangles constant. Expected heap/cache growth, not a leak. | Re-run the soak (`AURA_DEV_SOAK_MINUTES`) after Phase 3B adds real data. |
