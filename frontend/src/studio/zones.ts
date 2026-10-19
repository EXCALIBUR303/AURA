import { zonePose } from "../world/registry.ts";
import type { ZoneId } from "@aura/contracts";

type Point = [number, number, number];
export interface Zone {
  id: ZoneId;
  label: string;
  shortLabel: string;
  caption: string;
  accent: string;
  anchor: Point;
  camera: Point;
  target: Point;
  glyph: string;
}

export const ZONES: Zone[] = [
  { id: "studio", label: "Studio overview", shortLabel: "Studio", caption: "Four workstations. One considered workspace.", accent: "#426a7a", anchor: [0, 0.1, 4], camera: [9.6, 8.1, 12.8], target: [0, 0.7, -0.2], glyph: "◈" },
  { id: "hardware", label: "Hardware Lab", shortLabel: "Hardware", caption: "Electronics, systems, and the workbench.", accent: "#326b70", anchor: [-3.6, 1.8, -2.3], camera: [-0.5, 3.1, 2.2], target: [-3.3, 1, -2.4], glyph: "▧" },
  { id: "software", label: "Software Studio", shortLabel: "Software", caption: "A focused place to shape your software.", accent: "#42669a", anchor: [3.6, 1.8, -2.3], camera: [6.4, 3.1, 2.2], target: [3.3, 1, -2.4], glyph: "⌘" },
  { id: "ai-lab", label: "AI / LLM Lab", shortLabel: "AI Lab", caption: "Models, experiments, and new directions.", accent: "#6d5f87", anchor: [-3.6, 1.8, 2.1], camera: [-0.5, 3, 6.2], target: [-3.3, 1, 1.8], glyph: "✳" },
  { id: "github", label: "GitHub projects", shortLabel: "Projects", caption: "An organized view of your project collection.", accent: "#4f7059", anchor: [3.6, 1.7, 2.1], camera: [6.7, 3.1, 6.3], target: [3.3, 1, 1.8], glyph: "⑂" },
  { id: "companion", label: "Astra Lumen II", shortLabel: "Companion", caption: "A companion in the context of your work.", accent: "#326b70", anchor: [0, 2.1, 0], camera: [2, 2, 4.7], target: [0, 0.8, 0], glyph: "✧" },
];

// Physical coordinates are frontend-only; the six native identifiers are unchanged.
for (const zone of ZONES) {
  const pose=zonePose(zone.id);zone.camera=pose.position;zone.target=pose.target;
  zone.anchor=zone.id==="companion"?[-1.25,2.1,-12.5]:zone.id==="studio"?[0,.1,-7]:[zone.id==="hardware"||zone.id==="ai-lab"?-3.25:3.25,1.8,zone.id==="hardware"||zone.id==="software"?-13.5:-8.5];
}

export function getZone(id: ZoneId): Zone {
  return ZONES.find((zone) => zone.id === id)!;
}

export function isZone(value: unknown): value is ZoneId {
  return ZONES.some((zone) => zone.id === value);
}

export function readBrowserZone(): ZoneId | null {
  try {
    const value = localStorage.getItem("aura.mock.lastZone");
    return isZone(value) ? value : null;
  } catch { return null; }
}

export function writeBrowserZone(zone: ZoneId): void {
  try { localStorage.setItem("aura.mock.lastZone", zone); } catch { /* Storage may be disabled. */ }
}
