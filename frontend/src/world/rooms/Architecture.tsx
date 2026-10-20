import { useEffect, useMemo, useRef } from "react";
import { Instance, Instances } from "@react-three/drei";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, BoxGeometry, CanvasTexture, Color, MeshBasicMaterial, Matrix4, Object3D, Sphere, SRGBColorSpace, Vector3 } from "three";
import type { InstancedMesh } from "three";
import { ROOM_GLOW } from "../environment.ts";
import { travelSignal } from "../travelSignal.ts";
import type { Point, RoomId } from "../types.ts";

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
const easeIn=(d:number,far:number,near:number)=>{const t=Math.min(1,Math.max(0,(far-d)/(far-near)));return t*t*(3-2*t);};
type Side="north"|"south"|"east"|"west";
const yawOf=(side:Side)=>side==="north"?0:side==="south"?Math.PI:side==="west"?Math.PI/2:-Math.PI/2;
export type GlowDoor={at:Point;side:Side;to:RoomId};
export type GlowBar={at:Point;size:Point;color:string};
/** Pointer-over state for doorway glows, keyed by destination room (written by Portal). */
export const doorHover=new Set<RoomId>();
/**
 * Every unlit practical light in a room as one instanced draw: threshold strips around each
 * doorway (jambs and lintel, in the colour of the room behind it) and static light bars.
 * A doorway brightens as the camera approaches, under the pointer, while a journey to its room
 * runs, and briefly when its room is arrived in; `pulseRoom` bars lift on arrival. Per frame,
 * no React renders; one material and one unit box shared by all instances.
 */
export function RoomGlow({doors,bars=[],reduced,pulseRoom}:{doors:readonly GlowDoor[];bars?:readonly GlowBar[];reduced:boolean;pulseRoom?:RoomId}){
  const mesh=useRef<InstancedMesh>(null);
  const setup=useMemo(()=>{
    const geometry=new BoxGeometry(1,1,1),material=new MeshBasicMaterial({toneMapped:false});
    const pieces:{matrix:Matrix4;door?:number;base:Color}[]=[];const o=new Object3D();
    doors.forEach((d,i)=>{const yaw=yawOf(d.side),c=Math.cos(yaw),sn=Math.sin(yaw);
      const local=(x:number,y:number,z:number):[number,number,number]=>[d.at[0]+x*c+z*sn,d.at[1]+y,d.at[2]-x*sn+z*c];
      for(const [pos,scale] of [[local(-1.185,1.4,.12),[.035,2.7,.05]],[local(1.185,1.4,.12),[.035,2.7,.05]],[local(0,2.785,.12),[2.4,.035,.05]]] as const){
        o.position.set(pos[0],pos[1],pos[2]);o.rotation.set(0,yaw,0);o.scale.set(scale[0],scale[1],scale[2]);o.updateMatrix();pieces.push({matrix:o.matrix.clone(),door:i,base:new Color(ROOM_GLOW[d.to])});}
    });
    for(const b of bars){o.position.set(b.at[0],b.at[1],b.at[2]);o.rotation.set(0,0,0);o.scale.set(b.size[0],b.size[1],b.size[2]);o.updateMatrix();pieces.push({matrix:o.matrix.clone(),base:new Color(b.color)});}
    return{geometry,material,pieces,centres:doors.map(d=>{const yaw=yawOf(d.side);return new Vector3(d.at[0]+.12*Math.sin(yaw),1.4,d.at[2]+.12*Math.cos(yaw));}),levels:doors.map(()=>0),colour:new Color(),world:new Vector3()};
  },[doors,bars]);
  useEffect(()=>{const m=mesh.current;if(!m)return;setup.pieces.forEach((p,i)=>{m.setMatrixAt(i,p.matrix);m.setColorAt(i,p.base);});m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
    // Tight bounds from the pieces' actual corners: the default per-instance spheres of long thin bars are far larger, and would keep an unseen doorway drawn.
    const box=new Box3();for(const p of setup.pieces)box.union(new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5)).applyMatrix4(p.matrix));m.boundingSphere=box.getBoundingSphere(new Sphere());},[setup]);
  useEffect(()=>()=>{setup.geometry.dispose();setup.material.dispose();},[setup]);
  useFrame(({camera},delta)=>{
    const m=mesh.current;if(!m)return;
    const parent=m.parent;const now=performance.now();
    const since=(now-travelSignal.arrivedAt)/1000;
    doors.forEach((d,i)=>{
      setup.world.copy(setup.centres[i]!);if(parent)parent.localToWorld(setup.world);
      const near=easeIn(camera.position.distanceTo(setup.world),5,1.4);
      const journey=travelSignal.destination===d.to||travelSignal.via===d.to?Math.sin(Math.PI*travelSignal.progress):0;
      const arrival=!reduced&&travelSignal.arrivedRoom===d.to&&since<1.6?(1-since/1.6)**2:0;
      const goal=.16+.5*near+.35*Number(doorHover.has(d.to))+.55*journey+.4*arrival;
      setup.levels[i]!+= (goal-setup.levels[i]!)*(reduced?1:1-Math.exp(-8*Math.min(delta,.1)));
    });
    const pulse=!reduced&&pulseRoom&&travelSignal.arrivedRoom===pulseRoom&&since<1.8?Math.sin(Math.PI*since/1.8):0;
    setup.pieces.forEach((p,i)=>{const level=p.door===undefined?.85+.45*pulse:setup.levels[p.door]!;m.setColorAt(i,setup.colour.copy(p.base).multiplyScalar(level));});
    if(m.instanceColor)m.instanceColor.needsUpdate=true;
  });
  return <instancedMesh ref={mesh} args={[setup.geometry,setup.material,setup.pieces.length]}/>;
}
export function Portal({side,at,open,label,detail,onSelect,showSign=true,to}:{showSign?:boolean;side:Side;at:Point;open:boolean;label:string;detail:string;onSelect:()=>void;to:RoomId}){
  const yaw=yawOf(side);
  return <group position={at} rotation={[0,yaw,0]}>
    {[-1.31,1.31].map(x=><Block key={x} at={[x,1.45,0]} size={[.22,2.9,.32]} color="#6b746c"/>)}
    <Block at={[0,2.91,0]} size={[2.84,.22,.32]} color="#6b746c"/>
    <mesh position={[0,1.4,.025]} visible={!open} castShadow><boxGeometry args={[2.4,2.8,.1]}/><meshStandardMaterial color="#394851" roughness={.6}/></mesh>
    {showSign&&<Sign label={label} detail={detail} position={[0,3.23,.19]}/>}
    <mesh position={[0,1.4,.15]} visible={false} onClick={e=>{e.stopPropagation();onSelect();}} onPointerOver={e=>{doorHover.add(to);(e.nativeEvent.target as HTMLCanvasElement).style.cursor="pointer";}} onPointerOut={e=>{doorHover.delete(to);(e.nativeEvent.target as HTMLCanvasElement).style.cursor="";}}><boxGeometry args={[2.4,2.8,.1]}/><meshBasicMaterial/></mesh>
  </group>;
}
