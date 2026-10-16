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
  { id: "studio", label: "Studio overview", shortLabel: "Studio", caption: "A space for what comes next", accent: "#2563eb", anchor: [0, 0.1, 4], camera: [9, 8, 12], target: [0, 0.7, 0], glyph: "◈" },
  { id: "hardware", label: "Hardware Lab", shortLabel: "Hardware", caption: "Build at the edge", accent: "#00759a", anchor: [-3.6, 1.6, -2.3], camera: [0, 3.6, 3], target: [-3.3, 1, -2.4], glyph: "▧" },
  { id: "software", label: "Software Studio", shortLabel: "Software", caption: "Ideas into interfaces", accent: "#2563eb", anchor: [3.6, 1.6, -2.3], camera: [7.7, 3.5, 2.8], target: [3.3, 1, -2.4], glyph: "⌘" },
  { id: "ai-lab", label: "AI / LLM Lab", shortLabel: "AI Lab", caption: "Explore the possible", accent: "#6366f1", anchor: [-3.6, 1.7, 2.1], camera: [0.4, 3.4, 7.1], target: [-3.3, 1, 2], glyph: "✳" },
  { id: "github", label: "GitHub projects", shortLabel: "Projects", caption: "Connect the work", accent: "#15803d", anchor: [3.6, 1.6, 2.1], camera: [7.8, 3.7, 7.3], target: [3.3, 1, 2], glyph: "⑂" },
  { id: "companion", label: "Astra Lumen II", shortLabel: "Companion", caption: "Your companion, in context", accent: "#00759a", anchor: [0, 2.3, 0], camera: [2.3, 2.1, 4.6], target: [0, 1.15, 0], glyph: "✧" },
];

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
