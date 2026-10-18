import type { RoomShellProps } from "../types.ts";
import type { Part } from "../assets/ModelBatch.tsx";
import { ModelBatch } from "../assets/ModelBatch.tsx";
import { Seating } from "../assets/Seating.tsx";
import { HitTarget } from "../assets/HitTarget.tsx";
import { HomeShell } from "./HomeShell.tsx";
import { RoomGraphic } from "./RoomDetails.tsx";
const ROOM_PARTS:Part[]=[
 {name:"arcade",position:[-2.9,0,-2.6]}, {name:"console",position:[0,0,-3.45]},
 {name:"display",position:[0,.62,-3.45]}, {name:"game-console",position:[-.65,.62,-3.4]},
 {name:"controller",position:[.65,.62,-3.4]}, {name:"controller",position:[.25,.62,-3.4]},
 {name:"bookshelf",position:[-4.1,0,2.1],rotation:Math.PI/2}, {name:"floor-lamp",position:[2.6,0,2.3]},
 {name:"plant",position:[3.7,0,3.2]}, {name:"coffee-table",position:[0,0,.15]}, {name:"pendant",position:[0,2.4,0]},
];
const PC_PARTS:Part[]=[{name:"desk",position:[2.6,0,-2.55]},{name:"chair",position:[2.6,0,-1.35]},
 {name:"pc",position:[1.7,.784,-2.5]},{name:"monitor",position:[2.78,.784,-2.83]},
 {name:"keyboard",position:[2.78,.784,-2.29]},{name:"mouse",position:[3.19,.784,-2.29]},
 {name:"speaker",position:[2.21,.784,-2.85]},{name:"speaker",position:[3.36,.784,-2.85]}];
export default function Gaming({connected,travel,options,active,act}:RoomShellProps){
 return <HomeShell kind="gaming" connected={connected} travel={travel}>
  <mesh position={[0,.008,.5]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[3.5,3.4]}/><meshStandardMaterial color="#3f4962" roughness={1}/></mesh>
  <ModelBatch asset="room-kit" parts={ROOM_PARTS} lights={options.gamingLights}/><ModelBatch asset="workstation" parts={PC_PARTS}/>
  <Seating kind="sofa" position={[0,0,1.7]} rotation={Math.PI}/>
  <RoomGraphic title="Game library" detail="No games installed · browse upcoming" position={[0,1.30,-3.405]} size={[2.30,1.26]}/>
  <RoomGraphic title="Game library" detail="No games installed" position={[-2.9,1.42,-2.41]} size={[.64,.47]}/>
  <RoomGraphic title="AURA Games" detail="Game library in the room display" position={[2.78,1.144,-2.804]} size={[.848,.479]}/>
  {active&&options.gamingLights&&<pointLight position={[2.6,1.45,2.3]} color="#a4b5e2" intensity={4} distance={5} decay={2}/>}
  <HitTarget position={[-2.9,1.1,-2.6]} size={[.86,1.9,1.05]} label="Arcade game library" act={()=>act("gaming.games")}/>
  <HitTarget position={[0,1.30,-3.38]} size={[2.4,1.36,.1]} label="Game library display" act={()=>act("gaming.games")}/>
  <HitTarget position={[2.78,1.144,-2.79]} size={[.93,.56,.1]} label="Gaming workstation display" act={()=>act("gaming.games")}/>
  <HitTarget position={[2.6,1.3,2.3]} size={[.6,.8,.6]} label="Gaming floor lamp" act={()=>act("gaming.lamp")}/>
 </HomeShell>;
}
