import { useState } from "react";
import type { Point } from "../types.ts";
export function HitTarget({position,size,act,label}:{position:Point;size:Point;act:()=>void;label:string}){
 const [hover,setHover]=useState(false);
 return <mesh name={label} position={position} onClick={e=>{e.stopPropagation();act();}} onPointerOver={e=>{e.stopPropagation();setHover(true);(e.nativeEvent.target as HTMLCanvasElement).style.cursor="pointer";}} onPointerOut={e=>{setHover(false);(e.nativeEvent.target as HTMLCanvasElement).style.cursor="";}}><boxGeometry args={size}/><meshBasicMaterial color="#b4d4cd" transparent opacity={hover ? .10 : 0} depthWrite={false}/></mesh>;
}
