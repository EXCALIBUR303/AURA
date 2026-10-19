import { safePoint } from "./collision.ts";
import type { Collider, Point, Rect } from "./types.ts";

/**
 * Pure camera-travel planning. WorldNavigation owns the camera and samples a plan once
 * per frame; nothing here touches three.js, the DOM or the controller, so it is unit-tested.
 *
 *  route  — a collision-checked walkway (adjacent rooms, in-room inspection): eased along
 *           its arc length, looking ahead along the path before settling on the arrival target.
 *  bridge — rooms that are not physically connected: a short rise-and-pull-back departure,
 *           a veil while the camera crosses, then a dolly into the destination's framing.
 *  cut    — reduced motion, instant requests or no safe framing: place the camera at once.
 */
export type TravelSample = { position: Point; target: Point; veil: number };
export type TravelPlan = { kind: "route" | "bridge" | "cut"; duration: number; sample: (elapsed: number) => TravelSample };
export type Geometry = { floors: readonly Rect[]; colliders: readonly Collider[] };
export type PlanInput = {
  from: { position: Point; target: Point };
  to: { position: Point; target: Point };
  /** Collision-checked waypoints from `from` to `to` (excluding `from`); empty when no walkway exists. */
  route: readonly Point[];
  geometry: Geometry;
  reduced: boolean;
  instant: boolean;
  /** Veil opacity already on screen when this plan replaces an unfinished one. */
  carryVeil?: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Smooth start and stop (C2-continuous), so travel never jerks at either end. */
export const smootherstep = (t: number) => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10); };
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const window01 = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

type Aim = { yaw: number; pitch: number; distance: number };
const aim = (position: Point, target: Point): Aim => {
  const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2];
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz) || 1e-6), distance: Math.max(0.5, Math.hypot(dx, dy, dz)) };
};
/** Signed shortest angular difference b - a, in (-π, π]. */
const angleBetween = (a: number, b: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d <= -Math.PI) d += Math.PI * 2; return d; };
/** Turn the view by angle (never by moving a target point through the camera), the short way round. */
const blendAim = (a: Aim, b: Aim, t: number): Aim => ({ yaw: a.yaw + angleBetween(a.yaw, b.yaw) * t, pitch: lerp(a.pitch, b.pitch, t), distance: lerp(a.distance, b.distance, t) });
const project = (p: Point, v: Aim): Point => {
  const flat = Math.cos(v.pitch) * v.distance;
  return [p[0] + Math.sin(v.yaw) * flat, p[1] + Math.sin(v.pitch) * v.distance, p[2] + Math.cos(v.yaw) * flat];
};

/** Bounded so cinematic travel never delays ordinary use. */
export const ROUTE_MIN = 0.9, ROUTE_MAX = 1.9, BRIDGE_DEPART = 0.5, BRIDGE_ARRIVE = 0.85;
/** Long enough for the distance and for the turn (peak turn rate ≤ about 170°/s under smootherstep), never longer than ROUTE_MAX. */
export const routeDuration = (length: number, turnRadians = 0) => Math.min(ROUTE_MAX, Math.max(ROUTE_MIN, 0.75 + length / 7, 1.875 * Math.abs(turnRadians) * 180 / Math.PI / 170));

function polyline(points: readonly Point[]) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + dist(points[i - 1]!, points[i]!));
  const total = lengths.at(-1)!;
  const at = (s: number): Point => {
    if (points.length === 1 || total === 0) return [...points.at(-1)!];
    const d = clamp01(s) * total;
    let i = 1; while (i < lengths.length - 1 && lengths[i]! < d) i++;
    const span = lengths[i]! - lengths[i - 1]!;
    return mix(points[i - 1]!, points[i]!, span ? (d - lengths[i - 1]!) / span : 1);
  };
  return { total, at };
}

/** A pose pulled back along its own view direction and lifted, if that space is free. */
export function framingOffset(pose: { position: Point; target: Point }, back: number, lift: number, geometry: Geometry): Point | undefined {
  const dx = pose.position[0] - pose.target[0], dz = pose.position[2] - pose.target[2];
  const flat = Math.hypot(dx, dz) || 1;
  for (const scale of [1, 0.6, 0.3]) {
    const p: Point = [pose.position[0] + dx / flat * back * scale, pose.position[1] + lift * scale, pose.position[2] + dz / flat * back * scale];
    if (safePoint(p, geometry.floors, geometry.colliders, 0.12, false)) return p;
  }
  return undefined;
}

export function planTravel(input: PlanInput): TravelPlan {
  const { from, to, route, geometry, reduced, instant } = input;
  const carry = clamp01(input.carryVeil ?? 0);
  const fadeCarry = (elapsed: number) => carry * (1 - window01(elapsed, 0, 0.25));
  if (reduced || instant) return { kind: "cut", duration: 0, sample: () => ({ position: [...to.position], target: [...to.target], veil: 0 }) };

  if (route.length) {
    const path = polyline([from.position, ...route]);
    const start = aim(from.position, from.target), finish = aim(to.position, to.target);
    const duration = routeDuration(path.total, angleBetween(start.yaw, finish.yaw));
    const endHeading = path.at(1), lastLeg = path.at(Math.max(0, 1 - 1.5 / Math.max(path.total, 0.001)));
    const travelYaw = Math.atan2(endHeading[0] - lastLeg[0], endHeading[2] - lastLeg[2]);
    // Long walks look where they are going only when the arrival view continues that way;
    // otherwise (e.g. arriving facing back the way we came) the camera keeps a steady pull-back.
    const agrees = Math.max(0, Math.cos(angleBetween(travelYaw, finish.yaw)));
    const lookAhead = clamp01((path.total - 5) / 3) * agrees;
    return { kind: "route", duration, sample: (elapsed) => {
      const t = clamp01(elapsed / duration), s = smootherstep(t);
      if (t >= 1) return { position: [...to.position], target: [...to.target], veil: 0 };
      const position = path.at(s);
      const ahead = path.at(Math.min(1, s + 1.2 / Math.max(path.total, 0.001)));
      const gaze = Math.hypot(ahead[0] - position[0], ahead[2] - position[2]) > 0.05 ? aim(position, [ahead[0], position[1] - 0.6, ahead[2]]) : finish;
      const leave = smootherstep(window01(t, 0, 0.35)), settle = smootherstep(window01(t, 0.5, 1));
      const view = lookAhead ? blendAim(blendAim(start, gaze, leave * lookAhead), finish, settle) : blendAim(start, finish, s);
      return { position, target: project(position, view), veil: fadeCarry(elapsed) };
    } };
  }

  // No walkway between the rooms: depart, veil, arrive. Offsets are collision-checked in their own rooms.
  const depart = framingOffset(from, 0.7, 0.3, geometry) ?? from.position;
  const approach = framingOffset(to, 1.35, 0.35, geometry) ?? to.position;
  const duration = BRIDGE_DEPART + BRIDGE_ARRIVE;
  return { kind: "bridge", duration, sample: (elapsed) => {
    if (elapsed < BRIDGE_DEPART) {
      const t = elapsed / BRIDGE_DEPART;
      // Fully veiled before the camera changes rooms, so the crossing itself is never seen.
      const veil = Math.max(fadeCarry(elapsed), smootherstep(window01(t, 0.3, 0.88)));
      return { position: mix(from.position, depart, smootherstep(t)), target: [...from.target], veil };
    }
    const t = clamp01((elapsed - BRIDGE_DEPART) / BRIDGE_ARRIVE);
    if (t >= 1) return { position: [...to.position], target: [...to.target], veil: 0 };
    return { position: mix(approach, to.position, easeOut(t)), target: [...to.target], veil: 1 - smootherstep(window01(t, 0.06, 0.45)) };
  } };
}
