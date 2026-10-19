import { useEffect, useMemo, useRef, useState } from "react";
import { MeshStandardMaterial, InstancedMesh, Mesh, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { surfaceTexture } from "../rooms/Surfaces.tsx";
import { readAsset } from "./resources.ts";
import { EQUIPMENT, STATIONS } from "../interactions/registry.ts";
import type { WorldSettings, MotionSamples } from "../settings.ts";
import type { Point } from "../types.ts";
import type { ZoneId } from "@aura/contracts";
import { MonitorPanels } from "./MonitorPanels.tsx";
import type { ScreenState } from "./MonitorAtlas.tsx";

import { collect } from "./ModelBatch.tsx";
import type { Part } from "./ModelBatch.tsx";
const stationParts=(s:typeof STATIONS[number]):Part[]=>{
 const yaw=s.z>0?Math.PI:0,sign=s.z>0?-1:1;
 const part=(name:string,p:Point,scale?:Point,rotation=0):Part=>({name,position:[s.x+p[0]*sign,p[1],s.z+p[2]*sign],rotation:yaw+rotation,scale});
 return [part("desk",[0,0,0]),part("chair",[0,0,1.08]),part("pc",[-.90,.784,.05]),
  part("monitor-stand",[.18,.784,-.28]),part("keyboard",[.18,.784,.26]),part("mouse",[.59,.784,.26]),
  part("speaker",[-.39,.784,-.30]),part("speaker",[.76,.784,-.30]),
  ...(s.id==="software"?[part("laptop",[.94,.784,.1],[.8,.8,.8],-.25)]:[]),
 ];
};
export function Equipment({navigate,inspect,selected,reduced,active,screens,settings,motion}:{navigate:(zone:ZoneId)=>void;inspect:(id:string)=>void;selected:string|null;reduced:boolean;active:boolean;screens:ScreenState;settings:WorldSettings;motion:MotionSamples}){
 const source=readAsset("workstation").scene;
 const wood=useMemo(()=>surfaceTexture("walnut"),[]);
 const batches=useMemo(()=>collect(source,STATIONS.flatMap(stationParts)).map(b=>{
  if(b.material.name!=="Walnut")return b;const material=b.material.clone() as MeshStandardMaterial;material.map=wood;material.color.set("#ffffff");return {...b,material};
 }),[source,wood]);
 useEffect(()=>()=>{batches.forEach(b=>{b.geometry.dispose();if(b.material.name==="Walnut")b.material.dispose();});wood.dispose();},[batches,wood]);
 const [hover,setHover]=useState<string|null>(null);
 const rotor=useMemo(()=>{const mesh=source.getObjectByName("fan__Graphite");if(!(mesh instanceof Mesh))throw Error("Missing fan rotor");return mesh;},[source]);
 const fans=useRef<InstancedMesh>(null),phase=useRef(0),initialized=useRef(false);const temp=useMemo(()=>new Object3D(),[]);
 useFrame((_,delta)=>{if(!fans.current||initialized.current&&(!active||reduced))return;initialized.current=true;if(active&&!reduced)phase.current=(phase.current+Math.min(delta,.05)*3.5)%(Math.PI*2);motion.fanAngle=phase.current;
  STATIONS.forEach((s,i)=>{const sign=s.z>0?-1:1;for(let j=0;j<3;j++){temp.position.set(s.x-.9*sign,.784+.095+j*.15,s.z+.318*sign);temp.rotation.set(0,s.z>0?Math.PI:0,phase.current);temp.updateMatrix();fans.current!.setMatrixAt(i*3+j,temp.matrix);}});fans.current.instanceMatrix.needsUpdate=true;
 });
 useEffect(()=>{const mesh=fans.current;return()=>mesh?.dispose();},[rotor]);
 const pointer=(id:string,over:boolean,e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();setHover(over?id:null);(e.nativeEvent.target as HTMLCanvasElement).style.cursor=over?"pointer":"";};
 return <group>
  {batches.map((b,i)=><mesh key={i} geometry={b.geometry} material={b.material} castShadow={!b.material.transparent} receiveShadow dispose={null}/>)}
  <instancedMesh ref={fans} args={[rotor.geometry,rotor.material,12]} dispose={null}/>
  <MonitorPanels settings={settings} reduced={reduced} active={active} state={screens} motion={motion}/>
  {STATIONS.map(s=><group key={s.id} position={[s.x,0,s.z]} rotation={[0,s.z>0?Math.PI:0,0]}>
   {/* Stable proxies never bob with decorative geometry; no triangle-level equipment hit testing. */}
   {EQUIPMENT.filter(e=>e.zone===s.id).map(item=><mesh key={item.id} position={item.proxy.position} onClick={e=>{e.stopPropagation();if(item.category==="functional")navigate(item.zone);else inspect(item.id);}} onPointerOver={e=>pointer(item.id,true,e)} onPointerOut={e=>pointer(item.id,false,e)}>
     <boxGeometry args={item.proxy.size}/><meshBasicMaterial color={s.accent} transparent opacity={hover===item.id||selected===item.id ? .1:0} depthWrite={false}/>
   </mesh>)}
   <mesh position={[0,.75,.23]} visible={false} onClick={e=>{e.stopPropagation();navigate(s.id);}}><boxGeometry args={[2.5,.12,.5]}/><meshBasicMaterial/></mesh>
  </group>)}
 </group>;
}
