# Phase 5 — cinematic navigation (Phase 2)

Status: implemented and validated, 2026-10-19, on `claude/phase5-spatial-engineering`. No contract, native persistence or voice change. `/Applications/AURA.app` untouched.

## What changed for the user

- **Room travel is a short, purposeful camera move instead of a cut or a constant-speed slide.**
  - *Walkway* (rooms joined by a passage, and moves inside a room): the camera eases along the collision-checked route. On long walks it looks down the passage, then turns to the arrival subject; when the arrival view faces back the way it came (Hub → Atrium), it holds a steady pull-back that reveals the room it left. 0.9–1.9 s, scaled to both distance and turn angle.
  - *Bridge* (rooms with no passage: Hub ↔ Living/Gaming): a 0.5 s rise and pull-back, a dark veil over the 3D view only (HUD and panels stay readable), then a 0.85 s dolly into the destination's framing. 1.35 s total. Previously this was an instant cut with the source room unloaded first.
  - *Cut*: system/world Reduce Motion and instant restores place the camera directly, with no veil.
- **Skip** (HUD button or Enter/Space while the scene has focus) jumps to the arrival framing. **Escape** still cancels to a safe landing. A new destination mid-travel replans from the current camera and fades out any veil already showing.
- **Free Explore**: walking eases in and out instead of starting and stopping dead; Shift walks faster; a session-only **Look sensitivity** slider (0.4–2×) in World settings scales drag-to-look and arrow turning. Drag-to-look stays primary and pointer lock optional.
- **Inspect**: Living objects (bookshelf, artwork, media display) now frame the camera on selection, and closing Room controls returns to the exact previous view, matching Hub equipment.

## Design

| Piece | File | Notes |
| --- | --- | --- |
| Travel planner (pure) | `frontend/src/world/cinematic.ts` | `planTravel` → `route` / `bridge` / `cut`; `sample(elapsed)` gives position, target, veil. View direction is blended by yaw/pitch the short way round, never by moving a target point through the camera. Arrival framings come from the room's own pose; approach/depart offsets are collision-checked. |
| Camera owner | `WorldNavigation.tsx` | Samples the plan once per frame; advance capped at 1/30 s so a room-mount hitch slows rather than jumps; inactive/hidden windows settle at the arrival pose (existing M7 rule); DOM `.travel-veil` driven without React renders. |
| Controller | `WorldController.ts` | Keeps the departing room loaded until arrival, then releases rooms not connected to the destination; still at most two rooms. `skip()`, session-only `setLookSensitivity()`. No new persisted field. |
| Diagnostics | `__AURA_DIAGNOSTICS__.travel` | `{kind, plannedMs, elapsedMs, outcome: arrived/skipped/settled-inactive/replaced}` |
| Living focus | `interactions/registry.ts` `ROOM_OBJECT_FOCUS`, `App.tsx` | Same capture → inspect → exact return pattern as equipment. |
| Native probe | `WorldProbe.swift` scenario `p2` | Frame pacing during each travel kind, skip, cancel, rapid retarget, hide mid-travel. Scenario `leak` is the memory-bisect harness. |

## Validation

**Unit** (`frontend/test/cinematic.test.ts`, 14): easing, duration bounds, Hub→Atrium route safety/ease/landing, Hub→Gaming bridge (full veil before the room change, no visible jump), reduced-motion/instant cut, veil carry-over, every walkway pair both ways and every Hub workspace pair under 3.2°/frame at 60 fps with ≥10 cm clearance, framing offsets, two-room retention, skip semantics, sensitivity bounds (no persistence intent), cancel during a bridge, Living focus poses. Full selected set: 77/77 with world, world-preferences, games and non-voice bridge tests.

**Browser** (Mac Chromium, Metal; shared mock): `navigation.browser.mjs` 8/8 (bridge, route, Skip + Enter, Escape cancel, rapid destinations, sensitivity scaling + axe, Living focus/return, reduced-motion cut). Regression unchanged: spatial 8, equipment 7, polish 12, rooms 8, customization 8, GitHub 23, design 13. Filmstrips: `~/Developer/AURA-phase5-review-artifacts/filmstrip/` (outside Git).

**Native Mac M5** (isolated Release build, `AURA_DEV_WORLD_PROBE=p2`, window active, DPR 2, warm rooms):

| Travel | Kind | Travel time | Frame p50 / p95 / max | Frames > 20.9 ms |
| --- | --- | --- | --- | --- |
| Hub → Gaming | bridge | 1,361 ms | 17 / 18 / 76 ms | 4 |
| Gaming → Atrium | route | 1,908 ms | 17 / 18 / 25 ms | 2 |
| Atrium → Living | route | 1,912 ms | 17 / 23 / 60 ms | 8 |
| Living → Hub | bridge | 1,356 ms | 17 / 18 / 72 ms | 4 |
| Hub → Atrium → Hub | route | 1,911 / 1,917 ms | 17 / 18 / 26, 22 ms | 3, 2 |

Skip at 324 ms → arrived, veil 0. Escape at 300 ms → idle, settled, one room loaded, veil 0. Three destinations 150 ms apart → settled on the last, one canvas. App hidden mid-bridge → settled while hidden, correct room and controls on return. Idle afterwards: 60 fps, p95 18 ms, no long tasks.

The 60–76 ms frames happen when a room's scene mounts at the start of travel (shader/material setup). That run measured the earlier 1/10 s cap; with the committed 1/30 s cap a hitch can no longer jump the camera along the path, and this was rechecked in the browser only. Pre-warming the destination's programs is a Phase 9 optimisation candidate.

## Not covered / pending

- Native drag-to-look, WASD and the sensitivity slider were verified in the browser; WKWebView pointer input needs an owner-present check (synthetic pointer events cannot exercise pointer capture natively).
- Inspect orbit/zoom are the existing OrbitControls (verified in Phase 4); unchanged here.
- Arrival framings are the existing room introductions. Gaming's framing still places the arcade near the rail (Phase 6/7).
- Look sensitivity is session-only by design; persisting it needs an approved contract change.
- The Phase 4 manual world-preference discrepancy remains unresolved and untouched.
