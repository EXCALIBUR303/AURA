# Phase 5 — foundation review (Phase 1)

Status: review complete, 2026-10-19. Branch `claude/phase5-spatial-engineering`, worktree `~/Developer/AURA-phase5`, started from Codex `470fdafe83f782b413b1e27a7cf422f8e0043f1c` (base `29cb3a3`, PR #4). Nothing pushed, merged or installed; `/Applications/AURA.app` unchanged (binary md5 `992894b8…`). No voice, microphone, speech, TTS or audio work or tests.

Verdict: the Codex foundation holds up on the real Mac. Two confirmed layout defects were fixed; the design is otherwise preserved. One measurement (WebContent memory) needs a controlled A/B before Phase 9 can sign off.

## Evidence

| Source | What it shows |
| --- | --- |
| Mac Chromium (Metal ANGLE, Apple M5, DPR 2), `frontend/test/*.browser.mjs` against the dev server, shared mock | Behaviour and layout; FPS here is not native |
| Isolated Release `AURA.app` built from this worktree (`tools/build-app.sh`), `AURA_DEV_WORLD_PROBE=1`, window active, 1280×800 @2x | Native WKWebView rendering, travel, resources, lifecycle |
| Screenshots, review artifacts outside Git: `~/Developer/AURA-phase5-review-artifacts/` (`screens/` before fixes, `screens-after/`, `native-hub-1280.png`) | Visual review at 1440×900 and 1100×700 |

Browser results are mock services. They prove UI routing, state and accessibility, not live AI, GitHub or Keychain.

## Automated results (all run on this Mac)

| Check | Result |
| --- | --- |
| `npm --prefix frontend run build` (both TypeScript projects) | Pass |
| Unit/bridge: `bridge`, `world`, `world-preferences`, `games` with `--test-skip-pattern='mock voice'` | 63 pass, 0 fail |
| `spatial.browser.mjs` | 8 pass, 9 axe scans clean |
| `github.browser.mjs` | 23 pass |
| `equipment.browser.mjs` | 7 pass |
| `polish.browser.mjs` (full suite) | 12 pass, 8 axe scans clean |
| `rooms.browser.mjs` | 8 pass, 6 axe scans |
| `customization.browser.mjs` | 8 pass, 2 axe scans clean |
| `design.browser.mjs` | 13 pass |
| Approval-while-minimized probe (scratch script, cloud mock provider + private repository context) | Host consent dialog opens on top while minimized (580×560 at 1440×900), Deny reaches `ai.respondToApproval`, 0 `ai.cancel` calls, no page errors |

Not run, by policy: `astra.browser.mjs`, `studio.browser.mjs`, `world.browser.mjs` (each contains microphone/voice cases and cannot be filtered), `voice*.mjs`, `voice-controller.test.ts`, the unfiltered `npm test`.

Codex reported that `polish`, `rooms` and `customization` were not rerun. They failed here only because they type into a composer that is now minimized by default, or assert the old side-column console geometry. The test updates restore the console before typing, read the preserved draft with `includeHidden`, and replace "console is left/right of panel" with "rectangles do not overlap". Every draft and state-preservation assertion is kept.

## Native Mac M5 (isolated Release build, this branch)

Scenario `AURA_DEV_WORLD_PROBE=1`: one cold pass through all four rooms, four repeat cycles, then minimize/hide/restore. Window active and visible, DPR 2, 1280×800.

| Room | Median app FPS | Min | p95 frame | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Project Hub | 60 | 60 | 18 ms | 56–58 | 249,568–250,648 |
| Atrium (Hub visible) | 60 | 60 | 18 ms | 74 | 250,760 |
| Living | 60 | 56–60 | 18 ms | 52 | 114,532 |
| Gaming | 60 | 57–58 | 18 ms | 72 | 84,092 |

- Travel 1.69–1.75 s per room (one 659 ms Atrium visit with a single 29 fps sample during settling; median 61).
- GPU resources identical at every cycle end (geometries 56, textures 17, programs 31); at most two rooms loaded; DOM 290 elements.
- Lifecycle: minimized and app-hidden both stop frames; restore resumes at 60 fps, p95 17 ms, no long tasks, context ready.
- Draw calls/triangles match Codex's software-rendered counts exactly, so the +1 call/+208 triangles plinth delta is confirmed.

**Memory — open item.** At probe end: app 47 MB, WebKit GPU 422 MB, WebContent 1,454–1,519 MB. Phase 4's report recorded WebContent 508–598 MB and GPU 128–204 MB, but under the `m9` scenario. A same-scenario A/B against the Phase 4 build could not be completed: the screen locked during the runs, so the window was occluded and rendered no frames (those runs read 287–540 MB, which is not comparable). Nothing in the Phase 5 diff (CSS, SVG, one extra mesh) obviously explains +900 MB, so this is **unverified, not a confirmed regression**. Phase 2 starts with a controlled A/B (same scenario, active window, both builds).

## Visual review

Screens reviewed: minimized Hub, room selector, compact and expanded Astra, equipment, all four rooms at 1440×900 and 1100×700, plus the native window.

What works: Astra is the clear focal point on the new plinth; the room selector reads as a spatial chooser, not a web list; the minimized beacon keeps the world dominant; native traffic lights and drag region are clear; credits stay visible; text contrast holds over the scene.

### Defects fixed (committed)

| # | Defect | Cause | Fix |
| --- | --- | --- | --- |
| D1 | In-world zone labels ("AI Lab", "Projects") drawn underneath the new workspace rail and the Astra beacon, showing as ghost buttons | `ProjectHotspots` collision list still targeted the removed `.companion-pill` and did not know the rail, beacon, equipment trigger/panel or inspector | `Studio.tsx`: labels now avoid `.spatial-rail`, `.equipment-trigger`, `.equipment-panel`, the visible beacon, the open compact console and the inspector |
| D2 | "Reset panel width" covered the expanded console's "Astra" title whenever any console control had focus (including while typing) | Phase 5 moved it inside the panel at `top:4px` and kept the old `:focus-within` reveal | `spatial.css`: it sits beside the splitter, mid-height, and appears only while the splitter or the button is hovered or keyboard-focused |

Both were verified by recapture (`screens-after/`) and by the native screenshot.

### Observations, not fixed (assigned to later phases)

1. The Hub heading card partly hides the in-world HARDWARE sign at 1280–1440 widths (Phase 2 arrival framing / Phase 7).
2. In Gaming, the arcade cabinet sits at the far left under the workspace rail; arrival framing should centre the playable equipment (Phase 2, Phase 6).
3. The equipment panel is a tall card with little content until an object is chosen (Phase 3 fills it with real component inspection).
4. The voice island keeps its light Phase 3 palette, which contrasts with the dark spatial theme. It is frozen and was deliberately left untouched.
5. Relocated labels can land far from their anchor (e.g. "Software" near the top edge at 1100 px); acceptable now, revisit with Phase 2 camera framing.

## Astra conversation checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| Minimize / restore, focus to beacon and back to the same textarea | Pass | spatial #3 |
| Compact / expanded / focus, edge docking | Pass | spatial #4, design suite |
| Draft preservation (same DOM node) | Pass | spatial #3, rooms, customization, polish |
| Active stream continues while minimized; unread indicator; reset on restore | Pass | spatial #5 |
| Context and history retained across workspaces/rooms | Pass | spatial #7, rooms #5 |
| No cancellation or reset on minimize | Pass | 0 `ai.cancel`/`ai.resetConversation`/`ai.endConversation` |
| Approval dialog reachable while minimized | Pass | approval probe |
| Error recovery after minimizing | Pass | spatial #6 |

Live provider streaming inside the native app was not exercised (no credentials created or used).

## Existing feature inventory (what later phases build on)

- **World**: `WorldController` (single camera owner; `travel`, `arrive`, `cancel`, `inspect`, `capture`, `setMode`), `WorldNavigation` (travel, drag-to-look, WASD/arrows, optional pointer capture, deactivation handling), `collision.ts`, room registry (`project-hub`, `atrium`, `living`, `gaming`), two-room load limit with cache/eviction, `__AURA_DIAGNOSTICS__`.
- **Persistence**: `worldPreferenceSync` (P4-N1). The manual-change discrepancy from Phase 4 remains **unresolved**; nothing here touches it.
- **Equipment**: `world/assets/Equipment.tsx` (instanced `ModelBatch`, monitor atlas), `interactions/` hit proxies and `EquipmentPanel`, keyboard picker, exact camera return.
- **Games**: `world/games/registry.ts` (`GameDefinition`, `GameModule.mount → GameRuntime {pause,resume,dispose,save?}`, `validateGame`), `GameSession` (phases idle→running/paused→exiting, pauses on blur/hidden/native deactivation), `GameLibrary` modal, `GamingDisplay`. Both entries are `upcoming`; nothing is playable yet.
- **Shell**: spatial header, workspace rail (⌘1–6), room selector with `RoomPortal` SVGs, minimizable `CompanionWorkspace`, inspector, credits.

## Engineering plan for Phases 2–6

The rules are the same throughout: one Canvas, one camera owner (`WorldController`), one authoritative Astra, no new WebGL contexts, no new bridge contracts without a shared-contract change, and draw-call budgets measured per room.

**Phase 2 — cinematic navigation.** Add a camera-director layer inside `WorldNavigation`, not a second controller. It is a state machine (`idle → departing → path → arriving → idle`, plus `cancelled`) driven by `WorldController` requests. Per-room paths live in `registry.ts` as short Catmull-Rom splines with arrival poses, so a new room declares its own route. Transitions are bounded at 1.2–1.8 s and skippable with Escape, a click or the selector. Reduced motion uses a short fade-cut. Deactivation and hide settle to the arrival pose (the existing M7 behaviour). Explore keeps drag-to-look as primary and pointer lock optional; add a sensitivity setting (session-only until a contract is approved). Inspect gets orbit and zoom around a focus target, with exact return through `capture()`. Gate: rapid repeated travel, cancel mid-path, hide mid-path, reduced motion, missing room asset, all four rooms.

**Phase 3 — interactive hardware.** Build a procedural, generic GPU/PC component kit in `world/assets/`, with shared geometries and materials and instancing through `ModelBatch`. It is lazy-loaded only for inspection, so the Hub idle budget stays within about +6 draw calls. Exploded view uses precomputed offsets animated by the existing scheduler. Annotations are DOM, positioned the same way as the hotspots (now collision-aware). No invented telemetry: status lights show only real app state. Workstation screens keep routing to the existing Hardware, Software, AI and GitHub workspaces.

**Phase 4 — game host.** Extend the existing `GameSession`; do not replace it. It takes input ownership: on `running` it releases world input (`WorldNavigation` already gates on modals) and restores the captured camera on exit. Games mount into a DOM container through the `GameModule` contract. 2D canvas games need no WebGL context, and the world renders throttled while a game is focused. Add a deterministic `core` step function per game (pure, unit-tested) separate from its renderer. The registry gains `controls`, `category` and `cover` (local SVG) fields. Acceptance: one minimal demo module through the full lifecycle.

**Phase 5 — games.** Neon Snake, Breakout and Reflex as pure-logic cores plus Canvas 2D renderers, flipped to `installed` only once their tests pass.

**Phase 6 — arcade and TV.** The cabinet hit proxy opens the `GameLibrary` focused on the cabinet camera. The TV uses a deterministic attract-mode showcase driven by one game core at low rate (about 15 Hz) into a small CanvasTexture, paused outside the Gaming room and when hidden.

## Pending (owner-present or later phases)

Controlled WebContent memory A/B; VoiceOver labels and focus; system Reduce Motion/Transparency in the native app; live text AI and read-only GitHub inside the native app under existing authorisation; long soak; the Phase 4 manual world-preference discrepancy (record only). Voice and audio remain frozen.
