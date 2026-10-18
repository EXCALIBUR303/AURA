# World interaction map

Status: Milestone 0 requirements and proposed adapters. Existing Project Hub
functions are implemented; physical new-room controls below are planned only.

## Proposed physical-to-functional mapping

| Room / object | Category | Meaningful action and source | Status |
|---|---|---|---|
| Hub / hardware workstation | Functional + inspectable | Focus native `hardware` view, existing project list/inspector; component inspection only for real authored metadata | Current navigation exists; new equipment/inspection planned |
| Hub / software monitors | Functional | `software`, selected repository/branch and existing project details; do not invent source code or activity | Current tools exist; screen adapter planned |
| Hub / AI console | Functional | `ai-lab`, existing provider/model configuration and permitted conversation state; no separate provider runtime or fake inference stats | Current tools exist; console adapter planned |
| Hub / repository display | Functional | `github`, existing auth/explorer/commits and selected repository | Current explorer exists; physical display planned |
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
