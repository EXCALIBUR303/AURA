# Phase 5 — interactive hardware

Status: implemented and verified in the cloud (software renderer), 2026-10-19. **Native Mac M5 validation has not been performed.** Branch `claude/phase5-interactive-hardware`, based on `main` `895ebc3fed1017d86854e03a0789c11a2b7a7155` (the approved Phase 5 spatial work, PR #5). Nothing was merged or installed. No voice, microphone, speech, TTS, Bluetooth or audio code was touched, and `/Applications/AURA.app` was not touched.

Ownership note: this work lives in `frontend/src/world/**`, normally Codex-owned. It was done by Claude Code at the owner's direction, as the Phase 5 navigation work was. All changes are additive or narrowly scoped (see [Files changed](#files-changed)).

## What the user gets

The Hardware workstation's PC is now a detailed, original, procedural gaming tower instead of a small authored box. Select **Equipment → Hardware workstation PC** (or click the PC in the Project Hub) to open an inspector:

- Click any major part in the 3D scene, or choose it from the list. The camera glides to frame it; drag to orbit, scroll or pinch to zoom.
- Each part shows its type, purpose, connections, cooling and a short technical explanation.
- **Explode view / Reassemble** separates the parts and is reversible at any moment; **Reset view** returns to the overview; **Exit inspection** (or Escape) restores the exact previous camera.

Everything is an illustration. It is not a model of any real product, carries no logos or trademarks, and shows **no measured value**: AURA does not read temperatures, fan speeds or usage from the user's machine, and the spinning fans and lighting are labelled in the panel as decorative and simulated.

## Implemented components

All geometry is generated at runtime from code (`world/hardware/builders.ts`) in PC-local metres. There are no new model files, textures or downloads.

| Part | What is modelled |
|---|---|
| Case and chassis | Mid-tower frame with corner posts, mesh front with fine slats, perforated rear and expansion area, rear exhaust fan with LED ring, feet, top panel with power button, two generic ports and a jack, subtle base light strips |
| Tempered-glass panel | Transparent panel with four standoff screws; it is the first part to separate when exploded |
| Motherboard | Textured circuit board (procedural trace pattern), CPU socket frame, two voltage-regulator heatsinks with fins, I/O shroud, chipset heatsink, four DIMM slots, PCIe x16 and x1 and M.2 slots, 24-pin and 8-pin power headers, SATA ports, battery, capacitors and chokes |
| Processor | Package with a metal heat spreader in the socket (hidden under the cooler until exploded) |
| CPU air cooler | Copper base, mounting bracket, four heat pipes, 21-fin aluminium stack, fan frame, instanced rotor, LED ring |
| Memory | Two DIMMs with heat spreaders, gold contacts and RGB strips, in alternate slots (dual channel) |
| Graphics card | Original high-end-style card (vertical mount on a riser): backplate, PCB, vapour-chamber-style copper plate, 28-fin heatsink, five heat pipes, shroud frame around three openings, three fan hubs and rims with LED rings, PCIe edge connector, output bracket with generic ports, auxiliary power plug. Three instanced rotors |
| Storage | M.2 NVMe stick under a heat shield; 2.5-inch SSD on a bracket |
| Power supply | Ventilated shroud over a modular unit with sockets and a front light line |
| Cables | Sleeved 24-pin, 8-pin and graphics-card power cables routed as tubes, plus the shielded riser cable |
| Front intake fans | Three 120 mm fan frames with LED rings and instanced rotors |

The PCI-e connector note: the card is described as "an original design"; no NVIDIA or other brand names, logos or product claims appear in code, labels or copy (a unit test checks the copy for brand names and measured-looking figures).

## Interactions

| Interaction | Behaviour |
|---|---|
| Select | Click a part in the scene (invisible hit boxes, enabled only while inspecting), or use the grouped part list (Core, Cooling, Power & storage, Enclosure). A selected part gets a bright outline bracket; hovering shows a faint one. Selecting again clears the selection |
| Camera | Framing is computed from the part's size and, when exploded, its displaced position (`focusPose`). Travel uses the existing cinematic planner, so reduced motion and Skip behave as everywhere else |
| Rotate and zoom | The existing OrbitControls, with limits while inspecting: 0.16–1.3 m from the target, never below the desk, never inside the case. Trackpad pinch arrives as ctrl+wheel |
| Explode | One progress value 0→1 moves each part along its own offset with a stagger; the glass leaves first, the board last. It is a pure function of progress, so reversing mid-way retraces the motion and the last part out is the first back in |
| Reset view | Deselects, reassembles and returns to the overview pose |
| Exit | **Exit inspection**, the close button, **Return to room** or Escape. Escape first clears a selected part, then exits. The camera returns to the exact previous pose |
| Keyboard | The part list, Explode, Reset and Exit are buttons with accessible names, visible focus rings and `aria-pressed`. The action row stays pinned while the information scrolls |
| Reduced motion | Explode and camera moves apply immediately; fans and the light breathing hold still |

Other equipment (Software, AI Lab, GitHub workstations) keeps its original behaviour and original models.

## Animation (all simulated)

- **Fans**: eight instanced rotors (3 front, 1 rear, 1 CPU cooler, 3 graphics card). They spin at a fixed decorative rate only while the window is active and motion is not reduced. This is not a fan speed, and no RPM is displayed.
- **RGB**: cyan-to-violet vertex colours on one shared unlit material whose brightness breathes slowly. It is a decoration, not a status signal.
- **Explode**: constant-rate progress (1.15 s end to end), eased per part with a stagger.

## Architecture

```
world/hardware/
  catalog.ts        pure data and math: parts, sizes, offsets, text, fans, explode curve, camera poses (unit-tested)
  builders.ts       procedural geometry, merged per material; rotor geometry
  materials.ts      11 shared PBR materials, circuit texture, local reflection environment
  inspection.ts     session-only store shared by the 3D rig and the panel (useSyncExternalStore)
  HardwareRig.tsx   the 3D tower: assembled (merged) or per-part (inspecting), proxies, outlines, rotors
  HardwareInspector.tsx / hardware.css   the DOM panel
```

- `Equipment.tsx` mounts the rig at the Hardware desk and stops using the authored PC and its three GLB fan rotors for that station only. The other three stations and every other room are unchanged.
- `EquipmentPanel.tsx` shows the new inspector for the Hardware PC and the original blurbs for the others.
- One Canvas, one camera owner (`WorldController`), no new WebGL context and no new bridge call.

### Camera and collision scoping

The Hub's desk collider is a 2.5 × 1.16 × 1.9 m box, which would reject every close view of the PC and forbid orbiting. While the Hardware PC is inspected, `WorldSnapshot.inspectionZone = "hardware"` swaps that one collider for a low desk slab, the monitor and the case itself (`HARDWARE_INSPECTION_COLLIDERS`), and narrows the zoom range. Nothing else changes (the chair, Astra, walls and other desks keep their colliders; other rooms get none).

The zone ends on arrival of **any** camera request that is not another hardware inspection (exit, workspace change, room travel, Escape-cancel, retry). The zoom limits are applied before the controls resume at the arrival frame, so they can never clamp the arrival pose. Two defects in this logic were found by tests and fixed (see [Test results](#test-results)).

## Optimizations

- **Merged by material**: the assembled tower in the room is 11 material meshes plus one instanced rotor mesh, not hundreds of parts.
- **Two levels of detail**: per-part geometry (needed for separation) is built only while the inspector is open and is disposed after the return animation. The room never holds it.
- **Shared resources**: 11 materials for the whole tower; one rotor geometry instanced eight times; one circuit texture; one outline geometry.
- **No new lights, shadow maps or post-processing.** Only the case frame and assembled tower cast shadows; interior parts do not.
- **Reflections** come from three's built-in procedural studio environment, applied only to these materials, so other rooms' lighting is untouched and nothing is fetched.
- **Per-frame work** is bounded: rotor matrices only while spinning or moving, part positions only while the explode progress changes, the glow value only when it changes.
- **Lifecycle**: resources are created in effects and released on cleanup (safe under React StrictMode); `__AURA_HARDWARE__` exposes read-only counters for tests.

## Test results

Run on Linux with Node 24.22.0, headless Chromium with a **software** GL (SwiftShader), against the dev server and the shared mock bridge.

### Unit and bridge (non-voice)

`node --test --test-isolation=none --test-skip-pattern='mock voice' shared/test/bridge.test.ts frontend/test/world.test.ts frontend/test/world-preferences.test.ts frontend/test/games.test.ts frontend/test/cinematic.test.ts frontend/test/hardware.test.ts`: see the result table in [Final verification](#final-verification). Voice tests were not run.

`frontend/test/hardware.test.ts` (10 tests): catalog integrity and copy (no brand names, no measured-looking figures), explode curve (monotonic, reversible, rate-limited, instant under reduced motion), exploded parts never intersect, every focus pose is collision-valid in the inspection geometry and invalid without it, the inspection store, and the zone lifecycle (held through the exit travel, cleared by any other request).

### Browser: `frontend/test/hardware.browser.mjs`

Checks: the assembled tower sits in the Hub at rest; opening frames the tower and shows the inspector; list selection frames and describes parts; **clicking parts in the scene** selects them; zoom, rotate and limits; explode reversed mid-flight and reassembled; Reset view; keyboard operation and an axe WCAG 2 A/AA + 2.1 AA scan; Escape in two levels; exact camera restore and release of per-part geometry; **no GPU resource growth across three open/explode/close cycles** (geometries, textures and programs identical); other equipment unchanged; laptop width (1100×700) without overflow and with the unsent draft kept; leaving through "Open hardware workspace" restores ordinary camera limits; reduced motion; no page errors and no external requests. The result table is in [Final verification](#final-verification).

### Regression: existing suites

Existing suites were run unmodified (apart from the one Hardware-specific assertion described below) against this branch **and** against unmodified `origin/main` in a separate worktree with the same stand-in models, so failures caused by the cloud environment can be told apart from regressions.

| Suite | `main` | This branch |
|---|---|---|
| `equipment.browser.mjs` | first 6 checks pass; fails only on the missing Astra file (page errors) | identical |
| `navigation.browser.mjs` | first 5 checks pass; the look-sensitivity drag check fails (`slow 0 fast 0`) in this environment | identical. With only that check skipped, the Living-object focus and system reduced-motion cut checks also pass |
| `spatial.browser.mjs` | times out waiting for `window.__spatialTest` | identical (environment, not a regression) |

The equipment suite had one assertion about the Hardware PC's old three text blurbs ("Board & memory"); it now checks the new inspector's "Motherboard" instead. That suite also caught a genuine regression in this work: the inspection allowance outlived inspection when leaving through "Open hardware workspace" (zoom cap clamped the next pose). It passes on `main`, so it was fixed here and a unit and a browser regression test were added.

Two further real defects were found and fixed during development: the exit pose was clamped to the 1.3 m zoom maximum because the limits switched one render after arrival, and two catalog poses were invalid (a front-fan view inside the chair collider; a board/power-supply overlap of a few millimetres).

The `spatial`, `github`, `polish`, `rooms`, `customization` and `design` suites, the voice suites and the unfiltered `npm test` were **not** run for this phase. The look-sensitivity drag check and the Astra-dependent assertions could not be exercised without the real model files.

### What the cloud environment cannot show

The five original GLBs, including the Astra Lumen II avatar, are gitignored and were **not present** in the cloud checkout. To exercise the Hub, small **throwaway stand-in** models with the required part names were generated locally (never committed; they are matched by `*.glb` in `.gitignore` and were deleted before the handoff). Consequently:

- the real Hub scene (desks, chairs, monitors, Astra) was not rendered here;
- hub-level draw call and triangle figures below are for a stand-in Hub and say nothing about the real one;
- the "Astra could not load" card was hidden by the test harness so it could not cover the canvas.

## Measurements

**These are from a software renderer in the cloud. They are not native Mac M5 numbers and must not be read as performance evidence.** Frame rate was not measured.

| View (dev-only preview, 1280×800) | Draw calls | Triangles | Geometries |
|---|---|---|---|
| Assembled tower (merged; includes one ground plane) | 13 | 18,098 | 12 |
| Inspecting: GPU selected | 54 | 16,570 | 63 |
| Inspecting: exploded | 53 | 16,570 | 62 |
| Inspecting: processor, exploded | 51 | 16,246 | 60 |

Counters include the shadow pass. Build time in the cloud: about 277 ms for materials plus the reflection environment and 60 ms for geometry (software GL for the first part). The assembled tower adds about 12 draw calls to the Hub (11 material meshes and the rotor mesh) while removing the authored PC and its rotor instances at that station; the real Hub's net change needs measuring natively.

## Screenshots

Real renders, taken from the dev-only preview page and from the full app against stand-in models, are delivered with the handoff rather than committed, because `AGENTS.md` asks that binaries are not committed without explicit approval. They are reproducible:

```bash
npm --prefix frontend run dev
AURA_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs AURA_CHROMIUM_PATH=/path/to/chromium AURA_SOFTWARE_GPU=1 \
  AURA_ARTIFACTS=/tmp/aura-hardware-screens npm --prefix frontend run screens:hardware
```

That writes `assembled.png`, `gpu.png`, `exploded.png`, `cpu-exploded.png` and `cooler.png` plus `screens.json`. Do not set `AURA_SOFTWARE_GPU` on the Mac. The full-app panel views come from `hardware.browser.mjs` (`inspect-gpu-1440.png`, `inspect-gpu-1100.png`, `inspect-exploded-1440.png` and others in `AURA_ARTIFACTS`), and show the stand-in desk, not the real Hub.

## Known limitations

- **CPU cooler occlusion.** The tower cooler covers the processor, so a scene click lands on the cooler until the view is exploded. The panel says so, and the list always selects the processor.
- **Case selection.** Only the top and bottom plates are clickable for "Case and chassis"; the frame, pillars, rear and glass are not. The glass has no hit box on purpose, so clicks reach the parts behind it. The case is always available from the list. Cables are list-only, because thin tubes make poor click targets.
- **Stand-in workstation.** The Hub in the cloud used stand-in models; the real Hub, Astra, and the other rooms were not rendered with this branch. The Software, AI Lab and GitHub PCs still use the authored GLB PC.
- **Camera range.** The chair collider prevents orbiting around to the front of the PC. Front intake fans are therefore framed from the side.
- **Information panel.** The part text is long for a 340 px panel at laptop height; the panel scrolls and its controls stay pinned.
- **Materials.** Metals pick up only a procedural studio reflection. Realism of finishes can only be judged on the native display.
- **Not real hardware.** The tower is a generic illustration. It does not reflect the user's Mac, and no figure on it is measured.
- **Not run:** native app, WKWebView pointer input, VoiceOver, system Reduce Motion/Transparency, DPR 2 GPU behaviour, long sessions.

## Asset licensing

No new binary, texture, font, model or HDRI was added. All shapes and the circuit pattern are generated by code written for this project; the circuit pattern is a seeded procedural drawing. `RoomEnvironment` and `RoundedBoxGeometry` come from the already-bundled `three` package (MIT) and are used offline. No dependency was added or changed (`package-lock.json` is unchanged). The five existing GLBs, their manifests and credit files, and the Astra Lumen II CC BY 4.0 attribution are untouched. The Hardware desk still uses the original authored desk and monitor.

## Files changed

New: `frontend/src/world/hardware/*` (7 files), `frontend/test/hardware.test.ts`, `frontend/test/hardware.browser.mjs`, `frontend/test/hardware.screens.mjs`, `frontend/hardware-preview.html`, `frontend/src/hardware-preview/main.tsx` (dev-only entry, not part of the production build), this document.

Changed: `world/assets/Equipment.tsx` (mount the rig, drop the authored PC at the Hardware station), `world/interactions/EquipmentPanel.tsx`, `App.tsx` (the Hardware PC is framed by the inspector; passes the world controller), `world/WorldController.ts`, `world/WorldNavigation.tsx`, `world/registry.ts`, `world/types.ts` (the scoped inspection zone), `test/equipment.browser.mjs` (one assertion), `package.json` (scripts only), `TASKS.md`.

Unchanged: `macos/**`, `shared/**` (bridge contracts, mock, fixtures), `frontend/src/platform/**`, voice code, GitHub and AI code, `assets/**`, `frontend/public/**`, the lockfile.

## Native Mac M5 validation checklist

Use an isolated worktree and the Release app build from this branch; do not modify `/Applications/AURA.app`. Copy the five gitignored GLBs and verify them with `shasum -a 256 -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt` first.

1. `npm --prefix frontend ci`, `npm --prefix frontend run build`, and the unit command above. Run the browser suites on the Mac against the dev server (use the real GPU: do not set `AURA_SOFTWARE_GPU`): `hardware`, `equipment`, `navigation`, `spatial`.
2. **Hub at rest:** window active, DPR 2. Record fps, draw calls and triangles with the Hub visible, and compare with the Phase 5 baseline (Hub 56–58 calls, about 250k triangles). Target 55–60 fps. The expected delta is about +12 calls and a few thousand triangles from the tower.
3. **Open the inspector** and select each part (GPU, memory, processor, motherboard, CPU cooler, intake fans, storage, power supply, cables, case) from the list and by clicking in the scene. Confirm the camera frames each without clipping into the desk, monitor or case.
4. **Orbit and zoom** with the trackpad (two-finger drag, pinch) and mouse in WKWebView. Check the 0.16–1.3 m limits, that the camera never enters the case, and that nothing clips at the near plane when zoomed in on the exploded GPU.
5. **Explode and reassemble**, including reversing mid-animation and switching selection while exploded. Record fps during the animation.
6. **Exit routes:** Exit inspection, the close button, Return to room, Escape (selected part first, then exit), "Open hardware workspace", and room travel while inspecting. After each, confirm ordinary camera limits and (where applicable) the exact previous view.
7. **Visuals:** judge reflections, metal and glass finishes, the board texture, LED rings and the cables against the screenshots. Check that the glow breathing is subtle and that fans spin only while the window is active; minimize and hide the window and confirm rendering stops and resumes.
8. **Reduced motion:** system Reduce Motion on and off, and the world's own switch: instant view changes, no spin, steady glow.
9. **Resources:** open and close the inspector 20 times and watch geometry, texture and program counts and WebContent memory (`__AURA_HARDWARE__.resources()` in a dev build). They must return to their starting values; peak memory before garbage collection is not a leak (see PHASE5_FOUNDATION_REVIEW.md).
10. **Accessibility:** VoiceOver reads every control with a name and state; Tab order is sensible; focus rings are visible on the dark panel; text remains readable at 1440×900, 1280×800 and 1100×700.
11. **Other equipment and rooms:** Software, AI Lab and GitHub PCs, Living, Gaming, Atrium travel, the Astra console, GitHub explorer and the credit footer behave as before. Confirm the Astra Lumen II credit is visible and the five GLB hashes match.
12. **Console and network:** no errors in `log show --predicate 'subsystem == "com.aura.app"'`, and no requests outside `aura://` or the dev server.

## Future improvements

- A native-measured quality pass on materials once the owner has seen it on the display (anisotropic brushed metal, a baked or captured studio environment, ambient occlusion in the case).
- Click targets for the case frame and cables, and a hint ring that reveals the processor under the cooler.
- Use the same kit, in a non-inspectable form, for the Gaming room desk (about 12 more draw calls there) and offer one or two alternative builds.
- Real, user-approved hardware information (for example the Mac's actual model) through a native bridge method, clearly separate from this generic illustration.
- Persist the last inspected part only if the owner approves a contract change; today the state is session-only by design.
