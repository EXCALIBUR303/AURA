import { memo } from "react";
import { Instance, Instances } from "@react-three/drei";

function Box({ position, size, color = "#e9eef2" }: {
  position: [number, number, number]; size: [number, number, number]; color?: string; metalness?: number;
}) {
  return <Instance position={position} scale={size} color={color} />;
}

function Workbench({ x, z, accent, variant }: { x: number; z: number; accent: string; variant: "hardware" | "software" | "ai" | "github" }) {
  return <group position={[x, 0, z]}>
    <Box position={[0, 0.81, 0]} size={[2.35, 0.12, 1.15]} color="#f9fbfd" />
    {[-0.93, 0.93].map((side) => <Box key={side} position={[side, 0.4, 0]} size={[0.11, 0.8, 0.85]} color="#c6d0da" metalness={0.65} />)}
    <Box position={[0, 0.74, 0.49]} size={[2.15, 0.035, 0.028]} color={accent} />
    <Box position={[0, 1.05, -0.25]} size={[0.06, 0.45, 0.06]} color="#aebbc7" />
    <Box position={[0, 0.9, -0.16]} size={[0.5, 0.035, 0.3]} color="#bac6d2" />
    <Box position={[0, 1.47, -0.3]} size={[1.55, 0.92, 0.07]} color="#233241" metalness={0.5} />
    <Box position={[0, 1.47, -0.258]} size={[1.47, 0.83, 0.012]} color="#162939" />
    {/* Abstract screen geometry carries no invented telemetry or source data. */}
    {[0, 1, 2, 3].map((row) => <Box key={row} position={[-0.17 + row % 2 * 0.07, 1.7 - row * 0.145, -0.245]} size={[0.82 - row % 3 * 0.14, 0.025, 0.01]} color={accent} />)}
    <Box position={[0.05, 0.89, 0.25]} size={[0.8, 0.025, 0.23]} color="#d0d9e3" />
    {variant === "hardware" && <>
      <Box position={[-0.84, 1.05, 0.1]} size={[0.28, 0.36, 0.32]} color="#334b4d" />
      {[0, 1, 2].map((i) => <Box key={i} position={[-0.84, 0.95 + i * 0.09, 0.267]} size={[0.2, 0.015, 0.01]} color="#84c5c4" />)}
    </>}
    {variant === "ai" && <mesh position={[-0.86, 1.14, 0.1]}>
      <icosahedronGeometry args={[0.23, 1]} /><meshStandardMaterial color={accent} wireframe />
    </mesh>}
    {variant === "github" && [-0.85, -0.7, -0.55].map((side, i) => <Box key={side} position={[side, 0.96 + i * 0.035, 0.1]} size={[0.09, 0.22 + i * 0.07, 0.32]} color={i === 1 ? "#b3c7bc" : "#cbd8de"} />)}
    <group position={[0, 0, 1.07]}>
      <Box position={[0, 0.49, 0]} size={[0.65, 0.1, 0.59]} color="#bac6d0" />
      <Box position={[0, 0.26, 0]} size={[0.08, 0.5, 0.08]} color="#91a0b0" metalness={0.6} />
      <Box position={[0, 0.82, 0.22]} size={[0.64, 0.6, 0.08]} color="#d1dbe5" />
      <Box position={[0, 0.06, 0]} size={[0.66, 0.06, 0.51]} color="#91a0b0" metalness={0.6} />
    </group>
  </group>;
}

function Plant({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.26, 0]} castShadow><cylinderGeometry args={[0.25, 0.19, 0.52, 12]} /><meshStandardMaterial color="#e5e8e2" /></mesh>
    <mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.025, 0.03, 0.8, 6]} /><meshStandardMaterial color="#617b5c" /></mesh>
    {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.sin(i * 2) * 0.22, 0.85 + i * 0.14, Math.cos(i * 2) * 0.18]} scale={[0.28, 0.4, 0.15]} rotation={[0, i, 0.6]} castShadow>
      <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={i % 2 ? "#6c947d" : "#91ad91"} roughness={0.9} />
    </mesh>)}
  </group>;
}

export const World = memo(function World() {
  return <Instances limit={180} frames={1} castShadow receiveShadow>
    <boxGeometry />
    <meshStandardMaterial roughness={0.6} metalness={0.12} />
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
      <planeGeometry args={[200, 200]} /><meshStandardMaterial color="#e8edf2" roughness={0.85} />
    </mesh>
    <Box position={[0, -0.04, 0]} size={[12, 0.08, 9]} color="#f2f4f5" />
    <gridHelper args={[12, 24, "#d9e0e7", "#e1e6eb"]} position={[0, 0.007, 0]} />
    {/* Open atrium: rear walls, daylight slats, and a low gallery ledge. */}
    <Box position={[0, 1.8, -4.5]} size={[12, 3.6, 0.12]} color="#f3f5f6" />
    <Box position={[-6, 1.8, -0.6]} size={[0.12, 3.6, 7.8]} color="#e9eff1" />
    <Box position={[0, 0.35, -4.15]} size={[11.4, 0.7, 0.58]} color="#dce4e9" />
    {[-5, -3, -1, 1, 3, 5].map((x) => <group key={x}>
      <Box position={[x, 2.4, -4.39]} size={[1.72, 1.8, 0.04]} color="#c9dde5" />
      <Box position={[x, 2.4, -4.35]} size={[0.045, 1.8, 0.07]} color="#f9fbfd" />
    </group>)}
    {[-3.4, -1.8, -0.2, 1.4, 3].map((z) => <Box key={z} position={[-5.91, 2.5, z]} size={[0.04, 1.5, 0.85]} color="#d2e2e7" />)}
    <Workbench x={-3.5} z={-2.5} accent="#51a4b2" variant="hardware" />
    <Workbench x={3.5} z={-2.5} accent="#79a4df" variant="software" />
    <Workbench x={-3.5} z={1.8} accent="#9997da" variant="ai" />
    <Workbench x={3.5} z={1.8} accent="#8cbba6" variant="github" />
    <mesh position={[0, 0.06, 0]} receiveShadow><cylinderGeometry args={[1.28, 1.34, 0.12, 64]} /><meshStandardMaterial color="#f9fbfd" roughness={0.35} metalness={0.15} /></mesh>
    <mesh position={[0, 0.126, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.12, 1.14, 64]} /><meshBasicMaterial color="#8bc7d2" /></mesh>
    <Plant x={-5.1} z={-3.6} /><Plant x={5.1} z={-3.6} />
    <Plant x={-5.1} z={3.3} /><Plant x={5.1} z={3.3} />
  </Instances>;
});
