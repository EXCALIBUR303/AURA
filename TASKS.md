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

### Phase 3C-C — implementation checkpoint (Phases 3–4)

- [C] Production conversation workspace, compact/expanded/focus layouts, native history/stream/cancel/error recovery, explicit repository/branch/file context and exact-text preview, host-issued consent, provider configuration and native key-sheet triggers implemented on `codex/phase3c-c-astra-experience`. Phases 3–4 implementation checkpoint and Phase 5 functional/accessibility QA complete locally: TypeScript/build pass; bridge 16/16, Astra 27/27, studio 28/28 and GitHub 23/23; 14 axe scans with zero violations; production smoke passes. QA fixed narrow focus heading overlap. See `docs/PHASE3C_C_ASTRA_EXPERIENCE.md`. Phase 6 design audit (GPT-6 Astra EXTRA HIGH) and Phase 7 final integration/handoff remain pending; no push or merge.
- [C] Preserve one Canvas/GLB, cached GPU strings, adaptive DPR, background/hidden policy and original model credit. Added reversible exact camera capture, pointer hover emphasis, and camera revision/sample timestamps. No added scene geometry, lights, or postprocessing. Mac M5 performance still requires native validation.
- [CC] Architecture stack-table update requested (root-document ownership): frontend now uses `react-markdown` 10.1 + `remark-gfm` 4.0 for React AST Markdown/GFM with raw HTML and remote images disabled; `lowlight` 3.3 + `highlight.js` 11.12 supply safe syntax ASTs with only seven bundled grammars. Code parsing is lazy, streaming parses are coalesced, and no extra animation/state framework was added. Reasons are also recorded in the Phase 3C-C handoff and implementation commit.
- [C/CC] The frontend coordinator uses the existing exported `newReply`/`applyReplyEvent` folder with subscriptions installed before send and a bounded pre-return buffer. The platform's `useReply(streamId)` alone cannot collect events before that id resolves. Native conversations remain authoritative; no native/shared/platform files were changed. Consider incorporating this buffering and snapshot-sequence restoration into the platform hook alongside the snapshot request above.

### Phase 3C-C — Phase 6 design audit checkpoint

- [C] Phase 6 complete locally: corrected welcome-view scrolling and spacing, bounded keyboard-scrollable code, aligned composer focus, visible compact activity feedback, tool disclosure motion, and a two-column Projects inspector at minimum desktop sizes. Project drafts and existing native interactions preserved. No scene/native/contract/dependency/asset changes.
- [C] Verification: TypeScript/build pass; bridge 16/16, Astra 27/27, GitHub 23/23 and unfiltered studio 28/28, zero skipped; 15 axe scans with zero violations. Production screenshots show the original GLB/idle, one canvas and no page/network failures. Before/after evidence and exact results are in `docs/PHASE3C_C_ASTRA_EXPERIENCE.md`. Mac M5 performance was not revalidated.
- [C/O] Next checkpoint: manual switch to GPT-6.1 Sol HIGH for Phase 7 integrated release review and Claude Code handoff. Continue from `codex/phase3c-c-astra-experience`; no repeated implementation, push, merge or Phase 3C-D voice work. Native Mac acceptance and the active-approval snapshot request remain pending.

### Phase 3C-C — Phase 7 final frontend handoff

- [C] Phases 0–7 frontend work complete locally. Final integration fixed a confirmed startup error: Refresh now retries provider/preferences/session initialization without losing the draft or automatically sending. Functional code checkpoint: `6beade13b305600823355d702beeb585ef89573f` on `codex/phase3c-c-astra-experience`.
- [C] Final evidence: Phase 7 TypeScript/build and 16 bridge tests pass; Astra 28/28, zero skipped; retained Phase 6 GitHub 23/23 and studio 28/28, zero skipped. Current combined evidence has 16 zero-violation axe scans. Targeted Keep/Reset/End and production HTTP-with-native-CSP/lazy-chunk/GLB checks pass. Original source and built model checksums match. No native/shared/platform changes or push/merge. Full acceptance table, screenshots and exact Mac instructions: `docs/PHASE3C_C_ASTRA_EXPERIENCE.md`.
- [CC] Native optional soak maintenance: `macos/Sources/AuraApp/DevProbe.swift` still uses `HTMLInputElement.prototype.value` for `#companion-prompt` (now a textarea) and old `.reply`/`.companion-reply` counters. Update its setter and count `.conversation-turn`/`.assistant-markdown`, then validate the soak. The six-zone diagnostics sampler is unaffected. Do not count the old conversation soak as passing.
- [O/CC] Pending: owner review and explicit push approval; final-branch native Debug/Release/Swift tests, real provider/Keychain/GitHub/tools/human consent, system accessibility/window integration and measured M5 ≥55 fps acceptance. The atomic pending-approval snapshot and architecture dependency documentation requests remain open. Stop here; Phase 3C-D voice has not started.

### Phase 3C-C — native Mac validation (Claude Code)

- [CC] Native validation checkpoint 1 on `review/phase3c-c-validation` (from Codex `db5bb30`): Release `AURA.app` on the M5 through the real bridge. Conversations, Stop, Keep/Reset/End, drafts, project binding, privacy enforcement, live Ollama tool execution, consent allow/deny, provider settings, native Keychain sheet, errors, layouts, title-bar drag and full screen pass. 60 fps in all six zones and while streaming or switching layouts. Results: `docs/PHASE3C_C_NATIVE_VALIDATION.md`.
- [CC] Fixed: D1 tool paths with surrounding slashes (`AITools.swift`), D5 soak probe selectors plus a conversation performance pass (`DevProbe.swift`). Architecture stack table now lists the Markdown/syntax dependencies.
- [C] Review requested — fixed on the review branch in Codex-owned files: D2 removed provider stays selected with no recovery (`useConversation.ts`, new Astra check), D3 zone heading unreadable over the scene above 1250 px (`experience.css`), D4 "cloud environment" copy in provider settings (`ProviderSettings.tsx`).
- [O] Pending: system VoiceOver / Reduce Motion / Reduce Transparency run with the owner, hosted inference (cost approval), dev-configuration pass, final regression and merge decision.

## Phase 3C-D — Astra voice (branch `claude/phase3c-d-voice`, not pushed)

Implementation, contract and Codex handoff: [docs/PHASE3C_D_VOICE.md](docs/PHASE3C_D_VOICE.md). Plan and D0 findings: [docs/PHASE3C_D_VOICE_PLAN.md](docs/PHASE3C_D_VOICE_PLAN.md).

- [x] [CC] Native voice host: sessions, push-to-talk / auto end, on-device SpeechAnalyzer (microphone permission only) with SFSpeechRecognizer fallback, sentence-by-sentence TTS of streamed replies, input-health timeouts per device type, device-change and lost-input handling, interruptions, cleanup and shutdown
- [x] [CC] Contracts, Swift mirror, fixtures, mock voice flow (`voiceGranted`, `voiceIssue` options), 59 voice tests including real on-device recognition of prerecorded speech
- [ ] [O/CC] Deferred physical acceptance (owner present): built-in mic/speakers, Bluetooth earbuds, device switching, speaker playback, mic indicator, permission prompts, Sound-input settings link, echo test, fps while speaking, VoiceOver (handoff §8). None of these has passed yet.
- [ ] [C] Voice UI/UX (GPT-6 Astra, Extra High, then GPT-6.1 Sol High): handoff §9. Replace the "Voice unavailable" copy and tests; Talk/⌥Space/Esc, transcript in composer, speakReply, issue recovery, Astra animation from `voice.inputLevel` / `voice.speechLevel` / `voice.speechProgress`. No hands-free barge-in.
- [ ] [CC] After the UI lands: install the new build in /Applications only after native validation passes.

### Phase 3C-D — voice design checkpoint (Codex, Phases 0–2)

- [x] [C] Verified remote `claude/phase3c-d-voice` at `4087d11a9a377232e0f7acb40ec75a620f837969`; created `codex/phase3c-d-voice-experience` from that exact tip, preserving merged 3C-C validation fixes. Reviewed all 15 methods, six events, native controller/wiring, shared mock/fixtures, conversation send path and original rig.
- [x] [C] Creative direction and component specifications: integrated voice rail, 17 state/recovery snapshots, permission/keyboard/session/transcript ordering design, voice settings and real-event reaction mapping. Isolated `frontend/voice-design.html` prototype uses labelled shared fixtures and one original Studio. It captures no audio, sends no messages and refuses the native bridge. Specification: `frontend/design/VOICE_EXPERIENCE.md`.
- [x] [C] Design checkpoint checks: TypeScript/build pass; bridge 19/19; prototype browser 13/13, with nine zero-violation axe scans; final layout recheck 6/6 with three further zero-violation axe scans. Screenshots and evidence are listed in `docs/PHASE3C_D_VOICE_EXPERIENCE.md`. GLB SHA-256/CC BY attribution preserved; no production/native/shared/platform or dependency changes. No native Mac performance claim.
- [ ] [C/O] Required checkpoint 1: manually switch to GPT-6.1 Sol / High, then continue Phases 3–4 from this branch. Production voice integration, actual event-driven Astra reactions and final functional QA remain pending. Stop before Phase 5 (Astra / Extra High), Phase 6 (Luna / Medium), and Phase 7 (Sol / High) for the owner's switches. No push/merge or /Applications changes.
