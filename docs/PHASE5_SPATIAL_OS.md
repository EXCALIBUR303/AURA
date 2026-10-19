# Phase 5 — spatial design foundation

Status: functional visual foundation completed for review, 2026-10-19. This checkpoint implements the owner's narrowed visual-foundation request; it does not complete the full Phase 5 game, camera or native programme.

Branch: `codex/phase5-spatial-os`. Base: `29cb3a39dc0a03932eb30fa50b2eb2c27150367f` (`review/phase4-final-integration`, PR #4). Both Codex M9 and Claude's native-foundation history are retained. The original Phase 4 worktree and installed app were not changed. No push or merge was performed.

## Implemented experience

- A scoped graphite/navy design system, readable cyan actions, violet Astra identity and warm status colours. A compact title bar retains the native drag region; the six original workspaces move to a floating keyboard-accessible rail. Contextual tools, diagnostics and credits remain available.
- A world-first default with Astra's conversation minimized to a status beacon. Restore, minimize, compact, expanded, focus and left/right compact docking all operate on the same mounted conversation. Drafts, history, active replies and text error recovery survive presentation changes. New reply text received while minimized produces an unread indicator; minimizing an already-read reply does not.
- Four room cards with original vector architectural illustrations, current-location state and one-step travel through the existing controller. The illustrations are labelled as illustrations. “Central Hub” is a presentation name for the existing `atrium` ID, not a new room or contract.
- Astra-centred Project Hub welcome framing, a refined tapered plinth, muted technical materials, darker room signs and adjusted Hub/Atrium daylight. The Living and Gaming rooms retain their warm and violet identities. One authoritative, unchanged Astra model remains in the Project Hub.
- Project, equipment and room-control panels use the spatial surfaces. Equipment/room inspection minimizes the console; restoring it closes the conflicting panel and returns an inspected camera through the existing return action. The project inspector and explorer reserve a bottom dock shelf at desktop and laptop widths.

## File map

| Files | Responsibility |
| --- | --- |
| `designs/design-system/tokens.css` | Scoped spatial semantic palette; archived light prototypes retain their root tokens |
| `frontend/src/spatial/spatial.css` | Shell, rail, console, room cards and existing-panel theme/layout adapters |
| `frontend/src/spatial/RoomPortal.tsx` | Original dependency-free SVG room schematics |
| `frontend/src/App.tsx` | Session-only console presentation, panel coordination, compact header and workspace rail |
| `frontend/src/companion/CompanionWorkspace.tsx` | Persistent console wrapper, beacon, focus, unread and transcript visibility handling |
| `frontend/src/world/WorldHUD.tsx` | Room-selection presentation; existing travel/input methods retained |
| `frontend/src/studio/World.tsx`, `frontend/src/world/registry.ts` | Platform dimensions/collider and welcome camera; Hardware camera moves 0.2 m for platform clearance |
| `frontend/src/world/environment.ts`, `frontend/src/world/rooms/{Architecture,Atrium,ProjectHub,Surfaces}.tsx` | Existing-light adjustments, signs, room materials and floor tint |
| `frontend/test/spatial.browser.mjs`, `frontend/package.json` | Focused spatial regression and `test:spatial` command |
| `frontend/test/equipment.browser.mjs` | Existing test opens the newly minimized console before typing; still verifies the hidden draft after inspection |
| Four `docs/PHASE5_*.md` documents, appended `TASKS.md` | Owner-requested design and engineering handoff |

No dependencies or lockfile changes. Native, shared contracts/mock, frontend platform, GitHub implementation, `useConversation`, voice implementation, `Astra.tsx`, assets and licence files are unchanged. The voice hook arguments, transcript handlers and composer controls remain unchanged; the new shell preserves the original voice-control palette. No voice functionality was exercised or validated.

## Verification

Node 24.19.0, npm 11.9.0, Linux Chromium/SwiftShader. Browser services are the existing shared mock, including native-shaped test transport. These are not live GitHub, AI-provider or WKWebView results.

| Check | Result |
| --- | --- |
| Production build, including both TypeScript projects | Pass; 1,107 modules |
| World/preferences + generic game + non-voice bridge tests | 63 pass, 0 fail: 39 + 6 + 18 |
| Spatial browser suite | 8 pass; 9 axe scans, zero violations |
| Existing GitHub browser suite | 23 pass; 7 axe scans, zero violations |
| Equipment browser suite | 6 pass; 2 axe scans, zero violations |
| Focused Explore/window lifecycle browser checks | 6 pass |
| Total focused browser checks | 43 pass; no recorded page errors or external requests |
| Five original GLBs | SHA-256 manifest matches; rendered captures receive all five over local HTTP |

The selected unit command excludes four `mock voice` cases before execution. The unfiltered `npm test`, voice suites and microphone browser checks were not run. The entire legacy Studio/Astra/design/polish matrix was not rerun; some older presentation assertions assume the previous permanent console or top navigation. Do not count those suites as passing this checkpoint.

Coverage includes default loading, original credit, room selection/Escape focus return, exact textarea identity and draft preservation, active reply completion while minimized, unread reset, error recovery, compact/expanded/focus/edge layouts, reduced motion, project inspector clearance at 1440×900 and 1100×700, GitHub connection/error/rate-limit/empty/filter states, actual equipment hit proxies, missing-model retry, drag/WASD/arrows, pointer denial and inactive/hidden camera travel. The accessibility scans are automated WCAG 2 A/AA and 2.1 AA checks; they do not replace VoiceOver testing.

## Render budget and visual evidence

Matched room captures at DPR 1, same local models and reduced-motion/static presentation:

| View | Before calls / triangles | After calls / triangles |
| --- | --- | --- |
| Project Hub | 55 / 249,360 | 56 / 249,568 |
| Atrium with visible Hub | 73 / 250,552 | 74 / 250,760 |
| Living | 52 / 114,532 | 52 / 114,532 |
| Gaming | 70 / 83,012 | 70 / 83,012 |

The one additional call and 208 triangles come from the plinth treatment. No extra light, shadow map, postprocessing pass, texture download or WebGL canvas was introduced. The existing two-room limit, cache/disposal, lifecycle scheduling and performance diagnostics remain. Final cloud software-rendered samples are Hub 3, Atrium 3, Living 5 and Gaming 3 FPS; **Mac M5 55–60 FPS has not been revalidated**. Claude's Phase 4 measurements remain historical baseline evidence only. Portal-view cost and DPR 2 GPU behaviour still need Mac profiling.

The downloadable `AURA-Phase5-Spatial-Foundation.zip` contains a local `index.html` gallery, seven matched before/after views, final laptop inspector evidence, render measurements, successful logs/results, 18 axe reports, this handoff, a SHA-256 manifest and an incremental Git bundle. The screenshots are actual browser renders; all repository/account content is shared-mock fixture data. No images, recordings or GLB binaries are committed. The ZIP metadata records the exact final commit; use `git rev-parse HEAD` to verify a checkout.

## Remaining acceptance

The intermittent manual world-preference-saving discrepancy is **unresolved and deliberately postponed**. Passing automated preference tests does not close it. New minimized/docking presentation state is session-only; no alternative persistence or new bridge contract was added.

Native visual review, VoiceOver/system accessibility, DPR 2 M5 performance, long-session resource behaviour and live text AI/GitHub validation remain pending. Native integration, the full game library, new cinematic camera modes, hardware-detail expansion and any audio work are outside this checkpoint. Continue only after review, using [the Claude handoff](PHASE5_NATIVE_HANDOFF.md).
