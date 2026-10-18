# World asset inventory

Status: Milestone 0 baseline. No new model, texture, HDRI, external tool or skill
has been acquired, installed or licensed in this milestone. Asset research belongs
to M2 after M1 defines the actual architectural plan and hero requirements.

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

## Acquisition queue — all unreviewed / planned

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
[Sketchfab](https://sketchfab.com). No specific asset from these sites is yet verified;
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
M2 must set explicit per-room budgets against the measured main baseline; no new
room is claimed to hold M5 ≥55 fps until that composition is measured natively.
