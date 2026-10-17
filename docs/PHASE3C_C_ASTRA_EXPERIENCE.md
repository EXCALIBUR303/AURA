# Phase 3C-C — Astra experience

Current checkpoint: **Phases 3–6 are complete locally. Next: Phase 7 final
integration and handoff, GPT-6.1 Sol HIGH.** Keep this branch and completed work.
Native acceptance remains pending. Nothing is pushed or merged.

## Design checkpoint: Phases 1–2

Branch: `codex/phase3c-c-astra-experience`.
Verified native base: `8519fdefac1da9ff9b4987503ac66a228e157136`
(`origin/claude/phase3c-b-astra-intelligence`).

Design checkpoint commit: `8e4087bfcf6cc3e977269f72b6a981a233ccf8c8`.
The production implementation checkpoint is recorded below. Final QA, design audit
and native handoff remain separate steps in the owner's model schedule. Nothing has
been pushed or merged.

## Direction and deliverables

The room establishes place; a purpose-specific working pane holds the task. Warm
porcelain, evergreen text, restrained teal actions, cobalt keyboard focus, and fine
structural rules evolve AURA's existing light identity. Expanded conversation sits
beside the room. Focus mode retains Astra in a narrow scene column and gives code a
wide reading area. Projects use the available height, with no dock obscuring cards.

- [Design blueprint](../frontend/design/ASTRA_EXPERIENCE.md): inspected strengths and
  problems, layout dimensions, component states, motion inventory, keyboard rules,
  native contract mapping, recovery semantics, and implementation order.
- [Design tokens](../designs/design-system/tokens.css): additive semantic colours,
  type, controls, surfaces and elevation. Existing token values remain intact.
- [Isolated design entry](../frontend/astra-design.html): served by the existing
  Vite dev server at the `/astra-design.html` path. It is not a production route
  and is not included in the normal production entry build.
- [Prototype source](../frontend/src/design-preview/AstraDesignPreview.tsx) and
  [styles](../frontend/src/design-preview/preview.css): compact/expanded/focus,
  context, consent, providers, tool disclosure, projects, empty and recovery views.
- [Prototype browser checks](../frontend/test/design.browser.mjs): layout, state
  preservation, keyboard, accessibility, attribution and read-only mock behaviour.

## Evidence boundaries

The prototype uses the existing R3F `Studio` and original Astra GLB. Repository,
provider, and file-path examples come from the existing browser mock via the typed
bridge. The page refuses native transport. Authored conversation/code specimens are
labelled, and all consent/provider actions are explicit local previews. It sends no
AI messages, credentials, approvals, provider saves, or GitHub mutations.

The prototype demonstrates draft preservation and layout transitions. Full cursor/
scroll restoration, exact previous-camera-pose restoration, real Markdown parsing,
streaming, cancellation, provider checks and native consent belong to Phase 3/4.
The current static code specimen is hand-authored syntax markup, not a Markdown
renderer or a model-generated answer.

The model is unchanged: SHA-256
`e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1`.
Original 72-joint rig, `Idle02_F` clip, mesh, textures and source attribution remain.
No new dependencies, fonts, CDN requests, geometry, lights, or postprocessing.

## Verification at this checkpoint

Final results are recorded below from the design review run. Browser screenshots
and machine-readable results are stored outside the repository in
`/workspace/aura-phase3c-c/design-final/`; no binary screenshots are committed.
The prior implementation baseline is in `/workspace/aura-phase3c-c/phase0/`.

| Check | Result |
| --- | --- |
| TypeScript | Passed: `tsc -p tsconfig.json && tsc -p tsconfig.node.json` |
| Existing bridge tests | 16/16 passed |
| Production build | Passed; isolated prototype is not a production entry |
| Prototype interaction/browser checks | 13/13 passed; no observed page errors, HTTP failures, or external asset requests |
| Automated accessibility | 5 scans passed, zero violations: context, consent, providers, Projects and expanded conversation; axe enabled, WCAG A/AA |
| Short-window dialogs | Context, consent and provider-form actions remain within 1100×700; bodies scroll independently |
| Semantic colour pairs | Checked: all 11 text pairs ≥4.5:1; control border 3.15:1 |
| Original GLB checksum and visible attribution | Verified |
| Native app / live AI / M5 performance | Not revalidated in this cloud checkpoint |

The initial keyboard run found that Tab could leave the last consent action. The
prototype now explicitly wraps modal focus; the final run verifies this correction.
Seventeen screenshots were captured across the requested desktop sizes and design
states. Visual inspection covered the compact room, expanded and focus conversation,
code, context/consent/provider dialogs, recovery state, and the 1100×700 Projects
layout. These are design-prototype images, not completed production UI screenshots.

Changed files at this checkpoint:

```text
TASKS.md
designs/design-system/tokens.css
docs/PHASE3C_C_ASTRA_EXPERIENCE.md
frontend/astra-design.html
frontend/design/ASTRA_EXPERIENCE.md
frontend/src/design-preview/main.tsx
frontend/src/design-preview/AstraDesignPreview.tsx
frontend/src/design-preview/preview.css
frontend/test/design.browser.mjs
```

The main application entry, existing scene source, `frontend/src/platform`,
`shared`, `macos`, package manifest and lockfile have no changes. The production
build still transforms 1,007 modules and excludes `astra-design.html`; its stylesheet
contains the additive tokens. Full production studio/GitHub browser suites were not
rerun for this isolated design checkpoint; their Phase 3 regression run is pending.

To reproduce browser checks, use the same external Playwright/Chromium/axe setup as
the existing studio suite, start the documented Vite development server, then run:

```bash
AURA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
AURA_AXE_MODULE=/absolute/path/to/@axe-core/playwright/dist/index.mjs \
AURA_CHROMIUM_PATH=/absolute/path/to/chromium \
AURA_ARTIFACTS=/tmp/aura-astra-design \
node frontend/test/design.browser.mjs
```

Set `AURA_SOFTWARE_GPU=1` only for the cloud software-rendering configuration.
Those frames are not Mac M5 performance evidence. Tests require axe rather than
silently skipping accessibility. Use the review strip to inspect each prototype
view at 1100×700, 1280×800, 1440×900 and 1728×1117.

## Native contract question and preserved guarantees

`ai.getConversation` does not return an outstanding approval or stream sequence
watermark. A reload during consent cannot restore the approval id safely. A concrete
request for an atomic active-reply snapshot was appended to `TASKS.md`; no shared,
platform or Swift files were edited. Until it is implemented, use a clear recovery
state with Stop/send again. Never infer approval from a checkbox or model text.

Continue to use `useReply`, `ai.conversationChanged`, explicit repository binding,
native private-source policy, and the native secure key sheet. Only the implemented
OpenAI-compatible adapter and built-in mock may be offered. Conversation history is
in-memory for the app session, not durable. Voice capture remains Phase 3C-D.

The existing 3C-B report §9 records completed native QA, despite the older unchecked
Checkpoint G task in `TASKS.md`. Treat that as historical baseline evidence, not new
3C-C validation. Human approval flow, live hosted inference, and this new UI still
need native validation.

## Historical design-to-implementation handoff (completed)

At the design checkpoint the requested model was GPT-6.1 Sol with HIGH effort.
The following Phases 3–4 implementation steps have now been carried out:

1. Production shared controls/layout shell and purpose-specific panes.
2. Native conversation coordinator, restoration, streaming and cancellation.
3. Context picker/preview, tool cards and authoritative consent states.
4. Provider settings, non-secret configuration and native key-sheet trigger.
5. Safe Markdown and local syntax highlighting with justified dependencies.
6. Scene state isolation, reversible camera focus, spatial interaction polish.
7. Required integration checks and a local implementation commit, then stop for
   the mandated GPT-6 Luna MEDIUM QA switch.

Preserve file ownership, existing GitHub functionality, graphics lifecycle/DPR
diagnostics, and the original GLB. Append task status accurately. Do not push, merge,
or begin voice development. Final native validation on the Mac remains required.

## Production implementation checkpoint: Phases 3–4

Production AURA now uses the design direction: compact companion dock, expanded
conversation beside the room, and a wide focus reading view with Astra retained in
the scene. A single mounted conversation workspace keeps drafts and scroll state
across layout changes. The project inspector uses the right-pane slot in compact
mode. At 1100 px the full-height Projects collection can switch to an inspector
subview. No floating conversation dock obscures its repository cards.
Compact positioning explicitly spans the workspace grid; bounds and pointer access
are checked at all four desktop sizes with and without the inspector. Sending a
message preserves focus mode instead of implicitly restoring the previous room.

### Implemented behaviour

- Host-owned session history, New/Reset/End, provider/model selection, progressive
  replies, Stop, partial cancellation, typed errors, and explicit Send again.
  Send again is a new native turn, never an automatic retry or replacement.
- Explicit repository/branch binding. Selecting an explorer card is separate from
  changing conversation context. The inspector and top project chip open the
  selected project as a candidate; the native binding changes only on confirmation.
- Workspace/metadata/commit/note/README context, up to five explicit files with line
  ranges, searchable bounded path listing, and an exact plain-text context preview.
  Privacy preferences are real native preferences. They never substitute for consent.
- Actual read-only tool cards, native source references, and host-issued consent
  with safe initial focus, expiry, Deny, scoped Allow, and Stop inside the dialog.
  A decision receipt is distinguished from tool completion.
- OpenAI-compatible provider forms, model-list checks, native key-sheet request,
  derived credential state, default provider preference, and confirmed removal.
  Built-in mock is read-only and labelled. No frontend key input or secret value.
- Safe Markdown/GFM and locally highlighted code with wrap/copy; raw HTML, remote
  images and unsafe link protocols are disabled. Preview context stays plain text.
- Full-height GitHub explorer, shared branch selection with the inspector, existing
  repository search/filter/sort, assignment, notes, pinning and connection states.
- Searchable command dialog with keyboard navigation, accessible modal focus loops,
  visible focus, reduced motion/transparency, and short-window scrolling dialogs.
- Real camera capture/restore on entering/leaving focus, reversible previous view,
  existing accurate hit proxies, and restrained workstation hover colour feedback.

### Stream ordering and recovery

The frontend uses the existing platform exports `newReply` and `applyReplyEvent`.
Subscriptions are present before `ai.sendMessage`; a bounded buffer retains events
that arrive before the returned stream id. This addresses a limitation of invoking
`useReply(streamId)` only after the id resolves. It does not replace the host engine
or redefine turn/tool state transitions. The platform-hook enhancement is requested
in `TASKS.md`, with no edits to platform/shared/native ownership.

Gaps and restored active replies reconcile against `ai.getConversation` while
active. If the send reply is lost, a snapshot discovers the actual active stream,
so Stop still cancels it; the frontend never automatically sends the prompt again.
The Stop and Send buttons have distinct DOM identities, preventing a Stop click
from becoming a form submission when native cancellation completes immediately.

An outstanding approval cannot be reconstructed from the current snapshot contract.
If its actual event is received, that host-issued payload can be presented. If it
was lost before reload, the UI explains the limitation and offers Stop/send again.
No approval id, path permission, or successful decision is inferred.

Private content is removed from frontend views on GitHub access change, with stale
response guards. Endpoint/provider changes require a new conversation. Host privacy,
installation access, read-only allowlists and Keychain remain authoritative.

### Rendering and performance boundaries

No new scene geometry, lights, shadows, postprocessing or avatar instances were
added. Existing shader/ring reuse, cached GPU renderer strings, adaptive DPR, and
full/30 fps/hidden window rendering policy remain in place. Stream text stays below
the scene owner; the room receives only discrete companion states. Text replies do
not activate voice or fabricate lip sync.

Only eight transcript turns render initially; earlier messages load in batches of
eight. Native history remains bounded by its own limits. Streaming Markdown AST
work is coalesced to at most ten updates/second, completion flushes immediately,
and collapsed/hidden panes run no parsing interval. Long/unknown code blocks remain
plain text rather than invoking an expensive grammar. Resize observation follows
new text only while the reader remains at the tail; scrolling upward suspends it.
Stable Markdown renderer identities preserve code wrap/copy state as text streams;
a targeted live-stream check confirms Wrap stays enabled as the block grows.

Markdown, context controls and provider settings are lazy local chunks. The build
warning encountered before splitting was resolved without increasing its threshold.
The final build sizes and browser measurements are recorded with final results.
Camera diagnostics add revision and sample timestamps so checks distinguish a fresh
post-gesture pose from an intermediate one-second sample.

The original GLB checksum above is unchanged. Visible full title, author, source and
CC BY 4.0 credit remain in the production footer. No binary assets are committed.
Mac M5 frame rate, WKWebView behaviour and live hosted inference are **not** verified
by this cloud checkpoint.

### Dependencies and ownership

`react-markdown` 10.1 and `remark-gfm` 4.0 provide maintained AST rendering/GFM.
`lowlight` 3.3 and `highlight.js` 11.12 provide safe syntax ASTs; only JavaScript,
TypeScript, JSON, Python, Swift, C/C++ and shell grammars are bundled. No raw HTML
injection, CDN assets, extra animation framework, or new state framework was added.
The architecture stack-table update is requested from Claude in `TASKS.md` because
root architecture ownership remains native-side.

Changed production paths: `frontend/src/App.tsx`, `experience.css`, `companion/*`,
`components/ui.tsx`, `components/Inspector.tsx`, GitHub selection/detail/explorer
files, studio camera/hover/diagnostic files, frontend manifest/lockfile and browser
checks. `shared/**`, `macos/**`, `frontend/src/platform/**`, and original assets have
no changes. The isolated design prototype remains as a reference.

### Verification and remaining work

Production results and screenshots are outside the repository under
`/workspace/aura-phase3c-c/`: `astra-final`, `github-regression`, `studio-final`,
and `production-final`. `production-review` retains the earlier multi-size captures;
its compact screenshot predates the grid-position correction. Use `production-final`
for the corrected compact dock and focus reply. No binary images are committed.

| Check | Result |
| --- | --- |
| TypeScript | Passed: both app and Node configurations |
| Bridge integration | 16/16 passed; shared tests unchanged |
| Production build | Passed, 1,059 modules, no chunk warning |
| Astra browser integration | 27/27 passed, zero skipped; includes focus-send and compact-dock bounds regressions |
| Studio browser regression | 28/28 passed, **zero skipped** |
| GitHub browser regression | 23/23 passed, zero skipped |
| Accessibility | axe enabled: six Astra scans, six GitHub scans and two studio scans; all 14 have zero violations |
| Streaming code controls | Targeted check passed: Wrap state persists while a code block grows |
| Production smoke | Passed: GLB loaded, one canvas, four-size compact bounds, preserved draft and focus-mode reply; zero page errors or failed HTTP responses |
| Original asset and ownership | GLB SHA-256 unchanged; no shared/native/platform changes |
| Mac M5, real Keychain, live inference | Not run in this cloud checkpoint |

The unfiltered studio run exercises the actual GLB and idle rig, all six zones,
3D clicks, orbit/zoom/reset, exact camera restoration, shortcuts, project persistence,
text streaming/cancellation, attribution, minimum-window keyboard/layout behaviour,
context loss, missing-model retry and unavailable WebGL. Camera/tail targeted runs
explicitly skipped unrelated checks and are not counted as full regression results.

Initial JavaScript is 1,357.68 kB (377.26 kB gzip). Lazy Markdown/code is 214.36 kB
(66.18 kB gzip), context 11.02 kB (3.72 gzip), providers 8.55 kB (2.87 gzip), and CSS
53.34 kB (11.69 gzip). No existing locked dependency versions changed; 104 dependency
entries were added for Markdown/GFM and syntax ASTs.

The final production cloud sample reports **6 fps, 14 draw calls, 79,802 scene
triangles, DPR 1**, using Chromium WebGL2 through ANGLE/SwiftShader software rendering.
This is an observed diagnostic sample, not an Apple GPU benchmark or evidence of
the M5 ≥55 fps requirement. Earlier screenshots show the changing live sample.
The original idle clip loaded successfully; the studio suite separately verifies
the 72-joint rig, animation progress, and visible author/source/CC BY attribution.

Phase 5 visual review found the focus heading covered Astra's head at 1100×700.
The responsive heading now keeps its title and reset action and hides the redundant
eyebrow and caption only in narrow focus mode. The regression checks these states,
the title's visibility and captures the production result. Screenshots also cover
compact and expanded 1440px, focus/code at 1440px, project inspector, providers,
context and consent under simulated native transport. Phase 6 should inspect long
transcripts, dialog transitions and the overall visual balance.

Reproduce frontend checks with Node 23.6+ and the existing external browser setup:

```bash
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
# With Vite running and Playwright, Chromium and axe configured as above:
npm --prefix frontend run test:astra
npm --prefix frontend run test:github
npm --prefix frontend run test:browser
```

At the Phase 5 checkpoint, the next scheduled step was the **GPT-6 Astra, EXTRA HIGH**
design audit of narrow focus framing, long transcripts and dialog transitions.
That audit is recorded in the Phase 6 section below. The owner's Sol High Phase 7
integration checkpoint follows it. No push or merge is approved.

Native Mac validation remains pending for:

1. Xcode Debug/Release, native bridge parity/Swift tests, and embedded lazy assets.
2. Real provider configuration, native secure key sheet/cancellation, and model-list
   checks. Hosted inference requires the owner's cost approval and a configured key.
3. Live streaming, Stop, history restore, source tools and human consent in AURA.app,
   including GitHub expiry/account changes and privacy tightening mid-session.
4. Native menus/shortcuts, title-bar dragging, focus return, Voice unavailable
   presentation, system accessibility/Reduce Motion/Reduce Transparency and VoiceOver.
5. All six zones at 1100×700, 1280×800, 1440×900 and 1728×1117, including long code
   and history, context/provider dialogs and project inspector subviews.
6. Comparable frontmost Apple GPU samples per zone at the validated DPR settings:
   ≥55 fps acceptance, target 60; frame-time tails, draw calls/triangles, inactive
   30 fps and hidden suspension. Record these as new M5 evidence only after running.

The current native snapshot limitation, local-model tool reliability, session-only
history, unsupported content search and unavailable voice are disclosed limitations,
not implemented capabilities. Phase 3C-D voice work has not started.

## Phase 6 — final design audit

This pass starts from Phase 5 commit
`2639512a5da6d1226c6c041030a2b7a842a57617` on the same feature branch. It refines
production components, preserving the existing spatial composition and native
integration. No scene, native service, bridge contract, dependency or asset changed.

### Findings and corrections

| Observed issue | Completed refinement |
| --- | --- |
| Opening an empty conversation followed a nonexistent message tail, clipping the welcome mark. The mark and eyebrow also competed on one line. | Empty conversations now start at the top, including after host restoration. The mark, eyebrow and heading have separate rows and reduced vertical spacing. Suggestions remain keyboard reachable at 1100×700. |
| Long generated code occupied an unbounded transcript area. | Code has a bounded, independently scrollable reading area with an inset keyboard focus ring. Wrap, full-text Copy and streaming controls are preserved. |
| At 1100px the full-width inspector stacked a duplicate project list above the selected repository. | The inspector uses a fixed summary, a 260px project list and a separate scrolling detail column. Repository details open above the fold; notes survive closing/reopening the inspector. The close action uses the shared icon button. |
| Composer focus drew nested outlines; the compact status label disappeared at smaller window widths. | Focus surrounds the composer as one control group. Readable status remains visible at the minimum size. Approval and tool states retain text and use distinct restrained indicator colours. |
| Expanded tool details had the same disclosure direction as collapsed details. | The chevron follows open state with a short rotation, covered by the existing Reduce Motion override. |

The review retained the warm light surfaces, evergreen typography, original room,
visible Astra, and compact/expanded/focus relationships. Fresh context and provider
dialogs, long transcripts, source disclosures and consent were inspected. No
additional decorative effects or scene complexity were justified.

### Changed files and evidence

- `frontend/src/companion/CompanionWorkspace.tsx`: empty-view scroll handling only.
- `frontend/src/components/Inspector.tsx`: layout containers and shared close button.
- `frontend/src/experience.css`: the visual changes above.
- `frontend/test/astra.browser.mjs`: welcome positioning, keyboard suggestions and
  composer focus, bounded code scrolling and complete clipboard output.
- `frontend/test/github.browser.mjs`: minimum-window detail placement, keyboard
  close, preserved notes and an additional inspector accessibility scan.
- This document and an append-only `TASKS.md` checkpoint.

Evidence is stored outside Git under `/workspace/aura-phase3c-c/`. Before/after
comparisons use the following artifacts; they contain only labelled mock data.

| View | Before this audit | After this audit |
| --- | --- | --- |
| Expanded welcome, 1440×900 | `production-review/expanded-empty-1440.png` | `phase6-production/expanded-1440.png` |
| Project inspector, 1100×700 | `production-review/project-details-1100.png` | `phase6-production/inspector-1100.png` |
| Focus conversation | `production-final/focus-code-1440.png` | `phase6-production/focus-code-1440.png` (longer code sample) |

Additional captures in `phase6-production` show the 1100px welcome and focus views,
1440px studio/inspector, and fresh context/provider dialogs. The Astra/GitHub test
screenshots use a simulated native transport with the window deliberately hidden
to suspend software rendering; those blank canvases are not studio-render evidence.
Use the production captures and studio suite for actual room/GLB rendering.

### Phase 6 verification results — 2026-10-17

| Check | Result |
| --- | --- |
| `npm --prefix frontend run typecheck` (also invoked by build) | Passed, app and Node configurations |
| `npm --prefix frontend test` | 16 passed; 0 failed, cancelled, skipped or todo |
| `npm --prefix frontend run build` | Passed, 1,059 modules, no chunk warning |
| Astra browser suite | 27 passed, 0 skipped; `phase6-astra/results.json` |
| GitHub browser suite | 23 passed, 0 skipped; `phase6-github/github-results.json` |
| Studio browser suite, unfiltered | 28 passed, 0 skipped; `phase6-studio/results.json` |
| axe WCAG A/AA scans | 15 scans (6 Astra, 7 GitHub, 2 studio), 0 violations |
| Production capture/smoke | Original GLB and `Idle02_F` loaded, one canvas, 0 page errors and 0 failed HTTP responses; `phase6-production/results.json` |
| Asset/ownership | Original GLB SHA-256 unchanged; no diff from native base in `shared/**`, `macos/**`, `frontend/src/platform/**` or `assets/**` |

The final build contains initial JS **1,357.84 kB / 377.21 kB gzip**, CSS **55.72 /
12.06**, Markdown **214.36 / 66.18**, context **11.02 / 3.72**, and providers **8.55 /
2.87**. This pass added no dependencies. The refreshed full studio run includes
avatar rig/idle, navigation, camera restoration, keyboard interaction, project
persistence, context loss and missing-model/WebGL recovery.

The production diagnostic sample was **2 fps, 14 draw calls, 79,802 scene triangles,
DPR 1**, on ANGLE/SwiftShader software rendering. The studio suite was running
concurrently; this is rendering evidence, not a comparative performance benchmark.
No 3D rendering code changed in Phase 6. Mac M5 performance was **not revalidated**.

Phase 6 is complete. Stop here for the manual switch to **GPT-6.1 Sol HIGH**.
Phase 7 should use this branch and current evidence for final integrated review,
remaining acceptance accounting and the Claude Code native validation handoff.
Repeat checks only when changes, failures or unresolved concerns require it. Do not
restart implementation, push/merge without approval, or begin Phase 3C-D voice.

Native Mac acceptance listed above remains pending. Cloud screenshots and mock-host
tests do not establish live inference, Keychain behaviour, VoiceOver/WebKit behaviour
or the Mac M5 ≥55 fps target. The outstanding-approval snapshot limitation still
requires the documented Stop/send-again recovery until the native contract changes.
