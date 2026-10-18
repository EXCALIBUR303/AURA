# Phase 4 — Living Universe

## Current checkpoint

M3 core spatial world and M4 workstation are implemented on `codex/phase4-living-universe` after the
owner's manual model checkpoint. Atrium + Project Hub form the verified vertical
slice. Living and Gaming remain closed/planned until M5. Detailed workstation equipment is verified; Living/Gaming furnishing remains M5.
M5 continues with GPT-6.1 Sol / High;
no model change is needed. Stop after M6 for Astra / Extra High.

## Milestone 0: audit and migration plan

Status: audit complete; no Phase 4 runtime implementation. Recommended model
for this milestone: GPT-6.1 Sol / High. Stop after committing this audit and request
GPT-6 Astra / Extra High for Milestone 1. The owner supplied the full Phase 4 brief
on 2026-10-18; the documents below preserve its scope and execution gates.

Fetched `origin/main` rather than trusting the reported short hash. Actual remote
tip: **`a67cda15538b16af4182c249bfc212ad39e41f38`**, merge of PR #3,
`claude/phase3c-d-real-audio`. Created **`codex/phase4-living-universe`** directly
from that tip with a clean working tree. The existing voice feature branch and
the existing checkout were preserved. No additional worktree, main edit, push,
merge or app installation. The feature branch has no upstream, avoiding accidental
publication to main.

## Documentation map

| Document | Owns |
|---|---|
| [WORLD_VISION.md](WORLD_VISION.md) | Dimensional floor plan, room identities, materials, light and hero quality gates |
| [WORLD_ARCHITECTURE.md](WORLD_ARCHITECTURE.md) | Proposed spatial state, registries, lifecycle, input and native requests |
| [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) | Existing assets, acquisition queue and licence/optimization evidence |
| [WORLD_INTERACTION_MAP.md](WORLD_INTERACTION_MAP.md) | Physical objects, real actions, keyboard alternatives and data sources |
| [WORLD_ROADMAP.md](WORLD_ROADMAP.md) | Milestone gates, status and bounded future ideas |
| [WORLD_CODEX_TO_CLAUDE_HANDOFF.md](WORLD_CODEX_TO_CLAUDE_HANDOFF.md) | Integration boundary, native requests and Mac acceptance |

These documents distinguish design specifications from implementation. M1 supplies
the scaled floor plan and art direction; asset suitability awaits M2 and runtime
features await M3–6.

## Baseline reviewed

- `AGENTS.md`, `ARCHITECTURE.md`, `TASKS.md`, assets and design-system tokens;
  `docs/DESIGN_ANALYSIS.md` and frontend voice specifications.
- Phase 3B and 3C service/UX handoffs; the newer
  [native validation](PHASE3C_D_VOICE_NATIVE_VALIDATION.md) and
  [real-audio report](PHASE3C_D_REAL_AUDIO.md) supersede the old frontend handoff's
  pending-native statements where explicitly measured.
- Actual `App.tsx`, `Studio.tsx`, `World.tsx`, `Astra.tsx`, `zones.ts`, `useStudio.ts`,
  diagnostics, conversation/GitHub state ownership and platform adapter.
- Current shared preferences, commands and voice contract. Main includes **18 voice
  methods**, including Pause/Resume/Replay, six events, `speechPaused`/`canReplay`,
  and the measured **0.7–1.3 pace range, default 0.85**. Preserve these newer fixes.

## Technical findings

| Existing implementation | Consequence for Phase 4 |
|---|---|
| One memoized R3F Canvas, three r186 / R3F 9.8.2 / React 19.3.1, Safari 18 build target | Keep this stack and one renderer; do not create one canvas per room or game |
| Six native `ZoneId`s: studio, hardware, software, ai-lab, github, companion | All remain logical views of the Project Hub. Add frontend RoomId separately |
| `World.tsx`: approximately 12.1×9.1 m floor, 3.9 m back wall; four workstations, avatar at centre | Existing space is a cutaway studio, not a connected explorable world; M1 must resolve entrances, sightlines and circulation |
| Most equipment shares instanced box geometry and a roughness 0.76 / metalness 0.08 material; primitive chairs/plants | Instancing is valuable; hero silhouettes, surface response and furniture detail are insufficient for the new brief |
| Monitor surfaces contain three abstract bars; object clicks navigate a zone | No live screen rendering or component inspection exists; add state-backed displays through bounded adapters |
| Orbit camera with per-zone azimuth/distance limits, damped transitions, exact focus-mode restore | Reuse its restoration behavior, but introduce a single mode arbiter before adding explore/cinematic ownership |
| No world graph, room streaming, collision, pointer lock, game registry, editor or float modes | New systems are planned, not existing capabilities. Start with static colliders; no physics dependency yet |
| App owns GitHub state; CompanionWorkspace owns conversation/voice; zone also enters AI context and project assignment | Room changes must not remount these services or leak a RoomId into native project/context fields |
| Renderer uses installed R3F defaults: sRGB output, ACES filmic, ColorManagement enabled; no custom shaders/postprocessing/HDRI | Make the effective pipeline explicit later; preserve correct texture colour spaces and measure any additional pass |
| Hemisphere intensity 1.8; two directionals 2.6/1.1; one 1024² shadow map; global pale background/fog | Room-local lighting/material profiles need authored direction; CSS filters cannot replace it |
| Active full-rate, visible inactive 30 fps demand loop, hidden never; adaptive DPR floor 1, upper bound from native prefs | Preserve lifecycle policy. Add room-load/camera stability to diagnostic sampling; do not sample transitions as steady performance |
| Renderer identity cached; draw calls/triangles and per-zone samples already measured | Extend diagnostics additively for physical rooms without removing native/probe consumers |
| Original GLB loaded locally with Draco/Meshopt flags off; skeleton cloned, existing idle and procedural head/eye/jaw | Preserve original asset and credit; do not assume walking, visemes or finger animation |
| Current prefs have lastZone, reduceMotion, voice, AI and graphics only | Durable room/layout/ambience preferences require a Claude contract change; no hidden persistence workaround |

Rendered baseline review confirms pale, similar room surfaces, block chassis and
chairs, static abstract screen marks, and substantial scene coverage from the
compact dock or expanded companion/inspector. Preserve readable typography, truthful
mock/permission states, scene click targets and visible credit while reworking
physical craftsmanship and HUD occupancy. Screenshots are audit evidence, not new
art-direction prototypes.

`@react-three/rapier` is not a direct dependency. A legacy
`@dimforge/rapier3d-compat` 0.12 transitive package exists through three-stdlib;
its presence is not an approved physics integration. Meshoptimizer/Draco-related
transitive packages likewise do not establish a bundled decoder pipeline. Review
version, WASM/CSP, native cost and licensing in M2 before adopting anything.

## Safe migration sequence

1. **Art and blueprint first (M1–2).** Resolve physical floor plan, connected
   entrances/corridors, room proportions, camera paths and licensed hero assets.
   Review critical PC/furniture quality before detailed geometry work.
2. **Add the spatial shell (M3).** Introduce RoomId/registry/graph, room boundaries,
   navigation transaction, camera/input ownership and lazy resources behind the
   existing Project Hub. Native Cmd+1–6 must route to that hub and existing tools.
   Map navigation remains usable when pointer lock or WebGL is unavailable.
3. **Complete the hub (M4).** Replace weak hero props progressively, retain useful
   instancing, add reusable inspect/action adapters and real-state monitor content.
   Validate repository selection, source approvals, speech controls and camera return
   before expanding the scene. No duplicate AI lab/provider backend.
4. **Complete Living and Gaming (M5).** Independent physical rooms, their own licensed
   assets, working room controls and honest game availability. Future rooms stay
   graph/registry concepts; no empty modeled expansions or fake Play actions.
5. **Presentation/customization (M6).** Static/floating/hybrid eligibility, room light
   presets and bounded object options; session-only UI until native persistence is
   approved. Architecture/colliders never levitate or depend on decorative motion.
6. **Evidence and handoff (M7–9).** Visual audit of actual rooms, full regression,
   measured resource lifecycle and native M5 acceptance requests. Honor every model
   stop in the roadmap. An attractive screenshot alone cannot pass a gate.

## Preservation and risk gates

- Preserve developer state above room loading boundaries. Loading a room cannot
  create a conversation, change repository grants or start capture/inference.
- Pointer lock support in WKWebView has not been established. Feature-detect and
  test it; request Claude review if a host delegate is needed. Do not weaken origin,
  navigation, permission, CSP or keychain policy to enable it.
- Doorways must join real navigable volumes; loads block travel safely until floor
  and colliders exist. A map can travel directly with truthful loading and cancellation.
- Hero asset acquisition is a quality prerequisite. Missing/unclear assets remain
  explicit tasks; block props cannot count as completed premium equipment.
- Keep one active room plus bounded connection/adjacent resources, not every detailed
  room alive. Cache/disposal ownership must preserve shared materials and Astra.
- Existing pending native audio/accessibility checks remain pending; Phase 4 cannot
  imply they passed. The atomic source-approval snapshot limitation remains open.

## Audit verification

Current-checkout targeted checks: TypeScript passed; `npm --prefix frontend test`
passed (Node grouped-file output), direct shared bridge **20/20**, frontend voice
controller **19/19**, production build **1,064 modules** with no chunk warning.
Initial JS **1,391.40 kB / 386.51 kB gzip**, CSS **63.56 / 13.39 kB gzip**; lazy Voice
Settings **5.79 / 2.09 kB gzip**. `inspect:avatar` passed; original digest in inventory.

Live baseline browser audit: **9/9 checks passed**, covering all six existing zone
camera transitions with one canvas, layout/credit at 1440×900 and 1100×700, and no
browser capture, page error or external request. **Two axe scans, zero violations**.
An initial audit-harness run needed an explicit Playwright browser context for axe;
the corrected complete run passed without an application change.

Evidence outside Git: `/workspace/aura-phase4/m0/results.json`, `axe-{1440,1100}.json`,
`baseline-overview-{1440,1100}.png`, and `baseline-{hardware,github,companion}-1440.png`.
The final cloud sample was **7 fps, DPR 1, ANGLE/SwiftShader, 14 draw calls and
79,802 triangles**; 1.75 m original avatar, 72 joints and `Idle02_F`. These are a
software-rendered audit sample, not a six-zone performance benchmark or M5 result.
Full browser regression is reserved for implementation changes/QA; no native macOS
execution is available here.

Claude's reports on main record 60 fps / p95 17–18 ms on an M5, typically 12–14
draw calls and 79,610–79,802 triangles, and a 235-test Swift regression. These are
**source-reported prior measurements**, not rerun in this cloud audit. Their
deferred Bluetooth, device-switching, system accessibility and other physical
checks remain explicitly deferred. New Phase 4 rooms require new M5 validation.

## Milestone 1: art direction

Completed room transforms/dimensions, three level corridors, furniture footprints,
primary routes, scale/camera anchors, one-actor Astra placement, material palettes,
day/sunset/night direction, compact HUD principles and hero acceptance criteria.
See WORLD_VISION and the original design sheet under `frontend/design/phase4/`.
The JSON blueprint is design-only; no runtime/native contract has been introduced.

Checks: four room bounds/three portal connections, all drawn prop bounds and 909
route samples with at least 1.4 m clearance pass. A preliminary check caught the
Gaming chair approach at 1.3 m; the route endpoint moved 0.1 m to preserve clearance.
These are checks of drawn footprints, not collision tests of finished assets.
Design sheet at 1440×900 and 1100×700: no horizontal overflow, images loaded, no page
errors; two axe scans with zero violations. Screenshots and helper evidence are
outside Git in `/workspace/aura-phase4/m1/`. No new 3D performance measurement.

## Milestone 2: assets, engineering research and room blueprint

Reviewed official Git repositories and three licensed furniture GLBs outside AURA.
Shortlisted GlamVelvetSofa (4,196 measured triangles, 3.15 MB) for fitting, kept
SheenChair conditional, and rejected the ornate heavier sofa. Recorded creator,
source commit, licence, SHA-256, bytes, mesh/material/image counts, dimensions,
modification status and credit requirements in WORLD_ASSET_INVENTORY. Screenshots
were visually inspected. No binary, third-party code, dependency or skill installed
in the application. Small sofa fit expands planned depth from 1.00 to 1.05 m.

Direct public HTTP sources returned proxy 403; Git access worked. Catalogues remain
unverified where inaccessible. Precise remaining PC/furniture/gaming assets and the
required environment domain additions are recorded without replacing an unknown
allowlist. M4 cannot pass with placeholder equipment. No asset issue was hidden by
calling an unreviewed catalogue or geometric block production-ready.

WORLD_ARCHITECTURE now specifies portal/floor collision, safe camera waypoints,
cancellation, input ownership, staged room availability, bounded cache/disposal,
state-backed screen limits, proposed resource ceilings and M3 checks. Reviewed R3F,
Three controls, Rapier, glTF-Transform, gltfjsx and meshoptimizer. Simple authored
collision is sufficient initially; no new physics or optimization dependency.
WORLD_INTERACTION_MAP specifies stable scene action IDs, availability/reset/cleanup,
bounded customization and game launch/pause/exit. P4-N1/P4-N2 stay native requests.

Current checkpoint checks:

- `npm --prefix frontend run typecheck`: pass.
- `npm --prefix frontend test`: pass, one grouped test file; direct
  `node shared/test/bridge.test.ts`: **20/20**, zero skipped.
- `npm --prefix frontend run test:voice`: **19/19**, zero skipped.
- `npm --prefix frontend run build`: pass, **1,064 modules**; same initial JS
  **1,391.40 kB / 386.51 kB gzip**, no chunk warning. Design HTML/SVG/JSON and research
  GLBs are excluded from the production output.
- Updated plan: four room bounds, three aligned passages, all drawn furniture
  bounds and **909** primary-route clearance samples pass.
- Final design-sheet browser checks at **1440×900 / 1100×700**: no overflow, all
  images loaded, no page errors; **two axe scans, zero violations**.
- Three isolated local GLB renders pass without page errors or external requests;
  measured counts are in the inventory. These are candidate studies, not new rooms.
- Original Astra hash/credit and native/shared/platform/runtime/dependency boundaries
  unchanged. No new tracked binary, credential or screenshot.

M0's nine application browser checks are retained baseline evidence, **not rerun as
new world acceptance**. Full world regression belongs to implementation milestones.
No macOS build, physical audio acceptance or M5 performance revalidation occurred.
Research evidence is `/workspace/aura-phase4/m2/research/`; final plan/sheet evidence
is `/workspace/aura-phase4/m1/`. These local files are not substitutes for committed
provenance: source URLs, pinned commits, licences and measurements are in the docs.

## Milestone 3: core spatial world

Recommended model/effort: GPT-6.1 Sol / Extra High. Implemented frontend RoomId and
connection registries, lazy room modules, latest-intent/cancellable loading, a
single camera owner, collision-safe travel/orbit/zoom, explicit pointer-lock WASD,
E to open nearby passages, continuous corridor walking and accessible room map.
Map/inspect remain usable with denied pointer lock or unavailable WebGL. Loaded
room instances are bounded to current plus destination; no native RoomId or prefs
schema changes. Existing logical workspaces remain together in the Hub.

App-level companion/conversation/voice state stays mounted. Repository search and
project inspector drafts survive physical room visits. Native workspace commands
return to the correct Hub view. Opening a modal safely cancels microphone capture
and releases mouse capture. Original Astra is normalized to 1.75 m at the authored
Hub home, with unchanged GLB/hash/credit, voice rig and permissions.

M3 camera refinement from rendered evidence: Hub introduction is world
`(0,2.6,-7.5)`, target `(0,1,-11.7)`, replacing M1's higher local pose so the
camera has safe orbit/zoom headroom under the actual ceiling. Scene click tests
now use the physical floor plan and assert real room bounds.

Checks: TypeScript and production build pass; shared bridge **20/20**, voice
controller **19/19**, world unit **16/16**, world browser **13/13**, retained
Studio browser **28/28** (zero skipped). Three world axe scans and two Studio
axe scans report zero violations. Browser suites report no uncaught errors or
external requests. Coverage includes all six workspaces, actual 3D clicks,
restore/drafts/search, 20 visits, load cancellation/retry, pointer-lock success
and denial, keyboard safety, mic cancellation, context loss, missing original GLB
and no-WebGL recovery. Final Studio rerun also passes **28/28**, zero skipped, with evidence at
`/workspace/aura-phase4/m3/studio-final/`.

Evidence outside Git: `/workspace/aura-phase4/m3/browser/` and
`/workspace/aura-phase4/m3/studio/`; room/map screenshots include 1440×900 and
1100×700. Actual final world SwiftShader sample: **3 fps, DPR 1, 25 draw calls,
80,306 rendered triangles**, 19 geometries/8 textures/12 programs. Recent Hub
samples are 17–21 calls/79,184–80,278 triangles. These are software renderer
measurements, not Mac M5 acceptance. Native pointer lock, hardware voice,
VoiceOver/system settings and ≥55 fps on M5 remain pending.

Build: 1,075 modules; main JS 1,415.14 kB (393.85 kB gzip), CSS 67.00 kB
(14.10 kB gzip); Hub/Atrium are separate lazy chunks. No new dependency, native,
shared, platform, contract, permission, original asset or lockfile changes.
No binary/screenshot committed, push, merge or app installation.

## Next work

M4 Premium Workstation — GPT-6.1 Sol / High. Complete detailed licensed/original
hero assets, real-state monitor surfaces and reusable inspection/action/return
before expanding into M5. Then M6 customization/motion; required stop for
GPT-6 Astra / Extra High after M6. Do not repeat completed audits or claim full
Phase 4 acceptance from this foundation.

## Milestone 4: workstation implementation evidence

Recommended model/effort: GPT-6.1 Sol / High; same model continues after M3.
Replaced primitive workstation furniture/equipment with an original offline-authored
GLB kit, with detailed PC internals, glass/ventilation, sculpted task chairs,
rounded desks, monitors/laptop, keycaps, mice and speaker drivers. Blender source,
read-only inspector, reproduction instructions, provenance and generated manifest
are committed text; the 1,002,184-byte GLB remains ignored. The original Astra and
CC BY attribution are unchanged. No external script, addon, dependency or service.

Added room-scoped asset owner/disposal boundaries, required-model failure/retry,
material batching, instanced reduced-motion-aware fan rotors, original wood/stone
textures, room-inside key lighting and distinct workspace panels/rugs/shelves.
Reusable equipment registry/keyboard panel supports actual PC click, component
information, native workspace action and exact prior camera return. A single
bounded monitor atlas shows real project/branch/language/last-push/auth and actual
companion/provider/model state. No fake hardware or source data. Hardware screens
explicitly identify an authored local illustration.

M4 evidence so far: TypeScript/build pass, direct bridge **20/20**, grouped npm test
passes, voice controller **19/19**, world unit **18/18**, new equipment browser
**6/6**, world browser **13/13**; five combined axe scans with zero violations,
zero uncaught page errors/external requests. Equipment tests cover actual PC
raycast, four keyboard camera targets, real tool opening, camera/draft preservation,
laptop layout and missing-model/retry. Existing full Studio browser also passes **28/28**, zero skipped, with two further
zero-violation axe scans (**seven** M4 scans total).

Actual overview: SwiftShader **2–3 fps, DPR1, 51 calls/250,204 rendered triangles**.
Final equipment sample 3 fps/51 calls/250,204 triangles, 43 geometries/14 textures/
16 programs after camera/selection visits. World repeat-visit test ends at
2 fps/66 calls/251,380 triangles, 51 geometries/15 textures/18 programs with
Hub+Atrium loaded. Browser resource-growth assertions pass. These are measured
software-GPU costs, not ≥55 fps M5 acceptance. Native regressions remain pending.

Screenshots/results: `/workspace/aura-phase4/m4/equipment/`, `world/`, `studio/`;
original overview/close-up at `m4/hub.png` and `m4/pc.png`; M3 screenshots supply
before views. Tests use labelled shared mock repositories and no private data.
Build 1,082 modules; entry JS 503.37 kB + shared Architecture chunk 918.06 kB,
CSS68.14 kB. These are split chunks, not a claimed reduction in total application
payload. Native/shared/platform/permissions/contracts/lockfile remain unchanged.
