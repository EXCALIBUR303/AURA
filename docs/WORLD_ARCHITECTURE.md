# World architecture — M3 runtime and extension blueprint

M3–4 implement the Hub/Atrium foundation, equipment/assets/interactions; game/environment and
customization records remain extension specifications until their milestones.
`src/world/types.ts`, `registry.ts`, `WorldController.ts`, `collision.ts`,
`WorldNavigation.tsx`, `WorldScene.tsx`, `WorldHUD.tsx` and `rooms/*` are the
current modules. `useWorld.ts` owns the external store; App retains native state.
One Canvas and one camera owner serve current + at most one adjacent room.
Explicit E passage preload preserves camera/mode/ZoneId; floor and collision
unions open only after the destination is ready. Cancel uses a checked safe pose;
stale imports cannot trigger a later camera jump. No durable world settings yet.

The module table below describes responsibility, not exact directory names. M1 geometry/art are specified in [WORLD_VISION.md](WORLD_VISION.md)
and the design-only [blueprint](../frontend/design/phase4/blueprint.json). The M2 blueprint below specifies
asset fitting, route collision, camera paths and proposed resource budgets.

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
progressively. Stream the active room and bounded doorway/adjacent resources. The M1–2
portal geometry below connects physical paths; direct map placement is separately
disclosed and never presented as continuous walking. Direct map travel can use explicit cinematic
travel or reduced-motion placement while manual exploration follows real paths.

One Canvas remains alive. Per-room error/loading boundaries recover independently.
Context-loss recovery restores supported world/navigation state and releases obsolete
loads. Separate long-lived Astra/shared resources from disposable room assets; do
not mutate/dispose a shared useGLTF cache from an unrelated room's unmount. Bound
cache lifetime and measure repeated visits. Do not preload every game/room on launch.


## M4 asset and interaction implementation

`assets/resources.ts` owns local GLTFLoader entries with room owner sets, pending
load deduplication, required-root validation and disposal after the new React room
set commits. Original Astra stays in its existing cache/lifetime. A failed required
model prevents opening the destination and keeps tools/retry available. Canceled
unowned parses dispose on completion. No remote URI/decoder is present in the
inspected GLB. Source JS modules may stay cached; disposable GPU resources do not
use that code cache as a lifetime policy.

`assets/Equipment.tsx` merges transformed static model copies by shared material;
only the wood material is cloned for the original room texture. One instanced
rotor mesh replaces twelve per-object animation draw calls. It pauses when inactive
or Reduce Motion is set. Stable hit proxies do not move. Original buffer/material
ownership stays with the resource manager; merged room buffers/textures are disposed
by the room instance.

`interactions/registry.ts` defines stable IDs, category, label, native ZoneId adapter,
focus pose and hit bounds. `EquipmentPanel` is a dismissible keyboard alternative
with component information/action/return. App saves the prior checked camera;
inspection leaves native zone/context unchanged, while Open workspace invokes the
existing adapter. Existing native navigation clears obsolete selection.

One `MonitorAtlas` reflects authorized selected repository metadata and real
companion/provider/model state. It does not fetch source, credentials, telemetry
or another provider service. Hardware is explicitly an authored illustration.
Canvas text is bounded plain text. The atlas updates on state changes and at most
2 Hz for a real active companion indicator; no React update loop per frame.

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

## M2 implementation blueprint

This is a specification, **not implemented types or acceptance of a new runtime**.
The M1 [plan](../frontend/design/phase4/blueprint.json) is the coordinate source for
room transforms, portals, primary routes and maximum prop footprints. It is design
JSON, not something to import blindly into production. M3 creates strict frontend
records and validates them; RoomId never enters the native ZoneId contract.

### Vertical slice and room boundaries

| Room | First available milestone | Geometry / load boundary | Functional entry |
|---|---|---|---|
| Atrium | M3 | One shell, map, door frames, simple piers, bounded greenery; no unused expansion mesh | Three destination records, existing companion panel, accessible map |
| Project Hub | M3 migration, quality gate M4 | Adapt existing studio into planned origin; preserve functionality while replacing props in M4 | Six original logical destinations, existing GitHub/AI/voice state |
| Living | M5 | Separate module: fitted seating, lights, curtains, local variants and inspection | Light/curtain adapters; media honestly unavailable |
| Gaming | M5 | Separate module: fitted seating/equipment, launcher and lights | Real game registry; no playable entries until an actual game lands |

M3 must not label empty Living/Gaming shells complete. Their records may be planned
and their doors closed until the M5 slice is ready. The graph/loader tests can use
small test-only modules. No duplicate AI/GitHub rooms. Native shortcut compatibility
is tested in the M3 migration before detailed prop replacement.

### Door, floor and collision blueprint

- All floors use Y=0. Shell wall segments are authored from the finished interior
  bounds with a 2.4 m aperture at each portal in WORLD_VISION. Remove the wall
  collider across that aperture; lintel bottom is Y=2.8. Passage side walls are
  continuous with room jambs. Do not put invisible collision planes across open doors.
- Ground motion uses an upright body, height 1.78 m, radius 0.26 m, eye 1.62 m;
  no jump, gravity simulation or stairs in this level plan. Start walk speed 2.2 m/s,
  normalized diagonal input, no sprint or head bob. Clamp accepted frame delta to
  50 ms and subdivide to ≤0.08 m displacement, or use a swept circle with sliding.
- Collision data includes closed walls/doors, desk footprint, complete chair/sofa
  envelope, console/cabinet/storage and Astra's occupied anchor. Door clearance and
  floor safety use the **union** of connected floor regions; independently shrinking
  each room rectangle would introduce a false barrier at the seam. Rugs/inlays are
  nonblocking; curtains stay in their window recess, away from navigation.
- Keep the primary route corridors ≥1.4 m; furniture customization is restricted to
  authored slots whose complete bounds pass the same checks. A scale/rotation change
  must update both fitting and collider validation. Mesh raycasts are for inspection,
  never the default player collision representation for detailed furniture.
- Door activation begins preload. Until the destination floor/colliders and required
  assets are ready, leaves stay closed and the accessible UI says Loading/Retry.
  On success, slide leaves into side pockets over 300–450 ms (instant reduced motion),
  update collision at a safe clear opening, then permit crossing. Cancel/failure
  leaves the person on the last safe side. No automatic door closure on an occupied
  capsule or camera; a doorway occupancy check gates the closing transition.
- At a floor/registry/context error, release pointer lock and restore the last
  validated landing. No fake walk through missing rooms, dead-end invisible floors
  or reset of the developer conversation. Accessible map/tool actions remain usable.

### Safe camera paths and mode arbitration

One controller owns pose each frame. Keep snapshot data (room, mode, camera position,
quaternion, target, orbit bounds) separate from a transition's interpolation state.
Native zone navigation, room travel and inspect requests cancel the prior transaction
by ID; late loader callbacks cannot commit stale destinations.

Graph waypoints in world XYZ at eye height:

| Edge | Atrium-side approach → aperture → aperture → room landing |
|---|---|
| Hub | (0,1.62,−2.7) → (0,1.62,−4) → (0,1.62,−6.5) → (0,1.62,−7.3) |
| Living | (−2.7,1.62,0) → (−4,1.62,0) → (−6.5,1.62,0) → (−7.7,1.62,0) |
| Gaming | (2.7,1.62,0) → (4,1.62,0) → (6.5,1.62,0) → (7.7,1.62,0) |

Reverse paths for return. Arbitrary explore poses first route along a validated
clear path to the room landing; never interpolate straight through furniture.
Use the authored central route network, with a checked connector from the current
pose. If no connector is safe, offer direct room placement; do not invent a flight
through a wall. For inter-wing trips over ~10 m, prefer a clearly disclosed short
transition after readiness rather than a fast motion-sickness-inducing corridor run.
Manual WASD still provides continuous physical passage.

- Room introductions last 650–1,100 ms once assets are ready; bound the total travel
  presentation to ~1.6 s or use direct placement. Smooth curves cannot cut a corner:
  validate their swept camera sphere (0.12 m) against 3D obstacles, or use safe
  piecewise paths. End at the M1 introduction pose only if its route is clear.
- Inspect uses 250–450 ms focus, near plane 0.05–0.1 m and object-specific distance/
  azimuth/polar limits derived from **actual** bounds. Equipment behind glass is
  inspected through authored views and metadata; do not orbit inside the chassis.
- Cancel before crossing returns to source; after crossing, stop at a validated
  landing on the current side. Restore exact prior pose for ordinary inspect exit;
  revalidate if the supported furniture slot changed during inspection.
- Reduce Motion skips camera travel, easing and levitation. An optional guided tour
  uses existing safe presets and a persistent Cancel control; it is not mandatory
  startup behavior. No second OrbitControls instance can fight explore/cinematic.
- Modal/text editing wins input; game has exclusive input; active voice retains its
  existing Stop/Cancel/Esc safety. Otherwise Esc releases pointer lock, cancels travel
  or exits inspect as appropriate. Browser pointer-lock release may accompany a
  voice cancellation. Centralize dispatch/consumption instead of competing global
  handlers. Native Cmd+1–6 and deliberate map navigation end exclusive game input
  safely and invoke the existing workspace adapter. Game exit never restarts audio.

### Streaming, ownership and monitor content

Resource boundary: **one active detailed room + at most one adjacent/previous detailed
room**, plus shared shell/door resources and one original Astra resource lease.
Only render the adjacent room while its doorway/view needs it. A reserved future
room has metadata only. Do not mount the complete world and merely hide it forever.

Use stable asset URLs and cached geometries/materials. During travel, warm the next
required assets, compile necessary materials where supported, then open the portal.
Keep both sides while the door is occupied. Once clear, close the door before
replacing the departing room with a closed shell. Evict the least-recent inactive
room before loading a third. A short bounded retention interval (initially 30 s)
may avoid repeated visits recompiling; final choice follows native memory evidence.
Dispose only when all leases are released. Rejected/cancelled loads may finish but
cannot acquire an active-room lease or move the camera. Do not clear original Astra
caches from room cleanup. Its animation runs only when its actor is actually visible;
its native conversation/voice services remain mounted and authoritative everywhere.

Project screens observe existing selected-project/provider/conversation metadata.
Use one local canvas atlas with four ≤512×256 tiles initially, text/shape drawing
only, maximum two updates per second and only on relevant state changes. Do not
render a nested React/DOM tree into every texture. Full project details stay in the
accessible DOM panel; a small world screen need not duplicate an entire application.

No remote images, arbitrary HTML, source-code previews or per-frame bridge polling.
Private metadata uses existing authorized in-memory state only. Clear textures on
auth/context reset, discard stale update epochs, and do not persist textures. Local
hardware diagrams are labelled illustrations, not telemetry. Screen-off/unavailable
is a designed bezel/substrate state, not a fabricated live graph.

### Initial resource review thresholds

These are **proposed review ceilings**, not measured performance or permission to
fill every budget. M0's actual scene was 14 render calls / 79,802 rendered triangles.
A more detailed room must justify each increase with visible benefit. Counts below
include shadow passes, unlike the unique asset triangle counts in the inventory.

| Active composition | Render calls / rendered triangles review ceiling | New texture estimate, excluding original Astra |
|---|---|---|
| Atrium | 40 / 140,000 | 32 MiB |
| Project Hub | 80 / 260,000 | 80 MiB |
| Living | 60 / 240,000 | 80 MiB |
| Gaming | 70 / 240,000 | 80 MiB |

Keep ≤1 1024² shadow map, ≤2 non-shadowed practical lights plus key/fill initially;
no postprocessing. Shared geometry/materials, instanced repeat parts, selective
casters and a single screen atlas come before increasing limits. Start new textures
at 1k (2k only for a demonstrated close-up); candidate model target ≤8 MiB and new
room payload ≤15 MiB, excluding the existing Astra. Review exceptions explicitly.
Across the active/retained pair, estimated texture storage should stay ≤192 MiB,
including shared textures counted once. This estimate excludes render targets,
geometry, browser overhead and driver allocation; it is not a process-memory limit.

Low quality removes distant decoration/shadows and reduces DPR within native prefs,
not the PC's recognizable form, floor collision, legible screens or interaction.
Preserve existing 30 fps inactive / hidden suspension. Record cold/warm loads,
steady per-room metrics, transition peaks and repeated-visit resource counts. Final
acceptance still requires actual M5 ≥55 fps under comparable active-window conditions;
none of these new compositions has been benchmarked on that machine.

## M2 engineering references and decisions

All review snapshots are outside Git at `/workspace/aura-phase4/m2/research/`.
Reviewed source is evidence, not an instruction to execute its examples or install
packages. Current stack/lockfile stays unchanged. No external skill was installed;
none of the available skills supplies a concrete R3F/asset workflow beyond these
documents. A new skill framework would add no value at this stage.

| Source actually inspected | Licence / observed revision | Decision and limits |
|---|---|---|
| [R3F performance pitfalls](https://github.com/pmndrs/react-three-fiber/blob/d74622ea8ed717f7212d7e19d65ff3e325508389/docs/advanced/pitfalls.mdx), [scaling](https://github.com/pmndrs/react-three-fiber/blob/d74622ea8ed717f7212d7e19d65ff3e325508389/docs/advanced/scaling-performance.mdx) | MIT, `d74622e` dated 2026-10-14 | Use delta-based mutation, cached loaders/materials, instancing and explicit invalidation. Balance visibility retention against bounded room eviction; do not adopt the examples' extra state libraries or their unrelated performance numbers |
| Installed Three r186 `PointerLockControls`, `Octree`, `Capsule`, GLTFLoader and colour pipeline | MIT, pinned installed 0.186.1 | Reuse supported controls/math concepts, add simple authored swept collision. PointerLockControls translates without collision; it is not a complete navigation system. Dispose its listeners. Official HTTP docs blocked, so source was inspected locally |
| [React Three Rapier](https://github.com/pmndrs/react-three-rapier/tree/ae5c3fede5ca489fd7eaa8271e9d9c5eabc88e98) package/README/Physics source | MIT, v2.2.0, `ae5c3fe` dated 2025-11-03 | Peer declarations fit React 19/R3F 9/Three ≥0.159; needs Rapier compat 0.19.2, unlike existing transitive 0.12. Dynamic WASM init and independent loop would need CSP/local bundle, pause/cleanup and native profiling. **Do not add for static level rooms.** Revisit only for actual dynamic-body gameplay |
| [glTF-Transform](https://github.com/donmccurdy/glTF-Transform/tree/8e2a94a2616d293c4b503d0fb6a4b42e6ec7c62f) CLI metadata, entry, README, licence | MIT, v4.5.1, `8e2a94a` dated 2026-10-16, Node ≥20 | Suitable future offline inspect/dedup/resize pipeline. Sharp/native dependencies and codec binaries need pinned installation review. No installation/execution now; measured small sofa does not justify immediate conversion. Never run optimize on original Astra |
| [gltfjsx](https://github.com/pmndrs/gltfjsx/tree/f4fbfa2a19ffa7c05b1a93745da7b4a7abd497f4) package/CLI/README/licence | MIT, v6.5.2, `f4fbfa2` dated 2024-11-04 | Defer: tool pins older Three 0.159 and transforms/Draco defaults can alter meshes and use CDN decoders. Hand-authored typed loader wrappers are sufficient. If used offline later, review generated output, preserve groups/pivots and supply local decoders |
| Installed meshoptimizer package/README/licence | MIT, 1.1.1, ©2016–2026 Arseny Kapoulkine | Already transitive, not an approved direct runtime dependency. Optional offline simplification/meshopt only after measured comparison; explicit bundled decoder and WASM/native checks if adopted |
| Three's installed Draco/Basis files and loader requirements; glTF-Transform codec documentation | Retain each bundled codec's own licence if adopted | KTX2 may reduce GPU texture storage; WebP mainly reduces download bytes. Neither is necessary for M3. Draco adds decode work; don't enable it by default or use drei's CDN. Any KTX encoder/tool install needs separate pin/dependency review |
| Installed Blender | 4.3.2 available; no external add-ons/scripts loaded | Automation is feasible for original authored props or approved derivatives in later asset work. No processing performed in M2; keep immutable source, reproducible export settings and licence/modification history |

Maintenance dates above are the heads **observed through Git**, not claims about
all releases. No dependency supply-chain audit or native compatibility certification
is implied. Swift/WKWebView pointer lock, memory and Metal behavior remain Claude's
P4-N2/native validation work; a Chromium study does not establish those capabilities.

### M3 targeted acceptance checklist

- Validate registry IDs/edges/portal alignment/floor union and planned-room availability.
- Cross Atrium/Hub doors both ways, cancel during load/travel, retry an asset failure;
  latest request wins and no body/camera crosses an unloaded floor.
- Test diagonal motion, wall sliding, doorway corners, held keys on blur, pointer-lock
  denial/Esc, modal/typing priority, reduced motion and keyboard-only direct travel.
- Inspect/restore exact pose; rapid room/native-zone selection cannot race camera owners.
- Existing six native destinations, repository selection, source approvals, voice
  controls and conversation drafts survive travel without remount or automatic input.
- One Canvas; room failure/context loss keeps accessible tools/map; no remote assets.
- Repeat visits at least 20 times after warm-up: stable resource counts after eviction,
  no accumulating listeners/loops, preserved throttling and meaningful diagnostics.
- Run typecheck/build/bridge/voice unit checks and relevant existing browser suites.
  Report software-renderer limitations; send exact native acceptance work to Claude.
