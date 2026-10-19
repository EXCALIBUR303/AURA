import type { RoomOptions, WorldSettings, MotionSamples } from "./settings.ts";
import type { ComponentType, ReactNode } from "react";
import type { ZoneId } from "@aura/contracts";

export type RoomId = "atrium" | "project-hub" | "living" | "gaming";
export type Point = [number, number, number];
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Collider = Rect & { id: string; minY: number; maxY: number };
export type CameraPose = { position: Point; target: Point; room?: RoomId };
export type CameraMode = "inspect" | "explore" | "cinematic";
export type RoomShellProps = { motion:MotionSamples;settings:WorldSettings; options:RoomOptions; reduced:boolean; active:boolean; act:(id:string)=>void; children?: ReactNode; connected: readonly RoomId[]; travel: (room: RoomId) => void; openMap: () => void };
export type RoomModule = { default: ComponentType<RoomShellProps> };
export type RoomDefinition = {
  id: RoomId; title: string; description: string; accent: string;
  availability: "available" | "planned"; reason?: string; origin: Point;
  floor: Rect; ceiling: number; landing: Point; introduction: CameraPose;
  colliders: readonly Collider[]; load?: () => Promise<RoomModule>;
};
export type Connection = { id: string; from: RoomId; to: RoomId; floor: Rect; fromPoint: Point; toPoint: Point };
export type CameraRequest = { id: number; room: RoomId; pose: CameraPose; kind: "travel" | "workspace" | "restore"; instant?: boolean; arrivalMode?: "inspect"|"explore" };
export type WorldSnapshot = {
  room: RoomId; mode: CameraMode; phase: "preparing" | "travelling" | "idle" | "error";
  settings:WorldSettings; options:RoomOptions; loadTiming?:{room:RoomId;startedAt:number;readyMs?:number;settledMs?:number}; pending?: RoomId; error?: string; request?: CameraRequest;
  modules: Readonly<Partial<Record<RoomId, RoomModule>>>;
  loaded: readonly RoomId[]; selectedZone: ZoneId;
  /** Request id whose cinematic travel should finish now (skip). */ skip?: number;
  /** Session-only Explore look/turn multiplier. */ lookSensitivity: number;
  /** Close-inspection zone: relaxes the desk/PC colliders so the camera may approach parts on the desk. Session-only. */ inspectionZone?: "hardware";
};
