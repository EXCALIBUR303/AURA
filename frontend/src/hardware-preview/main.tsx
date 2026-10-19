// Development-only entry: renders just the procedural hardware kit with orbit controls, with no room assets,
// bridge or Astra. Not imported by the production app or its build (vite builds index.html only).
// Query: ?assembled=1 (merged at-rest tower, as in the Hub)  ?select=gpu  ?explode=1  ?reduced=1
// The camera is framed with the same pure focusPose used in the world.
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { HardwareRig } from "../world/hardware/HardwareRig.tsx";
import { hardwareInspection } from "../world/hardware/inspection.ts";
import { HARDWARE_ORIGIN, focusPose } from "../world/hardware/catalog.ts";
import type { ComponentId } from "../world/hardware/catalog.ts";

const params = new URLSearchParams(location.search);
const assembled = params.get("assembled") === "1";
const select = (params.get("select") || null) as ComponentId | null, exploded = params.get("explode") === "1", reduced = params.get("reduced") === "1";

function Frame() {
  const camera = useThree((s) => s.camera), gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!assembled) { hardwareInspection.open(); hardwareInspection.select(select); hardwareInspection.setExploded(exploded); }
    const pose = focusPose(select, exploded);
    // The rig lives at the origin here, so convert from world to preview space.
    camera.position.set(pose.position[0] - HARDWARE_ORIGIN[0], pose.position[1] - HARDWARE_ORIGIN[1], pose.position[2] - HARDWARE_ORIGIN[2]);
    camera.lookAt(pose.target[0] - HARDWARE_ORIGIN[0], pose.target[1] - HARDWARE_ORIGIN[1], pose.target[2] - HARDWARE_ORIGIN[2]);
    (window as unknown as { __PREVIEW__: unknown }).__PREVIEW__ = { gl, info: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length }) };
    return () => hardwareInspection.close();
  }, [camera, gl]);
  const pose = focusPose(select, exploded);
  return <OrbitControls makeDefault enablePan={false} target={[pose.target[0] - HARDWARE_ORIGIN[0], pose.target[1] - HARDWARE_ORIGIN[1], pose.target[2] - HARDWARE_ORIGIN[2]]} minDistance={0.16} maxDistance={1.3} />;
}

createRoot(document.getElementById("root")!).render(<StrictMode>
  <Canvas camera={{ fov: 50, near: 0.05, far: 80 }} dpr={[1, 2]} shadows="percentage" gl={{ preserveDrawingBuffer: true, antialias: true }}
    onCreated={({ gl }) => { gl.outputColorSpace = SRGBColorSpace; gl.toneMapping = ACESFilmicToneMapping; }}>
    <color attach="background" args={["#122135"]} />
    <hemisphereLight args={["#bbd6ec", "#465569", 1.35]} />
    <directionalLight position={[-1.5, 2.6, 1]} intensity={2.15} color="#f5dfc4" castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[2, 1.5, 2]} intensity={0.8} color="#91bfeb" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow><planeGeometry args={[3, 3]} /><meshStandardMaterial color="#8b6546" roughness={0.7} /></mesh>
    <HardwareRig active reduced={reduced} />
    <Frame />
  </Canvas>
</StrictMode>);
