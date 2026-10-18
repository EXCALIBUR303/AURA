import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedMesh, MathUtils, Mesh, Object3D } from "three";
import { readAsset } from "./resources.ts";
import { STATIONS } from "../interactions/registry.ts";
import { displayLift } from "../settings.ts";
import type { WorldSettings, MotionSamples } from "../settings.ts";
import { MonitorAtlas } from "./MonitorAtlas.tsx";
import type { ScreenState } from "./MonitorAtlas.tsx";
export function MonitorPanels({settings,reduced,active,state,motion}:{settings:WorldSettings;reduced:boolean;active:boolean;state:ScreenState;motion:MotionSamples}){
 const source=readAsset("workstation").scene;
 const parts=useMemo(()=>{const meshes:Mesh[]=[];source.getObjectByName("monitor-panel")!.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});return meshes;},[source]);
 const instances=useRef<(InstancedMesh|null)[]>([]),lifts=useRef(STATIONS.map(()=>0));const temp=useMemo(()=>new Object3D(),[]);const initialized=useRef(false);
 useEffect(()=>{const meshes=instances.current.filter((mesh):mesh is InstancedMesh=>mesh!==null);return()=>meshes.forEach(mesh=>mesh.dispose());},[parts]);
 useEffect(()=>{initialized.current=false;},[settings.presentation,settings.floatIntensity,reduced]);
 useEffect(()=>()=>{for(const station of STATIONS)delete motion.displayLifts[station.id];},[motion]);
 useFrame(({clock},delta)=>{
  if(initialized.current&&!active)return;initialized.current=true;
  STATIONS.forEach((s,i)=>{const wanted=displayLift(settings,s.id,clock.elapsedTime,reduced);lifts.current[i]=reduced?wanted:MathUtils.damp(lifts.current[i]!,wanted,7,Math.min(delta,.05));motion.displayLifts[s.id]=lifts.current[i]!;
   const sign=s.z>0?-1:1;temp.position.set(s.x+.18*sign,.784+lifts.current[i]!,s.z-.28*sign);temp.rotation.set(0,s.z>0?Math.PI:0,0);temp.updateMatrix();for(const mesh of instances.current)mesh?.setMatrixAt(i,temp.matrix);
  });for(const mesh of instances.current)if(mesh)mesh.instanceMatrix.needsUpdate=true;
 },-1);
 return <group>{parts.map((part,i)=><instancedMesh key={part.uuid} ref={node=>{instances.current[i]=node;}} args={[part.geometry,part.material,4]} castShadow={part.name.includes("Graphite")} receiveShadow dispose={null}/>)}<MonitorAtlas state={state} lifts={lifts} active={active}/></group>;
}
