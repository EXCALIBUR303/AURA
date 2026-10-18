import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Point } from "../types.ts";
/** Original bounded texture. No image downloads, runtime noise shader or random frame work. */
export function surfaceTexture(kind:"stone"|"walnut"){
 const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;const c=canvas.getContext("2d")!;
 let seed=413;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle=kind==="stone"?"#8c908a":"#927352";c.fillRect(0,0,512,512);
 for(let i=0;i<(kind==="stone"?15000:1500);i++){
  const light=random()>.5;c.fillStyle=light?"#ffffff09":"#201a200c";
  if(kind==="stone")c.fillRect(random()*512,random()*512,1+random()*3,1+random()*3);
  else{c.beginPath();const x=random()*512,y=random()*512;c.lineWidth=.4+random();c.strokeStyle=light?"#e3c59c38":"#3d251f29";c.moveTo(x,y);c.bezierCurveTo(x+100,y+3,x+240,y-3,x+400,y);c.stroke();}
 }
 if(kind==="stone"){c.strokeStyle="#535d5544";c.lineWidth=1;c.strokeRect(.5,.5,511,511);}
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(kind==="stone"?4:1,kind==="stone"?3:1);texture.anisotropy=4;return texture;
}
export function FloorSurface({size,position=[0,.003,0]}:{size:[number,number];position?:Point}){
 const texture=useMemo(()=>surfaceTexture("stone"),[]);useEffect(()=>()=>texture.dispose(),[texture]);
 return <mesh position={position} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={size}/><meshStandardMaterial map={texture} roughness={.8}/></mesh>;
}
