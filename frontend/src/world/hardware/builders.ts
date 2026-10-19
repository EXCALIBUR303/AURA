/**
 * Procedural geometry for the tower. Each builder returns geometry already merged per material,
 * in PC-local metres (see catalog.ts). Nothing is downloaded; every shape is original.
 */
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Point } from "../types.ts";
import type { MatKey } from "./materials.ts";
import type { ComponentId } from "./catalog.ts";
import { COMPONENT_IDS } from "./catalog.ts";

export type MergedParts = Partial<Record<MatKey, BufferGeometry>>;
type Axis = "x" | "y" | "z";
type Gradient = { axis: 0 | 1 | 2; min: number; max: number };
const CYAN: Point = [0.31, 0.82, 0.9], VIOLET: Point = [0.61, 0.52, 0.95];

class Builder {
  private readonly groups = new Map<MatKey, BufferGeometry[]>();
  private put(mat: MatKey, source: BufferGeometry, at: Point, rot?: Point, gradient?: Gradient) {
    // Primitives differ in whether they are indexed (RoundedBoxGeometry is not); one form is needed to merge.
    let g = source;
    if (source.index) { g = source.toNonIndexed(); source.dispose(); }
    if (rot) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2])));
    g.translate(at[0], at[1], at[2]);
    if (mat === "rgb") {
      // Every RGB geometry carries a colour attribute so the group merges: a cyan to violet blend along an axis.
      const position = g.getAttribute("position"), color = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const t = gradient ? Math.min(1, Math.max(0, (position.getComponent(i, gradient.axis) - gradient.min) / (gradient.max - gradient.min))) : 0.5;
        for (let c = 0; c < 3; c++) color[i * 3 + c] = CYAN[c]! + (VIOLET[c]! - CYAN[c]!) * t;
      }
      g.setAttribute("color", new Float32BufferAttribute(color, 3));
    }
    const list = this.groups.get(mat) ?? []; list.push(g); this.groups.set(mat, list);
  }
  box(mat: MatKey, at: Point, size: Point, rot?: Point, gradient?: Gradient) { this.put(mat, new BoxGeometry(size[0], size[1], size[2]), at, rot, gradient); return this; }
  rbox(mat: MatKey, at: Point, size: Point, radius: number, rot?: Point) { this.put(mat, new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), at, rot); return this; }
  cyl(mat: MatKey, at: Point, radius: number, length: number, axis: Axis = "y", segments = 14) {
    const g = new CylinderGeometry(radius, radius, length, segments);
    if (axis === "x") g.rotateZ(Math.PI / 2); else if (axis === "z") g.rotateX(Math.PI / 2);
    this.put(mat, g, at); return this;
  }
  /** Torus whose axis is `axis`: LED rings and fan rims. */
  ring(mat: MatKey, at: Point, radius: number, tube: number, axis: Axis, segments = 28, gradient?: Gradient) {
    const g = new TorusGeometry(radius, tube, 6, segments);
    if (axis === "x") g.rotateY(Math.PI / 2); else if (axis === "y") g.rotateX(Math.PI / 2);
    this.put(mat, g, at, undefined, gradient); return this;
  }
  tube(mat: MatKey, points: readonly Point[], radius: number, segments = 28, radial = 8) {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p[0], p[1], p[2])), false, "catmullrom", 0.2);
    this.put(mat, new TubeGeometry(curve, segments, radius, radial, false), [0, 0, 0]); return this;
  }
  /** Square fan frame around a circular opening plus a hub: the rotor itself is instanced separately. */
  fanFrame(mat: MatKey, at: Point, axis: "x" | "z", size: number, depth: number) {
    const bar = size * 0.07, half = size / 2 - bar / 2;
    const dims = (w: number, h: number): Point => axis === "z" ? [w, h, depth] : [depth, h, w];
    const shift = (a: number, b: number): Point => axis === "z" ? [at[0] + a, at[1] + b, at[2]] : [at[0], at[1] + b, at[2] + a];
    this.box(mat, shift(0, half), dims(size, bar)).box(mat, shift(0, -half), dims(size, bar));
    this.box(mat, shift(half, 0), dims(bar, size - 2 * bar)).box(mat, shift(-half, 0), dims(bar, size - 2 * bar));
    this.cyl(mat, at, size * 0.1, depth * 1.05, axis, 14);
    return this;
  }
  build(): MergedParts {
    const out: MergedParts = {};
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) throw Error("Incompatible hardware geometry");
      out[mat] = merged;
    }
    return out;
  }
}

const PI = Math.PI;
const FRONT_FAN_Y = [0.095, 0.245, 0.395] as const;

function caseFrame(): MergedParts {
  const b = new Builder();
  b.box("graphite", [0, 0.015, 0], [0.25, 0.03, 0.49]).box("graphite", [0, 0.4775, 0], [0.25, 0.025, 0.49]);
  b.box("graphite", [-0.119, 0.255, 0], [0.012, 0.46, 0.48]);
  for (const x of [-0.115, 0.115]) for (const z of [-0.235, 0.235]) b.box("alu", [x, 0.255, z], [0.016, 0.46, 0.016]);
  for (const x of [-0.1, 0.1]) for (const z of [-0.17, 0.17]) b.cyl("rubber", [x, 0.0, z], 0.017, 0.012, "y", 12);
  // Mesh front: frame bars and fine slats, so the intake fans stay visible behind it.
  b.box("graphite", [0, 0.032, 0.262], [0.22, 0.012, 0.012]).box("graphite", [0, 0.46, 0.262], [0.22, 0.012, 0.012]);
  for (const x of [-0.1, 0.1]) b.box("graphite", [x, 0.255, 0.262], [0.02, 0.43, 0.012]);
  for (let i = 0; i < 12; i++) b.box("graphite", [0, 0.06 + i * 0.0345, 0.268], [0.2, 0.006, 0.004]);
  // Rear: frame bars around the exhaust fan, rear I/O shield, expansion-slot covers and hardware.
  b.box("graphite", [0, 0.465, -0.2475], [0.226, 0.02, 0.01]).box("graphite", [0, 0.045, -0.2475], [0.226, 0.03, 0.01]);
  for (const x of [-0.105, 0.105]) b.box("graphite", [x, 0.255, -0.2475], [0.016, 0.43, 0.01]);
  b.fanFrame("graphite", [0, 0.335, -0.228], "z", 0.12, 0.026);
  b.ring("rgb", [0, 0.335, -0.242], 0.053, 0.0018, "z", 28, { axis: 1, min: 0.28, max: 0.39 });
  b.box("alu", [-0.098, 0.3, -0.19], [0.025, 0.12, 0.012]);
  for (let i = 0; i < 4; i++) b.box("gold", [-0.108 + i * 0.012, 0.275, -0.1965], [0.006, 0.014, 0.004]);
  // Vented plate over the expansion-card area, below the exhaust fan.
  for (let i = 0; i < 6; i++) b.box("graphite", [0.03, 0.12 + i * 0.027, -0.2475], [0.11, 0.012, 0.006]);
  // Top panel: power button, indicator, two USB-style ports and a headset jack, all generic.
  b.cyl("alu", [0.0, 0.491, 0.185], 0.012, 0.004, "y", 20).ring("rgb", [0, 0.4935, 0.185], 0.012, 0.0014, "y", 20);
  for (const x of [-0.05, -0.028]) b.box("rubber", [x, 0.491, 0.19], [0.014, 0.004, 0.008]);
  b.cyl("rubber", [0.05, 0.491, 0.19], 0.004, 0.004, "y", 10);
  // A soft accent along the base: the case's subtle RGB light.
  b.box("rgb", [0.0, 0.034, 0.239], [0.2, 0.004, 0.004], undefined, { axis: 0, min: -0.1, max: 0.1 });
  b.box("rgb", [0.0, 0.034, -0.239], [0.2, 0.004, 0.004], undefined, { axis: 0, min: -0.1, max: 0.1 });
  return b.build();
}

function glassPanel(): MergedParts {
  const b = new Builder();
  b.box("glass", [0.127, 0.255, 0], [0.004, 0.435, 0.46]);
  for (const y of [0.063, 0.447]) for (const z of [-0.2, 0.2]) b.cyl("alu", [0.1335, y, z], 0.0045, 0.007, "x", 10);
  return b.build();
}

/** Procedural circuit board, regulator heatsinks, slots, headers, capacitors. */
function motherboard(): MergedParts {
  const b = new Builder();
  const x0 = -0.1065;
  b.box("pcb", [-0.1105, 0.255, -0.04], [0.003, 0.3, 0.3]);
  // Processor socket frame (the processor package is its own component).
  b.box("graphite", [x0 + 0.0, 0.335, -0.075], [0.006, 0.058, 0.058]);
  for (const [dy, dz] of [[-0.027, -0.027], [-0.027, 0.027], [0.027, -0.027], [0.027, 0.027]] as const) b.cyl("alu", [-0.1035, 0.335 + dy, -0.075 + dz], 0.0028, 0.006, "x", 8);
  // Voltage-regulator heatsinks: rear block and top block with fins, plus the rear I/O cover.
  b.box("alu", [-0.098, 0.335, -0.147], [0.022, 0.11, 0.028]);
  for (let i = 0; i < 6; i++) b.box("alu", [-0.084, 0.29 + i * 0.0165, -0.147], [0.008, 0.006, 0.028]);
  b.box("alu", [-0.098, 0.403, -0.07], [0.022, 0.022, 0.1]);
  for (let i = 0; i < 7; i++) b.box("alu", [-0.084, 0.403, -0.112 + i * 0.014], [0.008, 0.022, 0.006]);
  b.box("shroud", [-0.099, 0.335, -0.178], [0.026, 0.12, 0.014]);
  b.box("rgb", [-0.0855, 0.335, -0.178], [0.001, 0.11, 0.004], undefined, { axis: 1, min: 0.28, max: 0.39 });
  // Chipset heatsink and fins.
  b.box("graphite", [-0.103, 0.17, 0.05], [0.012, 0.05, 0.05]);
  for (let i = 0; i < 5; i++) b.box("alu", [-0.094, 0.15 + i * 0.01, 0.05], [0.006, 0.004, 0.044]);
  // DIMM slots: four, two of them populated by the memory component.
  for (const z of [0.005, 0.02, 0.035, 0.05]) b.box("graphite", [-0.103, 0.335, z], [0.01, 0.134, 0.007]);
  // PCIe x16 (riser end) and x1 slots, an M.2 slot and the shielded M.2 mounting post.
  b.box("graphite", [-0.103, 0.2, -0.065], [0.01, 0.01, 0.092]).box("gold", [-0.0975, 0.2, -0.065], [0.001, 0.003, 0.08]);
  b.box("graphite", [-0.103, 0.172, -0.085], [0.008, 0.008, 0.052]);
  b.box("graphite", [-0.105, 0.25, -0.03], [0.006, 0.02, 0.012]);
  // Power headers: 24-pin along the front edge, 8-pin processor power at the top rear.
  b.box("graphite", [-0.102, 0.285, 0.1], [0.014, 0.07, 0.01]);
  for (let i = 0; i < 12; i++) b.box("rubber", [-0.0945, 0.255 + i * 0.0053, 0.1], [0.001, 0.003, 0.006]);
  b.box("graphite", [-0.102, 0.41, -0.152], [0.014, 0.012, 0.03]);
  // SATA ports, header blocks and the battery.
  for (let i = 0; i < 4; i++) b.box("graphite", [-0.103, 0.13 + (i % 2) * 0.012, 0.09 - Math.floor(i / 2) * 0.006], [0.008, 0.008, 0.014]);
  b.box("graphite", [-0.104, 0.12, -0.02], [0.008, 0.014, 0.03]);
  b.cyl("nickel", [-0.1, 0.205, 0.0], 0.0105, 0.004, "x", 18);
  // Capacitors and chokes in deterministic rows around the regulators and the lower board.
  for (let i = 0; i < 12; i++) b.cyl(i % 3 ? "alu" : "graphite", [-0.1, 0.285 + (i % 6) * 0.01, -0.118 - Math.floor(i / 6) * 0.01], 0.0034, 0.012 + (i % 2) * 0.004, "x", 8);
  for (let i = 0; i < 10; i++) b.box("graphite", [-0.106, 0.12 + (i % 5) * 0.012, -0.17 + Math.floor(i / 5) * 0.012], [0.006, 0.008, 0.008]);
  return b.build();
}

function processor(): MergedParts {
  const b = new Builder();
  b.box("pcb", [-0.1035, 0.335, -0.075], [0.0012, 0.044, 0.044]);
  b.box("nickel", [-0.1018, 0.335, -0.075], [0.0024, 0.036, 0.036]);
  b.box("alu", [-0.1, 0.335, -0.075], [0.0006, 0.03, 0.03]);
  return b.build();
}

/** Copper base, U-shaped heat pipes, fin stack, mounting bracket, frame and the fan's LED ring. */
function cpuCooler(): MergedParts {
  const b = new Builder();
  b.box("copper", [-0.0975, 0.335, -0.075], [0.004, 0.04, 0.04]);
  b.box("graphite", [-0.099, 0.335, -0.075], [0.003, 0.08, 0.012]);
  for (const dz of [-0.018, -0.006, 0.006, 0.018]) b.cyl("nickel", [-0.05, 0.335, -0.075 + dz], 0.003, 0.095, "x", 8);
  // 21 fins stacked along y, plates in the xz plane; the airflow crosses them front to back.
  for (let i = 0; i < 21; i++) b.box("alu", [-0.046, 0.292 + i * 0.0043, -0.0975], [0.098, 0.0009, 0.055]);
  b.box("graphite", [-0.046, 0.381, -0.0975], [0.098, 0.004, 0.055]).box("graphite", [-0.046, 0.289, -0.0975], [0.098, 0.004, 0.055]);
  b.fanFrame("graphite", [-0.045, 0.335, -0.0375], "z", 0.094, 0.025);
  b.ring("rgb", [-0.045, 0.335, -0.0245], 0.045, 0.0016, "z", 28, { axis: 0, min: -0.09, max: 0 });
  return b.build();
}

/** Two DIMMs in alternate slots, so the dual-channel arrangement is visible. */
function memory(): MergedParts {
  const b = new Builder();
  for (const z of [0.02, 0.05]) {
    b.box("pcb", [-0.0855, 0.335, z], [0.032, 0.133, 0.0016]);
    b.box("alu", [-0.0855, 0.335, z - 0.0026], [0.03, 0.12, 0.0016]).box("alu", [-0.0855, 0.335, z + 0.0026], [0.03, 0.12, 0.0016]);
    b.box("rgb", [-0.0675, 0.335, z], [0.002, 0.118, 0.0045], undefined, { axis: 1, min: 0.275, max: 0.395 });
    b.box("gold", [-0.1015, 0.335, z], [0.003, 0.118, 0.0014]);
  }
  return b.build();
}

/** An M.2 stick under a heat shield, and a 2.5-inch SSD on a small bracket. */
function drives(): MergedParts {
  const b = new Builder();
  b.box("pcb", [-0.099, 0.25, -0.03], [0.0016, 0.022, 0.08]).box("graphite", [-0.0962, 0.25, -0.03], [0.0045, 0.024, 0.082]);
  for (let i = 0; i < 6; i++) b.box("alu", [-0.093, 0.25, -0.062 + i * 0.0124], [0.0016, 0.024, 0.006]);
  b.box("graphite", [-0.04, 0.032, 0.14], [0.09, 0.006, 0.11]);
  b.rbox("shroud", [-0.04, 0.044, 0.14], [0.07, 0.018, 0.1], 0.003);
  b.box("alu", [-0.04, 0.0535, 0.14], [0.066, 0.0008, 0.096]);
  b.box("gold", [-0.04, 0.044, 0.186], [0.034, 0.008, 0.004]);
  return b.build();
}

/** Ventilated power-supply shroud over a modular unit, with its sockets facing the board. */
function powerSupply(): MergedParts {
  const b = new Builder();
  b.rbox("shroud", [0, 0.066, -0.145], [0.22, 0.072, 0.18], 0.004);
  for (let i = 0; i < 9; i++) b.box("rubber", [0.0, 0.1025, -0.215 + i * 0.016], [0.17, 0.001, 0.007]);
  b.box("graphite", [0, 0.066, -0.0555], [0.21, 0.062, 0.003]);
  for (let i = 0; i < 6; i++) b.box("rubber", [-0.07 + i * 0.028, 0.062, -0.0535], [0.02, 0.012, 0.002]);
  for (let i = 0; i < 4; i++) b.box("rubber", [-0.07 + i * 0.028, 0.078, -0.0535], [0.02, 0.008, 0.002]);
  b.box("rgb", [0.0, 0.097, -0.0565], [0.19, 0.003, 0.003], undefined, { axis: 0, min: -0.095, max: 0.095 });
  return b.build();
}

/** A shrouded three-fan card mounted vertically on a riser, drawn frame, shroud, heatsink, pipes and backplate. */
function graphicsCard(): MergedParts {
  const b = new Builder();
  const zMin = -0.2, zMax = 0.1, y0 = 0.125, y1 = 0.255, zc = (zMin + zMax) / 2, yc = (y0 + y1) / 2;
  // Backplate (faces the board), PCB and the vapour-chamber-style copper plate under the fins.
  b.box("shroud", [0.022, yc, zc], [0.004, 0.128, 0.3]);
  for (let i = 0; i < 9; i++) b.box("rubber", [0.0197, yc, zMin + 0.03 + i * 0.03], [0.0008, 0.09, 0.012]);
  b.box("pcb", [0.0255, yc - 0.004, zc], [0.0016, 0.1, 0.296]);
  b.box("copper", [0.0296, yc - 0.002, zc + 0.02], [0.004, 0.096, 0.2]);
  // Fin block with thin plates, five heat pipes that cross it, and the shroud frame around three openings.
  for (let i = 0; i < 28; i++) b.box("alu", [0.0445, yc - 0.002, zMin + 0.014 + i * 0.0102], [0.026, 0.118, 0.0011]);
  for (let i = 0; i < 5; i++) b.cyl("nickel", [0.04, y0 + 0.016 + i * 0.0225, zc - 0.005], 0.0029, 0.27, "z", 8);
  const front = 0.0725;
  b.rbox("shroud", [front, y1 - 0.0075, zc], [0.0165, 0.015, 0.3], 0.003).rbox("shroud", [front, y0 + 0.0075, zc], [0.0165, 0.015, 0.3], 0.003);
  b.rbox("shroud", [front, yc, zMin + 0.004], [0.0165, 0.13, 0.008], 0.003).rbox("shroud", [front, yc, zMax - 0.004], [0.0165, 0.13, 0.008], 0.003);
  for (const z of [-0.1, 0.0]) b.rbox("shroud", [front, yc, z], [0.0165, 0.13, 0.008], 0.003);
  // Fan hubs, rims and accent lines; rotors are instanced and added by the rig.
  for (const z of [-0.15, -0.05, 0.05]) {
    b.cyl("graphite", [0.062, yc, z], 0.012, 0.012, "x", 16);
    b.ring("alu", [0.0675, yc, z], 0.0455, 0.0016, "x", 32);
    b.ring("rgb", [0.0653, yc, z], 0.0455, 0.0013, "x", 32, { axis: 2, min: -0.2, max: 0.1 });
  }
  b.box("rgb", [0.0815, yc + 0.0615, zc], [0.0008, 0.0022, 0.29], undefined, { axis: 2, min: -0.2, max: 0.1 });
  // PCIe edge connector (gold fingers), output bracket with generic video ports, auxiliary power plug.
  b.box("gold", [0.0255, y0 - 0.001, zMin + 0.05], [0.0016, 0.008, 0.075]);
  b.box("alu", [0.0455, yc, zMin - 0.002], [0.052, 0.128, 0.002]);
  for (let i = 0; i < 3; i++) b.box("rubber", [0.0455, y0 + 0.02 + i * 0.026, zMin - 0.0035], [0.03, 0.012, 0.002]);
  b.box("rubber", [0.0455, y1 - 0.012, zMin - 0.0035], [0.034, 0.014, 0.002]);
  b.box("graphite", [0.046, y1 + 0.006, 0.062], [0.026, 0.014, 0.036]);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) b.box("rubber", [0.0583, y1 + 0.0125, 0.0485 + i * 0.0053], [0.0015, 0.0015, 0.003]);
  return b.build();
}

/** Sleeved cables, routed as tubes. They belong together so they move as one part. */
function cables(): MergedParts {
  const b = new Builder();
  // 24-pin: PSU front face up the board's front edge into the header.
  for (const dz of [0, 0.007]) b.tube("rubber", [[-0.08, 0.07, -0.052], [-0.085, 0.082, 0.0], [-0.093, 0.13, 0.082 + dz], [-0.098, 0.2, 0.1 + dz], [-0.1, 0.285, 0.1]], 0.0048, 40, 8);
  // 8-pin processor power: behind the board, up the rear and into the top-rear header.
  b.tube("rubber", [[-0.06, 0.1, -0.205], [-0.03, 0.2, -0.218], [-0.05, 0.37, -0.215], [-0.09, 0.425, -0.185], [-0.1, 0.42, -0.152]], 0.0042, 40, 8);
  // GPU auxiliary power: out of the PSU, around the card's front end and onto the plug.
  b.tube("rubber", [[0.05, 0.095, -0.056], [0.05, 0.09, 0.0], [0.052, 0.1, 0.13], [0.054, 0.2, 0.135], [0.056, 0.275, 0.115], [0.052, 0.282, 0.075]], 0.005, 48, 8);
  // Riser: a flat shielded ribbon from the card's gold fingers to the x16 slot.
  b.tube("graphite", [[0.026, 0.12, -0.16], [0.0, 0.1, -0.15], [-0.07, 0.115, -0.12], [-0.098, 0.19, -0.1], [-0.099, 0.2, -0.08]], 0.0065, 32, 6);
  b.box("graphite", [-0.098, 0.2, -0.065], [0.003, 0.012, 0.088]);
  b.box("gold", [-0.098, 0.2, -0.065], [0.001, 0.004, 0.07]);
  return b.build();
}

/** Housings for the three front intake fans (rotors are instanced). */
function intakeFans(): MergedParts {
  const b = new Builder();
  for (const y of FRONT_FAN_Y) {
    b.fanFrame("graphite", [0, y, 0.205], "z", 0.12, 0.025);
    b.ring("rgb", [0, y, 0.2185], 0.0545, 0.0018, "z", 32, { axis: 1, min: 0.03, max: 0.46 });
  }
  return b.build();
}

const BUILDERS: Record<ComponentId, () => MergedParts> = {
  case: caseFrame, glass: glassPanel, board: motherboard, cpu: processor, cooler: cpuCooler, ram: memory, gpu: graphicsCard,
  storage: drives, psu: powerSupply, airflow: intakeFans, cables,
};

export type BuiltComponents = Record<ComponentId, MergedParts>;
export function buildComponents(): BuiltComponents {
  return Object.fromEntries(COMPONENT_IDS.map((id) => [id, BUILDERS[id]()])) as BuiltComponents;
}

/** One geometry per material across the whole tower: the assembled, idle-in-room version (about 11 draw calls). */
export function mergeAssembled(parts: BuiltComponents): MergedParts {
  const out: MergedParts = {};
  const byMaterial = new Map<MatKey, BufferGeometry[]>();
  for (const id of COMPONENT_IDS) for (const [mat, g] of Object.entries(parts[id]) as [MatKey, BufferGeometry][]) {
    const list = byMaterial.get(mat) ?? []; list.push(g.clone()); byMaterial.set(mat, list);
  }
  for (const [mat, list] of byMaterial) {
    const merged = mergeGeometries(list, false); list.forEach((g) => g.dispose());
    if (!merged) throw Error("Incompatible hardware geometry");
    out[mat] = merged;
  }
  return out;
}

/** A unit-radius, +z-axis fan rotor: hub, nine swept blades and an outer ring. Instanced and scaled per fan. */
export function rotorGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const hub = new CylinderGeometry(0.24, 0.24, 0.12, 16); hub.rotateX(PI / 2); parts.push(hub);
  for (let i = 0; i < 9; i++) {
    const blade = new BoxGeometry(0.62, 0.3, 0.025);
    blade.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(0.5, 0, 0)));
    blade.translate(0.58, 0, 0);
    blade.applyMatrix4(new Matrix4().makeRotationZ((i / 9) * PI * 2 + 0.25));
    parts.push(blade);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw Error("Incompatible hardware geometry");
  return merged;
}
