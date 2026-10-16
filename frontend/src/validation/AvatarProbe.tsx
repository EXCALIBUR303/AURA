// Phase 1 validation scene: proves Three.js/R3F initialise, the Astra Lumen
// GLB resolves and loads, and reports what the file actually contains.
// Throwaway by design — Codex replaces this with the real studio in Phase 2.

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const AVATAR_URL = "/avatar/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb";

export interface ClipInfo {
  name: string;
  durationSec: number;
  tracks: number;
}

export interface RendererInfo {
  webgl2: boolean;
  vendor: string;
  renderer: string;
  maxTextureSize: number;
  pixelRatio: number;
}

export interface AvatarDiagnostics {
  status: "loading" | "loaded" | "error";
  error?: string;
  /** Wall-clock ms from mount to first render of the parsed model (fetch + parse + upload). */
  loadMs?: number;
  clips: ClipInfo[];
  playingClip?: string;
  skinnedMeshes: number;
  bones: number;
  morphTargets: number;
  triangles: number;
  materials: string[];
  textures: string[];
  heightMeters?: number;
  renderer?: RendererInfo;
  /** Frames per second measured over the last second in this tab. */
  fps?: number;
}

export const EMPTY_DIAGNOSTICS: AvatarDiagnostics = {
  status: "loading",
  clips: [],
  skinnedMeshes: 0,
  bones: 0,
  morphTargets: 0,
  triangles: 0,
  materials: [],
  textures: [],
};

type Report = (patch: Partial<AvatarDiagnostics>) => void;

function inspect(scene: THREE.Object3D, animations: THREE.AnimationClip[]): Partial<AvatarDiagnostics> {
  let skinnedMeshes = 0;
  let triangles = 0;
  let morphTargets = 0;
  const bones = new Set<string>();
  const materials = new Set<string>();
  const textures = new Set<string>();

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshes += 1;
      for (const bone of object.skeleton.bones) bones.add(bone.uuid);
    }
    const geometry = object.geometry as THREE.BufferGeometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    morphTargets = Math.max(morphTargets, Object.values(geometry.morphAttributes)[0]?.length ?? 0);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(`${material.name || "(unnamed)"} · ${material.type}`);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && value.image) {
          const image = value.image as { width?: number; height?: number };
          textures.add(`${value.name || "(unnamed)"} ${image.width}×${image.height}`);
        }
      }
    }
  });

  return {
    clips: animations.map((clip) => ({ name: clip.name, durationSec: clip.duration, tracks: clip.tracks.length })),
    skinnedMeshes,
    bones: bones.size,
    morphTargets,
    triangles: Math.round(triangles),
    materials: [...materials],
    textures: [...textures],
  };
}

function Avatar({ startedAt, report }: { startedAt: number; report: Report }) {
  const group = useRef<THREE.Group>(null);
  // useDraco=false: this asset is not Draco-compressed, and drei's default
  // decoder path is a CDN — the app must not make that request.
  const { scene, animations } = useGLTF(AVATAR_URL, false);
  const { actions } = useAnimations(animations, group);
  const facts = useMemo(() => inspect(scene, animations), [scene, animations]);

  // Stand the model on the floor at the origin.
  useLayoutEffect(() => {
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -box.min.y, -center.z);
    report({ heightMeters: Number((box.max.y - box.min.y).toFixed(3)) });
  }, [scene, report]);

  useEffect(() => {
    report({ ...facts, status: "loaded", loadMs: Math.round(performance.now() - startedAt) });
  }, [facts, report, startedAt]);

  useEffect(() => {
    const first = animations[0]?.name;
    const action = first ? actions[first] : undefined;
    if (!first || !action) return;
    action.reset().fadeIn(0.3).play();
    report({ playingClip: first });
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, animations, report]);

  return <primitive ref={group} object={scene} />;
}

function FpsMeter({ report }: { report: Report }) {
  const frames = useRef(0);
  const windowStart = useRef(performance.now());
  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (now - windowStart.current >= 1000) {
      report({ fps: Math.round((frames.current * 1000) / (now - windowStart.current)) });
      frames.current = 0;
      windowStart.current = now;
    }
  });
  return null;
}

class LoadBoundary extends Component<{ report: Report; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.report({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function readRenderer(gl: THREE.WebGLRenderer): RendererInfo {
  const context = gl.getContext();
  const debug = context.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: gl.capabilities.isWebGL2,
    vendor: String(context.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : context.VENDOR)),
    renderer: String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
    maxTextureSize: gl.capabilities.maxTextureSize,
    pixelRatio: gl.getPixelRatio(),
  };
}

export function AvatarProbe({ report, maxPixelRatio = 2 }: { report: Report; maxPixelRatio?: number }) {
  const startedAt = useMemo(() => performance.now(), []);
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, maxPixelRatio]}
      camera={{ position: [0, 1.4, 3.2], fov: 35, near: 0.05, far: 100 }}
      onCreated={({ gl }) => report({ renderer: readRenderer(gl) })}
    >
      <color attach="background" args={["#eef2f8"]} />
      <hemisphereLight args={["#ffffff", "#c8d2e0", 1.2]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#bfe9ff" />
      <gridHelper args={[10, 20, "#b4c0d0", "#d6dee9"]} />
      <LoadBoundary report={report}>
        <Suspense fallback={null}>
          <Avatar startedAt={startedAt} report={report} />
        </Suspense>
      </LoadBoundary>
      <OrbitControls target={[0, 0.9, 0]} enableDamping makeDefault />
      <FpsMeter report={report} />
    </Canvas>
  );
}
