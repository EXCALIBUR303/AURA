# World asset inventory

Status: M0 baseline retained; M2 reviewed candidates and measurements are below.
Three research GLBs were acquired outside the checkout. No new model/texture/tool/
skill is installed in AURA, and no binary has been committed.

## M3 foundation resources

No new GLB adopted in M3. Hub/Atrium structural boxes are instanced by material;
room signs are bounded local 1024×256 canvas textures, no remote fonts/assets.
Existing workstation props remain migration geometry until the M4 hero gate.
Original Astra file/hash and visible credit remain unchanged. Final 20-visit
world test reports 19 geometries, 8 textures and 12 shader programs with two room
instances retained. These measurements do not certify future asset memory costs.

## Verified existing hero

| Field | Astra Lumen II |
|---|---|
| Name | Astra Lumen II, a rigged companion android |
| Creator | XRProfXR — https://sketchfab.com/pinckneyb |
| Source | https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428 |
| Licence / credit | CC BY 4.0; title, creator, source and licence link remain visible; original `CREDITS.txt` retained |
| Path | `assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb`; public symlink serves `/avatar/astra-lumen/...` |
| Tracking / size | Original binary is ignored, **18,054,896 bytes** (17.2 MiB); each checkout needs the licensed copy |
| Digest | `e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1` |
| Geometry | 36,508 triangles; one skinned mesh/primitive/material, 72 joints, zero morph targets |
| Textures / material | Embedded 2048² PNG (~5.1 MiB) and 64² PNG, base colour + metallic/roughness, clearcoat extension; inspect reports no required extension |
| Animation | `Idle02_F`, 31.8 seconds, 283 channels; head/eye/jaw support, no finger bones or walk clips |
| Modifications | None to file. Existing runtime normalization to 1.75 m and procedural reactions retained |

`npm --prefix frontend run inspect:avatar` and SHA-256 were checked in M0. Do not
optimize/re-export/replace the original GLB; a future authorized derivative requires
separate provenance, attribution and approval. No new Astra gesture/animation may
be assumed from its appearance.

## Existing procedural environment

`frontend/src/studio/World.tsx` supplies instanced boxes, primitive plants, desks,
chairs, architecture and abstract monitor marks; it is not a library of licensed
external furniture models. Reuse efficient structural primitives/instancing where
visually appropriate, but do not label them premium hero assets. Current geometry
does not provide realistic PC internals, fitted mechanical keyboards, fabric sofas,
console controllers or arcade equipment.

## Required asset families — see M2 decisions below

| Needed asset family | Quality gate | First consumer |
|---|---|---|
| Developer PC chassis + internals/fans/GPU/cooler/RAM | Believable proportions, separate metal/glass/plastic, identifiable components, useful pivots and constrained transparent surfaces | Hub hero in M4 |
| Monitor/laptop, keyboard/mouse/pad/speakers | Correct scale, fitted desk footprint, addressable screen surface and coherent PBR | Hub M4; shared gaming equipment M5 |
| Desk/chair/shelves/tools/cable channels | Convincing silhouette/material detail, clear walking/inspection space | Hub M4 |
| Sofa/armchair/table/rug/lamps/storage | Warm material family, fabric geometry/surface, seating scale | Living M5 |
| Plants/books/art/curtains | Compatible licences, no unapproved embedded artwork, sensible pivots for supported controls | Living/Atrium M5 or M3 |
| Gaming display/console/controller/arcade/seating | Original or licensed generic designs, no embedded commercial game artwork/software | Gaming M5 |
| Stone/glass/wood/metal/fabric surfaces and local environment maps | Correct colour/data spaces, measured texture cost, coherent light profiles | All rooms |

Research starting points authorized by the brief: [Poly Haven](https://polyhaven.com),
[Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com),
[Sketchfab](https://sketchfab.com). Direct catalogue pages are not verified;
do not infer a licence from the hosting platform. Hugging Face is selective research
only, not an automatic production mesh source. No download restriction bypasses,
scraping, executable installers or unreviewed repository scripts.

## Intake record required before runtime use

Record exact asset ID/name, creator, source/download URL, licence/version and
credit requirements, licence evidence file/date, local path/hash/bytes, dimensions,
orientation/scale/pivot, triangles/meshes/materials/draw implications, texture sizes
and colour spaces, animations/colliders, decoder/runtime dependencies, modifications
and derivative output path. Record whether the original and derivative are tracked
or ignored. Binary commit authorization is separate from researching/downloading.

Review source and artefacts as untrusted; inspect archives and data without running
included code. Inspect scripts, licence, maintenance, compatibility and dependencies
before adopting a tool/skill. Record references and the actual decision, including
rejected candidates and unresolved hero gaps. No asset is approved by this queue alone.

## Optimization decision gate

Compare actual geometry/material/texture budgets in the composed room, not only a
single mesh viewer. Prefer sharing/instancing, appropriate LOD, bounded shadows and
small suitable textures. Review glTF-Transform/gltfjsx/meshoptimizer/KTX2/Draco and
Blender automation for a concrete asset problem; install nothing merely because it
is listed. Bundle all runtime decoders/HDRIs; inspect native CSP/WASM compatibility.
Keep originals/provenance, validate changed pivots/bounds and compare rendered quality.
M2 per-room budgets are in WORLD_ARCHITECTURE, relative to the measured baseline; no new
room is claimed to hold M5 ≥55 fps until that composition is measured natively.

## Milestone 2 — actual source and model review

Reviewed 2026-10-18. Public HTTP requests to Poly Haven/API, Kenney, Quaternius,
Sketchfab/API, Three documentation and GitHub API returned proxy **403 Forbidden**.
This is an environment access limitation, not evidence those assets are unavailable
or unlicensed. No access restriction was bypassed. The configured HTTPS Git proxy
successfully read the official repositories below. No external scripts were run,
no packages installed, and no new binary entered AURA or its Git history.

Source snapshot: [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe),
commit `edc7c9e67c639d230715049ee31f9a96a6babbbe` (2026-10-02). Asset-specific README
licences were reviewed **before** fetching selected GLBs. Platform/repository-wide
licensing was not substituted for an asset licence. Research copies and evidence:
`/workspace/aura-phase4/m2/research/assets/`; files there are outside the checkout.
These are reviewed candidates, not integrated or redistributed runtime assets.

### Candidate decisions and measured intake

| Field | GlamVelvetSofa | SheenChair | SheenWoodLeatherSofa |
|---|---|---|---|
| Decision | **Preferred candidate** for Living/Gaming fitting | **Conditional accent chair**; not an office chair or an armchair replacement | **Rejected for room use**; ornate form conflicts with direction, higher texture/alpha cost |
| Creator / licence | Eric Chadwick, ©2021 Wayfair LLC; **CC BY 4.0** | Eric Chadwick, ©2020 Wayfair LLC; **CC0 1.0** | Fran Calvente original ©2021 **CC0**; Eric Chadwick improvements, ©2024 Darmstadt Graphics Group GmbH **CC BY 4.0** |
| Source record | [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/GlamVelvetSofa/README.md) | [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/SheenChair/README.md) | [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/SheenWoodLeatherSofa/README.md) |
| Local original | `…/assets/GlamVelvetSofa.glb` | `…/assets/SheenChair.glb` | `…/assets/SheenWoodLeatherSofa.glb` |
| File bytes | **3,149,844** | **4,125,648** | **10,107,912** |
| Unique triangles / mesh primitives | **4,196 / 3** | **39,936 / 4** | **46,492 / 6** |
| Declared materials / active default | 7 / 3; five fabric variants | 6 / 4; two variants | 6 / 6; fringe alpha blend |
| Bounds X×Y×Z, metres | 2.18844 × 0.78754 × 1.02283 | 0.82656 × 0.68625 × 0.57027 | 2.72580 × 1.11730 × 0.92318 |
| Images | Two 1024² PNGs: AO and fabric normal; colours from factors | Seven PNGs: one 1024², one 1024×512, five 512² | Thirteen WebPs: two 2048², two 1024², four 512², two 256², one each 512×256/256×128/128² |
| Estimated image storage with RGBA8 mip chain | **10.67 MiB** | **14.67 MiB** | **60.25 MiB** |
| Required extensions | `KHR_texture_transform` | `KHR_texture_transform` | `KHR_texture_transform`, `EXT_texture_webp` |
| Optional material features | Sheen/specular/variants; embedded directional light | Sheen/variants; source's Peacock fabric uses artistic metalness=1 | Sheen/specular, transparent fringe with authored sorting |
| Animation / pivots | No animation; bottom Y≈0.00005, asymmetric X/Z center | No animation; bottom Y≈−0.00007 | No animation; bottom Y≈0.00063 |
| File modifications | None | None | None |

The `…` prefix above is `/workspace/aura-phase4/m2/research`. GLB paths in the
source repository are `Models/<name>/glTF-Binary/<name>.glb`. Licence evidence is
saved beside each original as `<name>-README.md`; acquisition date is above.
SHA-256:

- GlamVelvetSofa: `67202c74a1a33377771f162dc7fad612a6c9bd51ee15124c488e9851d9ac5266`
- SheenChair: `f0af2a2b102d28d540236306ae19f8fb36842df76bd38cf76f063f9bd2853399`
- SheenWoodLeatherSofa: `5349e042ad41e695e89f1110230c4ee0c75b2bc62ef830c7016be6ecf665bfb6`

Counts come from the actual downloaded GLB accessors, not marketing/README numbers.
Glam's README says 4,319 triangles; this exact binary has **4,196**. Texture storage
is an estimate (`width × height × 4 × 4/3`), not measured GPU memory; variants,
shared images, colour-space copies and driver allocation can change it.

All three loaded and rendered locally using the installed Three r186 GLTFLoader,
with no page errors or external asset requests. Review screenshots, measured JSON
and source files remain outside Git. The isolated viewer included floor/environment
and one shadow pass: Glam **7 calls / 8,394 rendered triangles**, chair **9 / 79,874**,
ornate sofa **13 / 92,986**. These are isolated software-renderer draw totals, not
AURA room benchmarks, FPS measurements or Mac acceptance. GLB bounds were measured
before viewer placement; no source asset was normalized or rewritten.

### Fitting, colour and attribution decisions

- Keep Glam's natural dimensions; enlarge the planned sofa collision envelope to
  1.05 m deep instead of stretching the model to a 2.6 m width. It fits the maximum
  Living/Gaming footprints. Recenter the **instance**, preserve original file/pivot.
- Its source directional light has intensity 3. Disable it on the instance before
  joining room lighting; it was disabled in the comparison viewer. Never accumulate
  a light rig per sofa. The default navy fits Gaming. Living needs an explicit
  original champagne variant or a documented forest-fabric material derivative.
  Variant selection is **not implemented**; core GLTFLoader alone does not expose
  a complete variants UI. Do not promise five working options yet.
- The chair has a convincing curved silhouette, fasteners and upholstery. Its vivid
  mango colour and unusually low back need actual room review. Keep at most one
  initially; a 40k-triangle chair is not an instanced default for four workstations.
  A required upholstered armchair and ergonomic office chair remain unresolved.
- For Glam, publish a credit such as “GlamVelvetSofa — Eric Chadwick / Wayfair LLC,
  CC BY 4.0” with the source and licence links; describe instance lighting removal
  and any future material derivative. Keep source legal notices. The sample depicts
  a real product; use a generic AURA label and no endorsement/brand claims.
- CC0 chair credit is optional legally but retain creator/source provenance. Do
  not copy reference photographs from the README into AURA; their rights were not
  established by the model licence. Rejected assets never ship just because fetched.
- Original Astra stays byte-for-byte unchanged with its existing visible credit.
  New research candidates have no runtime path yet. Binary publication still needs
  owner approval; future assets must travel with their licence and measured manifest.

### Unresolved assets and bounded next steps

| Asset gap | Status / next action |
|---|---|
| PC chassis, recognizable GPU/cooler/RAM/fans, peripherals, monitors/laptop, office chair | **M4 completion blocked on asset quality/licence intake.** No suitable detailed PC acquired. Resume approved catalogue research when reachable; an original authored model must meet the same silhouette/material/pivot gate, never substitute featureless blocks |
| Living armchair, table, curtains, lamps, plants, books/art | Planned; sofa candidate does not satisfy the whole room. Curtains need actual controllable geometry; no cloth-simulation dependency by default |
| Generic arcade, console/controller, gaming desk props | Planned; no commercial artwork/game included. Verify exact model licence and working input surfaces |
| HDRI and material textures | No external map acquired. Start with controlled local Three environment generation/materials; research a small licensed HDRI only if comparison shows a benefit |
| Poly Haven / Kenney / Quaternius / Sketchfab | Direct source pages blocked by environment proxy. Candidates from those catalogues remain unverified; their names alone confer no production approval |
| Hugging Face | Deferred: no concrete mesh advantage or local-inference task at M2; no model/runtime/skill installed |

If further HTTP asset research is needed, add the specific domains through cloud
Environment settings: `polyhaven.com`, `api.polyhaven.com`, `kenney.nl`,
`quaternius.com`, `sketchfab.com`, `api.sketchfab.com` (then review each actual download
host). The current allowlist cannot be read here, so it was **not replaced**. Git
research remains usable. This does not block M3's atrium + existing-hub migration;
it does prevent declaring the later detailed rooms complete.
