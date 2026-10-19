import { useEffect, useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import type { ReactNode } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Point } from "../types.ts";

export function ArchitectureBatch({children}:{children:ReactNode}){return <Instances limit={100} frames={1} castShadow receiveShadow><boxGeometry/><meshStandardMaterial roughness={.8} metalness={.02}/>{children}</Instances>;}
export function Block({at,size,color,metal=0,rough=.8}:{at:Point;size:Point;color:string;metal?:number;rough?:number}){
  return metal>0?<mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} metalness={metal} roughness={rough}/></mesh>:<Instance position={at} scale={size} color={color}/>;
}
export function Sign({label,detail,position,rotation=0}:{label:string;detail:string;position:Point;rotation?:number}){
  const texture=useMemo(()=>{
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;const c=canvas.getContext("2d")!;
    c.fillStyle="#142536";c.fillRect(0,0,1024,256);c.fillStyle="#d5eaf4";c.font="600 52px system-ui";c.fillText(label,52,104,920);c.font="30px system-ui";c.fillStyle="#9fbfce";c.fillText(detail,52,182,920);
    const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
  },[label,detail]);
  useEffect(()=>{texture.needsUpdate=true;return()=>texture.dispose();},[texture]);
  return <mesh position={position} rotation={[0,rotation,0]}><planeGeometry args={[2.3,.575]}/><meshBasicMaterial map={texture}/></mesh>;
}
export function Portal({side,at,open,label,detail,onSelect,showSign=true}:{showSign?:boolean;side:"north"|"south"|"east"|"west";at:Point;open:boolean;label:string;detail:string;onSelect:()=>void}){
  const yaw=side==="north"?0:side==="south"?Math.PI:side==="west"?Math.PI/2:-Math.PI/2;
  return <group position={at} rotation={[0,yaw,0]}>
    {[-1.31,1.31].map(x=><Block key={x} at={[x,1.45,0]} size={[.22,2.9,.32]} color="#6b746c"/>)}
    <Block at={[0,2.91,0]} size={[2.84,.22,.32]} color="#6b746c"/>
    <mesh position={[0,1.4,.025]} visible={!open} castShadow><boxGeometry args={[2.4,2.8,.1]}/><meshStandardMaterial color="#394851" roughness={.6}/></mesh>
    {showSign&&<Sign label={label} detail={detail} position={[0,3.23,.19]}/>}
    <mesh position={[0,1.4,.15]} visible={false} onClick={e=>{e.stopPropagation();onSelect();}} onPointerOver={e=>{(e.nativeEvent.target as HTMLCanvasElement).style.cursor="pointer";}} onPointerOut={e=>{(e.nativeEvent.target as HTMLCanvasElement).style.cursor="";}}><boxGeometry args={[2.4,2.8,.1]}/><meshBasicMaterial/></mesh>
  </group>;
}
