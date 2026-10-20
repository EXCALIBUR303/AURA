import { CanvasTexture, Color, DoubleSide, LinearMipmapLinearFilter, LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator, SRGBColorSpace, Texture } from "three";
import type { Material, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Eleven shared materials cover the whole tower: geometry is merged per material, never per part. */
export type MatKey = "graphite" | "shroud" | "alu" | "nickel" | "copper" | "pcb" | "rubber" | "gold" | "glass" | "rgb" | "fan";
export const MAT_KEYS: readonly MatKey[] = ["graphite", "shroud", "alu", "nickel", "copper", "pcb", "rubber", "gold", "glass", "rgb", "fan"];

/** Deterministic pseudo-random sequence (no Math.random), so the decorative board pattern never changes between runs. */
function lcg(seed: number) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

/** A procedural circuit pattern for the board, drawn once on a 512 px canvas. It is decoration, not a real layout. */
export function circuitTexture(): CanvasTexture {
  const size = 512, canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const rand = lcg(20261019);
    ctx.fillStyle = "#1c3733"; ctx.fillRect(0, 0, size, size);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let layer = 0; layer < 2; layer++) {
      ctx.strokeStyle = layer ? "#2f6a5c" : "#3c8572"; ctx.lineWidth = layer ? 2 : 3;
      for (let i = 0; i < 70; i++) {
        let x = Math.floor(rand() * 32) * 16 + 8, y = Math.floor(rand() * 32) * 16 + 8, horizontal = rand() < 0.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 2 + Math.floor(rand() * 4); k++) {
          const run = (1 + Math.floor(rand() * 6)) * 16 * (rand() < 0.5 ? -1 : 1);
          if (horizontal) x += run; else y += run; ctx.lineTo(x, y); horizontal = !horizontal;
        }
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#6fb39d";
    for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc(Math.floor(rand() * 32) * 16 + 8, Math.floor(rand() * 32) * 16 + 8, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearMipmapLinearFilter; texture.anisotropy = 4;
  return texture;
}

export type HardwareMaterials = {
  mats: Record<MatKey, Material>;
  rgb: MeshBasicMaterial;
  outline: { hover: LineBasicMaterial; select: LineBasicMaterial };
  dispose: () => void;
};

/**
 * `envMap` is applied only to these materials (not to scene.environment), so the other rooms' lighting
 * is untouched. Reflections come from three's built-in procedural studio, which needs no network.
 */
/**
 * The studio reflection and the circuit texture are identical every time, so they are made once and
 * kept for the session (one small cube texture per renderer, one 512 px canvas): rebuilding the
 * reflection compiles PMREM's shaders and renders about twenty passes in the frame the Hub mounts.
 * Keyed by renderer, so a restored WebGL context builds its own.
 */
const reflections = new WeakMap<WebGLRenderer, Texture>();
let sharedBoard: CanvasTexture | undefined;
function studioReflection(gl: WebGLRenderer): Texture {
  let envMap = reflections.get(gl);
  if (!envMap) {
    const pmrem = new PMREMGenerator(gl), studio = new RoomEnvironment();
    envMap = pmrem.fromScene(studio, 0.04).texture;
    studio.dispose(); pmrem.dispose(); reflections.set(gl, envMap);
  }
  return envMap;
}

export function createHardwareMaterials(gl: WebGLRenderer): HardwareMaterials {
  const envMap = studioReflection(gl);
  const board = sharedBoard ??= circuitTexture();
  const standard = (color: string, metalness: number, roughness: number, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, envMap, envMapIntensity: 0.9, ...extra });
  const rgb = new MeshBasicMaterial({ color: new Color(1, 1, 1), vertexColors: true, toneMapped: false });
  const mats: Record<MatKey, Material> = {
    graphite: standard("#2b353c", 0.55, 0.42),
    shroud: standard("#1a2227", 0.7, 0.46),
    alu: standard("#b9c2c4", 1, 0.32),
    nickel: standard("#cfd2d0", 1, 0.2),
    copper: standard("#c4805a", 1, 0.26),
    pcb: standard("#ffffff", 0.15, 0.55, { map: board, bumpMap: board, bumpScale: 0.6 }),
    rubber: standard("#151b20", 0, 0.82, { envMapIntensity: 0.3 }),
    gold: standard("#d9b45e", 1, 0.24),
    glass: standard("#a9cad6", 0, 0.05, { transparent: true, opacity: 0.13, depthWrite: false, envMapIntensity: 1.3 }),
    rgb,
    fan: standard("#11171c", 0.25, 0.5, { side: DoubleSide }),
  };
  const outline = { hover: new LineBasicMaterial({ color: "#9cdeeb", transparent: true, opacity: 0.45, toneMapped: false }), select: new LineBasicMaterial({ color: "#9cdeeb", toneMapped: false }) };
  return {
    mats, rgb, outline,
    dispose() { Object.values(mats).forEach((m) => m.dispose()); outline.hover.dispose(); outline.select.dispose(); },
  };
}
