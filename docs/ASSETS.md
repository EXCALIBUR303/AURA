# Assets

## Astra Lumen II (companion character)

| | |
|---|---|
| File | `assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb` (17.2 MB, glTF 2.0 binary, Sketchfab-17.15.0 export) |
| Author / licence | XRProfXR, **CC BY 4.0**. Full attribution in [`CREDITS.txt`](../assets/avatar/community/astra-lumen/CREDITS.txt) |
| In git? | **No.** `*.glb` is gitignored until Git LFS is set up. Each checkout or worktree needs a copy (see below). |
| Served to the frontend at | `/avatar/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb` via the symlink `frontend/public/avatar/astra-lumen → assets/avatar/community/astra-lumen` |

### Verified contents

These were checked on 2026-10-16 with `npm --prefix frontend run inspect:avatar` (container parse) and confirmed by loading the model in three.js r186, both in Chromium and in WKWebView inside `AuraApp`.

| Property | Value | Implication |
|---|---|---|
| Meshes | 1 skinned mesh `temp_Material_001_0`, 36,508 triangles | Cheap to render, with one draw call. |
| Vertex attributes | POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 | No tangents, so normal maps (if added later) need generated tangents. |
| Morph targets / blend shapes | **0** | **No facial expressions or visemes.** Lip-sync has to use the jaw bone, an emissive "voice" glow, or new morphs authored later. |
| Material | 1 × `Material_001`, using baseColor and metallicRoughness textures plus `KHR_materials_clearcoat`. three.js loads it as `MeshPhysicalMaterial`. | Clearcoat costs an extra lighting pass. Opaque. |
| Textures | 2048×2048 PNG (5.1 MB) and 64×64 PNG, embedded | Consider KTX2/Basis in Phase 2 to cut GPU memory and load time. |
| Skeleton | 1 skin, 72 joints, Character Creator (`CC_Base_*`) naming | It has a hip/spine/neck/head chain, clavicle→upperarm→forearm→hand, twist bones, `JawRoot`, `L_Eye`/`R_Eye`, tongue and teeth, and toe bones. |
| Finger bones | **None.** Hands end at `CC_Base_L_Hand` / `CC_Base_R_Hand`. | No finger animation or gestures beyond wrist rotation. |
| Animations | **1 clip: `Idle02_F`, 31.8 s, 283 channels** (rotation, translation, scale) | **This is the only animation.** Walk, talk, gesture, wave and so on do not exist and must be sourced or authored (see below). |
| Scale / units | The mesh is authored in centimetres: 1.91 m tall after the FBX node's ×0.01. The Sketchfab root node then applies **×1.748**, so the model loads **3.34 m tall**. | Phase 2 must normalise it, e.g. scale the root so height ≈ 1.70–1.80 m. |
| Up axis | The root node's matrix converts Z-up to Y-up | It already stands upright in three.js. |

Clip names and counts are read from the file, not assumed. Re-run `npm --prefix frontend run inspect:avatar` after replacing the file.

### Getting the file into a new checkout or worktree

```bash
cp ~/Developer/AURA/assets/avatar/community/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb \
   <worktree>/assets/avatar/community/astra-lumen/
```

If it is missing, `inspect:avatar` exits non-zero and the validation scene shows `status: error`.

### Adding animations (Phase 2+, needs a decision)

The rig follows Character Creator / iClone conventions. Options:
1. **Retarget** CC-compatible clips (Mixamo, ActorCore) in Blender, then export GLB. Check each clip's licence before committing.
2. **Procedural**: drive head and eye look-at, breathing, jaw-open-on-speech and wrist motion directly from bones in three.js. This needs no new assets.
3. **Commission or author** clips for the same rig.

Any modified GLB must be listed under "Changes made by AURA" in `CREDITS.txt` (CC BY 4.0 requires indicating changes).

## Stitch design exports

`designs/stitch/stitch_aura_personal_3d_ai_developer_universe/` is reference material only. See [DESIGN_ANALYSIS.md](DESIGN_ANALYSIS.md). `screen.png` is gitignored (1.4 MB binary). Read it from the main checkout.
