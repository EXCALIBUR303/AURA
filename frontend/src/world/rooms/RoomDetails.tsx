import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Group, SRGBColorSpace } from "three";
import { useFrame } from "@react-three/fiber";
import { readAsset } from "../assets/resources.ts";
import type { Point } from "../types.ts";
export function Curtain({open,reduced,active}:{open:boolean;reduced:boolean;active:boolean}){
 const source=readAsset("room-kit").scene;const panels=useMemo(()=>[source.getObjectByName("curtain")!.clone(true),source.getObjectByName("curtain")!.clone(true)],[source]);
 const group=useRef<Group>(null),openness=useRef(open?1:0);
 useFrame((_,delta)=>{if(!group.current)return;if(active||reduced)openness.current=reduced?Number(open):openness.current+(Number(open)-openness.current)*(1-Math.exp(-6*Math.min(delta,.05)));
  group.current.children.forEach((o,i)=>{o.position.x=(i===0?-1:1)*(1.03+openness.current*.90);o.scale.x=1.14-openness.current*.90;});
 });
 return <group ref={group} position={[0,.38,-3.90]}>{panels.map((panel,i)=><primitive key={i} object={panel} dispose={null}/>)}</group>;
}
export function RoomGraphic({title,detail,position,size,rotation=0,art=false}:{title:string;detail:string;position:Point;size:[number,number];rotation?:number;art?:boolean}){
 const texture=useMemo(()=>{const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=576;const c=canvas.getContext("2d")!;c.fillStyle=art?"#d6c7a9":"#172936";c.fillRect(0,0,1024,576);
  if(art){c.fillStyle="#a46344";c.beginPath();c.arc(560,230,150,0,Math.PI*2);c.fill();c.fillStyle="#385647";c.beginPath();c.moveTo(0,420);c.bezierCurveTo(320,140,440,550,1024,330);c.lineTo(1024,576);c.lineTo(0,576);c.fill();c.strokeStyle="#e5c996";c.lineWidth=3;for(let i=0;i<5;i++){c.beginPath();c.moveTo(0,420+i*15);c.bezierCurveTo(320,140+i*25,440,550+i*10,1024,330+i*20);c.stroke();}}
  else{c.fillStyle="#9fbeb8";c.font="24px system-ui";c.fillText("AURA / "+title.toUpperCase(),55,65);c.fillStyle="#e3e5d6";c.font="500 42px system-ui";c.fillText(title,55,230);c.font="25px system-ui";c.fillStyle="#b1c3c6";c.fillText(detail,55,297);c.strokeStyle="#527d7e";c.beginPath();c.moveTo(55,470);c.lineTo(970,470);c.stroke();c.font="23px system-ui";c.fillText("LOCAL SCENE / NO EXTERNAL CONNECTION",55,515);}
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
 },[title,detail,art]);useEffect(()=>()=>texture.dispose(),[texture]);
 return <mesh position={position} rotation={[0,rotation,0]}><planeGeometry args={size}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
