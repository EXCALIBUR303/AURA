/**
 * Phase 5 interactive hardware: the single source of truth for the procedural PC.
 * Pure data and math (no three.js, DOM or controller), so it is unit-tested.
 *
 * Coordinates are PC-local metres: origin at the centre of the case base, +x towards the
 * tempered-glass panel, +y up, +z towards the front. The tower stands on the Hardware
 * desk, so world = HARDWARE_ORIGIN + local (the station faces +z, no yaw).
 *
 * Everything here is an original, generic illustration. It is not a model of any real
 * product, carries no logos, and no value is measured from the user's computer.
 */
import type { CameraPose, Point } from "../types.ts";

export type ComponentId = "case" | "glass" | "board" | "cpu" | "cooler" | "ram" | "gpu" | "storage" | "psu" | "airflow" | "cables";
export type ComponentInfo = {
  /** What the part is, in a few words. */
  kind: string;
  purpose: string;
  connects: string;
  cooling: string;
  explanation: string;
};
export type ComponentDef = {
  id: ComponentId;
  label: string;
  /** Section in the inspector list. */
  group: "Core" | "Cooling" | "Power & storage" | "Enclosure";
  /** Centre and size of the part when assembled (PC-local). Drives hit proxies, outlines and framing. */
  center: Point;
  size: Point;
  /** Exploded displacement (PC-local metres). Offsets grow with distance from the board so parts never intersect. */
  offset: Point;
  /** 0..1 stagger: 0 separates first and returns last. */
  delay: number;
  /** Optional camera direction (from the part towards the camera) where the default view would end up inside the desk or chair. */
  view?: Point;
  selectable: boolean;
  info?: ComponentInfo;
};

/** World position of the tower's base centre on the Hardware desk (see Equipment.tsx stationParts). */
export const HARDWARE_ORIGIN: Point = [-4.15, 0.784, -13.45];
export const CASE_SIZE: Point = [0.25, 0.49, 0.49];

export const COMPONENTS: readonly ComponentDef[] = [
  { id: "glass", label: "Tempered-glass panel", group: "Enclosure", center: [0.127, 0.255, 0], size: [0.006, 0.435, 0.46], offset: [0.24, 0, 0], delay: 0, selectable: false },
  { id: "gpu", label: "Graphics card", group: "Core", center: [0.046, 0.19, -0.05], size: [0.056, 0.13, 0.31], offset: [0.12, 0, 0], delay: 0.16,
    selectable: true, info: {
      kind: "Discrete graphics card (an original design, mounted vertically on a riser cable)",
      purpose: "Draws the image and runs highly parallel work such as 3D rendering, video encoding and machine-learning inference.",
      connects: "Data through a PCIe x16 link to the board (here via a riser cable); power from a dedicated auxiliary cable from the power supply; video out through the bracket ports.",
      cooling: "A heatsink of thin fins and heat pipes, with three fans pushing air through the fins. High-end cards dissipate hundreds of watts, so case airflow matters as much as the card's own cooler.",
      explanation: "Large cards are heavy and often use a support or vertical mount. A riser lets the cooler face the glass, at the cost of a longer signal path and less airflow behind the card.",
    } },
  { id: "cooler", label: "CPU air cooler", group: "Cooling", center: [-0.045, 0.335, -0.083], size: [0.108, 0.094, 0.098], offset: [0.1, 0.05, 0], delay: 0.3,
    selectable: true, info: {
      kind: "Tower air cooler: copper base, heat pipes, aluminium fin stack and fan",
      purpose: "Moves heat away from the processor so it can sustain its speed instead of slowing down to protect itself.",
      connects: "Clamps to the board's mounting holes over the processor; the fan plugs into a board fan header.",
      cooling: "Heat conducts from the processor through the base into sealed heat pipes, spreads into the fins, and the fan pulls air across them toward the rear exhaust.",
      explanation: "Heat-pipe coolers transfer heat by evaporating and condensing a small amount of liquid inside each pipe. Thermal paste fills microscopic gaps between the processor lid and the base.",
    } },
  { id: "ram", label: "Memory modules", group: "Core", center: [-0.086, 0.335, 0.035], size: [0.034, 0.134, 0.03], offset: [0.06, 0, 0.05], delay: 0.44,
    selectable: true, info: {
      kind: "Two DIMM memory modules in a dual-channel arrangement",
      purpose: "Short-term working memory for running programs and their data; much faster than storage but emptied when power is removed.",
      connects: "Each module seats in a DIMM slot on the board, wired to the processor's memory controller. Populating alternate slots enables dual channel.",
      cooling: "A thin aluminium heat spreader is enough at ordinary speeds; airflow from the front fans passes across the modules.",
      explanation: "Two matched modules double the width of the memory path compared with one, which mainly benefits bandwidth-hungry workloads such as integrated graphics and compression.",
    } },
  { id: "cpu", label: "Processor", group: "Core", center: [-0.1, 0.335, -0.075], size: [0.008, 0.046, 0.046], offset: [0.07, 0, 0], delay: 0.5,
    selectable: true, info: {
      kind: "Desktop processor (CPU) under its metal heat spreader, in a land-grid socket",
      purpose: "Executes program instructions and coordinates the rest of the system. Its cores handle general, branching work.",
      connects: "Contacts in the socket touch pads under the processor; the socket links it to memory, expansion slots and the chipset. The cooler sits directly on top.",
      cooling: "All of its heat leaves through the metal lid into the cooler. It is hidden beneath the cooler until you explode the view.",
      explanation: "The lid spreads the heat of a very small silicon die over a larger area so the cooler's base can pick it up evenly.",
    } },
  { id: "storage", label: "Storage drives", group: "Power & storage", center: [-0.045, 0.14, 0.06], size: [0.15, 0.2, 0.12], offset: [0.06, 0, 0], delay: 0.56,
    selectable: true, info: {
      kind: "An M.2 NVMe solid-state drive on the board and a 2.5-inch SSD on a bracket",
      purpose: "Keeps the operating system, applications and files when the computer is off.",
      connects: "The M.2 stick plugs straight into a board slot over PCIe lanes; the 2.5-inch drive uses a cable for data (SATA) and another for power.",
      cooling: "Fast M.2 drives slow down when hot, so a small aluminium heat shield covers the controller and flash chips.",
      explanation: "NVMe drives talk to the processor over PCIe and are several times faster than SATA drives. Both types have no moving parts.",
    } },
  { id: "cables", label: "Power and riser cables", group: "Power & storage", center: [-0.02, 0.19, -0.04], size: [0.2, 0.34, 0.34], offset: [0.05, 0, 0], delay: 0.64,
    selectable: true, info: {
      kind: "Sleeved power cables and the graphics-card riser cable",
      purpose: "Deliver the power supply's rails to the board, processor and graphics card, and carry the card's data link to its slot.",
      connects: "A 24-pin cable feeds the board, an 8-pin cable feeds the processor's voltage regulators, and an auxiliary cable feeds the graphics card.",
      cooling: "Tidy routing keeps cables out of fan paths. Cable bundles hidden behind the board tray improve airflow.",
      explanation: "Thicker wire carries current with less voltage drop and heat. Connectors are keyed so each plug fits only one way.",
    } },
  { id: "airflow", label: "Front intake fans", group: "Cooling", center: [0, 0.245, 0.205], size: [0.13, 0.36, 0.03], offset: [0, 0, 0.1], delay: 0.7, view: [0.95, 0.17, 0.25],
    selectable: true, info: {
      kind: "Three 120 mm case fans behind a perforated front panel",
      purpose: "Pull cool room air into the case so the cooler and the card have fresh air to work with.",
      connects: "Each fan plugs into a board or hub fan header, which sets its speed.",
      cooling: "Positive airflow (more intake than exhaust) keeps dust from entering through gaps, while the rear fan and the cards' own fans exhaust warm air.",
      explanation: "The blades you see spinning are a decorative animation. AURA does not read fan speeds or temperatures from your machine, so no RPM is shown.",
    } },
  { id: "psu", label: "Power supply", group: "Power & storage", center: [0.0, 0.066, -0.145], size: [0.22, 0.072, 0.18], offset: [0, 0, -0.1], delay: 0.8,
    selectable: true, info: {
      kind: "ATX power supply under a ventilated shroud",
      purpose: "Converts wall power to the low-voltage direct current that every component runs on, and regulates it under changing load.",
      connects: "Modular sockets accept cables for the board, processor, graphics card and drives. It mounts at the bottom rear and draws air through its own fan.",
      cooling: "A temperature-controlled fan in the unit; the shroud separates its hot exhaust from the main chamber.",
      explanation: "A supply is sized to the system's peak draw with headroom, and runs most efficiently at moderate load.",
    } },
  { id: "board", label: "Motherboard", group: "Core", center: [-0.11, 0.255, -0.04], size: [0.008, 0.3, 0.3], offset: [0.03, 0, 0], delay: 0.9,
    selectable: true, info: {
      kind: "ATX-style motherboard with voltage-regulator heatsinks, DIMM slots and expansion slots",
      purpose: "The backbone that connects every component and distributes power and data between them.",
      connects: "The processor sits in the socket, memory in the DIMM slots, the graphics link and M.2 storage in PCIe slots, and power cables in the headers around the edge.",
      cooling: "Aluminium heatsinks on the voltage regulators and the chipset spread heat; case airflow carries it out.",
      explanation: "Multi-layer boards route thousands of signals between components. The traces drawn here are a decorative pattern, not a real layout.",
    } },
  { id: "case", label: "Case and chassis", group: "Enclosure", center: [0, 0.245, 0], size: [0.25, 0.49, 0.49], offset: [0, 0, 0], delay: 1,
    selectable: true, info: {
      kind: "Mid-tower chassis with a tempered-glass side panel and mesh front",
      purpose: "Holds and aligns the components, shields them, and shapes airflow through the system.",
      connects: "Standoffs mount the board to the tray, slots at the rear hold expansion cards, and the front and top panel carry the power button and ports.",
      cooling: "A perforated front, a rear exhaust fan and open top and bottom paths set the airflow direction, front to back.",
      explanation: "Tempered glass shows the build and breaks into small blunt pieces if it fails. The internal layout here is a showcase arrangement, not a specific product.",
    } },
];

export const COMPONENT_IDS = COMPONENTS.map((c) => c.id);
export const SELECTABLE = COMPONENTS.filter((c) => c.selectable);
export const componentById = (id: string): ComponentDef | undefined => COMPONENTS.find((c) => c.id === id);
export const GROUPS = ["Core", "Cooling", "Power & storage", "Enclosure"] as const;

/** Decorative fans. Rotors are instanced; the frames are part of each component's merged geometry. */
export type FanDef = { component: ComponentId; position: Point; axis: "x" | "z"; radius: number };
export const FANS: readonly FanDef[] = [
  { component: "airflow", position: [0, 0.095, 0.205], axis: "z", radius: 0.052 },
  { component: "airflow", position: [0, 0.245, 0.205], axis: "z", radius: 0.052 },
  { component: "airflow", position: [0, 0.395, 0.205], axis: "z", radius: 0.052 },
  { component: "case", position: [0, 0.335, -0.228], axis: "z", radius: 0.05 },
  { component: "cooler", position: [-0.045, 0.335, -0.0375], axis: "z", radius: 0.041 },
  { component: "gpu", position: [0.0585, 0.19, -0.15], axis: "x", radius: 0.042 },
  { component: "gpu", position: [0.0585, 0.19, -0.05], axis: "x", radius: 0.042 },
  { component: "gpu", position: [0.0585, 0.19, 0.05], axis: "x", radius: 0.042 },
];

// ---------------------------------------------------------------- explode animation (pure)
export const EXPLODE_SECONDS = 1.15;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoother = (t: number) => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10); };
/**
 * Per-component separation 0..1 for a global progress 0..1. Reversible by construction: the factor
 * is a pure function of progress, so running progress backwards retraces the same motion, and the
 * parts that left last return first.
 */
export const separation = (progress: number, delay: number) => smoother((progress - delay * 0.42) / 0.58);
/** Moves `progress` toward `target` at a constant rate (instantly when `instant`). */
export function stepProgress(progress: number, target: 0 | 1, dt: number, instant: boolean) {
  if (instant) return target;
  const step = Math.max(0, dt) / EXPLODE_SECONDS;
  return target > progress ? Math.min(target, progress + step) : Math.max(target, progress - step);
}

// ---------------------------------------------------------------- camera poses (pure)
const unit = (v: Point): Point => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
const VIEW_DIRECTION = unit([0.86, 0.22, 0.46]);
/** World camera pose that frames a component (or the whole tower when null), optionally while exploded. */
export function focusPose(id: ComponentId | null, exploded: boolean): CameraPose {
  const def = id ? componentById(id) : undefined;
  let center: Point, extent: number;
  if (def && def.id !== "case") {
    const o: Point = exploded ? def.offset : [0, 0, 0];
    center = [def.center[0] + o[0], def.center[1] + o[1], def.center[2] + o[2]];
    extent = Math.max(...def.size);
  } else {
    // Whole tower; when exploded the glass and the pulled-out parts widen the subject.
    center = exploded ? [0.07, 0.25, 0] : [0, 0.25, 0];
    extent = exploded ? 0.62 : 0.52;
  }
  const distance = Math.min(1.25, Math.max(def && def.id !== "case" ? 0.4 : 0.9, extent * 1.45 + 0.14));
  const target: Point = [HARDWARE_ORIGIN[0] + center[0], HARDWARE_ORIGIN[1] + center[1], HARDWARE_ORIGIN[2] + center[2]];
  const dir = def?.view ? unit(def.view) : VIEW_DIRECTION;
  const position: Point = [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance];
  return { position, target, room: "project-hub" };
}
