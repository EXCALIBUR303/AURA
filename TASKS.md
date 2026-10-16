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
- [ ] [CC] Native window dragging for the hidden title bar (`data-aura-drag-region` contract, see handoff)
- [ ] [CC] About / Credits window (native) with the CC BY 4.0 attribution
- [ ] [CC] Xcode app target (after [O] installs Xcode): bundle `frontend/dist`, Info.plist usage strings, hardened runtime, icon

## Phase 3: Real services (native-led)

- [ ] [CC] GitHub auth (method to be decided by [O]: device-flow OAuth app or fine-grained PAT) → Keychain, `github.authChanged`
- [ ] [CC] GitHub REST/GraphQL client: repos, commits, rate-limit handling (`rate_limited`), optional cache
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
4. **GitHub auth method** and the scopes AURA may request (read-only recommended).
5. **LLM providers** and any spending limits.

## Bridge requests

Codex: add requests here (method, event or field, payload shape, why). Claude Code implements them in `shared/contracts` + Swift + mock in one commit.

- _(none yet)_

## Native requests

- _(none yet)_

### Phase 2 frontend handoff

- [CC] Documentation sync: `motion` 14.3.0 is now installed for accessible dock/reply transitions, as requested in the Phase 2 handoff. Update ARCHITECTURE.md's existing motion entry from "not installed yet" when reviewing the root docs. No new bridge methods were required.
- [O] Browser implementation and cloud checks are recorded in `frontend/PHASE2_HANDOFF.md`. Complete the remaining AuraApp, native keyboard/window dragging, Safari network, and Apple Silicon performance acceptance on the Mac before marking Phase 2 fully accepted. The GLB remains ignored and unchanged.

### Phase 2 completion audit

- [C] Frontend completion fixes and regression coverage: dock/avatar-safe projected cards at 1100×700; loaded/settled performance sampling; renderer startup error feedback; actual mouse orbit/zoom/reset diagnostics; loading, missing-model/retry, keyboard-only, attribution and AI error checks.
- [C] Required frontend checks pass and the expanded browser suite has 22 passing checks. Full criterion-by-criterion evidence and exact isolated Mac M5 review commands are in `frontend/PHASE2_HANDOFF.md`; machine-readable results are in `frontend/PHASE2_RESULTS.json`.
- [O/CC] Phase 2 acceptance remains pending for actual AuraApp/WebKit execution, native menus/focus/persistence/dragging, Safari network checks, accessibility review, and per-zone M5 browser plus AuraApp performance at DPR 2 (≥55 FPS). No Phase 3 work is included.
