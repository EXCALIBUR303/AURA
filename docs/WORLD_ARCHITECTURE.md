# World architecture — proposed at Milestone 0

No types or services below are implemented. This document specifies the intended
frontend boundaries; exact room geometry and art await M1–2.

## Identity and compatibility

Introduce frontend `RoomId`: `atrium`, `project-hub`, `living`, `gaming`, extended
through the room registry. Native `ZoneId` remains exactly `studio`, `hardware`,
`software`, `ai-lab`, `github`, `companion`. All six belong to `project-hub`.

Track physical room and logical zone independently. A room-map action changes the
physical destination without writing RoomId into `prefs.lastZone`, `projects.zone`,
AI context, menu commands or bridge events. Native Cmd+1–6 first brings the Project
Hub into view, then invokes the existing logical destination. Room travel alone
must not change a conversation's repository/context/provider or make an AI request.
No duplicate AI/GitHub/voice service is introduced in React.

## Proposed modules and data contracts

Keep implementations split under frontend-owned `src/world/` rather than extending
the current World.tsx into a whole-world monolith:

| Module | Responsibility |
|---|---|
| `registry/rooms` | Stable ID, label, availability, world transform, bounds, spawn/camera anchors, loader, environment and interaction/asset/collision manifests |
| `registry/connections` | Edge ID, from/to room + doorway anchors, corridor/walkable volume, door/load state and accessible label; graph validation |
| `navigation` | Cancellable travel transaction, last-safe pose, room state, native-zone adapter and explicit transition completion |
| `camera` | Exclusive explore/inspect/cinematic ownership; snapshots and exact restore |
| `input` | Modal/typing/game/explore/inspect priority; pointer-lock lifecycle and focus |
| `interactions` | Stable object IDs, category, label, action adapter, availability/loading/error/reset and selection |
| `assets` | Licensed manifest records, lazy boundaries, preload policy, shared leases and bounded eviction |
| `environment` | Room-local material/light preset definitions within one colour pipeline |
| `rooms/{atrium,project-hub,living,gaming}` | Independent room geometry and configuration, without owning native data services |
| `games` | Registry of availability and lazy runtime contracts; no eagerly loaded games |
| `customization` | Versioned scene options, explicit eligibility and validation/migrations |
| `hud` | Accessible map/room selector, modes, controls, context and dismissible panels |

Required records:

- **RoomDefinition**: schema version, ID, title, availability (`available`,
  `unavailable`, `planned`), local→world transform, bounds, entry anchors,
  camera presets, connected edge IDs, asset IDs, environment presets, collider data,
  interaction IDs, dynamic module loader and feature flags.
- **InteractionDefinition**: room/object IDs; category (`functional`, `inspectable`,
  `ambient`, `customizable`, `decorative`); accessible label, collider/hit target,
  supported actions, eligibility/availability, focus pose, return behavior and action
  adapter ID. Ambient/decorative records have no fake click action.
- **AssetRecord**: exact creator/source/licence/credit/path/hash, bytes, bounds,
  triangles/materials/textures, decoder dependencies, pivot/scale, allowed instances,
  provenance and modifications. See the inventory.
- **GameDefinition**: ID/name/description, original or licensed icon/preview, lazy
  entry, input requirements, embedded/fullscreen presentation, availability reason,
  pause/resume/dispose, save capability only if implemented. An absent entry point
  cannot be marked playable. Save schema belongs to the installed game, not the shell.

Registry validation rejects dangling edges/assets/actions, duplicate IDs, non-finite
transforms, invalid bounds, unsupported manifest versions and missing required
licenses. New rooms should register their own data/module and edges, not rewrite
the core camera or backend; adding one still requires reviewed assets and tests.
Keep immutable definitions separate from runtime room-load state (`unloaded`,
`loading`, `ready`, `error`) and cancellable navigation transactions.

## State and lifecycle

Keep App-level GitHub/conversation/voice orchestration mounted above room Suspense
boundaries. Existing CompanionWorkspace must not be keyed by RoomId. Define travel
as `idle → preparing → travelling → settling → idle`, with cancellable/error states.
Each request has an identity; stale loads cannot move the camera after cancellation.
Commit a room only after its floor, colliders and required assets are ready. Failure
offers retry/return and keeps the last safe view and ordinary developer controls.

Start with a migration adapter for the existing Project Hub; replace its props
progressively. Stream the active room and bounded doorway/adjacent resources. M1–2
must define shared portal geometry so paths connect physically, rather than masking
teleports as continuous exploration. Direct map travel can use explicit cinematic
travel or reduced-motion placement while manual exploration follows real paths.

One Canvas remains alive. Per-room error/loading boundaries recover independently.
Context-loss recovery restores supported world/navigation state and releases obsolete
loads. Separate long-lived Astra/shared resources from disposable room assets; do
not mutate/dispose a shared useGLTF cache from an unrelated room's unmount. Bound
cache lifetime and measure repeated visits. Do not preload every game/room on launch.

## Camera, input and collision

- **Explore:** explicit user action requests pointer lock. WASD only while the
  canvas owns input and no modal/editor is active. Escape releases it; blur,
  occlusion, dialogue, game exit and failure restore a safe mode/focus. Pointer-lock
  support/denial in WKWebView needs real validation; no native delegate exists now.
  If unavailable, show a truthful limitation and keep direct map/inspect navigation.
- **Inspect:** one selected object, bounded orbit/zoom, data panel, supported action
  and exact prior room/pose restore. Do not let OrbitControls and explore controls
  mutate the same camera in the same frame.
- **Cinematic:** graph-derived paths, cancel at any point to a validated safe pose,
  no forced tour. Reduced motion uses immediate/short safe placement and no bobbing.
- **Collision:** begin with authored static horizontal colliders and walkable floor
  regions; swept movement or substeps prevent wall tunneling. Keep camera height,
  clearance and door-state collision consistent. Detailed prop hit areas need not
  be triangle-mesh physics. Evaluate Rapier only if a measured requirement warrants it.
- **Input order:** OS/native shortcuts remain functional; modal controls and text
  editing suppress world keys. Exclusive game input suppresses world controls;
  deliberate map/native navigation safely ends exclusive input. Existing ⌥Space/Esc
  voice behavior must not leak into a running game or compete with pointer-lock Esc.

Opening an installed game snapshots room/camera/customization, releases pointer
lock, cancels capture/stops speech through the existing controller, pauses unnecessary
world animation and transfers focus/input. Exit/dispose releases timers/listeners/
GPU resources, restores world pose and focus, and never restarts microphone or speech
automatically. No extra Canvas by default; require a measured lifecycle decision if
an eventual game truly needs its own renderer. Until games exist, show unavailable
catalogue entries without working Play/Pause/Save claims.

## Materials, rendering and motion

Use the existing sRGB output/ACES/linear working-space workflow as the baseline;
make settings explicit only with before/after verification. Colour textures use
sRGB; normal/roughness/metalness data remains non-colour. Match scale, exposure and
roughness across imported models. Review local HDRI and compression tooling in M2;
bundle every decoder/map/font. Any postprocessing must earn its GPU cost on native.

Keep room-specific day/sunset/night presets separate from global neutral UI tokens.
Limit shadow casters, reuse geometry/materials and instance repeated details. True
fan rotation is eligible; whole structural parts do not animate for decoration.
Static/floating/hybrid affects explicitly eligible screens/decor only; motion uses
bounded offsets around stable interaction anchors. Colliders/floors/walls never float.
Both native reduceMotion and system reduced motion suppress nonessential movement.

Retain active/full, visible inactive/30 fps and hidden/suspended policy. Extend
diagnostics additively with physical room/load/mode data; existing native/probe
consumers of ZoneId samples still work. Sample only stable active scenes. Measure
draw calls, triangles, DPR, load time, repeated-visit resource counts and actual M5
frame behavior; cloud software GPU results never pass the ≥55 fps gate.

## Preferences and native request P4-N1

Current `PreferencesPatch` cannot store world state. Request an additive optional
`world` field through Claude, with typed defaults/migration and nested patch behavior:

| Proposed field | Validation / behavior |
|---|---|
| `schemaVersion: 1` | Preserve older user prefs; unsupported future versions must not be silently overwritten |
| `lastRoomId: string` | Bounded stable ID, e.g. `[a-z][a-z0-9-]{0,47}`; frontend registry validates availability and falls back to Project Hub; never a ZoneId |
| `presentation: static / floating / hybrid` | Explicit enum; conservative migration default static |
| `floatIntensity: number` | Finite 0–1, no structural eligibility inferred |
| `lightingPreset: daylight / sunset / night` | Explicit enum, room defaults remain separate |

Use existing `prefs.get/update/changed`; no new service or privilege is requested.
Claude must update TS/Swift mirrors, default decoding of old rows, patch merge,
native persistence, mock, fixtures and parity/security/migration tests together.
Do not implement this contract from Codex or reinterpret voice/AI/graphics keys.
Per-object layouts, per-room overrides and game saves are future versioned schemas;
specify allowlisted objects, finite bounded transforms and migration rules before
requesting their native persistence. No arbitrary unbounded JSON store is proposed.

Until P4-N1 is accepted/landed, world controls operate in an explicit session-only
frontend reducer, say they are not saved, and expose no fake Save action. Existing
native-supported reduceMotion/graphics controls may continue through real prefs.
Do not create parallel localStorage/native-file/cloud persistence for this data.

## Native request P4-N2

Validate Web API pointer lock and its Esc/focus behavior in the existing WKWebView,
including Release/aura:// and Debug/Vite. If a WKUIDelegate hook is required, Claude
should propose the smallest trusted-origin, user-gesture-gated integration before
implementation. No raw host calls or relaxation of CSP/navigation/permission policy.
