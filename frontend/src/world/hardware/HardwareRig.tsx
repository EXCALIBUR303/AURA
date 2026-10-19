import { useEffect, useMemo, useRef, useState } from "react";
import { BoxGeometry, EdgesGeometry, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { InstancedMesh } from "three";
import type { BufferGeometry, Group, Material } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { buildComponents, mergeAssembled, rotorGeometry } from "./builders.ts";
import type { BuiltComponents, MergedParts } from "./builders.ts";
import { COMPONENTS, FANS, componentById, separation, stepProgress } from "./catalog.ts";
import type { ComponentId } from "./catalog.ts";
import { hardwareInspection, useHardwareInspection } from "./inspection.ts";
import { createHardwareMaterials } from "./materials.ts";
import type { HardwareMaterials, MatKey } from "./materials.ts";
import type { Point } from "../types.ts";

type Rig = { materials: HardwareMaterials; assembled: MergedParts; rotor: BufferGeometry; edges: EdgesGeometry; dispose: () => void };
type Box = { center: Point; size: Point };
const disposeParts = (parts: MergedParts) => Object.values(parts).forEach((g) => g?.dispose());

/** Click targets used only while inspecting. Thin or enclosing parts get several small boxes so they never swallow clicks meant for what is inside. */
const PROXIES: Partial<Record<ComponentId, Box[]>> = {
  gpu: [{ center: [0.046, 0.19, -0.05], size: [0.056, 0.13, 0.31] }],
  cooler: [{ center: [-0.045, 0.335, -0.083], size: [0.108, 0.094, 0.098] }],
  ram: [{ center: [-0.086, 0.335, 0.035], size: [0.034, 0.134, 0.04] }],
  cpu: [{ center: [-0.1, 0.335, -0.075], size: [0.01, 0.046, 0.046] }],
  board: [{ center: [-0.11, 0.255, -0.04], size: [0.008, 0.3, 0.3] }],
  storage: [{ center: [-0.095, 0.25, -0.03], size: [0.012, 0.03, 0.09] }, { center: [-0.04, 0.046, 0.14], size: [0.07, 0.022, 0.1] }],
  airflow: [0.095, 0.245, 0.395].map((y): Box => ({ center: [0, y, 0.205], size: [0.12, 0.12, 0.03] })),
  psu: [{ center: [0, 0.066, -0.145], size: [0.22, 0.072, 0.18] }],
  case: [{ center: [0, 0.4775, 0], size: [0.25, 0.025, 0.49] }, { center: [0, 0.015, 0], size: [0.25, 0.03, 0.49] }],
};
let loadTiming = { materialsMs: 0, geometryMs: 0 }; // last rig build, read by the diagnostics below
const SPIN_RADIANS_PER_SECOND = 3.5; // decorative; not a measured fan speed

/** One-time resources for the whole tower: shared materials, the merged assembled geometry and the instanced rotor. */
function useRig(): Rig | null {
  const gl = useThree((state) => state.gl);
  const [rig, setRig] = useState<Rig | null>(null);
  // Created in an effect (not useMemo) so React StrictMode's mount, cleanup, mount cycle never leaves a disposed rig in use.
  useEffect(() => {
    const t0 = performance.now();
    const materials = createHardwareMaterials(gl), t1 = performance.now();
    const parts = buildComponents(), assembled = mergeAssembled(parts);
    loadTiming = { materialsMs: Math.round(t1 - t0), geometryMs: Math.round(performance.now() - t1) };
    (Object.keys(parts) as ComponentId[]).forEach((id) => disposeParts(parts[id]));
    const unit = new BoxGeometry(1, 1, 1), edges = new EdgesGeometry(unit); unit.dispose();
    const next: Rig = { materials, assembled, rotor: rotorGeometry(), edges, dispose() { materials.dispose(); disposeParts(assembled); this.rotor.dispose(); edges.dispose(); } };
    setRig(next);
    return () => { next.dispose(); setRig(null); };
  }, [gl]);
  return rig;
}

/** Per-component geometry, built only while the inspector is open (or still settling) and released afterwards. */
function useDetail(needed: boolean): BuiltComponents | null {
  const [detail, setDetail] = useState<BuiltComponents | null>(null);
  useEffect(() => {
    if (!needed) return;
    const built = buildComponents(); setDetail(built);
    return () => { (Object.keys(built) as ComponentId[]).forEach((id) => disposeParts(built[id])); setDetail(null); };
  }, [needed]);
  return needed ? detail : null;
}

function Meshes({ parts, materials, shadow }: { parts: MergedParts; materials: Record<MatKey, Material>; shadow?: boolean }) {
  return <>{(Object.entries(parts) as [MatKey, BufferGeometry][]).map(([mat, geometry]) =>
    <mesh key={mat} geometry={geometry} material={materials[mat]} castShadow={!!shadow && mat === "graphite"} dispose={null} />)}</>;
}

export function HardwareRig({ active, reduced }: { active: boolean; reduced: boolean }) {
  const rig = useRig();
  const view = useHardwareInspection();
  const gl = useThree((state) => state.gl);
  // Keep the exploded parts mounted until they have flown home after closing.
  const [settling, setSettling] = useState(false);
  const detail = useDetail(view.open || settling);
  useEffect(() => { if (view.open) setSettling(true); }, [view.open]);
  useEffect(() => () => { gl.domElement.style.cursor = ""; }, [gl]);

  const groups = useRef(new Map<ComponentId, Group>());
  const fans = useRef<InstancedMesh>(null);
  const progress = useRef(0), spin = useRef(0), dirty = useRef(true), clock = useRef(0);
  const scratch = useMemo(() => ({ object: new Object3D(), orient: new Quaternion(), turn: new Quaternion(), axisY: new Vector3(0, 1, 0), axisZ: new Vector3(0, 0, 1), matrix: new Matrix4() }), []);
  useEffect(() => { dirty.current = true; }, [rig, detail, reduced, view.exploded, view.open]);
  const detailMounted = useRef(false); detailMounted.current = !!detail;
  // Read-only measurements for tests and the performance notes: no personal data, nothing from the user's machine.
  useEffect(() => {
    const host = window as unknown as { __AURA_HARDWARE__?: unknown };
    host.__AURA_HARDWARE__ = {
      loadTiming: () => loadTiming,
      state: () => ({ progress: progress.current, detailMounted: detailMounted.current, spin: spin.current, fans: FANS.length }),
      resources: () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
    };
    return () => { delete host.__AURA_HARDWARE__; };
  }, [gl]);

  useFrame((_, delta) => {
    if (!rig || !fans.current) return;
    const target: 0 | 1 = view.open && view.exploded ? 1 : 0;
    const spinning = active && !reduced;
    let moved = dirty.current;
    if (active && progress.current !== target) { progress.current = stepProgress(progress.current, target, delta, reduced); dirty.current = true; moved = true; }
    if (spinning) { spin.current = (spin.current + Math.min(delta, 0.05) * SPIN_RADIANS_PER_SECOND) % (Math.PI * 2); clock.current += Math.min(delta, 0.05); }
    // The subtle RGB accent breathes slowly; under reduced motion it holds a steady level.
    const glow = spinning ? 0.8 + 0.2 * Math.sin(clock.current * 0.9) : 0.85;
    if (Math.abs(rig.materials.rgb.color.r - glow) > 0.004) rig.materials.rgb.color.setScalar(glow);
    if (settling && !view.open && progress.current === 0) setSettling(false);
    if (!spinning && !dirty.current) return;
    dirty.current = false;
    if (moved) for (const def of COMPONENTS) {
      const f = separation(progress.current, def.delay);
      groups.current.get(def.id)?.position.set(def.offset[0] * f, def.offset[1] * f, def.offset[2] * f);
    }
    const { object, orient, turn, axisY, axisZ } = scratch;
    FANS.forEach((fan, i) => {
      const def = componentById(fan.component)!, f = separation(progress.current, def.delay);
      object.position.set(fan.position[0] + def.offset[0] * f, fan.position[1] + def.offset[1] * f, fan.position[2] + def.offset[2] * f);
      orient.setFromAxisAngle(axisY, fan.axis === "x" ? Math.PI / 2 : 0).multiply(turn.setFromAxisAngle(axisZ, spin.current));
      object.quaternion.copy(orient); object.scale.setScalar(fan.radius); object.updateMatrix();
      fans.current!.setMatrixAt(i, object.matrix);
    });
    fans.current.instanceMatrix.needsUpdate = true;
  });

  if (!rig) return null;
  const select = (id: ComponentId) => (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= 4) hardwareInspection.select(id); };
  const over = (id: ComponentId) => (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hardwareInspection.hover(id); gl.domElement.style.cursor = "pointer"; };
  const out = (id: ComponentId) => () => { if (hardwareInspection.getSnapshot().hovered === id) hardwareInspection.hover(null); gl.domElement.style.cursor = ""; };
  return <group name="Interactive hardware (original illustration)">
    {!detail && <Meshes parts={rig.assembled} materials={rig.materials.mats} shadow />}
    {detail && COMPONENTS.map((def) => <group key={def.id} ref={(el) => { if (el) groups.current.set(def.id, el); else groups.current.delete(def.id); }}>
      <Meshes parts={detail[def.id]} materials={rig.materials.mats} shadow={def.id === "case"} />
      {view.open && def.selectable && (PROXIES[def.id] ?? []).map((box, i) =>
        <mesh key={i} visible={false} position={box.center} onClick={select(def.id)} onPointerOver={over(def.id)} onPointerOut={out(def.id)}><boxGeometry args={box.size} /><meshBasicMaterial /></mesh>)}
      {def.selectable && (view.selected === def.id || view.hovered === def.id) &&
        <lineSegments geometry={rig.edges} position={def.center} scale={def.size.map((v) => v + 0.008) as Point} material={view.selected === def.id ? rig.materials.outline.select : rig.materials.outline.hover} />}
    </group>)}
    <instancedMesh ref={fans} args={[rig.rotor, rig.materials.mats.fan, FANS.length]} frustumCulled={false} dispose={null} />
  </group>;
}

