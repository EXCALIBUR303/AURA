import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { LightingPreset } from "../settings.ts";
import type { ReactNode } from "react";
import { ArchitectureBatch, Block, Portal, Sign } from "./Architecture.tsx";
import { surfaceTexture } from "./Surfaces.tsx";
import type { RoomId } from "../types.ts";
function WindowView({lighting}:{lighting:LightingPreset}){
 const texture=useMemo(()=>{const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=512;const c=canvas.getContext("2d")!;
  const sky=c.createLinearGradient(0,0,0,512);sky.addColorStop(0,lighting==="night"?"#10263c":lighting==="sunset"?"#8b9da9":"#86a4b0");sky.addColorStop(.65,lighting==="night"?"#364e62":lighting==="sunset"?"#e9b786":"#cfccac");sky.addColorStop(1,lighting==="night"?"#455e69":"#c7b088");c.fillStyle=sky;c.fillRect(0,0,1024,512);
  for(let i=0;i<3;i++){c.fillStyle=(lighting==="night"?["#344e53","#2b454b","#213c42"]:["#829e91","#6e8878","#4c6a5d"])[i]!;c.beginPath();c.moveTo(0,330+i*45);for(let x=0;x<=1024;x+=20)c.lineTo(x,330+i*45+Math.sin(x*.006+i)*40+Math.sin(x*.017)*12);c.lineTo(1024,512);c.lineTo(0,512);c.fill();}
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
 },[lighting]);useEffect(()=>()=>texture.dispose(),[texture]);
 return <mesh position={[0,1.92,-4.16]}><planeGeometry args={[4.2,1.86]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
export function HomeShell({kind,connected,travel,children,lighting}:{lighting:LightingPreset;kind:"living"|"gaming";connected:readonly RoomId[];travel:(room:RoomId)=>void;children:ReactNode}){
 const living=kind==="living",entry=living?1:-1,wall=living?"#c4b69c":"#333b53";
 const wood=useMemo(()=>{const t=surfaceTexture("walnut");t.repeat.set(2,6);return t;},[]);useEffect(()=>()=>wood.dispose(),[wood]);
 return <ArchitectureBatch><group position={[living?-11:11,0,0]}>
  <Block at={[0,-.08,0]} size={[9,.16,8]} color="#6a5f50"/>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[9,8]}/><meshStandardMaterial map={wood} color={living?"#c6b59d":"#726b67"} roughness={.7}/></mesh>
  <Block at={[-entry*4.59,1.6,0]} size={[.18,3.2,8]} color={wall}/>
  {[-2.6,2.6].map(z=><Block key={z} at={[entry*4.59,1.6,z]} size={[.18,3.2,2.8]} color={wall}/>)}
  <Block at={[entry*4.59,3.04,0]} size={[.18,.32,2.4]} color={wall}/>
  <Block at={[0,1.6,4.09]} size={[9.36,3.2,.18]} color={wall}/>
  {[-3.35,3.35].map(x=><Block key={x} at={[x,1.6,-4.09]} size={[2.3,3.2,.18]} color={wall}/>)}
  <Block at={[0,.5,-4.09]} size={[4.2,1,.18]} color={wall}/><Block at={[0,3.02,-4.09]} size={[4.2,.36,.18]} color={wall}/>
  <Block at={[0,3.29,0]} size={[9.36,.18,8.36]} color={living?"#c6bca7":"#737786"}/>
  <WindowView lighting={lighting}/>
  {[-2.14,0,2.14].map(x=><Block key={x} at={[x,1.92,-4.03]} size={[.05,1.9,.07]} color="#6d6b5d"/>)}
  {[.98,2.86].map(y=><Block key={y} at={[0,y,-4]} size={[4.35,.06,.20]} color="#6d6b5d"/>)}
  {[-4.49,4.49].map(x=><Block key={x} at={[x,.045,0]} size={[.035,.09,8]} color="#6e6456"/>)}
  <Portal showSign={false} side={living?"east":"west"} at={[entry*4.5,0,0]} open={connected.includes("atrium")} label="CENTRAL ATRIUM" detail="Project Hub · Living · Gaming" onSelect={()=>travel("atrium")}/>
  <Sign label="CENTRAL ATRIUM" detail="Project Hub · World map" position={[entry*4.48,2.35,2.6]} rotation={living?-Math.PI/2:Math.PI/2}/>
  {children}
 </group></ArchitectureBatch>;
}
