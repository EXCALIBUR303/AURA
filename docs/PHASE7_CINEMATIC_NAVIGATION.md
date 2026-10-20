# Phase 7 — cinematic spatial navigation and environmental transformation

Status: implemented and validated on this Mac, 2026-10-20, branch `claude/phase7-cinematic-navigation` (worktree `~/Developer/AURA-phase7`), stacked on Phase 6 (`claude/phase6-spatial-composition`, PR #7). Nothing pushed or merged. `/Applications/AURA.app` untouched (binary md5 `e4b21bea…`). No voice, microphone, speech or audio code or tests, no contract or persistence change.

## What changed for the user

- **Rooms are walked, never cut.** Hub ↔ Living/Gaming used to be a veiled bridge. They are now a *journey* through the Atrium: the camera passes through the middle of each doorway and across the Atrium, with no veil. Walks between adjacent rooms use the same doorway rules. Journeys take 3.0–3.6 s, adjacent walks 1.9–2.1 s, in-room station moves 1.4–1.9 s. Skip, Cancel (Esc), retargeting mid-walk and Reduce Motion (a direct cut) all work as in Phase 5.
- **The camera looks where it is going.** Through each passage the view is held along the passage; turns happen in the open part of a room. A room that is left from a view facing away from its door is backed out of, still looking at what is being left.
- **The environment follows the camera.** Sky, key and fill light, background, fog and key-light position blend by where the camera is (including inside a passage). A single always-present accent light leads the camera into the destination in the destination's colour, and rests over the selected Hub station.
- **Doorways respond.** One instanced, unlit glow per room draws the door frames (and the Hub's station bars): it brightens as you approach, on hover, during a journey and on arrival.
- **HUD.** A journey bar ("Through the Central Atrium · Project Hub", progress, Skip, Cancel travel), a short arrival title that clears itself, and in Free Explore a prompt near a doorway ("Walk through to …", or "E · Open the doorway to …").
- **Hub detail.** Backdrop strips, pilasters, wainscot, ceiling beams, a hardware parts rack, a software planning board and the AI Lab wall (`HubDetails.tsx`).

## Design

| Piece | File | Notes |
| --- | --- | --- |
| Planner (pure) | `world/cinematic.ts` | `planTravel` → `route` / `journey` / `bridge` / `cut`. `doorwayPlan` is used whenever the walk has doorways (`PlanInput.doors`): view is a function of arc length (hold along each passage, turn in rooms), then the walk is paced along the path (eased walk, slowed where the view turns quickly per metre) to keep the peak turn ≤ 168°/s (≤ 2.8° per 60 Hz frame target), lengthening the duration within its bound if needed. Grid-fallback routes keep the Phase 5 planner. |
| Paths | `world/collision.ts` | `passagesFor`, `doorwayPath` (passage centres at y 1.72 plus the via-room centre), `cameraPath` fallback. |
| Rooms on a journey | `world/registry.ts`, `WorldController.ts` | `viaRoom`; up to three rooms loaded only while walking, two when settled. Request carries `origin`/`via`. |
| Camera owner | `world/WorldNavigation.tsx` | Plans once per request; advance capped at 1/30 s per frame. |
| Atmosphere, lamps | `world/WorldScene.tsx` | Camera-position blend; accent light; the Living and Gaming lamps are a single always-present `practical` light (see Hitch). |
| Doorway glow | `world/rooms/Architecture.tsx` | `RoomGlow` one `InstancedMesh` per room, tight bounding sphere. |
| Visibility | `WorldScene.tsx` (`RoomAssetScope`), `Studio.tsx` (`HubVisible`) | A resting camera hides a neighbour whose doorway is outside the frustum; Astra follows the Hub. |
| Room warm-up | `WorldScene.tsx` (`RoomAssetScope`) | A new room stays hidden while its programs are created, one per frame, capped at 500 ms (see Hitch). |
| Profiling | `studio/frameTrace.ts`, `FrameTracer.tsx` | Opt-in (`window.__AURA_TRACE__`), inert by default (one boolean per mark). |
| HUD | `world/WorldHUD.tsx`, `spatial/spatial.css` | Journey bar, arrival title, doorway prompt. |
| Native probes | `macos/Sources/AuraApp/WorldProbe.swift` | `p7` (12 room moves + 7 station moves, frame stats), `p7t` (traced long frames; `AURA_DEV_TRACE_SYNC=1` waits for the GPU), `p7v` (WKWebView snapshots of web content only, doorway hover, Explore prompt), `AURA_DEV_PROBE_GC=1` (memory pressure step). |

## Wall-facing frames

Method: an offline ray scan (`9×5` rays over a 50° vertical field at 16:10, against the room colliders) of every frame of all twelve directed transitions at 60 fps, using the app's own planning path. A frame counts as bad if at least half the rays hit a wall within 1.6 m, or the centre ray does within 1.2 m.

| | Before (Phase 7 core) | After |
| --- | --- | --- |
| Transitions with bad frames | 8 of 12 | 0 of 12 |
| Bad frames | 9–20 per affected transition (Living → Hub: 20, in two bursts at the Living doorway and the Hub doorway) | 0 |
| Worst frame, share of view on a wall < 1.6 m | 0.60–0.96 | 0–0.11 |
| Peak view turn | up to 3.9°/frame (Atrium → Hub) | ≤ 3.0°/frame |

The new unit tests (`cinematic.test.ts`) fail on any frame with ≥ 40 % of the view on a wall within 1.6 m, any frame step over 0.25 m, any turn over 3.2°/frame, an unsafe position, a veil, or a landing off the framing, for all twelve transitions. They also cover Skip/landing, Reduce Motion and instant cuts, and retargeting from mid-walk.

Limit of the metric: at 3.5 m the same scan still flags 6–13 frames on Hub, Living and Gaming journeys (most of the view is wall *within 3.5 m*), and about 0.4 of the view is wall within 2.5 m at the Atrium side. That is the Atrium being 8 m wide with 2.4 m passages; moving the turn window did not reduce it (swept ±1.5 m), so it is architecture, not pacing. The native filmstrips show a brief flat-wall frame while the camera passes the Atrium's side wall; the Living → Hub filmstrip is the reference.

## Hub arrival hitch

Reported: 72–84 ms frames on arrival in the Hub (Atrium → Hub, Living → Hub, Gaming → Hub). Native M5, Release build, window active, DPR 2, same `p7` scenario before and after.

| Stage | Finding |
| --- | --- |
| Instrumented | CPU in frame callbacks, renderer `render()` time, program/texture/geometry counts per frame, React render/commit marks, scene mount/unmount, GLB decode, planning time (`p7t`), plus the probe's own rAF timestamps. |
| Lamp lights (fixed) | The Living and Gaming rooms mounted a `pointLight` only while the camera was in the room, so the scene's light count changed on arrival and every lit material needed a new program (`programs` changed by ±1–2 on the long frames). The lamps now drive one always-present light. |
| First-frame shader burst (fixed) | A newly mounted room compiled all its shaders in its first rendered frame (49–76 ms `render()` in Chromium traces). A room now stays hidden for a few frames while its programs are created at most one per frame, and is revealed when all exist or after 500 ms at most. Two heavier variants were tried and removed: polling program link status and staging texture uploads delayed the reveal and made the `polish` suite's Living asset check fail in most runs (the same suite passes 12/12 on the pre-warm-up commit and with this lighter warm-up; the cause was not identified), and deferred React mounting broke the rooms/polish asset-ownership checks. |
| Hardware reflection (fixed) | The remaining stall was a GPU-process stall invisible to frame callbacks (callbacks 0–1 ms, `render()` 1 ms, probe rAF gap 70–80 ms). `createHardwareMaterials` rebuilt the PMREM studio reflection (about twenty render passes plus a PMREM shader compile) on every Hub mount. It is now built once per renderer, with the circuit texture shared. Disposal no longer frees them (one small cube texture per renderer). |

Result (max frame per move; native, 60 Hz target 16.7 ms). "After" is the final code, two runs (`final2-a` / `final2-gc`):

| Move | Before (run4) | After |
| --- | --- | --- |
| Gaming → Hub | 72 ms | 40 / 41 |
| Living → Hub | 82 ms | 40 / 40 |
| Atrium → Hub | 84 ms | 48 / 48 |
| Hub → Living | 50 ms | 39 / 33 |
| Atrium → Living | 56 ms | 49 / 38 |
| Slowest of all 12 moves | 84 ms | 49 / 48 |
| Median of the 12 per-move maxima | 44.5 ms | 38 / 37 |
| p50 / p95 per move | 17 / 19 ms | 17 / 18–19 ms |
| Hub station moves (7), max frame | 19–25 ms | 19–27 ms |

Remaining outliers, stated plainly: every room move still has a frame of roughly 25–50 ms at or just after the room mounts (Atrium → Hub, Atrium → Living and Gaming → Living reached 48–49 ms), and the number of frames over 20.9 ms is not lower than before (50–59 across the twelve moves vs 43), partly because journeys are now longer (more frames). Frame time is not consistently 16.7 ms during room transitions. The trace attributes the leftover to the room mount itself (React and scene construction plus a GPU-process stall) which this phase did not fully remove. The 0–1 ms `render()` readings mean GPU or driver work is the larger part, and `AURA_DEV_TRACE_SYNC=1` (GPU read-back each frame) puts the GPU wait at about 6–24 ms on the mount frames, not the full gap.

## Memory and draw calls

| | Before (run4) | After |
| --- | --- | --- |
| WebContent peak / end (footprint, same scenario) | 843 / 610 MB | 861 / 579 MB (final2-a); the GC run ended at 592 MB; earlier post-fix runs spanned 768–1,332 MB peak and 578–1,316 MB end |
| Peak draw calls, 12 room moves | 90 (Living → Hub, three rooms mid-walk) | 97 (Hub → Gaming), 73–88 on the others |
| Hub station moves (7) | 52–83 | 51–83 |

Memory is a wide, run-to-run distribution (unchanged finding from Phase 5): two earlier post-fix runs ended at 1.27–1.32 GB and stayed there through a 90 s idle hold, while the two runs that added `AURA_DEV_PROBE_GC=1` (a ~1 GB short-lived allocation step so JavaScriptCore collects; its own brief spike is excluded) peaked at 845 and 768 MB and ended at 589 and 578 MB. So the high end is garbage awaiting collection rather than a retained leak, but a single end-of-run number is not a reliable figure and the peak is higher than the Phase 6 baseline of 807 MB in some runs. The draw-call peak rose from 90 to 97 (Hub → Gaming). Peaks occur mid-walk, when three rooms are visible (doorway culling applies only at rest); the rise was not traced to a specific change.

## Native in-app verification

Done on the Mac M5 with the isolated Release build (`AURA_DEV_WORLD_PROBE=p7v`): snapshots of the WKWebView only (never the desktop), twelve per transition for Hub → Living, Living → Hub, Hub → Gaming, Gaming → Atrium and Atrium → Living, kept outside Git in `~/Developer/AURA-phase7-review-artifacts/p7v/`.

- Journeys and walks arrived with outcome `arrived` (not `settled-inactive`) at the planned durations.
- **Doorway hover glow** (Atrium → Hub doorway hit area): pointer set a `pointer` cursor and the door frame's glow brightened (cyan frame vs dim), returned to default and dim when the pointer left. Synthetic pointer events dispatched to the canvas; a physical mouse was not used.
- **Free Explore doorway prompt** in the Hub: the prompt reads "Walk through to Central Atrium" and is visible beside the hint line.
- Not verified natively: keyboard `E` to open a doorway, drag-to-look and WASD (synthetic input cannot drive WKWebView pointer capture); verified in Chromium only.

## Validation

- Unit (`node --test`, `--test-skip-pattern='mock voice'`): 95/95 (bridge, world, world-preferences, games, cinematic, hardware, composition).
- Native non-voice: 157/157 (`tools/swift-test.sh --skip 'Voice|Audio|Audible|Speech|Spoken|OnDevice|InputHealth'`).
- Assets: 5/5 present and unchanged (`tools/check-assets.sh`, `PHASE4_SHA256SUMS.txt`); Astra Lumen II attribution and the CC BY 4.0 credit untouched.
- Browser suites (Mac Chromium Metal, shared mock, final code): navigation 8, journeys 7, composition 5, hardware 16, equipment 7, spatial 8, polish 12, rooms 8, customization 8 (on re-run, see Known issues), design 13, GitHub 22 PASS lines (23 checks). Probe screenshots and logs are kept outside Git in `~/Developer/AURA-phase7-review-artifacts/`.
- Not run, by policy: `astra`, `studio`, `world` and `voice*` browser suites (microphone cases) and the unfiltered `npm test`.

## Known issues and not covered

- Hub arrival and other room-mount frames still reach about 30–50 ms (see above). Further gains likely need the room scene built before the walk reaches it or smaller per-room GPU uploads.
- The Atrium is wide and plain; close wall frames within 2–3.5 m remain when crossing it. Redesigning the Atrium architecture was out of scope.
- The Living asset check in the `polish` suite is sensitive to how long a new room stays hidden (see Hitch); it passes 12/12 with the shipped warm-up (4 consecutive runs). The `customization` suite once reported one fewer pass in a sequential run and passed 8/8 on re-run; the cause was not investigated.
- The Phase 4 manual world-preference persistence discrepancy remains unresolved and untouched.
- Native keyboard/pointer input for Explore (E, drag-to-look, WASD) is browser-verified only.
