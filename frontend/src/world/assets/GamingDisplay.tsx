import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, InstancedMesh, MathUtils, Mesh, Object3D } from "three";
import { displayLift } from "../settings.ts";
import type { MotionSamples, WorldSettings } from "../settings.ts";
import { readAsset } from "./resources.ts";
import { RoomGraphic } from "../rooms/RoomDetails.tsx";
export function GamingDisplay({settings,reduced,active,motion}:{settings:WorldSettings;reduced:boolean;active:boolean;motion:MotionSamples}){
 const source=readAsset("workstation").scene;
 const panel=useMemo(()=>source.getObjectByName("monitor-panel")!.clone(true),[source]);
 const group=useRef<Group>(null),lift=useRef(0),phase=useRef(0),initialized=useRef(false);
 const rotor=useMemo(()=>source.getObjectByName("fan__Graphite") as Mesh,[source]);
 const fans=useRef<InstancedMesh>(null),temp=useMemo(()=>new Object3D(),[]);
 useEffect(()=>{const mesh=fans.current;return()=>mesh?.dispose();},[rotor]);
 useEffect(()=>{initialized.current=false;},[settings.presentation,settings.floatIntensity,reduced]);
 useEffect(()=>()=>{delete motion.displayLifts.gaming;},[motion]);
 useFrame(({clock},delta)=>{
  if(initialized.current&&!active)return;initialized.current=true;
  const wanted=displayLift(settings,"gaming",clock.elapsedTime,reduced);lift.current=reduced?wanted:MathUtils.damp(lift.current,wanted,7,Math.min(delta,.05));
  if(group.current)group.current.position.y=.784+lift.current;motion.displayLifts.gaming=lift.current;
  if(active&&!reduced)phase.current=(phase.current+Math.min(delta,.05)*3.5)%(Math.PI*2);motion.fanAngle=phase.current;
  for(let i=0;i<3;i++){temp.position.set(1.7,.784+.095+i*.15,-2.232);temp.rotation.set(0,0,phase.current);temp.updateMatrix();fans.current?.setMatrixAt(i,temp.matrix);}if(fans.current)fans.current.instanceMatrix.needsUpdate=true;
 });
 return <group><group ref={group} position={[2.78,.784,-2.83]}><primitive object={panel} dispose={null}/><RoomGraphic title="AURA Games" detail="No games installed" position={[0,.36,.026]} size={[.848,.479]}/></group><instancedMesh ref={fans} args={[rotor.geometry,rotor.material,3]} dispose={null}/></group>;
}
