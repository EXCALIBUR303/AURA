import type { RoomShellProps } from "../types.ts";
import type { Part } from "../assets/ModelBatch.tsx";
import { ModelBatch } from "../assets/ModelBatch.tsx";
import { Seating } from "../assets/Seating.tsx";
import { HitTarget } from "../assets/HitTarget.tsx";
import { HomeShell } from "./HomeShell.tsx";
import { Curtain, RoomGraphic } from "./RoomDetails.tsx";
const PARTS:Part[]=[
 {name:"coffee-table",position:[0,0,.5]}, {name:"console",position:[0,0,3.55],rotation:Math.PI},
 {name:"display",position:[0,.62,3.50],rotation:Math.PI}, {name:"bookshelf",position:[-4.1,0,-.8],rotation:Math.PI/2},
 {name:"floor-lamp",position:[-2.1,0,-1.9]}, {name:"pendant",position:[0,2.4,.1]},
 {name:"plant",position:[3.45,0,-3.15]}, {name:"plant",position:[-3.5,0,3.2]},
 {name:"art-frame",position:[-3.25,1.3,-3.97]},
];
export default function Living({connected,travel,options,reduced,active,act}:RoomShellProps){
 return <HomeShell kind="living" connected={connected} travel={travel}>
  <mesh position={[0,.008,.2]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[3.6,3]}/><meshStandardMaterial color="#b49a73" roughness={1}/></mesh>
  <ModelBatch asset="room-kit" parts={PARTS} lights={options.livingLights}/>
  <Seating kind="sofa" position={[0,0,-1.1]} palette={options.livingPalette}/>
  <Seating kind="chair" position={[-2.4,0,.7]} rotation={Math.PI/5}/>
  <Curtain open={options.curtainsOpen} reduced={reduced} active={active}/>
  <RoomGraphic title="Original AURA study" detail="" art position={[-3.25,1.72,-3.94]} size={[1.09,.78]}/>
  <RoomGraphic title="Media display" detail="No media source connected" position={[0,1.30,3.458]} size={[2.30,1.26]} rotation={Math.PI}/>
  {active&&options.livingLights&&<pointLight position={[-2.1,1.5,-1.9]} color="#ffd09b" intensity={4} distance={5} decay={2}/>}
  <HitTarget position={[-2.1,1.3,-1.9]} size={[.6,.8,.6]} label="Living floor lamp" act={()=>act("living.lamp")}/>
  <HitTarget position={[0,1.6,-3.85]} size={[4.1,2.2,.12]} label="Living curtains" act={()=>act("living.curtains")}/>
  <HitTarget position={[-4.1,1.1,-.8]} size={[.4,2.2,1.6]} label="Living bookshelf" act={()=>act("living.books")}/>
  <HitTarget position={[-3.25,1.72,-3.90]} size={[1.15,.84,.05]} label="Original AURA artwork" act={()=>act("living.art")}/>
  <HitTarget position={[0,1.30,3.45]} size={[2.4,1.36,.1]} label="Media display information" act={()=>act("living.media")}/>
 </HomeShell>;
}
