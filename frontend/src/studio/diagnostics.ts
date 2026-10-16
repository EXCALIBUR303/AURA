import type { ZoneId } from "@aura/contracts";
import type { AvatarDiagnostics } from "../validation/AvatarProbe.tsx";

export interface FrameSample {
  fps: number;
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
  sampledAt: number;
}

export interface StudioDiagnostics extends AvatarDiagnostics {
  zone: ZoneId;
  cameraSettled: boolean;
  context: "ready" | "lost" | "restoring";
  drawCalls?: number;
  sceneTriangles?: number;
  animationTime?: number;
  camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  rig?: { head: boolean; eyes: boolean; jaw: boolean; jawAngle: number; headYaw: number; headPitch: number };
  perZone: Partial<Record<ZoneId, FrameSample[]>>;
}

export type Report = (patch: Partial<StudioDiagnostics>) => void;

declare global {
  interface Window { __AURA_DIAGNOSTICS__?: StudioDiagnostics }
}
