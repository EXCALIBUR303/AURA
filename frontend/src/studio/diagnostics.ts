import type { WorldSettings, MotionSamples } from "../world/settings.ts";
import type { CameraMode, RoomId, WorldSnapshot } from "../world/types.ts";
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
  graphicsAvailable?: boolean;
  cameraRevision?: number;
  cameraSampledAt?: number;
  context: "ready" | "lost" | "restoring";
  drawCalls?: number;
  sceneTriangles?: number;
  resources?: { geometries: number; textures: number; programs: number };
  assets?: {id:string;owners:RoomId[];ready:boolean;loading:boolean;downloadMs?:number;decodeMs?:number;prefetched?:boolean}[];
  settings?: WorldSettings; motion?:MotionSamples;
  animationTime?: number;
  camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  rig?: { head: boolean; eyes: boolean; jaw: boolean; jawAngle: number; headYaw: number; headPitch: number };
  perZone: Partial<Record<ZoneId, FrameSample[]>>;
  perRoom?: Partial<Record<RoomId, FrameSample[]>>;
  world?: { room: RoomId; mode: CameraMode; phase: string; loadedRooms: readonly RoomId[]; pending?: RoomId; loadTiming?:WorldSnapshot["loadTiming"] };
}

export type Report = (patch: Partial<StudioDiagnostics>) => void;

declare global {
  interface Window { __AURA_DIAGNOSTICS__?: StudioDiagnostics }
}
