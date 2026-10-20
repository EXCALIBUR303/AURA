import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { STATIONS } from "../interactions/registry.ts";
export type ScreenState={project:string;branch:string;language:string;description:string;repositoryCount:number;githubState:string;companion:string;provider:string;model:string;updated:string;activity:string;mock:boolean;recent?:readonly string[]};
export const EMPTY_SCREEN_STATE:ScreenState={project:"",branch:"",language:"",description:"",repositoryCount:0,githubState:"not connected",companion:"Ready when you are",provider:"No provider configured",model:"No model selected",updated:"",activity:"idle",mock:true};
const clean=(s:string)=>s.replace(/[\u0000-\u001f\u007f]/g," ").slice(0,100);
export function MonitorAtlas({state,lifts,active}:{state:ScreenState;lifts:RefObject<number[]>;active:boolean}){
 const source=useMemo(()=>{const canvas=document.createElement("canvas");canvas.width=2048;canvas.height=1024;const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const material=new MeshBasicMaterial({map:texture,toneMapped:false});
  const tiles=STATIONS.map((_,i)=>{const g=new PlaneGeometry(.848,.479);const uv=g.getAttribute("uv");for(let j=0;j<uv.count;j++)uv.setXY(j,(uv.getX(j)+i%2)/2,(uv.getY(j)+(i<2?1:0))/2);
   return g;});
  return{canvas,texture,material,tiles};
 },[]);
 const planes=useRef<(Mesh|null)[]>([]);
 const latest=useRef(state);latest.current=state;const elapsed=useRef(0);const dot=useRef(false);
 const paint=()=>{const c=source.canvas.getContext("2d")!;const data=latest.current;
  for(let i=0;i<4;i++){const s=STATIONS[i]!;const x=(i%2)*1024,y=Math.floor(i/2)*512;c.save();c.translate(x,y);c.fillStyle="#14272e";c.fillRect(0,0,1024,512);c.fillStyle=s.accent;c.fillRect(0,0,10,512);c.fillStyle="#b7d2cb";c.font="500 23px system-ui";c.fillText("AURA / "+s.label.toUpperCase(),48,52);c.fillStyle="#f0f1e4";c.font="500 43px system-ui";
   if(s.id==="hardware"){
    c.fillText("Inside the workstation",48,124);c.font="25px system-ui";c.fillStyle="#afc2c3";c.fillText("LOCAL HARDWARE ILLUSTRATION",48,167);
    c.strokeStyle="#78a8a3";c.lineWidth=3;c.strokeRect(58,207,325,186);c.strokeRect(86,233,105,104);c.strokeRect(219,233,24,125);c.strokeRect(257,233,24,125);c.strokeRect(91,352,204,23);
    c.font="28px system-ui";c.fillText("Board · memory · cooling",421,252);c.fillText("Select the PC to inspect",421,306);c.font="23px system-ui";c.fillText("No device sensors connected",421,358);
   }else{
    const title=s.id==="ai-lab"?"Astra / Companion":data.project||"Choose a project";c.fillText(clean(title).slice(0,34),48,124);c.font="26px system-ui";c.fillStyle="#afc2c3";
    const rows=s.id==="ai-lab"?[data.companion,data.provider,data.model]:s.id==="github"?["GitHub: "+data.githubState,data.project?"Branch: "+data.branch:data.repositoryCount+" repositories available",data.updated?"Last push: "+data.updated:"Open Projects to connect or select"]:s.id==="software"?[[data.language,data.branch].filter(Boolean).join(" · ")||"Project metadata",data.description||"Select a repository in Projects",...(data.recent??[]).slice(0,2).map(r=>"Recent / "+r)]:[data.language||"Project metadata",data.branch?"Branch / "+data.branch:"No branch selected",data.description||"Select an authorized repository in Projects"];
    rows.forEach((row,j)=>c.fillText(clean(row).slice(0,59),48,200+j*62));
    if(s.id==="ai-lab"&&["thinking","speaking","listening"].includes(data.activity)){c.fillStyle=dot.current?"#aec8be":"#6c8b88";c.beginPath();c.arc(927,46,8,0,Math.PI*2);c.fill();}
   }
   c.fillStyle="#527c7c";c.fillRect(48,443,927,1);c.fillStyle="#b7d2cb";c.font="24px system-ui";c.fillText("OPEN WORKSPACE  ↗",48,481);c.font="20px system-ui";c.fillText(data.mock?"BROWSER MOCK":"NATIVE APPLICATION STATE",650,481);c.restore();
  }source.texture.needsUpdate=true;
 };
 useEffect(paint,[source,state]);
 useFrame((_,delta)=>{for(let i=0;i<planes.current.length;i++){const mesh=planes.current[i];if(mesh)mesh.position.y=1.144+(lifts.current[i]??0);}if(!active||!["thinking","speaking","listening"].includes(latest.current.activity))return;elapsed.current+=delta;if(elapsed.current>=.5){elapsed.current=0;dot.current=!dot.current;paint();}});
 useEffect(()=>()=>{source.texture.dispose();source.material.dispose();source.tiles.forEach(g=>g.dispose());},[source]);
 return <group>{STATIONS.map((s,i)=><mesh key={s.id} ref={node=>{planes.current[i]=node;}} position={[s.x+.18*(s.z>0?-1:1),1.144,s.z-.254*(s.z>0?-1:1)]} rotation={[0,s.z>0?Math.PI:0,0]} geometry={source.tiles[i]} material={source.material} dispose={null}/>)}</group>;
}
