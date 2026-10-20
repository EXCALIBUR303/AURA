import { Block } from "./Architecture.tsx";
import type { GlowBar } from "./Architecture.tsx";
import type { Point } from "../types.ts";

/**
 * Project Hub architecture, in the Hub's local frame (origin [0, 0, -11]). Solid parts join the
 * room's instanced architecture batch; the practical lights join the room's glow batch.
 * Two station identities: Hardware gets a parts rack, Software a planning board. Original
 * geometry, no new files, no live data drawn.
 */
const BIN = ["#4f8f8c", "#c99a5b", "#7c8a93", "#4f8f8c"];
const CARD = ["#efd27e", "#9fbbea", "#a7d1ae", "#efd27e", "#e6a6a0", "#9fbbea", "#a7d1ae", "#efd27e", "#9fbbea"];

export function HubDetails() {
  return <>
    {/* Astra's backdrop: a darker recessed panel so she reads against the north wall. */}
    <Block at={[0, 1.75, -4.47]} size={[3.2, 3, .06]} color="#15273a" />
    {[3.27, .25].map(y => <Block key={y} at={[0, y, -4.43]} size={[3.4, .08, .08]} color="#3b5266" />)}
    {/* Wall rhythm: pilasters and a wainscot line on both long walls. */}
    {[-6, 6].flatMap(x => [-2.9, 0, 2.9].map(z => <Block key={`${x}:${z}`} at={[x, 1.8, z]} size={[.14, 3.6, .22]} color="#3b4f62" />))}
    {[-5.99, 5.99].map(x => <Block key={x} at={[x, 1.02, 0]} size={[.03, .05, 9]} color="#5c7184" />)}
    {/* Ceiling structure and fixture housings. */}
    {[-2.9, 0, 2.9].map(z => <Block key={z} at={[0, 3.52, z]} size={[12, .16, .22]} color="#2d4052" />)}
    {[-2, 2].map(x => <Block key={x} at={[x, 3.55, 0]} size={[.16, .1, 9]} color="#2d4052" />)}
    {[-3.25, 3.25].flatMap(x => [-2.5, 2.5].map(z => <Block key={`h${x}:${z}`} at={[x, 3.46, z]} size={[2.3, .08, .22]} color="#24364a" />))}
    {/* A processional inlay from the doorway to Astra's pedestal. */}
    {[-.62, .62].map(x => <Block key={x} at={[x, .007, 1.85]} size={[.03, .012, 5.2]} color="#b9996c" />)}
    {/* Hardware station: a parts rack on the west wall. */}
    <Block at={[-5.97, 1.6, -2.5]} size={[.04, 1.1, 1.8]} color="#2a3d4d" />
    {[1.2, 1.55, 1.9].map(y => <Block key={y} at={[-5.86, y, -2.5]} size={[.22, .03, 1.7]} color="#6f7d86" />)}
    {[1.2, 1.55, 1.9].flatMap((y, row) => [-.6, -.2, .2, .6].map((z, i) => <Block key={`${y}:${z}`} at={[-5.86, y + .075, -2.5 + z]} size={[.18, .12, .3]} color={BIN[(i + row) % 4]!} />))}
    {/* Software station: a planning board on the east wall. */}
    <Block at={[5.97, 1.65, -2.5]} size={[.04, 1.1, 1.9]} color="#d6d9cc" />
    <Block at={[5.95, 2.17, -2.5]} size={[.045, .07, 1.9]} color="#6683ad" />
    {[-.32, .32].map(z => <Block key={z} at={[5.94, 1.6, -2.5 + z]} size={[.05, .95, .015]} color="#9aa2a0" />)}
    {CARD.map((color, i) => <Block key={i} at={[5.93, 1.9 - Math.floor(i / 3) * .25, -2.5 + (i % 3 - 1) * .64]} size={[.05, .16, .24]} color={color} />)}
    {/* AI Lab station: a dark projection wall on the west side, edged in lilac (see HubLights). */}
    <Block at={[-5.97, 1.75, 2.5]} size={[.04, 1.3, 2]} color="#1b1f33" />
  </>;
}

/** The Hub's practical light bars (station ceilings, Astra's backdrop edges, walkway, AI Lab wall), drawn with its doorway glow. */
export const HUB_BARS: GlowBar[] = [
  ...([[-3.25, -2.5, "#7fd0cf"], [3.25, -2.5, "#9bb8f0"], [-3.25, 2.5, "#b6a8ee"], [3.25, 2.5, "#a3d0ac"]] as const).map(([x, z, color]) => ({ at: [x, 3.415, z] as Point, size: [2.1, .025, .06] as Point, color })),
  ...[-1.62, 1.62].map(x => ({ at: [x, 1.75, -4.43] as Point, size: [.03, 2.6, .03] as Point, color: "#6fbfc4" })),
  ...[1.3, 3.1].map(z => ({ at: [0, 3.5, z] as Point, size: [.06, .025, 1.2] as Point, color: "#c9dde6" })),
  ...[1.12, 2.38].map(y => ({ at: [-5.94, y, 2.5] as Point, size: [.02, .02, 2.04] as Point, color: "#a898e8" })),
  ...[1.5, 3.5].map(z => ({ at: [-5.94, 1.75, z] as Point, size: [.02, 1.28, .02] as Point, color: "#a898e8" })),
];
