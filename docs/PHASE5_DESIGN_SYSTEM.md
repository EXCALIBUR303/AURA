# AURA Spatial — design foundation

The world is the primary surface. Interface chrome supplies orientation and short actions; conversation and project work expand only when requested. The direction takes spatial intelligence as inspiration and uses original AURA typography, line work, room illustrations and composition. No film UI artwork, logo, audio or other proprietary assets were copied.

## Palette and surfaces

All new tokens are scoped under `.spatial-os` in `designs/design-system/tokens.css`. Existing components consume mapped `--aura-*` semantic roles, so their status and accessibility logic remains intact.

| Role | Token / value | Use |
| --- | --- | --- |
| World backing | `--spatial-void: #080e18` | Quiet outer shell |
| Panel | `--spatial-panel: #101c2a` | Readable, nearly opaque work surfaces |
| Raised panel | `--spatial-panel-raised: #172638` | Layered controls and content |
| Architectural rule | `--spatial-line: #33485c` | Surface separation; not the sole interactive boundary |
| Primary action | `--spatial-cyan: #9cdeeb` | Navigation, selection and focus |
| Astra identity | `--spatial-violet: #c1b3f4` | Companion emblem and working state |
| Warning | `--spatial-amber: #f0c48e` | Recoverable problems and unsaved changes |
| Primary text | `--aura-ink: #e8f0f5` | Titles and content |
| Secondary text | `--aura-ink-secondary: #b7c7d6` | Supporting information |
| Control boundary | `--aura-control-border: #627c91` | Inputs and actionable outlines |

Use semantic success/warning/error roles with text, never colour alone. Glass-like depth comes from strong backing, fine borders and bounded shadows, not expensive live blur. Keep actual scene colour grading in existing materials/lights; do not add bloom or independent monitor renderers for decoration. The world-facing sign texture remains locally generated on the same meshes.

## Composition

- Title bar: 56 px, 80 px left inset preserving native traffic-light/drag space. Quiet account/project context, inspector, search and settings.
- Workspace rail: left 18 px, vertically centred, six 66 px-wide buttons. Labels remain visible; native shortcuts stay available. This is a workspace selector, distinct from room travel.
- World navigation: bottom shelf, starting 118 px from the left; compact map, inspection, Explore and settings actions. Credits remain visible in the 28 px footer.
- Minimized Astra: bottom-right beacon, 268–320 px, current textual state. It must not overlap project saves or equipment controls. The project surfaces reserve a 96 px bottom shelf.
- Compact Astra: 420 px on desktop / 390 px at laptop widths, with optional left/right edge button. Expanded and focus modes retain the established split layout and width controls. Minimize releases the world area without unmounting the console.
- Room navigation: four cards at larger desktop widths; two columns at ≤1250 px. Each has a semantic room identity, original SVG architectural illustration, current-location label and a real travel action. No second WebGL renderer or captured thumbnail dependency.
- Equipment: upper-right contextual panel, bounded above the dock. Opening it minimizes Astra; restoring Astra returns from inspection through the established camera API.

Supported review sizes: 1440×900, 1280×800 and 1100×700. Smaller mobile layouts are not a goal of this phase. Avoid replacing these layouts with a collection of permanent panels over the avatar.

## Type, interaction and accessibility

Use the existing bundled/system UI and monospace stacks. Body/support text is 11–14 px; uppercase technical labels may be 10 px; primary spatial headings are 25–32 px. Use sentence case for instructions, restrained tracking for short uppercase identifiers and readable line height. Never put essential low-contrast text directly over the 3D world.

Focus rings are 2 px cyan with a 4 px offset. The room modal uses the existing focus trap and Escape return. Console minimize moves focus to its beacon; restore moves it to the same textarea. Preserve the tab order, native shortcuts, keyboard equipment picker and drag-to-look Explore. Pointer lock remains optional.

New transitions are bounded 160 ms background/border changes and are absent under system reduced motion. Existing world/native/system motion precedence remains authoritative. Reduced-transparency CSS supplies opaque backing; actual macOS preference behaviour still needs native review. Do not animate the entire room-selector grid or make the user wait for decoration before choosing a destination.

## Extension rules for Claude Opus 5.5

1. Extend semantic tokens and reusable surfaces before adding component-specific colours. `spatial.css` currently adapts the established panels without changing their service ownership; future consolidation can move adapters into components after visual review.
2. Keep a single Canvas, camera owner, world controller and authoritative Astra. Original model bytes, credit and animation ownership stay intact.
3. Keep state labels tied to real conversation/controller state. An animated border cannot stand in for loading, errors, unavailable services or approval requirements.
4. Preserve the mounted `CompanionWorkspace`, `useConversation` owner, textarea and dialogs. Never implement minimize by conditional mounting, cancellation or clearing history.
5. Treat minimize and edge docking as session-only. Current pane width is also session-only. Any native persistence extension requires an approved shared contract; do not invent localStorage mirrors.
6. Preserve the original voice-control island and its handlers while audio is frozen. The new palette must not silently restyle or activate the microphone controls.
7. Review actual four-room renders at the documented desktop sizes. Compare draw calls/triangles as well as appearance. Native M5 FPS is a separate acceptance gate.

Left/right docking is implemented; arbitrary panel dragging is deferred. The first-release room and game architecture remains as inherited. This foundation is intended for extension after review, not a claim that the full Phase 5 programme is complete.
