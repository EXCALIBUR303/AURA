# World interaction map

Status: M3 Hub/Atrium navigation implemented; later-room actions remain
planned as identified below. Accessible map and portal clicks travel through checked
cinematic paths. In Explore, E opens a nearby passage without teleportation, WASD
walks the real corridor, and Esc releases capture. Closed Living/Gaming entries
truthfully state unavailable. Native six workspace commands return to the Hub;
map travel preserves developer context and drafts. Modal opening cancels capture.

## Proposed physical-to-functional mapping

| Room / object | Category | Meaningful action and source | Status |
|---|---|---|---|
| Hub / hardware workstation | Functional + inspectable | Focus native `hardware` view, existing project list/inspector; component inspection only for real authored metadata | Implemented M4: PC inspection + original hardware tool |
| Hub / software monitors | Functional | `software`, selected repository/branch and existing project details; do not invent source code or activity | Implemented M4: metadata atlas + existing workspace |
| Hub / AI console | Functional | `ai-lab`, existing provider/model configuration and permitted conversation state; no separate provider runtime or fake inference stats | Implemented M4: actual provider/model/state atlas + original tools |
| Hub / repository display | Functional | `github`, existing auth/explorer/commits and selected repository | Implemented M4: actual repository/auth/last-push metadata + original explorer |
| Hub / Astra | Functional | Existing companion conversation, explicit Talk/⌥Space, Stop/Pause/Resume/Replay/Mute/End and real levels | Implemented; preserve across rooms |
| Hub / fan | Ambient or customizable | Local authored rotation only when enabled, visible, powered and motion allowed; label as scene control, not system cooling telemetry | Planned |
| Atrium / doors + map | Functional | Room graph travel, truthful availability/load/error/retry/cancel | Planned |
| Atrium / Astra access | Functional | Same persistent companion, no second conversation controller | Planned surface, existing service |
| Living / lamp and light switch | Customizable | Real scene light on/off and bounded day/sunset/night profile; state shown in HUD | Planned |
| Living / curtains | Customizable | Supported authored rig/transform with closed/open collision-independent state; instant under reduced motion | Planned, asset prerequisite |
| Living / books or decor | Inspectable | Actual authored/licensed title/creator/details, accessible focus/return; no invented content | Planned, content prerequisite |
| Living / selected furniture | Customizable | Only approved variants/placement slots/rotations within room bounds and clearance | Planned, bounded scope |
| Living / media display | Decorative or unavailable functional | No music/streaming action until a real local/demo or authorized media implementation exists | No playback implementation |
| Gaming / launcher display or arcade | Functional | Open registry, show actual installed/unavailable/upcoming status; launch only real entries | Launcher planned; no playable game currently |
| Gaming / room lights | Customizable | Scene ambience/profile controls, distinct from world movement and developer data | Planned |
| Future connection | Architectural / informative | Explain reserved area with no active travel or fake loading | Planned metadata only |

## Reusable behavior contract

Functional objects need hover, selection, clear label, focus pose, available/loading/
failure states, real action and safe exit/reset. Provide a keyboard-accessible HUD
or map list using the same adapter as raycast selection. Use simplified stable hit
volumes rather than expensive detailed mesh raycasts. Do not make decorative objects
look actionable. Float motion must not move the interaction's safe anchor or collider.

Inspectable objects use authored metadata and current permitted app data, with exact
prior camera/room restoration. No native file reads from React. Screen previews
observe selected public/permitted data already in memory, bounded in rate/resolution;
do not make per-frame bridge requests or copy private content into persistent textures.
Auth/context loss must clear transient previews along with existing UI. A screen
without real state may show a clearly labelled local illustration, never telemetry.

## Input and disclosure rules

- Native Cmd+1–6 still selects the six developer views in the Project Hub.
- Room map and direct room selection remain reachable with keyboard and without
  pointer lock, WebGL or first-person navigation.
- Explore WASD is disabled during typing/modals. Mouse-look requires explicit
  pointer lock; Escape exits it. Avoid collisions between voice Esc, game input,
  dialogs and camera capture through one input arbiter.
- All panels are dismissible. Give focus back to their opener or the safe room HUD;
  no hidden keyboard trap. Minimum body/label size 11 px; 10 px only uppercase caps.
- Voice never starts on room travel, dialogue, game exit or a visual state. Settings,
  source approvals and credential sheets retain their existing privacy boundaries.
- Unavailable game/media/integration entries explain why; do not expose working
  Play, Pause, Save, Connect or telemetry controls for an absent implementation.
- Before exclusive game input, end capture/stop speech through existing controls,
  pause world work and save pose. Exit restores focus/pose and disposes game resources;
  unmuting/returning never resumes microphone or speech automatically.

Durable controls depend on [P4-N1](WORLD_ARCHITECTURE.md#preferences-and-native-request-p4-n1).
Until approved native persistence exists, explicitly describe changes as session-only.

## M2 room-level action blueprint

IDs below are frontend scene IDs, not new bridge methods. Each action routes through
one adapter with the same availability and error behavior from raycast and keyboard
HUD. Scene-only controls are session-only until P4-N1 lands. Object locations and
maximum footprints come from WORLD_VISION/blueprint.json; actual colliders follow
fitted mesh bounds. No actions in this table have been newly implemented in M2.

| Stable object/action | Target and focus | State / reset / ownership |
|---|---|---|
| `atrium.map` / `open-map` | Plinth at local (2.5,2.4); DOM map button always reachable | Available/loading/planned/error for each room; retry/cancel; return focus to opener |
| `door.atrium-hub`, `door.atrium-living`, `door.atrium-gaming` / `travel` | Actual 2.4 m portal plus named map entry; shared edge adapter | Planned destination has no active travel; loading keeps barrier; safe crossing/return; no side effects on AI/context |
| `hub.hardware.pc` / `inspect-hardware` | Hardware outer desktop; focus at M1 detail pose, simplified chassis hit volume | Selection shows only authored parts present in model. Reset restores pose. Missing components are not offered as inspectable |
| `hub.hardware.monitor` / `open-hardware` | Northwest bay screen and keyboard workspace button | Existing `hardware` selection/project inspector; local hardware illustration explicitly labelled |
| `hub.software.monitor` / `open-software` | Northeast desk, front-of-screen constrained camera | Existing `software` selection, selected repository metadata only; no fabricated editor/source |
| `hub.ai.console` / `open-ai` | Southwest desk; existing provider and conversation panel | `ai-lab` remains native authority; configured model/status only. Future model-management location has no invented install/switch service |
| `hub.github.monitor` / `open-github` | Southeast desk, portrait display; accessible explorer action | Existing `github` auth/search/selection/errors; world preview clears on sign-out. Manual categories still update current projects through existing path |
| `hub.pc.fan` / scene power option | Only a separately authored fan rotor, if the model provides one | Ambient rotation only when visible/powered/motion allowed. Not a hardware sensor or physical Mac fan control; not clickable unless real scene option exposed |
| `companion.actor` / `open-companion` | Single 1.75 m actor, simplified stable proxy | Existing companion flow/voice events. No second session. Open panel works even if actor is in a different room |
| `companion.placement` / `bring-here` | Only room's authored clear Astra anchor | Explicit relocation of same actor; short transition or immediate reduced motion; no walking/follow claim or automatic speech |
| `living.lamp` / `toggle-light` | Floor lamp outside entry route; matching HUD switch | Actual assigned scene light and emissive state toggle together; disabled/error if no light binding; restore preset resets it |
| `living.curtain` / `set-curtain` | Window-recess mesh; keyboard Open/Close | Bounded 0…1 transform with model-supported folds/pivots; static collision. Interrupted motion continues from current value; reduced motion snaps |
| `living.armchair` / `choose-slot` | Only (−2.4,0.7) or (−2.4,1.5), footprint ≤1.1² | Validate slot/clearance, reject invalid without changing scene; Reset returns authored slot. No free-drag editor or fake Save |
| `living.decor` / `inspect` | A few licensed/authored books/art objects, not every shelf item | Real title/creator/material/provenance; no invented book contents. Focus and Return only unless an actual extra action exists |
| `living.media` | Storage/display, decorative until player exists | Explain unavailable media in room tools; no Play/Connect button and no audio starts |
| `gaming.launcher` / `open-games` | Main display and arcade share launcher; DOM launcher button | Empty list clearly states no games installed. Future entries show availability reason; no uninstalled item launches |
| `gaming.light` / `set-ambience` | Real authored practicals; room settings panel | Changes bounded light preset, not provider/game state; Reset available, session-only disclosure |
| `world.presentation` / `set-mode` | HUD settings, no disguised glowing object | Static/floating/hybrid; intensity 0…1. Only eligible screens/decor move ≤0.12 m vertically with ≤0.015 m idle drift; Reduce Motion disables drift/transition |
| `world.lighting` / `set-preset` | HUD named Daylight/Sunset/Night choices | Applied room light/material rig; accessible pressed state; no setting claims persistence before native support |

For floating objects, keep a stable expanded hit envelope covering all allowed
visual displacement; use the authored anchor for focus. It must not create an
invisible blocking collider above a walkable floor. Architecture, furniture, player
colliders and Astra's ground contact never levitate. Static/hybrid are not animation
intensity synonyms: they select eligibility, then intensity affects allowed offsets.

### Game contract and exit matrix

No game is installed by M2, and no sample is presented as playable. M5 implements
an empty, honest registry and launcher. A future registry entry needs a stable ID,
name/description, locally licensed preview, availability reason, lazy `entry`, input
requirements, embedded/fullscreen mode, and explicit pause/resume/dispose. Expose
save-state only for a game with a real versioned implementation. Require these
capabilities at registration rather than reflecting arbitrary object methods.

| Trigger | Required behavior |
|---|---|
| Launch installed game | Snapshot room/camera; await native capture cancellation and speech stop through existing frontend coordinator; release pointer lock; transfer input only after success |
| Native stop/cancel failure | Keep safe launcher state with Retry/Cancel; do not hide an active mic behind the game |
| Pause / blur / hidden window | Pause game and world work as appropriate; show a keyboard-accessible pause/exit surface; no automatic input reacquisition |
| Resume | Deliberate user action, only if installed runtime supports it; no restart of mic or speech |
| Exit / map / native workspace shortcut | Dispose game resources/timers/listeners; restore safe world pose/focus; then perform requested navigation |
| Failed load / runtime error | Error boundary releases exclusive input and partial resources; return to launcher/room with Retry where valid |
| Dispose twice / cancel while importing | Idempotent cleanup, ignore stale import completion; no orphan renderer or new game after cancellation |

A small original game can be proposed after the gaming room passes its quality
slice. There is no paid/commercial game, streaming service or new native privilege
in this blueprint.

## M4 verified equipment behavior

All four PC proxies open reusable inspection without changing logical selection;
all four display proxies open the corresponding existing workspace. Equipment
selector provides keyboard access, component descriptions distinguish modeled
content from sensors, and Return restores the exact saved pose. Hover/selection
is a restrained stable proxy tint. The first-person route/colliders do not float.
Missing required GLB offers Retry room while text/native controls remain available.
The equipment panel is nonmodal, dismissible, opaque and scrollable at 1100×700.
