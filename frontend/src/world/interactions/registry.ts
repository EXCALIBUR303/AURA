import type { ZoneId } from "@aura/contracts";
import type { CameraPose, Point } from "../types.ts";
export type StationId = "hardware"|"software"|"ai-lab"|"github";
export const STATIONS:{id:StationId;label:string;x:number;z:number;accent:string}[]=[
  {id:"hardware",label:"Hardware",x:-3.25,z:-2.5,accent:"#4c8186"},
  {id:"software",label:"Software",x:3.25,z:-2.5,accent:"#6683ad"},
  {id:"ai-lab",label:"AI / LLM",x:-3.25,z:2.5,accent:"#827a9b"},
  {id:"github",label:"GitHub",x:3.25,z:2.5,accent:"#748b7b"},
];
export type InteractionDefinition = {id:string;label:string;category:"functional"|"inspectable";zone:ZoneId;description:string;focus:CameraPose;proxy:{position:Point;size:Point}};
export const EQUIPMENT:readonly InteractionDefinition[]=STATIONS.flatMap(s=>{
  const side=s.z>0?-1:1;
  return [{id:s.id+".pc",label:s.label+" workstation PC",category:"inspectable" as const,zone:s.id,
    description:"Original AURA scene model. Explore the chassis, board, graphics card and cooling assembly. This is an illustration, not a hardware scan of your Mac.",
    focus:{position:[s.x+.65*side,1.42,s.z-11+1.25*side],target:[s.x-.90*side,1.05,s.z-11+.05*side],room:"project-hub" as const},
    proxy:{position:[-.90,1.04,.05] as Point,size:[.28,.54,.51] as Point}},
    {id:s.id+".screen",label:s.label+" project display",category:"functional" as const,zone:s.id,
    description:"Opens the existing AURA workspace. Project and activity labels come from current application state; no source files or fabricated telemetry are drawn on this display.",
    focus:{position:[s.x-.1*side,1.7,s.z-11+1.7*side],target:[s.x+.18*side,1.16,s.z-11-.28*side],room:"project-hub" as const},
    proxy:{position:[.18,1.14,-.28] as Point,size:[.93,.56,.09] as Point}}];
});
export const COMPONENTS = [
  {id:"chassis",name:"Chassis & airflow",detail:"Open-frame steel structure, transparent side panel, front ventilation, three rotor assemblies, rear cable path and isolated feet."},
  {id:"board",name:"Board & memory",detail:"Authored circuit board, processor contact, aluminium cooling fins and two memory modules. No device identification or sensor polling occurs."},
  {id:"graphics",name:"Graphics card",detail:"A modeled expansion board, copper edge and cooling assembly. It does not represent an installed GPU or its measured performance."},
] as const;
export const interactionById=(id:string)=>EQUIPMENT.find(item=>item.id===id);
