import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Point } from "../types.ts";
/** Original bounded texture. No image downloads, runtime noise shader or random frame work. */
export function surfaceTexture(kind:"stone"|"walnut"){
 const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;const c=canvas.getContext("2d")!;
 let seed=413;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle=kind==="stone"?"#b9b7ac":"#92795f";c.fillRect(0,0,512,512);
 if(kind==="walnut"){
  // Quiet quarter-sawn boards: low-contrast fibres at a credible physical scale.
  for(let board=0;board<4;board++){
   const y=board*128;c.fillStyle=["#92795f","#8f765d","#957b61","#91785e"][board]!;c.fillRect(0,y,512,128);
   for(let line=0;line<64;line++){
    const v=y+random()*128;c.beginPath();c.lineWidth=.35+random()*.5;
    c.strokeStyle=random()>.5?"#efe3cc14":"#362b2512";c.moveTo(0,v);c.bezierCurveTo(160,v-2,330,v+2,512,v);c.stroke();
   }
   c.fillStyle="#42382c24";c.fillRect(0,y,512,1);
   c.fillRect(board%2?330:100,y,1,128);
  }
 }else{
  for(let i=0;i<12000;i++){c.fillStyle=random()>.5?"#ffffff0a":"#40474007";c.fillRect(random()*512,random()*512,1+random()*2,1+random()*2);}
  c.strokeStyle="#626b6024";c.lineWidth=1;c.strokeRect(.5,.5,511,511);
 }
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(kind==="stone"?4:1,kind==="stone"?3:1);texture.anisotropy=4;return texture;
}
export function FloorSurface({size,position=[0,.003,0]}:{size:[number,number];position?:Point}){
 const texture=useMemo(()=>surfaceTexture("stone"),[]);useEffect(()=>()=>texture.dispose(),[texture]);
 return <mesh position={position} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={size}/><meshStandardMaterial map={texture} roughness={.8}/></mesh>;
}
