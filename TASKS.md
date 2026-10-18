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

### Phase 3C-D — voice implementation checkpoint (Codex, Phases 3–4)

- [x] [C] Continued from design commit `ce0fa3e` on `codex/phase3c-d-voice-experience`. Production native voice coordinator, Talk/Finish/Cancel/⌥Space/Esc, permissions, settings, output mute/stop/end/read-aloud, real event transcripts/captions, recovery and existing conversation/privacy synchronization are implemented. No browser audio capture or new native contract.
- [x] [C] Original Astra reacts to discrete voice phases and actual bridge levels through a stable sample channel. Existing jaw/floor ring only; one canvas, 14 draw calls, 79,802 triangles in the cloud test. Reduce Motion suppresses movement. Original GLB/checksum and CC BY credit preserved; native/shared/platform untouched; no new dependencies.
- [x] [C] Implementation checks: TypeScript/build pass, bridge 19/19, frontend controller 18/18, voice browser 18/18, Astra 29/29, Studio 28/28 with zero skipped. These browser suites have 16 zero-violation axe scans. Fixed unavailable-host automatic binding retries and short-window transcript crowding. Full evidence/screenshots and native Mac commands: `docs/PHASE3C_D_VOICE_EXPERIENCE.md`.
- [ ] [C/O] Required next checkpoint: **GPT-6 Astra / Extra High** for Phase 5 production visual audit. Then stop for Phase 6 **Luna / Medium** (full QA including GitHub) and Phase 7 **Sol / High** (engineering handoff). Mac hardware voice/permissions/VoiceOver and M5 performance remain pending; no Mac performance revalidation claim. No push, merge or /Applications changes.

### Phase 3C-D — voice quality checkpoint (Codex, Phase 5)

- [x] [C] Audited the running production voice UI from `bc9f92c`. Refined quiet/listening/output hierarchy, made Stop speaking primary, exposed mute in text, disabled silent Read aloud while muted, retained unsent-draft labels in short windows, and restored keyboard focus after temporary controls disappear. Captions now support keyboard scrolling; long captions retain at least 96 px of conversation space across all three layouts. No coordinator, native, platform, contract, 3D or dependency changes.
- [x] [C] TypeScript/build pass; voice controller 18/18; shared bridge 19/19; updated voice browser suite 20/20 with nine zero-violation axe scans. Coverage includes 12 long-caption layout/size combinations, Cancel/End/Stop focus, original GLB response and reduced motion. Final software-GPU sample: 2 fps, DPR 1, 14 draw calls, 79,802 triangles; no M5 performance claim. Original asset checksum and XRProfXR / CC BY 4.0 credit preserved. Before/after screenshots and exact evidence: `docs/PHASE3C_D_VOICE_EXPERIENCE.md`.
- [x] [C] Phase 6 complete: TypeScript/build, bridge 19/19, controller 18/18; voice 20/20, Astra 29/29, GitHub 23/23 and Studio 28/28 (zero skipped), 24 axe scans with zero violations. All four browser suites report no page errors or external requests. Original GLB SHA-256 and CC BY 4.0 credit verified. Evidence: `/workspace/aura-phase3c-d/phase6/` and `docs/PHASE3C_D_VOICE_EXPERIENCE.md`.
- [ ] [C/O] Required next checkpoint: manually switch to **GPT-6.1 Sol / High** for Phase 7 integrated engineering review and Claude Code handoff. Continue from Phase 6 without repeating completed work unless a new integration defect requires it. Native Mac microphone/speaker/Bluetooth/permission/VoiceOver and M5 performance acceptance remain pending. No push, merge or `/Applications/AURA.app` changes.

### Phase 3C-D — final frontend handoff (Codex, Phase 7)

- [x] [C] Phases 0–7 frontend work are complete locally on `codex/phase3c-d-voice-experience`; this supersedes earlier pending frontend model checkpoints above. Final review found no new implementation defect. Production source remains at `55914f157b99c5373939187f701c477552d9e933`; Phase 6 validation was recorded in `72ac207a157a62da0e32bc3d143237d5b67c0aa3`. Retained passing evidence: TypeScript/build, bridge 19/19, voice controller 18/18, 100/100 browser checks and 24 zero-violation axe scans. No test matrix restart for documentation changes.
- [x] [C] Final package/ownership checks pass: production entry/lazy chunks/local GLB/credit resolve; prototype is excluded; no production browser capture/synthesis or direct WebKit calls; native/shared/platform/assets and lockfile unchanged; no binaries or private-key/certificate files added. Corrected the Phase 6 final SwiftShader sample to **1 fps**, DPR 1, 14 draw calls, 79,802 triangles (Phase 5's earlier sample was 2 fps). No native performance claim.
- [x] [C] `docs/PHASE3C_D_VOICE_EXPERIENCE.md` contains the final file inventory, tests, screenshots, dependencies (none), known inherited approval-restoration limitation and exact Claude Mac checkout/build/validation instructions. No push, merge or `/Applications/AURA.app` modification.
- [ ] [O/CC] Owner review and explicit push approval, followed by native Release/Debug/Swift validation on the final reported commit. Physical mic/speakers/Bluetooth, OS permissions/indicator/settings, recognition fallback/assets, lifecycle, VoiceOver/Reduce Motion/Transparency, live provider/GitHub privacy and measured M5 ≥55 fps acceptance remain pending. Preserve the existing safe Stop/send-again path for an un-restorable approval; the atomic native snapshot request remains open. Stop after this handoff; no additional phase.

### Phase 3C-D — native voice integration validation (Claude Code)

- [CC] Review branch `review/phase3c-d-voice-validation` (from Codex `73b6ffd`). In-app validation with deterministic fixtures (`AURA_DEV_VOICE_PROBE`, real on-device recognition and synthesis, no microphone or speakers): all 15 methods and 6 events, lifecycle, tap and ⌥Space push-to-talk (a real key hold was also checked), one final per utterance, editable drafts, auto-speak of the exact stream, Stop/Mute/Esc/End, ten failure and permission scenarios, app hide and sleep, 60 fps while listening and speaking. No integration defects found. Report: `docs/PHASE3C_D_VOICE_NATIVE_VALIDATION.md`.
- [CC] Final regression complete on `5644ad9` (all suites and builds pass).
- [O/CC] Pending: physical microphone, Bluetooth, speaker playback, device switching, TCC prompts, the Sound › Input link, VoiceOver and system motion toggles; in-app GitHub/Keychain re-check on the new signature. Voice is not accepted until these pass.

## Phase 4 — Living Universe (Milestone 0)

- [x] [C] Fetched actual `origin/main` at `a67cda15538b16af4182c249bfc212ad39e41f38`; created `codex/phase4-living-universe` from it with a clean checkout, preserving merged native validation/speech clarity/Pause/Resume/Replay. Audit and safe vertical-slice migration plan: `docs/PHASE4_LIVING_UNIVERSE.md`. The six native ZoneIds stay inside the Project Hub; four frontend RoomIds form a separate spatial layer.
- [x] [C] Created the seven owner-requested world documents covering vision, proposed architecture, road map, existing/required assets, interaction map and Claude handoff. M0 has no runtime, dependency, binary, native/shared/platform or original asset changes. New assets, art direction and world features remain planned; no completed-room claim.
- [x] [C] Current-main baseline verification: typecheck/build pass, shared bridge 20/20, voice controller 19/19, original GLB inspection/hash preserved; focused browser 9/9 with all six cameras/one canvas, two zero-violation axe scans and no page errors/external requests/browser capture. Evidence/screenshots: `/workspace/aura-phase4/m0/`. Final software sample 7 fps/DPR 1/14 draw calls/79,802 triangles; no new M5 measurement. Existing deferred native audio/accessibility checks stay deferred.
- [x] [CC] **P4-N1 — world preferences landed** on `claude/phase4-native-foundation` (`94ae238`): `Preferences.world` {schemaVersion 1, presentation, floatIntensity 0–1, lightingPreset, cameraMode inspect/explore, lastRoomId} via the existing prefs methods/events; old rows get defaults, damaged values fall back per field, a newer schema is kept and not patched. TS/Swift/mock/fixtures/tests updated. **Codex frontend wiring steps: `docs/PHASE4_NATIVE_INTEGRATION.md` §5.** Room options remain session-only by design.
- [ ] [CC] **P4-N2 — WKWebView pointer-lock validation:** review user-gesture request/denial, Escape and focus restoration in Debug/Release on the trusted app origins. No current delegate was found. If a host hook is necessary, propose its contract/security behavior before implementation; no CSP/origin/permission weakening. Accessible room-map/inspect navigation remains available when pointer lock is unsupported.
- [ ] [CC] Phase 4 native M5 validation pending the four world GLBs (missing on this Mac; `tools/check-assets.sh` now blocks Release builds without them). Plan: `docs/PHASE4_NATIVE_INTEGRATION.md` §6.
- [ ] [C/O] Required checkpoint: stop after the M0 commit; manually switch to **GPT-6 Astra / Extra High** for M1 architecture/art direction, then perform M2 licensed asset/resource research before requesting Sol / Extra High for M3. Continue from this audit without repeated baseline work. No push/merge/app replacement or unreviewed skill/script installation.

### Phase 4 — art direction (Milestone 1)

- [x] [C] Dimensional connected-world plan, room/furniture/route and camera specifications, material/lighting palettes, Astra placement, HUD and hero-quality gates: `docs/WORLD_VISION.md`; original SVG/HTML/design-only JSON in `frontend/design/phase4/`. No runtime, native, dependency or asset changes.
- [x] [C] Plan bounds/connections and 909 clearance samples pass. Design sheet passes 1440×900 and 1100×700 layout checks and two axe scans. M0 application checks are retained; no new Mac performance claim. Continue M2 on Astra / High; stop for Sol / Extra High before M3.

### Phase 4 — research and blueprint (Milestone 2)

- [x] [C] Reviewed three official Khronos furniture GLBs with exact licences, source revision, hashes, dimensions, geometry/material/texture measurements and local render evidence. Preferred contemporary sofa, conditional accent chair, ornate sofa rejected. Research originals/screenshots stay outside Git. Detailed PC/peripheral/arcade acquisition remains unresolved; public HTTP catalogues return proxy 403 while Git research works. See `docs/WORLD_ASSET_INVENTORY.md`.
- [x] [C] Completed M2 portal/floor/collision/camera/loading/cache/input/monitor budgets and room action/game lifecycle blueprint. Reviewed official R3F/Three/Rapier/glTF-Transform/gltfjsx/meshoptimizer sources; no package, skill, native contract, runtime source or original Astra changes. Three physical destinations remain distinct; all original developer functions stay in the Hub.
- [x] [C] Typecheck/build pass; bridge 20/20, voice controller 19/19; updated plan 909 clearance samples; two final design-sheet browser layouts and two zero-violation axe scans; three isolated GLBs load without errors/external requests. No native Mac validation or new room performance claim.
- [ ] [C/O] **Required stop: GPT-6.1 Sol / Extra High, then CONTINUE for M3 Core Spatial World.** Continue from committed M0–2; implement Atrium + existing-Hub vertical slice and preserve all native functionality. M4 PC quality and M5 furnishing/game work remain pending. Do not push/merge/install or commit binaries without owner approval.

### Phase 4 — core spatial world (Milestone 3)

- [x] [C] Implemented frontend room/connection registry, bounded lazy Hub + Atrium, cancellable latest-intent loading/travel, single camera owner, safe orbit/zoom/cinematic paths, explicit pointer-lock WASD/E passage and real corridor collision. Accessible map remains usable on denial/WebGL failure. Living/Gaming remain planned/closed, not completed rooms.
- [x] [C] Developer/voice state stays mounted above rooms; project drafts/search, six native workspaces and original Astra/CC BY survive travel. Native/shared/platform/permissions/dependencies unchanged. TypeScript/build pass; bridge 20/20, voice 19/19, world unit 16/16, world browser 13/13, Studio 28/28; five zero-violation axe scans. Evidence and actual software GPU counters in docs/PHASE4_LIVING_UNIVERSE.md. No Mac performance claim.
- [ ] [C] Next M4 detailed workstation and reusable interactions on Sol / High, then separate furnished M5 rooms and M6 customization. Required stop after M6 for Astra / Extra High. P4-N1 preferences and P4-N2 native pointer-lock validation remain pending Claude. No push/merge/install/binary commit.

### Phase 4 — premium workstation (Milestone 4)

- [x] [C] Replaced weak workstation props with original authored GLB PCs/internals, furniture and peripherals; added resource owners/disposal/retry, material batches/instanced fan rotors, state-backed monitor atlas and reusable PC inspection/keyboard/action/exact return. Source/reproduction/provenance/manifest committed; generated GLB remains ignored. Original Astra/hash/CC BY and native/shared/platform/contracts/permissions are unchanged.
- [x] [C] TypeScript/build pass; bridge20/20, voice19/19, world18/18; equipment6/6, world13/13 and full Studio28/28 browser checks, seven zero-violation axe scans. Actual overview 51calls/250,204 rendered triangles, SwiftShader2–3fps/DPR1; native M5 ≥55fps remains pending. Evidence and asset stats in seven world docs.
- [ ] [C] Next M5 separate furnished Living/Gaming and honest game interface, then M6 bounded session customization/motion. Same Sol / High model remains suitable. Required stop after M6 for Astra / Extra High; no push/merge/install/binary commit.

### Phase 4 — separate rooms (Milestone 5)

- [x] [C] Furnished separate Living/Gaming modules with reviewed unchanged licensed sofa/chair and original modeled room kit/arcade; scoped resource owners, correct side corridors/closed doors/colliders, real session lamp/curtain/palette controls, object/media information and visible furniture credits. Game registry/interface includes only upcoming metadata; no installed game or false Play/save claim. Native release handshake uses existing voice methods only.
- [x] [C] TypeScript/build and grouped bridge pass; voice19/19, world20/20, game6/6; rooms browser8/8 with six zero-violation axe scans, twelve cross-room visits and missing-sofa recovery. No page errors/external requests. Actual Living48calls/113428tris, Gaming66calls/80548tris; software FPS reported in docs, no M5 native acceptance. Original Astra/hash/CC BY and native/shared/platform/permissions/contracts unchanged; all GLBs ignored.
- [ ] [C] Continue M6 on Sol/High for bounded global presentation/light/motion controls. Stop after committed/verified M6 for Astra/Extra High. M7 visual and M8 broad regression/native acceptance remain pending. No push/merge/install/binary commit.

### Phase 4 — presentation and customization (Milestone 6)

- [x] [C] Implemented validated session-only schema1 static/floating/hybrid, finite intensity, room daylight/sunset/night, world/native/system motion priority and approved collision-safe chair slots. Original monitor stands/panels separated, bodies instanced, screen planes share one atlas; real front fan rings/rotors visible and gated. Original Astra parent contact corrected without changing its licensed GLB/rig/voice. No native/shared/platform/contracts/permissions/lockfile changes.
- [x] [C] Reproduced/fixed DOM-versus-R3F GLB release race with rendered-room pins and owned instance-buffer cleanup. Unchanged twelve-visit test now passes, Living32geometries/20textures rather than stale retired meshes. TypeScript/build, bridge20/20, voice19/19, world22/22, games6/6; customization8/8 and rooms8/8 with eight zero-violation axe scans. Final equipment6/6, world13/13 and fullStudio28/28 also pass after the fix: browser63/63,15zero-violation axe scans and no page errors/external requests. Counter evidence is in the phase report; no M5 native claim.
- [ ] [C/O] **Required stop after M6: GPT-6 Astra / Extra High, then CONTINUE for M7 actual visual audit.** Review dock occlusion/material grain/room and preset consistency; preserve all existing features. M8 full legacy browser QA and portal-view/native performance optimization, M9 engineering handoff and Claude native acceptance remain pending. Atrium+Hub75calls and Gaming+Atrium72calls need profiling; no Mac55fps claim. No push/merge/install/binary commit.
