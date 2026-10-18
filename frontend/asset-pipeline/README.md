# Original AURA equipment

`workstation.py` is original Blender authoring source created for Project AURA.
It contains only authored shapes/materials; no downloaded scripts, third-party
meshes, logos or textures. No external addons, codecs or assets are required.
The project retains the original asset rights; this does not assign a new licence
to the user's work. Astra Lumen II remains a separate, immutable CC BY 4.0 asset.

Reproduce from the repository root with Blender 4.3 or later:

```sh
blender -b --factory-startup --disable-autoexec \
  --python frontend/asset-pipeline/workstation.py -- \
  --output frontend/public/world/workstation.glb
```

The generated GLB is intentionally Git-ignored and must be copied or reproduced
on a new checkout. Export uses metre scale, Y up, front +Z, embedded materials and
no Draco/Meshopt. Named model roots have a common ground/desktop origin; static
parts are merged by material before export. The runtime batches room copies by
material and instances eligible fan rotors. No workstation part reports actual
hardware measurements. A generated artifact must be inspected and measured before
being accepted; Blender source alone does not establish visual quality.

After export, record the read-only embedded-data inspection:

```sh
node frontend/asset-pipeline/inspect.mjs \
  frontend/public/world/workstation.glb frontend/public/world/workstation.manifest.json
```

The committed manifest records the actual generated file, triangle/material counts
and digest. A newly exported file may differ across Blender exporter versions;
inspect its runtime geometry, scale and screenshots rather than trusting a name.
`npm --prefix frontend run assets:workstation` is a convenience wrapper. On macOS,
if Blender is installed outside PATH, use
`/Applications/Blender.app/Contents/MacOS/Blender` for the command above. Blender is
only an offline asset authoring tool, never a production dependency of AURA.

## Separate rooms

`rooms.py` creates the original room kit (furniture, lamps, curtains, plants,
arcade, console/controller, display/frame). Same offline authoring and project
rights as the workstation kit. Generate and inspect from repository root:

```sh
blender -b --factory-startup --disable-autoexec \
  --python frontend/asset-pipeline/rooms.py -- \
  --output frontend/public/world/room-kit.glb
node frontend/asset-pipeline/inspect.mjs frontend/public/world/room-kit.glb \
  frontend/public/world/room-kit.manifest.json
```

Two reviewed seating assets are separate unchanged originals, with pinned source,
digests and licences in `frontend/public/world/FURNITURE_CREDITS.txt` and
`docs/WORLD_ASSET_INVENTORY.md`. Copy `GlamVelvetSofa.glb` and `SheenChair.glb`
from the reviewed local workspace or obtain them at that exact official source
revision. Do not run external scripts or substitute the licence of the repository.
All four world GLBs are ignored; copy them to `frontend/public/world/` on a new
checkout. Preserve original Astra separately per `docs/ASSETS.md`. These are
bundled assets at runtime; source links are attribution/reproduction references,
not runtime fetches. No binary publication or commit is implied.

## M6 display and fan revision

The workstation source now exports `monitor-stand` and `monitor-panel` under the
compatibility `monitor` root. The runtime keeps stands grounded and instances panel
bodies; screen meshes share one atlas and move with the panels. PC front surrounds
are open rings, allowing the correctly placed real rotor mesh to remain visible.
Regenerate the ignored GLB and its manifest together; the current file digest is
in `workstation.manifest.json`. Previous milestone hashes are historical evidence,
not the expected current export. None of these changes touches licensed Astra or
reviewed furniture originals.
