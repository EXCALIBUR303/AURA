# World roadmap

Status definitions: **Implemented** = verified runtime feature; **In progress** =
active bounded work; **Planned** = accepted scope not implemented; **Blocked** = a
specific missing prerequisite; **Needs user approval** = a restricted action or
scope decision; **Requires Claude native integration** = outside frontend ownership.
Planned items must never appear as working product features.

## Milestone gates

| Milestone | Current status | Model / effort | Exit gate |
|---|---|---|---|
| 0 Audit | Complete (audit deliverable, no world runtime) | GPT-6.1 Sol / High | Latest-main branch, rendering/contract/asset audit, targeted baseline checks and committed migration docs; stop |
| 1 Art direction | Complete (design specification) | GPT-6 Astra / Extra High | Architectural plan, proportions, room identities, camera/lighting/material studies and hero acceptance criteria |
| 2 Asset research + blueprint | Complete (research/blueprint; hero gaps recorded) | GPT-6 Astra / High | Actual asset/source/licence review, measured inventory, reviewed engineering references, room interaction/collision plans; stop |
| 3 Core spatial world | Implemented (Hub + Atrium vertical slice) | GPT-6.1 Sol / Extra High | One canvas, RoomId graph, atrium/connected travel, room boundaries/loading, camera modes, safe collisions/input, native zone compatibility |
| 4 Premium Project Hub | Implemented (frontend quality gate; native performance pending) | GPT-6.1 Sol / High | Convincing licensed PC/furniture assets and state-backed screens; inspect/action/return; all existing developer functionality passes before expansion |
| 5 Living + Gaming | Implemented (furnished modules + scene controls; native acceptance pending) | GPT-6.1 Sol / High | Two separate complete spaces, real supported controls, modular launcher and truthful availability; no fake game/media features |
| 6 Customization + motion | Implemented (session-only; final M6 checks recorded in phase report) | GPT-6.1 Sol / High | Static/floating/hybrid, eligibility/intensity, day/sunset/night, reduced motion, bounded customization and safe persistence path; stop |
| 7 Visual audit | Complete frontend checkpoint (`35a499d`); native recheck pending | GPT-6 Astra / Extra High | Rendered before/after room corrections, drag Explore, inactive travel fix, staged loading and preference seams; native persistence remains deferred |
| 8 QA + optimization | Complete non-voice frontend regression (`a9fe3e3`); native profiling pending | GPT-6 Luna / Medium | 90 additional browser checks, 20 clean axe scans, 48 unit/bridge checks and cloud diagnostics; voice frozen; doorway budget debt retained |
| 9 Engineering handoff | Complete frontend handoff; owner review/native integration pending | GPT-6.1 Sol / High | Final acceptance matrix, asset/license checklist, portable local commits and exact Mac validation instructions; stop for owner |

Every required model checkpoint must finish targeted checks, documentation and a
safe milestone commit before requesting the manual switch. Never imply an automatic
switch. Complex M8 rendering/integration failures escalate to Sol / High.

## M3 implemented scope

Frontend registry/controller, lazy Hub/Atrium, physical corridor and E passage,
WASD/drag Explore (M7; optional browser pointer lock), bounded safe orbit/cinematic travel, cancellation/retry and
accessible map are verified. Developer state remains above rooms. Living/Gaming
are furnished in M5 with real lamp/curtain/palette controls and a truthful game library. Evidence: world 16 unit +
13 browser checks, Studio 28 browser checks, five zero-violation axe scans;
TypeScript/build/bridge/voice checks pass. No M5/native performance claim.

## Existing implemented foundation to preserve

- Native macOS shell, typed bridge and origin/CSP/Keychain/privacy boundaries.
- Single R3F studio, original Astra/idle/jaw/ring, camera restoration, diagnostics,
  inactive 30 fps and hidden suspension, DPR limit and reduced motion.
- Four project workstations, GitHub explorer/selection and source-bound AI tools,
  explicit approvals, conversation state, voice with the merged real-audio fixes.

## M6 implemented and remaining review

Bounded session presentation/light/motion, eligible instanced displays, real fan
rotors and two safe Living chair positions are implemented. System/native Reduce
Motion takes precedence. Rendered-room pins fix cross-root GLB release ordering;
original repeat-visit bounds pass. No native persistence or installed game.

M7 actual room/preset screenshots and M8 non-voice regressions are complete. See
`PHASE4_LIVING_UNIVERSE.md` for measured evidence and the corrected M8 axe count.
M9's final entry point is `WORLD_CODEX_TO_CLAUDE_HANDOFF.md`. The owner continued
each milestone explicitly; no automatic next phase or model change is implied.
Atrium+Hub remains73calls in the matched M7 view (proposed40-call standalone
ceiling), and Gaming+Atrium reaches72 versus70. Native profiling/acceptance is
pending. Voice work, including deferred hardware tests, stays frozen.

## Dependencies and restricted work

| Item | Status | Resolution |
|---|---|---|
| Hero PC/peripherals | Implemented original offline Blender kit; binary remains ignored | Committed source/provenance/manifest; 6 equipment + 13 world + 28 Studio browser checks, actual close-up screenshots; Mac performance pending |
| Arcade / room objects | Implemented original offline room kit | Source, 741,932-byte ignored GLB, 15,796 triangles and rights/provenance recorded; no commercial game content |
| Living/Gaming seating | Implemented reviewed unchanged sofa/chair originals | CC BY sofa and CC0 chair credits accessible; original hashes preserved, licensed copies remain ignored |
| Native durable room/layout/ambience preferences | Native contract implemented on Claude `6947263`; frontend wiring pending approved integration | Use actual `Preferences.world`; M7 restore/user-intent seams and integration guide are prepared; keep session-only copy until wired |
| Explore in actual WKWebView | Primary drag path implemented; native revalidation pending | Pointer lock was refused in Claude's Release validation; drag/WASD/arrows/E/Esc is primary, capture optional, no native permission change |
| Physics/decoder/postprocessing dependencies | Needs review before adoption | Use authored collision; defer reviewed physics/codec tooling until a measured need; M2 review complete; none added |
| Paid services/assets, binary commits, push/merge/app installation | Needs user approval | No approval inferred from permission to research or implement frontend |
| Mac ≥55 fps and physical/native acceptance | Claude measured M3–M6 at57–60; M7/native integration recheck pending | Measure final rooms, camera/light/motion/input/lifecycle states on M5; voice remains frozen |

## Future ideas — outside the current delivery

Planned concepts: art studio, gallery, library, media room, robotics workshop,
simulation/model experimentation rooms. None need geometry now.

Future game types: original arcade/puzzle/racing/rhythm/strategy/physics experiences.
Propose a small original demo only after the gaming room is stable; no game is
authorized as a current playable feature merely by appearing here.

Future editing: broader furniture transforms, saved layouts, approved personal
asset imports and custom themes. Current scope permits only explicitly eligible,
bounded options. Future local model discovery/switching/comparison stays native;
no new provider runtime, online synchronization or cloud persistence this phase.
