# AURA world vision — Milestone 1

Status: design specification complete; M3 Hub/Atrium foundation and M4 detailed workstation implemented.
Furnished Living/Gaming remain the next milestone. Dimensions
below are design constraints, not performance results or full-room acceptance.
M3 rendered-camera refinement: Hub introduction world `(0,2.6,-7.5)`, target
`(0,1,-11.7)` supplies safe ceiling headroom for bounded orbit/zoom. The
[scaled floor plan](../frontend/design/phase4/world-plan.svg) is an original vector
drawing; [the design sheet](../frontend/design/phase4/art-direction.html) combines
it with material palettes. Both are design documents, not application UI.

## An inhabited observatory

AURA is a private observatory for making, thinking and relaxing. A stone atrium
organizes three wings. Deep window reveals, rounded furniture edges, thin metal
framing and continuous floor joints unite the rooms. A cobalt floor inlay and small
engraved room labels provide orientation. Equipment and materials distinguish uses.

The Project Hub contains Hardware, Software, AI/LLM, GitHub and Companion. Living
and Gaming are separate physical rooms. There is one companion and one set of
native developer services. Future expansion is a closed south wall and connection
metadata, with no unused rooms behind it.

## Architectural plan v1

Metres; right-handed Three coordinates: +Y up, +X east, −Z north. All room origins
have Y=0 and yaw=0. Bounds are **finished internal floor edges**. Walls are 0.18 m
thick, outside those bounds; cut openings before adding corridor geometry. Overall
interior extent: X=−15.5…15.5, Z=−15.5…4, plus exterior wall thickness.

| Room ID | Origin X,Z | Interior width × depth | Ceiling | Entry in room-local X,Z |
|---|---|---|---|---|
| `atrium` | 0,0 | 8 × 8 | 4.6 | Arrival 0,2.7; three portals below |
| `project-hub` | 0,−11 | 12 × 9 | 3.6 | South: 0,4.5; landing 0,3.7 |
| `living` | −11,0 | 9 × 8 | 3.2 | East: 4.5,0; landing 3.3,0 |
| `gaming` | 11,0 | 9 × 8 | 3.2 | West: −4.5,0; landing −3.3,0 |

| Connection | Continuous world floor rectangle (X; Z) | Atrium opening → destination opening |
|---|---|---|
| `atrium-hub` | −1.2…1.2; −6.5…−4 | (0,−4) → (0,−6.5) |
| `atrium-living` | −6.5…−4; −1.2…1.2 | (−4,0) → (−6.5,0) |
| `atrium-gaming` | 4…6.5; −1.2…1.2 | (4,0) → (6.5,0) |

Connections are 2.5 m long, **2.4 m clear wide / 2.8 m clear high** passages.
Floor datum stays 0, without steps or teleport gaps. Corridor side walls terminate
at room exteriors; no second wall crosses the aperture. Door leaves slide into
pockets outside the clear width and cannot close on an occupied passage. Loading
uses these real entrances; an unloaded destination never exposes a hole.

Primary routes stay ≥1.4 m clear, doorway landings ≥1.5 m turning diameter, chair
pullback ≥0.9 m from the desk front. Explore eye height is 1.62 m; the existing
1.75 m Astra supplies a scale reference. A 0.26 m player collision radius leaves
1.88 m center travel across a doorway. These are game-space design dimensions,
not certification of a real building's accessibility.

## Room composition and footprints

Coordinates are **room-local X,Z**; dimensions are width × depth. Fit actual asset
bounds in M2–4 while preserving circulation. Colliders include chair backs.

### Project Hub — precise, industrious, warm

Four working bays frame an open center. The incoming view sees distinct equipment
silhouettes, Astra off axis, and a dark acoustic rear wall with warm grazing light.
Hardware has an exposed chassis; Software dual monitors; AI a generous console;
GitHub a portrait companion screen. These are stations within one room.

- Desks: centers (−3.25,−2.5), (3.25,−2.5), (−3.25,2.5), (3.25,2.5), each 3 × 0.9,
  top 0.75 m. North bays face +Z; south bays face −Z. Chairs at matching X and
  Z=−1.25/+1.25, maximum 0.8 × 0.8 footprint, seat around 0.46 m.
- Northwest Hardware; northeast Software; southwest AI/LLM; southeast GitHub.
  Preserve logical selection, project assignment and native shortcuts.
- Main north/south route X=−0.7…0.7; cross route Z=−0.7…0.7 to the bays. Astra's
  home is (−1.25,−1.5), outside both routes, on a flush 0.8 m floor insert.
- Hardware chassis target: footprint 0.24 × 0.50, height 0.48, on the outer desk
  half. Its inspect side faces the center, clear of the monitor. Interiors need
  recognizable parts and separate opaque/glass surfaces.
- Rear shelves depth ≤0.35 m at Z=−4.1; cable trays below desktops. Tools stay on
  peg rails; working surfaces retain empty space around keyboards and mice.

### Living — sheltered, tactile, personal

An east entry looks over a warm rug and sculpted seating toward a north window.
Low horizontal furniture, uneven but balanced books/plants and fabric seams create
comfort. Warm wood and forest upholstery carry color; ceiling/plaster remain cream.

- Sofa (0,−1.1), maximum 2.6 × 1.05, faces +Z; coffee table (0,0.5), 1.2 × 0.6, top 0.38 m.
  Sofa/table edge gap approximately 0.78 m. Rug 3.6 × 3, with no raised collision edge.
- Armchair (−2.4,0.7), bound ≤1.1 × 1.1 including rotation; alternate approved slot
  (−2.4,1.5). Floor lamp (−2.1,−1.9); west-wall bookshelf; media/storage console
  (0,3.55), 2.8 × 0.45. Window and curtains on north wall Z=−4.
- Entry route (4.5,0) → (2.5,0) → (2.5,2.5) → (0,2.5), clear width 1.4 m.
  Optional Astra placement (2.5,−2.4), outside the route.
- Lighting, curtains and bounded variants are real scene controls. Media remains
  honestly unavailable until an actual player exists.

### Gaming — intimate, focused, energetic

An indigo acoustic envelope contains the north display, recognizable arcade and
sculpted gaming desk. Cobalt/coral identify equipment; dark timber/fabric balance
screens. No illuminated trim around every wall.

- Desk (2.6,−2.55), 2.4 × 0.8; chair (2.6,−1.35), ≤0.8 × 0.8. Arcade (−2.9,−2.6),
  target 0.85 × 1, height 1.85; north display 2.4 m wide; console below at
  (0,−3.45), 2 × 0.5. Sofa (0,1.7), maximum 2.5 × 1.05, faces −Z.
- Entry route (−4.5,0) → (0,0) → (2.6,−0.2); keep Z=−0.7…0.7 clear before the
  desk approach. East shelf X=4.1, depth 0.4; Astra slot (−2.8,2.5).
- All displays open one launcher with actual availability. Use generic licensed
  cabinet art/controllers. Even inactive screens need bezel/glass/stand detail.

### Atrium — orientation and pause

The tallest room is least furnished. A 4.8 m square clerestory brings warm light
onto stone. Corner piers and planted recesses frame entrances. Map plinth (2.5,2.4),
footprint ≤1.2 × 0.5; Astra recess (−2.6,−2.4). The central cross X=−1.2…1.2 and
Z=−1.2…1.2 remains clear. The solid south wall represents future expansion only as
unavailable metadata, never a walkable doorway or a loading button.

## Material and colour board

Hex values are **sRGB base-colour intentions**, not scene samples or UI text tokens.
Evaluate through ACES under a neutral key before room grading. Large mid-value
surfaces establish form; small accents establish hierarchy.

| Room | Base / structural | Secondary / tactile | Accent hierarchy |
|---|---|---|---|
| Atrium | Limestone `#B9B4A9`, shadow `#5C6266` | Bronze `#80644C`, leaf `#385B48` | Cobalt `#305A9D`; sunlight `#E5B784` |
| Hub | Graphite `#303A40`, alloy `#9BA6AA` | Walnut `#705345`, felt `#4A5356` | Teal `#287D83`; copper `#AF7651`, amber `#DDB06B` subordinate |
| Living | Plaster `#DDD0BC`, walnut `#76533C` | Forest fabric `#34584D`, stone `#A5A095` | Terracotta `#B56D53`; gold `#B79A62` |
| Gaming | Indigo `#242C49`, charcoal `#32353D` | Dark wood `#59463E`, violet fabric `#65557D` | Cobalt `#3C66B0`, cyan `#58B7C2`; small coral `#D3866D` accents |

Aim roughly 65% base / 25% secondary / 10% accents by visible area, adjusted from
screenshots. No uniform pastel wash or pure black room envelope.

| Material | Starting response and craft requirement |
|---|---|
| Honed stone | Metalness 0, roughness 0.65–0.85; scale-correct roughness/normal variation, no deep displacement |
| Oiled wood | Metalness 0, roughness 0.45–0.65; grain follows each manufactured part |
| Fabric/felt | Metalness 0, roughness 0.85–1; seams and shaped cushions do most work |
| Painted chassis | Metalness 0 on paint, roughness 0.4–0.6; geometric bevels catch highlights |
| Bare brushed metal | Metalness 1, roughness 0.3–0.5; coherent reflections; gray does not imply metallic |
| Glass/screen | Separate thin surface, roughness 0.1–0.25, opaque screen substrate; few transparent layers, no global transmission pass |
| Plastic | Metalness 0, roughness 0.45–0.7; seams and functional shape, not merely different box colours |

These are tuning seeds, not overrides of correctly authored PBR maps. Share genuine
material matches. Instance repeat details; hero silhouettes must survive low quality.

## One light pipeline, three times of day

Retain linear working space, sRGB colour textures/output and ACES filmic mapping;
normal/roughness/metallic maps stay non-colour. Start exposure 1.0 for comparison;
tune only with matched screenshots. No CSS filters or exposure jumps at portals.
No bloom, SSAO or transmission pass is part of the base quality promise.

| Preset | Composition | Room response |
|---|---|---|
| Daylight (default) | Soft neutral window/clerestory key, weak sky fill, contact shadows | Readable hub metal/screens; natural living wood/cloth; gaming stays indigo, not black |
| Sunset | Lower warm key from same world direction, cool subdued fill | Atrium long soft shadows; living lamp pools; hub copper and gaming coral catch warmth |
| Night | Dark but readable exterior, broad architectural fill, local practical pools | Hub task lights, living lamps, gaming screen faces lead; exits stay visible |

Light arrives consistently from northwest (negative X/negative Z). Practical lights
are room-local; emissive bulbs do not automatically illuminate neighbors. Prefer a
shared environment, a bounded set of non-shadowed practical lights and **one shadow
key** per active composition. Check floor contact, Astra's face and screen legibility
in all presets. Blend corridor lighting without all room rigs rendering at once.

## Camera and Astra staging

Room introductions start at 46° vertical FOV (adjust 42–50° after actual 1100×700
and 1440×900 review). No fisheye/head bob/compulsory orbit. Poses below are local
XYZ. Inspect fits real bounds and collision-tested limits, not free orbit through walls.

| View | Position → look-at | Purpose |
|---|---|---|
| Atrium arrival | (0,1.62,2.7) → (0,1.7,−3.4) | Hub ahead, side entrances readable |
| Hub introduction | (0,3.3,3.9) → (0,1,−0.7) | Four bays and Astra, camera below ceiling |
| Hardware detail | (−2.3,1.45,−0.8) → (−4.1,1.05,−2.55) | Chassis side, joinery, scale beside keyboard |
| Living introduction | (3.5,2.2,2.8) → (−0.8,0.9,−0.7) | Sofa/window/low table with foreground depth |
| Gaming introduction | (−3.1,2.2,2.8) → (0.7,1,−2) | Cabinet, display and desk |

Manual travel follows corridors. Room selection uses cancellable safe waypoints,
then an introduction pose; a brief neutral transition/direct placement replaces
prolonged travel on long routes. Reduced motion places immediately after readiness.
M2 specifies timings, safe waypoints and cancellation.

Astra remains **one original actor**, 1.75 m tall, naturally lit with floor contact.
Home is the Hub. Other rooms offer “Bring Astra here” at their clear anchor; there
is no automatic teleport/follow when walking through doors. Relocation is a short
disclosed placement transition (instant for reduced motion), not a fabricated walk.
Keep one skeleton and persistent conversation/voice controller. The companion panel
works everywhere, regardless of actor position. Placement never starts voice or AI.

## HUD and interaction direction

Keep neutral light chrome and existing text-safe tokens. At 1100×700, a 48–56 px
navigation band and compact bottom companion rail leave the central view open.
Open one primary context panel at a time: 320–360 px on wide windows, a bounded
sheet for short windows. Voice/approval controls stay reachable. Do not remount the
conversation to change layout. Preserve title-bar drag and visible Astra credit.

The map uses room names, availability and current-room text, with keyboard buttons;
colour is supplementary. Advertise WASD/Esc only when supported. Hover is a quiet
edge/material change, selection a stable accent with text. Use 120–180 ms UI and
250–450 ms inspect transitions. Reduced motion removes spatial easing/levitation.
Decorative objects never impersonate buttons. Focus remains visibly outlined.

## Hero acceptance and review views

M4 cannot pass without a convincing Hub; M5 has equivalent room gates. Record
1440×900 and 1100×700 views for day/sunset/night outside Git, with diagnostics and
truthful mock labels. Missing hero assets block room completion, not core navigation.

| Review | Pass condition |
|---|---|
| Entry | Clear destination and real exit; walkable floor; overlays do not hide hero/action |
| PC at ~1 m | Separate chassis/vent/glass/interior; recognizable GPU/cooler/RAM/fans; no block substitute |
| Desk seated view | Fitted monitor/keyboard/mouse/chair; readable actions; convincing joinery/cables |
| Living close-up | Shaped cushions/seams; fabric/wood distinction; real curtain travel and table clearance |
| Gaming close-up | Recognizable cabinet/controller/console; licensed art; truthful launcher state |
| Astra | Original proportions/materials/idle; floor contact, clear face, visible CC BY 4.0 |
| Motion / low tier | Stable hit targets, safe cameras, essential silhouettes and UI retained |

## M4 rendered workstation refinement

Original fitted GLB equipment replaces the weak block props: transparent engineered
PCs, sculpted task chairs, rounded trestle desks and real keycaps/stands/drivers.
Four subdued material rugs, engraved workspace panels, walnut shelves and local
stone/wood textures ground the bays. An interior ceiling-height key light produces
contact shadows inside the enclosed shell; a light above an opaque ceiling had
flattened the earlier view. One bounded shadow pass remains. No bloom/postprocess,
remote environment map or arbitrary CSS colour filter was introduced. Evidence and
actual geometry costs are in the inventory; M7 still performs the complete visual
audit after the other two furnished rooms exist.
