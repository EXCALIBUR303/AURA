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
- [x] [CC] Hardening: same-origin redirects only (Phase 3C-A)
- [x] [CC] Hardening: installations above read access are refused and the token deleted (Phase 3C-A)
- [ ] [O] Manual checks: VoiceOver, Reduce Motion and Reduce Transparency, R12 (full screen then ⌘4)

## Phase 3C-A: AI security and provider foundation ✅ (branch `claude/phase3c-ai-foundation`, awaiting owner review)

Report and Codex handoff: [docs/PHASE3C_AI_FOUNDATION.md](docs/PHASE3C_AI_FOUNDATION.md)

- [x] [CC] GitHub redirect protection and permission allowlist
- [x] [CC] Provider-neutral `AIProvider`, OpenAI-compatible adapter, offline mock, provider registry, Keychain keys via a native prompt
- [x] [CC] Streaming with `seq`, coalescing, cancellation, retries, limits, page-lifecycle cleanup
- [x] [CC] Context builder with sharing and private-repository preferences, `ai.previewContext`, injection fencing
- [x] [CC] Tool allowlist and approval policy (decisions only), voice route/interruption contracts
- [ ] [O] Manual: open the native key sheet in AURA.app; decide which cloud provider (if any) to try, and approve any cost
- [ ] [C] Phase 3C-C: conversation UI, provider settings, context preview and privacy controls (see the handoff in the document)
- [x] [CC] Phase 3C-B: project-aware conversations and tool execution (see below)
- [ ] [CC] Phase 3C-D: real voice (`SFSpeechRecognizer`, `AVSpeechSynthesizer`, CoreAudio route monitor)

## Phase 3C-B: Astra conversations, project context, read-only tools (branch `claude/phase3c-b-astra-intelligence`, awaiting owner review)

Report and Codex handoff: [docs/PHASE3C_B_ASTRA_INTELLIGENCE.md](docs/PHASE3C_B_ASTRA_INTELLIGENCE.md)

- [x] [CC] Host-owned conversations: provider/repository binding, explicit turn states, one `seq` per reply, cancel, bounded in-memory history
- [x] [CC] OpenAI-compatible tool calling; read-only GitHub tools with scope, privacy gate, approvals, timeouts and budgets
- [x] [CC] Context: README and selected files (line ranges), boundary fences, `consent_required`; `github.listFiles`
- [x] [CC] Contracts, Swift mirror, mock, fixtures, tests; `useReply` hook in `platform/`
- [ ] [CC] Checkpoint G (QA): Xcode Debug/Release, browser suites with axe, live check in AURA.app (recommended: Sonnet 5.5)
- [ ] [O] Approve (or not) a hosted-provider test that may cost money; until then hosted inference is unverified
- [ ] [C] Phase 3C-C: conversation panel, tool activity, approval dialog, context picker, provider settings (handoff §11)

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

## Phase 3C-C — Astra experience design checkpoint

- [C] Phase 3C-C design checkpoint (Phases 1–2): creative direction, component and motion specifications, additive semantic tokens, and an isolated browser design study at `frontend/astra-design.html`. See `frontend/design/ASTRA_EXPERIENCE.md`. Functional conversation/provider/consent integration and final Mac validation remain pending; prototype actions do not send AI requests or native approvals.
- [C] Design checkpoint verification: TypeScript and production build passed; existing bridge tests 16/16; prototype browser checks 13/13 with five zero-violation axe scans. Four desktop sizes inspected; original GLB checksum/attribution preserved. Mac M5 performance and live inference were not revalidated. Full evidence and next implementation steps: `docs/PHASE3C_C_ASTRA_EXPERIENCE.md`.

### Bridge request — Phase 3C-C active-reply restoration

- [CC] Consider extending `ai.getConversation` with an atomic active-reply snapshot containing `pendingApproval: AIApprovalRequest | null` (with the remaining lifetime) and the reply's sequence watermark. The current result has conversation info and turns, but no approval id/payload or `seq`. A reload or lost event during approval therefore cannot reconstruct a safe consent dialog, and an active `useReply` subscription starts without a snapshot cursor. Keep existing security, expiry and cancellation semantics. Until this lands, Codex will show a truthful restoration notice and offer Stop/send again rather than inventing approval state. No contract or native implementation was modified for this request.
