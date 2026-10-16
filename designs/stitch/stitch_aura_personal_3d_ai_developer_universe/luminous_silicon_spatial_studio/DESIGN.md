---
name: Luminous Silicon Spatial Studio
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf1'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee9ff'
  surface-container-highest: '#d8e3f9'
  on-surface: '#111c2c'
  on-surface-variant: '#3e484e'
  inverse-surface: '#263142'
  inverse-on-surface: '#ebf1ff'
  outline: '#6e797f'
  outline-variant: '#bdc8cf'
  surface-tint: '#006686'
  primary: '#006483'
  on-primary: '#ffffff'
  primary-container: '#007ea4'
  on-primary-container: '#fbfdff'
  inverse-primary: '#6fd2ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#4648d4'
  on-tertiary: '#ffffff'
  tertiary-container: '#6063ee'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c0e8ff'
  primary-fixed-dim: '#6fd2ff'
  on-primary-fixed: '#001e2b'
  on-primary-fixed-variant: '#004d66'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f9f9ff'
  on-background: '#111c2c'
  surface-variant: '#d8e3f9'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-default:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 19px
    letterSpacing: -0.005em
  body-strong:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 19px
    letterSpacing: -0.005em
  body-compact:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 17px
    letterSpacing: 0em
  code-base:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: -0.02em
  code-inline:
    fontFamily: JetBrains Mono
    fontSize: 11.5px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-micro:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-spacious: 1.25rem
  margin: 1rem
  margin-screen: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

This design system defines a high-precision, cinematic developer environment crafted specifically for Apple Silicon macOS architecture. It merges the physical tactility of brushed titanium, frosted crystalline optical glass, and high-density spatial canvas computing. The aesthetic deliberately rejects over-saturated sci-fi tropes, glowing cyberpunk neon, and crypto dashboard clutter in favor of a restrained, instrument-grade architectural workspace.

### Core Philosophy
- **Instrument-Grade Restraint:** Every chrome element, HUD panel, and code display behaves with the quiet precision of high-end optical laboratory equipment.
- **Atmospheric Luminosity:** Surfaces rely on high-transmission frosted glass, translucent white-gray plates, and calibrated edge diffraction rather than muddy artificial shadows.
- **Tactile Material Honesty:** Seamless blending of light aerospace-grade metal (anodized clear titanium), high-index blur layers (Liquid Glass), and razor-sharp typographic telemetry.
- **Cognitive Clarity:** Dense multi-dimensional workflows (neural graph manipulation, node-based runtime orchestration, inline code compilation) maintain calm hierarchy through meticulous negative space and strict optical weighting.

### Design Movement Synthesis
A blend of **Modern macOS Desktop Native**, **Refined Architectural Glassmorphism**, and **Minimalist Swiss Information Design**. The interface remains predominantly light, luminous, and airy, anchored by milled dark titanium accents, razor-thin inner boundary reflections, and chromatic light cues.

## Colors

The system operates on an airy, luminous baseline with carefully calibrated transmission values that allow 3D canvas viewports and desktop wallpapers to subtly inform chrome layers. Color is deployed with surgical discipline: 90% of surfaces remain monochromatic or optical translucent values, reserving vivid spectral tones solely for system state, compilation telemetry, and spatial graph nodes.

### Palette Architecture

- **Primary Canvas & Light Plate Base:**
  - `canvas-root`: `#F7F9FC` (Soft optical daylight substrate).
  - `surface-glass-base`: `rgba(255, 255, 255, 0.72)` with a 32px Gaussian backdrop blur and 160% saturation boost.
  - `surface-glass-elevated`: `rgba(255, 255, 255, 0.88)` with an 18px Gaussian blur.
  - `surface-glass-sunken`: `rgba(238, 242, 248, 0.65)` for structural wells and code staging troughs.

- **Milled Titanium Accents (Structural Grounding):**
  - `titanium-core`: `#1C1F26` (Used for inspector window titlebars, deep code trays, and high-contrast control points).
  - `titanium-surface`: `#282D37` (Secondary code HUD containers and terminal blocks).
  - `titanium-border`: `rgba(255, 255, 255, 0.12)` (Inner specular highlight on dark controls).

- **Spectral Accents (Data & Engine Telemetry):**
  - `accent-cyan` (`#0099C7` light mode accessible / `#00D2FF` spectral emission): Represents spatial coordinates, active camera planes, and live execution buffers.
  - `accent-cobalt` (`#2563EB` base / `#3B82F6` hover): System focus states, primary execution triggers, and neural link vectors.
  - `accent-iris` (`#6366F1`): Graph transformations, parameter locks, and pipeline inference cycles.

- **Window Chrome & Edge Optics:**
  - Standard macOS Traffic Lights: Close (`#FF5F57`), Minimize (`#FEBC2E`), Expand (`#28C840`) with an inset `0.5px` dark specular stroke.
  - Edge Borders: Crisp `1px` composite strokes using `linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 60%, rgba(200,210,225,0.4) 100%)`.

## Typography

The typographic hierarchy prioritizes micro-legibility and vertical rhythm inside high-density UI layouts (split inspectors, tree hierarchies, spatial viewports, and interactive terminal canvases).

### Font Roles
- **Primary Interface (Inter):** Configured with macOS-native optical sizing (`font-feature-settings: 'cv05', 'cv11', 'ss01'`) ensuring zero visual friction against native AppKit/SwiftUI chrome while sustaining neutral clarity across light glass backgrounds.
- **Code, Telemetry & Spatial Inspector (JetBrains Mono):** Drives coordinate readouts, memory bandwidth meters, tensor status strings, and script editors. Ligatures are deliberately active for programming operators.

### Typographic Rules
- All numeric readings (memory stats, frame rates, 3D vector coordinates) must use tabular lining (`tnum`) to eliminate micro-jitter during continuous rendering loops.
- `label-caps` is strictly uppercase with a letter spacing of `+0.06em` to ensure instant scanability across floating spatial toolbars and panel dividers.

## Layout & Spacing

Layout conforms to the macOS desktop paradigm: multi-panel dynamic split workspaces, floating auxiliary palettes, and a persistent canvas viewport for spatial rendering.

### Spacing Philosophy
- Base increments scale on a crisp **4px base unit**.
- Internal panel padding strictly adheres to `0.75rem` (`space-md`) to ensure consistent structural density without visual suffocation.
- Panes snap to an edge-anchored layout engine with resizable dock splitters using an active threshold of `3px`.

### Desktop Multi-Pane Structure
- **Left Rail (System & Tree HUD):** Width defaults to `260px` (min `200px`, max `400px`).
- **Center Canvas (3D AI Viewport):** Flex 1 (stretches to fill infinite canvas bounds with dynamic inset padding).
- **Right Rail (Parameter & Code Inspector):** Width defaults to `320px` (min `280px`, max `560px`).
- **Bottom Dock (Runtime Logs & Tensor Timeline):** Collapsible drawer spanning viewport width with standard height at `240px`.

## Elevation & Depth

Visual depth is achieved through optical transmission and physical glass refraction rather than heavy dropshadows. Layers mimic optical prisms resting on frosted substrates.

### Layer Tiers
- **Tier 0 — Core Spatial Canvas:** Direct Metal/WebGL/Vulkan rendering layer. Completely borderless and infinite.
- **Tier 1 — Structural Chrome Plates (Sidebars & Trays):**
  - Surface: `rgba(250, 252, 255, 0.72)`.
  - Backdrop Filter: `blur(28px) saturate(180%)`.
  - Outer Border: `1px solid rgba(255, 255, 255, 0.6)`.
  - Shadow: None. Separation is achieved through light refraction.
- **Tier 2 — Floating HUD Panels & Inspectors:**
  - Surface: `rgba(255, 255, 255, 0.85)`.
  - Backdrop Filter: `blur(40px) saturate(190%)`.
  - Border: `1px solid rgba(255, 255, 255, 0.95)` with a bottom rim stroke of `rgba(200, 215, 235, 0.45)`.
  - Shadow: Dual-phase ambient occlusion:
    - Inner rim: Inset `0 1px 0 rgba(255, 255, 255, 0.9)`.
    - Drop shadow: `0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`.
- **Tier 3 — Floating Overlays & Modal Command Palettes:**
  - Surface: Titanium-reinforced glass `rgba(255, 255, 255, 0.94)`.
  - Border: `1px solid rgba(0, 153, 199, 0.25)`.
  - Shadow: `0 20px 48px -8px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08)`.

## Shapes

The design system incorporates geometric precision tuned to native macOS Sonoma/Sequoia guidelines with continuous curvature (squircle mathematics).

### Radius Hierarchy
- **Standard Controls (Buttons, Inputs, Selectors):** Radius token `2` corresponds to `8px` (`0.5rem`).
- **Sub-Containers & Group Plates:** Radius token `rounded-lg` corresponds to `12px` (`0.75rem`).
- **Main Floating Window Shells & Detached HUDs:** Radius token `rounded-xl` corresponds to `16px` (`1rem`).
- **Status Pills, Coordinate Chips & Traffic Light Wells:** Fully continuous rounded pill geometry (`9999px`).

## Components

### Buttons
- **Primary Execution (Action):** Background is solid cobalt (`#2563EB`) transitioning to active blue (`#1D4ED8`). Text is crisp `#FFFFFF` with typography `body-strong`. Specular top rim `inset 0 1px 0 rgba(255, 255, 255, 0.25)`. Elevation shadow `0 2px 4px rgba(37, 99, 235, 0.2)`.
- **Secondary (Frosted Utility):** Background is `rgba(255, 255, 255, 0.65)` over dynamic blur. Border is `1px solid rgba(255, 255, 255, 0.8)`. Hover produces `rgba(255, 255, 255, 0.95)` with subtle accent cyan borders (`rgba(0, 210, 255, 0.4)`).
- **Dark Titanium Trigger:** Background is `#1C1F26` with text `#F1F5F9`. Border is `1px solid rgba(255, 255, 255, 0.1)`. Used strictly for code generation prompts and engine builds.

### Input Fields & Parameter Draggers
- **Standard Text & Prompt Inputs:** Inset recessed well (`rgba(235, 240, 248, 0.6)`), border `1px solid rgba(210, 220, 235, 0.6)`. Active state triggers a crisp focus glow: `0 0 0 2px rgba(37, 99, 235, 0.25)` and border transitions to `#2563EB`. Font is `body-default`.
- **Numeric Spatial Vector Scrubbers (X, Y, Z coordinates):** Inline compound segmented input. Sub-label indicator in `label-caps` (`X: Cyan`, `Y: Cobalt`, `Z: Iris`). Click-and-drag cursor interaction with real-time numeric scrub.

### Cards & Modular Inspector Blocks
- **Floating Inspector Card:** Backed by `surface-glass-elevated`. Header row height is `36px` with integrated disclosure chevrons and status badges. Divider rule is `0.5px solid rgba(0, 0, 0, 0.06)`.
- **Node Graph Card:** Milled glass node containers with a dark titanium top bar (`#1C1F26`) housing node I/O sockets. Connectors glow softly in active data flows using primary spectral cyan.

### Chips & Badges
- **Runtime Telemetry Chip:** Padding `2px 8px`, border-radius `9999px`. Subtle glass surface with `JetBrains Mono` at `label-caps`. 
- **Active Thread Indicator:** Includes a 5px pulsing dot: `#00D2FF` for Metal execution, `#22C55E` for compiled runtime, `#6366F1` for inference cycles.

### Checkboxes & Toggle Controls
- **Toggle Switch:** Capsule track `32px x 18px`. Inactive track `rgba(215, 223, 235, 0.7)`. Active track fills with `#2563EB`. Thumb is solid optical white `#FFFFFF` with drop shadow `0 1px 3px rgba(0,0,0,0.15)`.
- **Checkbox:** Compact `14px x 14px`, `roundedness: 4px`. Border is `1px solid rgba(160, 175, 200, 0.6)`. Checked state transitions to `#2563EB` with a crisp white check vector mark.

### Window Chrome & Header Controls
- **macOS Native App Bar:** Total height `48px`. Integrated traffic light housing positioned at left inset `16px`. Center segment anchors the project universe identity with a segmented branch/model picker. Right quadrant houses memory pressure gauges and layout toggle clusters.