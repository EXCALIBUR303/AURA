import { memo, useEffect, useMemo, useState } from "react";
import { Color } from "three";
import { Instance, Instances } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { ZoneId } from "@aura/contracts";

type Point = [number, number, number];
const STATIONS: { id: ZoneId; x: number; z: number; accent: string; top: string }[] = [
  { id: "hardware", x: -3.5, z: -2.5, accent: "#4c8186", top: "#c6b394" },
  { id: "software", x: 3.5, z: -2.5, accent: "#6683ad", top: "#f4f3ed" },
  { id: "ai-lab", x: -3.5, z: 1.8, accent: "#827a9b", top: "#b1b9bd" },
  { id: "github", x: 3.5, z: 1.8, accent: "#748b7b", top: "#e8e5db" },
];

function Box({ position, size, color = "#e8e8e3", rotation, onSelect }: {
  position: Point; size: Point; color?: string; rotation?: Point; onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverColor = useMemo(() => onSelect ? `#${new Color(color).lerp(new Color("#ffffff"), 0.14).getHexString()}` : color, [color, !!onSelect]);
  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect?.(); };
  return <Instance position={position} scale={size} color={hovered ? hoverColor : color} rotation={rotation}
    onClick={onSelect ? select : undefined}
    onPointerOver={onSelect ? (event) => { event.stopPropagation(); setHovered(true); (event.nativeEvent.target as HTMLCanvasElement).style.cursor = "pointer"; } : undefined}
    onPointerOut={onSelect ? (event) => { setHovered(false); (event.nativeEvent.target as HTMLCanvasElement).style.cursor = ""; } : undefined} />;
}

function Monitor({ x = 0, y = 1.48, width = 1.5, height = 0.83, accent, select }: {
  x?: number; y?: number; width?: number; height?: number; accent: string; select: () => void;
}) {
  return <>
    <Box position={[x, 1.05, -0.28]} size={[0.055, 0.4, 0.055]} color="#8c9ba3" />
    <Box position={[x, 0.89, -0.22]} size={[0.43, 0.035, 0.29]} color="#a7b1b4" />
    <Box position={[x, y, -0.32]} size={[width + 0.08, height + 0.08, 0.07]} color="#273b44" onSelect={select} />
    <Box position={[x, y, -0.276]} size={[width, height, 0.012]} color="#1c3039" onSelect={select} />
    {/* Abstract layout marks, never invented source data or telemetry. */}
    {[0, 1, 2].map((row) => <Box key={row} position={[x - width * 0.08, y + height * 0.23 - row * height * 0.25, -0.263]}
      size={[width * (row === 1 ? 0.45 : 0.68), 0.025, 0.01]} color={accent} />)}
  </>;
}

function Workstation({ station, navigate }: { station: typeof STATIONS[number]; navigate: (zone: ZoneId) => void }) {
  const { id, x, z, accent, top } = station;
  const select = () => navigate(id);
  return <group position={[x, 0, z]}>
    <Box position={[0, 0.08, 0.15]} size={[2.95, 0.032, 2.6]} color={id === "hardware" ? "#d8ded6" : id === "software" ? "#d9e1e5" : id === "ai-lab" ? "#dfdce4" : "#e0e4dc"} />
    <Box position={[0, 0.83, 0]} size={[2.45, 0.1, 1.16]} color={top} onSelect={select} />
    <Box position={[0, 0.755, 0.47]} size={[2.3, 0.045, 0.065]} color={accent} />
    {[-0.98, 0.98].map((side) => <Box key={side} position={[side, 0.42, 0]} size={[0.12, 0.79, 0.87]} color="#9ca9ac" />)}
    <Box position={[0, 0.89, 0.23]} size={[0.75, 0.025, 0.23]} color="#dce0df" />
    {id === "hardware" && <>
      <Box position={[0, 1.63, -0.7]} size={[2.3, 1.28, 0.085]} color="#aabfbb" />
      <Monitor x={0.32} width={1.05} height={0.69} accent="#83aaa9" select={select} />
      <Box position={[-0.78, 1.14, 0.08]} size={[0.46, 0.5, 0.43]} color="#344d4d" onSelect={select} />
      {[0, 1, 2].map((row) => <Box key={row} position={[-0.78, 1.01 + row * 0.12, 0.302]} size={[0.31, 0.027, 0.012]} color="#a7bbb0" />)}
      <Box position={[0.72, 0.9, 0.22]} size={[0.36, 0.025, 0.29]} color="#426f63" />
      <Box position={[0.72, 0.923, 0.22]} size={[0.15, 0.025, 0.14]} color="#273d3d" />
      {[-0.62, -0.25, 0.12, 0.49].map((side) => <Box key={side} position={[side, 2.02, -0.642]} size={[0.16, 0.025, 0.015]} color="#e2e7dc" />)}
    </>}
    {id === "software" && <>
      <Monitor x={-0.42} width={1.16} height={0.79} accent="#8ba7c4" select={select} />
      <Monitor x={0.7} y={1.52} width={0.63} height={0.96} accent="#b0bbcf" select={select} />
      <Box position={[-0.82, 0.95, 0.24]} size={[0.27, 0.12, 0.32]} color="#9ba9bd" />
      <Box position={[-0.82, 1.03, 0.24]} size={[0.27, 0.035, 0.32]} color="#d0d8de" />
    </>}
    {id === "ai-lab" && <>
      <Monitor x={-0.36} width={1.2} height={0.8} accent="#aca0c0" select={select} />
      <Box position={[0.88, 1.27, -0.06]} size={[0.46, 0.79, 0.67]} color="#4f5364" onSelect={select} />
      {[0, 1, 2, 3].map((row) => <Box key={row} position={[0.88, 1.01 + row * 0.17, 0.285]} size={[0.34, 0.045, 0.025]} color="#adb0ba" />)}
      <Box position={[-0.97, 1.02, 0.18]} size={[0.16, 0.25, 0.24]} color="#c5b9c9" />
    </>}
    {id === "github" && <>
      <Monitor x={0.38} width={1.35} height={0.79} accent="#a0b9ab" select={select} />
      {[-0.95, -0.77, -0.59].map((side, i) => <Box key={side} position={[side, 1.13, -0.05]} size={[0.11, 0.47 + i * 0.07, 0.43]} color={i === 1 ? "#a2b4a4" : "#c7ccc1"} />)}
      <Box position={[0.66, 0.92, 0.27]} size={[0.55, 0.06, 0.29]} color="#d7ceb9" />
    </>}
    <group position={[0, 0, 1.08]}>
      <Box position={[0, 0.51, 0]} size={[0.64, 0.1, 0.58]} color={accent} />
      <Box position={[0, 0.29, 0]} size={[0.08, 0.46, 0.08]} color="#8e9ca2" />
      <Box position={[0, 0.84, 0.22]} size={[0.64, 0.58, 0.08]} color={accent} />
      <Box position={[0, 0.065, 0]} size={[0.65, 0.05, 0.5]} color="#8e9ca2" />
    </group>
  </group>;
}

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

const Architecture = memo(function Architecture({ navigate }: { navigate: (zone: ZoneId) => void }) {
  return <Instances limit={220} frames={1} castShadow receiveShadow>
    <boxGeometry /><meshStandardMaterial roughness={0.76} metalness={0.08} />
    <Box position={[0, -0.02, 0]} size={[12.1, 0.12, 9.1]} color="#d4c7ae" />
    <Box position={[0, 0.045, 0]} size={[11.97, 0.035, 8.97]} color="#e8e7de" />
    {[-4, -2, 0, 2, 4].map((x) => <Box key={x} position={[x, 0.065, 0]} size={[0.013, 0.003, 8.8]} color="#d2d5ce" />)}
    <Box position={[0, 0.067, -0.3]} size={[1.72, 0.006, 7.9]} color="#eeede6" />
    <Box position={[0, 1.95, -4.5]} size={[12, 3.9, 0.16]} color="#dedfd6" />
    <Box position={[-6, 1.95, -0.6]} size={[0.12, 3.9, 7.8]} color="#d5dedc" />
    <Box position={[0, 3.92, -4.15]} size={[12.1, 0.16, 0.85]} color="#eceae1" />
    <Box position={[-5.82, 3.92, -0.55]} size={[0.5, 0.16, 7.8]} color="#eceae1" />
    {/* Tall window bays and solid reveals create depth without transparent overdraw. */}
    {[-4.4, -2.4, 2.4, 4.4].map((x) => <group key={x}>
      <Box position={[x, 2.25, -4.37]} size={[1.77, 2.45, 0.07]} color="#c3d4d5" />
      <Box position={[x, 2.25, -4.29]} size={[0.045, 2.45, 0.07]} color="#f3f1e7" />
      <Box position={[x, 1.02, -4.25]} size={[1.9, 0.08, 0.28]} color="#ecece3" />
    </group>)}
    <Box position={[0, 2.05, -4.32]} size={[1.5, 3.72, 0.16]} color="#c5b99f" />
    {[-0.49, -0.24, 0, 0.24, 0.49].map((x) => <Box key={x} position={[x, 2.05, -4.19]} size={[0.06, 3.65, 0.12]} color="#dcd1b8" />)}
    {[-3.2, -1.35, 0.5, 2.35].map((z) => <group key={z}>
      <Box position={[-5.9, 2.25, z]} size={[0.05, 2.45, 1.55]} color="#c4d5d6" />
      <Box position={[-5.84, 2.25, z]} size={[0.08, 2.45, 0.045]} color="#eeeee4" />
    </group>)}
    <Box position={[0, 0.34, -4.12]} size={[11.4, 0.57, 0.58]} color="#d3d9d1" />
    {STATIONS.map((station) => <Workstation key={station.id} station={station} navigate={navigate} />)}
  </Instances>;
});

export const World = memo(function World({ zone, navigate, focusCompanion }: {
  zone: ZoneId; navigate: (zone: ZoneId) => void; focusCompanion: () => void;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => () => { gl.domElement.style.cursor = ""; }, [gl]);
  const station = STATIONS.find((item) => item.id === zone);
  // Keep the ring mounted and rendered (opacity 0 outside workstations): unmounting disposes
  // its material and an invisible mesh is never compiled, so either way the next workstation
  // visit would link a new shader program mid-transition (a synchronous GPU stall).
  const ring = station ?? STATIONS[0]!;
  return <group>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.085, 0]}>
      <planeGeometry args={[200, 200]} /><meshStandardMaterial color="#e7e9e6" roughness={0.92} />
    </mesh>
    <Architecture navigate={navigate} />
    <Plantings />
    <mesh position={[0, 0.095, 0]} receiveShadow><cylinderGeometry args={[1.23, 1.29, 0.07, 64]} /><meshStandardMaterial color="#c4c8c3" roughness={0.75} /></mesh>
    <mesh position={[0, 0.126, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.2, 64]} /><meshStandardMaterial color="#e7e8e0" roughness={0.66} /></mesh>
    <mesh position={[ring.x, 0.098, ring.z + 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.45, 1.47, 4]} /><meshBasicMaterial color={ring.accent} transparent opacity={station ? 0.5 : 0} depthWrite={false} />
    </mesh>
    {/* A non-rendering, six-face hit area avoids raycasting the 36k-triangle rig. */}
    <mesh visible={false} position={[0, 1.03, 0]} onClick={(event) => { event.stopPropagation(); focusCompanion(); }}
      onPointerOver={() => { gl.domElement.style.cursor = "pointer"; }} onPointerOut={() => { gl.domElement.style.cursor = ""; }}>
      <boxGeometry args={[0.78, 1.8, 0.68]} /><meshBasicMaterial />
    </mesh>
  </group>;
});
