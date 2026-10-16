# TASKS

Owner legend: **[C]** Codex · **[CC]** Claude Code · **[O]** project owner (decision or approval)

## Phase 1: Engineering foundation ✅ (awaiting owner approval)

- [x] [CC] Repository assessment, Stitch and design analysis (`docs/DESIGN_ANALYSIS.md`), verified asset report (`docs/ASSETS.md`)
- [x] [CC] Shared bridge contracts, client, mock and fixtures (`shared/`), 8 TS tests
- [x] [CC] Vite, React, R3F frontend with an Astra validation scene, running in the browser and in WKWebView
- [x] [CC] SwiftPM `AuraCore` (router, SQLite, Keychain, logging, config, service protocols and mocks) and `AuraApp` shell (WKWebView, `aura://`, menus), 19 Swift tests
- [x] [CC] Docs, `.gitignore`, `.env.example`, baseline commit

## Phase 2: Studio and companion (frontend-led)

Full brief: [docs/PHASE2_CODEX_HANDOFF.md](docs/PHASE2_CODEX_HANDOFF.md)

- [ ] [C] Real-time 3D studio geometry and lighting with 6 zones (no photo backgrounds)
- [ ] [C] Camera rig: zone-to-zone transitions, constrained orbit, ⌘1–⌘6 / `app.command`, persist `lastZone`
- [ ] [C] Astra: normalise scale (3.34 m → ~1.75 m), idle clip, procedural head/eye look-at, `CompanionState` visuals, jaw driven by `voice.speechLevel`
- [ ] [C] UI shell from Stitch: top bar, zone navigator, inspector, command dock, companion pill, zone cards (mock data)
- [ ] [C] Accessibility fixes from DESIGN_ANALYSIS, reduced motion, visible credits
- [ ] [C] Performance report (fps, draw calls, triangles) in the browser **and** `AuraApp`
- [x] [CC] Native window dragging for the hidden title bar (`data-aura-drag-region` contract, see handoff). Done in Phase 3A.
- [ ] [CC] About / Credits window (native) with the CC BY 4.0 attribution
- [x] [CC] Xcode app target: bundles `frontend/dist`, Info.plist usage strings, sandbox, hardened runtime. Done in Phase 3A; the icon is still missing.

## Phase 3A: Native foundation ✅ (awaiting owner review)

Report: [docs/PHASE3A_NATIVE.md](docs/PHASE3A_NATIVE.md)

- [x] [CC] `AURA.xcodeproj`: Debug/Release, sandbox, hardened runtime, ad-hoc signing, embedded frontend, `tools/build-app.sh`
- [x] [CC] Single `Window` scene; native title-bar dragging and double-click; page takes keyboard focus on load; Tab reaches every control
- [x] [CC] Window-state contract (`app.getWindowState`, `app.windowStateChanged`); `app.activeChanged` deprecated
- [x] [CC] Studio menu ticks the current zone; ⌘1–⌘6 and ⌘K verified with real key events
- [x] [CC] GitHub / AI / voice service foundations (native only, not on the bridge yet)
- [ ] [C] **Review** commit "frontend: render at 30 fps while AURA is visible but inactive" (`Studio.tsx`, approved cross-ownership change). Keep or adjust `BACKGROUND_FPS`.
- [x] [C] Move any remaining `app.activeChanged` listener to `app.windowStateChanged`. None remained; the event was removed in Phase 3B.
- [x] [O→CC] ⌘K is documented and labelled "Focus Chat" (Studio menu). A real command palette is later work for [C].
- [ ] [C] Phase 2.7 leftovers: inspector repo detail ignores the zone; Astra's feet touch the dock in Companion at 1100×700; "/" separator contrast 3.0:1.
- [x] [O→CC] "Talk to Astra" moved to ⌃⌥Space (⇧⌘Space was taken on the owner's Mac). Verified with the physical keyboard.
- [x] [O] Background rendering policy: keep 30 fps while visible-inactive; suspend when minimized or hidden.
- [x] [O] App icon deferred to the final visual branding stage.
- [ ] [O] Manual checks still open: VoiceOver pass; Reduce Motion / Reduce Transparency toggled on; R12 end-to-end (leave full screen with fn-F, then press ⌘4 without clicking).

## Phase 3B: GitHub integration ✅ (merged to `main`, 2026-10-17)

Reports: [docs/PHASE3B_GITHUB.md](docs/PHASE3B_GITHUB.md) (native and Codex brief), [docs/PHASE3B_VALIDATION.md](docs/PHASE3B_VALIDATION.md) (Mac M5 validation and finalization)

- [x] [CC] GitHub App device flow, Keychain credentials, refresh, revocation, launch restore, `github.authChanged`. Verified live in the sandboxed Release app.
- [x] [CC] Repositories across installations, repository detail and languages, branches, commits, pagination, ETag cache, rate limits
- [x] [CC] `projects.suggestZones` (explainable, never auto-applied); manual zones unchanged
- [x] [C] GitHub frontend: connect, authorizing, connected, expired, rate-limited and error states; repository explorer with paging, detail, branches and commits; zone suggestions with Accept (`0c48338`)
- [x] [O] Live revoke and reconnect (found and fixed the refresh-refusal defect, `c08f9b8`)

Non-blocking follow-ups:

- [ ] [C] Hide the "WebGL2 is unavailable" canvas fallback from assistive technology unless WebGL actually fails (`Studio.tsx`)
- [ ] [C] Inspector: show the first line of each commit message, with an expander
- [ ] [C] Offer Disconnect in the `error(configuration)` state
- [ ] [C] Explorer at 1100×700 shows about one row of cards
- [ ] [CC] Hardening: refuse HTTP redirects that leave `api.github.com` in `URLSessionTransport`, so the bearer token cannot follow one (no current endpoint redirects off-host)
- [ ] [CC] Hardening: treat an installation that grants more than read access as an error state instead of only logging it (the registered app is read-only today)
- [ ] [O] Manual checks: VoiceOver, Reduce Motion and Reduce Transparency, R12 (full screen then ⌘4)

## Phase 3: Real services (native-led)

- [x] [CC] GitHub auth → Keychain, `github.authChanged` (Phase 3B)
- [x] [CC] GitHub REST client: repos, commits, rate-limit handling, cache (Phase 3B)
- [ ] [CC] Voice: `SFSpeechRecognizer` (on-device where available), `AVSpeechSynthesizer`, `voice.speechLevel` metering, permission flow
- [ ] [C] Wire real loading, empty, error and permission-denied states into the UI

## Phase 4: AI

- [ ] [O] Choose providers (local via Ollama on localhost first? which cloud provider, if any?) and approve any paid usage
- [ ] [CC] `AIProvider` implementations, key entry via Keychain, streaming, cancellation
- [ ] [CC] AI-assisted project understanding (repo summary pipeline: scope, privacy rules, context limits) **(design doc first)**
- [ ] [C] Chat / conversation UI, Astra "thinking/speaking" states

## Phase 5: Polish and ship

- [ ] Profiling pass (Instruments + WebKit), texture compression (KTX2), WebGL context-loss recovery
- [ ] Signing, notarisation, auto-update decision
- [ ] Settings window (native) backed by `prefs.*`

## Open decisions for the owner [O]

1. **Xcode install.** It is required for the app bundle, voice and SwiftUI macros. It blocks Phase 3.
2. **Binary assets in git.** Install Git LFS and track `*.glb` / `screen.png`, or keep them out of the repo?
3. **Animations for Astra.** Retarget CC-compatible clips (licence check per clip), go procedural only, or commission?
4. ~~**GitHub auth method**~~ Decided 2026-10-17: GitHub App "AURA Developer Companion", device flow, Metadata + Contents read-only, installed on EXCALIBUR303 (selected repositories).
5. **LLM providers** and any spending limits.

## Bridge requests

Codex: add requests here (method, event or field, payload shape, why). Claude Code implements them in `shared/contracts` + Swift + mock in one commit.

- _(none yet)_

## Native requests

- _(none yet)_

### Phase 2 frontend handoff

- [x] [CC] Documentation sync (done in Phase 3A): `motion` 14.3.0 is now installed for accessible dock/reply transitions, as requested in the Phase 2 handoff. Update ARCHITECTURE.md's existing motion entry from "not installed yet" when reviewing the root docs. No new bridge methods were required.
- [O] Browser implementation and cloud checks are recorded in `frontend/PHASE2_HANDOFF.md`. Complete the remaining AuraApp, native keyboard/window dragging, Safari network, and Apple Silicon performance acceptance on the Mac before marking Phase 2 fully accepted. The GLB remains ignored and unchanged.

### Phase 2 completion audit

- [C] Frontend completion fixes and regression coverage: dock/avatar-safe projected cards at 1100×700; loaded/settled performance sampling; renderer startup error feedback; actual mouse orbit/zoom/reset diagnostics; loading, missing-model/retry, keyboard-only, attribution and AI error checks.
- [C] Required frontend checks pass and the expanded browser suite has 22 passing checks. Full criterion-by-criterion evidence and exact isolated Mac M5 review commands are in `frontend/PHASE2_HANDOFF.md`; machine-readable results are in `frontend/PHASE2_RESULTS.json`.
- [O/CC] Phase 2 acceptance remains pending for actual AuraApp/WebKit execution, native menus/focus/persistence/dragging, Safari network checks, accessibility review, and per-zone M5 browser plus AuraApp performance at DPR 2 (≥55 FPS). No Phase 3 work is included.
