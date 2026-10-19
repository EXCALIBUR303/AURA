import { memo, useEffect } from "react";
import { Instance, Instances } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ZoneId } from "@aura/contracts";

import { Equipment } from "../world/assets/Equipment.tsx";
import { STATIONS } from "../world/interactions/registry.ts";
import type { MotionSamples, WorldSettings } from "../world/settings.ts";
import type { ScreenState } from "../world/assets/MonitorAtlas.tsx";

const PLANTS: [number, number][] = [[-5.15, -3.65], [5.1, -3.65], [-5.1, 3.25], [5.1, 3.25]];
function Plantings() {
  return <>
    <Instances limit={4} frames={1} castShadow receiveShadow>
      <cylinderGeometry args={[0.24, 0.19, 0.52, 12]} /><meshStandardMaterial color="#d9d8cd" roughness={0.9} />
      {PLANTS.map(([x, z]) => <Instance key={`${x}:${z}`} position={[x, 0.26, z]} />)}
    </Instances>
    <Instances limit={4} frames={1}>
      <cylinderGeometry args={[0.023, 0.028, 0.8, 6]} /><meshStandardMaterial color="#667a60" roughness={1} />
      {PLANTS.map(([x, z]) => <Instance key={`${x}:${z}`} position={[x, 0.78, z]} />)}
    </Instances>
    <Instances limit={20} frames={1} castShadow>
      <sphereGeometry args={[1, 8, 5]} /><meshStandardMaterial roughness={0.95} />
      {PLANTS.flatMap(([x, z]) => Array.from({ length: 5 }, (_, i) => <Instance key={`${x}:${z}:${i}`}
        position={[x + Math.sin(i * 2) * 0.22, 0.85 + i * 0.14, z + Math.cos(i * 2) * 0.18]}
        scale={[0.28, 0.4, 0.14]} rotation={[0, i, 0.6]} color={i % 2 ? "#6e8a73" : "#94a58a"} />))}
    </Instances>
  </>;
}

export const World = memo(function World({ zone, navigate, focusCompanion, inspect, selected, reduced, active, screens, settings, motion }: {
  zone: ZoneId; navigate: (zone: ZoneId) => void; focusCompanion: () => void;
  inspect:(id:string)=>void;selected:string|null;reduced:boolean;active:boolean;screens:ScreenState;settings:WorldSettings;motion:MotionSamples;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => () => { gl.domElement.style.cursor = ""; }, [gl]);
  const station = STATIONS.find((item) => item.id === zone);
  // Keep the ring mounted and rendered (opacity 0 outside workstations): unmounting disposes
  // its material and an invisible mesh is never compiled, so either way the next workstation
  // visit would link a new shader program mid-transition (a synchronous GPU stall).
  const ring = station ?? STATIONS[0]!;
  return <group>
    <Equipment navigate={navigate} inspect={inspect} selected={selected} reduced={reduced} active={active} screens={screens} settings={settings} motion={motion}/>
    <Plantings />
    <group position={[-1.25,0,-1.5]}>
    <mesh position={[0, .065, 0]} receiveShadow><cylinderGeometry args={[.66, .72, .12, 64]} /><meshStandardMaterial color="#243748" metalness={.55} roughness={.38} /></mesh>
    <mesh position={[0, .126, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.64, 64]} /><meshStandardMaterial color="#415363" metalness={.3} roughness={.48} /></mesh>
    <mesh position={[0, .128, 0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.60,.615,64]}/><meshBasicMaterial color="#96d8e3" toneMapped={false}/></mesh>
    </group>
    <mesh position={[ring.x, 0.098, ring.z + 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.45, 1.47, 4]} /><meshBasicMaterial color={ring.accent} transparent opacity={station ? 0.5 : 0} depthWrite={false} />
    </mesh>
    {/* A non-rendering, six-face hit area avoids raycasting the 36k-triangle rig. */}
    <mesh visible={false} position={[-1.25, 1.03, -1.5]} onClick={(event) => { event.stopPropagation(); focusCompanion(); }}
      onPointerOver={() => { gl.domElement.style.cursor = "pointer"; }} onPointerOut={() => { gl.domElement.style.cursor = ""; }}>
      <boxGeometry args={[0.78, 1.8, 0.68]} /><meshBasicMaterial />
    </mesh>
  </group>;
});
