# Phase 3C-C — Astra experience

## Current checkpoint: Phases 1–2, design and interaction prototype

Branch: `codex/phase3c-c-astra-experience`.
Verified native base: `8519fdefac1da9ff9b4987503ac66a228e157136`
(`origin/claude/phase3c-b-astra-intelligence`).

This is the design checkpoint required by the owner's model schedule. The production
conversation implementation, final design audit, and native handoff are not complete.
Nothing has been pushed or merged.

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

## Resume without repeating completed work

The next requested model is GPT-6.1 Sol with HIGH effort. Read the blueprint and this
checkpoint, retain this branch, then implement Phases 3–4:

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
