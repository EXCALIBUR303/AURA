import { DEFAULT_ROOM_OPTIONS } from "./settings.ts";
import type { RoomOptions } from "./settings.ts";
import { prepareAssets } from "./assets/resources.ts";
import type { ZoneId } from "@aura/contracts";
import type { CameraPose, Collider, Connection, Point, Rect, RoomDefinition, RoomId } from "./types.ts";

async function loadRoom(id:RoomId){const module=id==="living"?import("./rooms/Living.tsx"):import("./rooms/Gaming.tsx");const [room]=await Promise.all([module,prepareAssets(id)]);return room;}

async function loadHub(){const [module]=await Promise.all([import("./rooms/ProjectHub.tsx"),prepareAssets("project-hub")]);return module;}

const wall = (id: string, x: number, z: number, w: number, d: number, h = 3.6): Collider => ({ id, minX: x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, minY:0, maxY:h });
export const HUB_ORIGIN: Point = [0, 0, -11];
export const ASTRA_HOME: Point = [-1.25, 0, -12.5];
export const CONNECTIONS: readonly Connection[] = [
  { id:"atrium-hub", from:"atrium", to:"project-hub", floor:{minX:-1.2,maxX:1.2,minZ:-6.5,maxZ:-4}, fromPoint:[0,1.62,-4], toPoint:[0,1.62,-6.5] },
  { id:"atrium-living", from:"atrium", to:"living", floor:{minX:-6.5,maxX:-4,minZ:-1.2,maxZ:1.2}, fromPoint:[-4,1.62,0], toPoint:[-6.5,1.62,0] },
  { id:"atrium-gaming", from:"atrium", to:"gaming", floor:{minX:4,maxX:6.5,minZ:-1.2,maxZ:1.2}, fromPoint:[4,1.62,0], toPoint:[6.5,1.62,0] },
];
const hubWalls = [wall("hub.north",0,-15.59,12.36,.18),wall("hub.west",-6.09,-11,.18,9),wall("hub.east",6.09,-11,.18,9),wall("hub.south.west",-3.6,-6.41,4.8,.18),wall("hub.south.east",3.6,-6.41,4.8,.18)];
const hubProps: Collider[] = [-3.25,3.25].flatMap(x=>[-2.5,2.5].flatMap(z=>[wall(`desk.${x}.${z}`,x,z-11,2.5,1.16,1.9),wall(`chair.${x}.${z}`,x,z-11+(z<0?1.08:-1.08),.8,.8,1.25)]));
const atriumWalls = [wall("atrium.south",0,4.09,8.36,.18,4.6),wall("atrium.north.west",-2.6,-4.09,2.8,.18,4.6),wall("atrium.north.east",2.6,-4.09,2.8,.18,4.6),...[-1,1].flatMap(side=>[-2.6,2.6].map(z=>wall(`atrium.side.${side}.${z}`,side*4.09,z,.18,2.8,4.6)))];

function homeColliders(id:"living"|"gaming"):Collider[]{
 const living=id==="living",origin=living?-11:11,entry=living?1:-1;
 const box=(name:string,x:number,z:number,w:number,d:number,h:number)=>wall(id+"."+name,x+origin,z,w,d,h);
 const bounds=[box("north",0,-4.09,9.36,.18,3.2),box("south",0,4.09,9.36,.18,3.2),box("outer",-entry*4.59,0,.18,8,3.2),...[-2.6,2.6].map(z=>box("entry."+z,entry*4.59,z,.18,2.8,3.2))];
 if(living)return [...bounds,box("sofa",0,-1.1,2.19,1.03,.8),box("chair",-2.4,.7,1.05,1.05,.85),box("table",0,.5,1.3,.72,.43),box("media",0,3.55,2.8,.5,2),box("books",-4.1,-.8,.4,1.6,2.15),box("lamp",-2.1,-1.9,.6,.6,1.8),box("plant-a",3.45,-3.15,.6,.6,1.9),box("plant-b",-3.5,3.2,.6,.6,1.9)];
 return [...bounds,box("sofa",0,1.7,2.19,1.03,.8),box("table",0,.15,1.3,.72,.43),box("arcade",-2.9,-2.6,.86,1.05,1.95),box("desk",2.6,-2.55,2.5,1.05,1.9),box("chair",2.6,-1.35,.8,.8,1.25),box("console",0,-3.45,2.8,.5,2),box("books",-4.1,2.1,.4,1.6,2.15),box("lamp",2.6,2.3,.6,.6,1.8),box("plant",3.7,3.2,.6,.6,1.9)];
}

export const ROOMS: Readonly<Record<RoomId,RoomDefinition>> = {
  "project-hub": {id:"project-hub",title:"Project Hub",description:"Hardware, software, AI and GitHub. Your original tools, together.",accent:"#287d83",availability:"available",origin:HUB_ORIGIN,floor:{minX:-6,maxX:6,minZ:-15.5,maxZ:-6.5},ceiling:3.6,landing:[0,1.62,-7.3],introduction:{position:[0,2.5,-7.05],target:[-.8,1.08,-12.5]},colliders:[...hubWalls,...hubProps,wall("astra",ASTRA_HOME[0],ASTRA_HOME[2],1.44,1.44,1.9)],load:loadHub},
  atrium:{id:"atrium",title:"Central Atrium",description:"A stone crossing connecting AURA’s three destinations.",accent:"#305a9d",availability:"available",origin:[0,0,0],floor:{minX:-4,maxX:4,minZ:-4,maxZ:4},ceiling:4.6,landing:[0,1.62,-2.7],introduction:{position:[-.4,2.5,3.45],target:[0,1.5,-.9]},colliders:[...atriumWalls,wall("map",2.5,2.4,1.2,.5,1.3)],load:()=>import("./rooms/Atrium.tsx")},
  living:{id:"living",title:"Personal Living Space",description:"Walnut, soft fabric and a quieter pace.",accent:"#48634f",availability:"available",origin:[-11,0,0],floor:{minX:-15.5,maxX:-6.5,minZ:-4,maxZ:4},ceiling:3.2,landing:[-7.7,1.62,0],introduction:{position:[-7.35,2.25,3.15],target:[-11.85,.9,-.5]},colliders:homeColliders("living"),load:()=>loadRoom("living")},
  gaming:{id:"gaming",title:"Gaming & Entertainment",description:"A separate destination for play and a future game library.",accent:"#514a7b",availability:"available",origin:[11,0,0],floor:{minX:6.5,maxX:15.5,minZ:-4,maxZ:4},ceiling:3.2,landing:[7.7,1.62,0],introduction:{position:[8.65,2.35,3.3],target:[11.1,1.05,-1.3]},colliders:homeColliders("gaming"),load:()=>loadRoom("gaming")},
};
export const ROOM_LIST = Object.values(ROOMS);
export const contains = (r:Rect, p:Point) => p[0]>=r.minX && p[0]<=r.maxX && p[2]>=r.minZ && p[2]<=r.maxZ;
export function roomAt(p:Point, loaded:readonly RoomId[]): RoomId | undefined { return loaded.find(id=>contains(ROOMS[id].floor,p)); }
export function connectionFor(a:RoomId,b:RoomId) { return CONNECTIONS.find(e=>(e.from===a&&e.to===b)||(e.from===b&&e.to===a)); }
export function zonePose(zone:ZoneId):CameraPose {
  const poses:Record<ZoneId,CameraPose> = {
    studio:ROOMS["project-hub"].introduction,
    hardware:{position:[-.6,2,-11.5],target:[-3.25,1.2,-13.5]},
    software:{position:[.6,2,-11.7],target:[3.25,1.2,-13.5]},
    "ai-lab":{position:[-.6,2,-10.4],target:[-3.25,1.2,-8.5]},
    github:{position:[.6,2,-10.4],target:[3.25,1.2,-8.5]},
    companion:{position:[.5,1.9,-10.1],target:[-1.25,.9,-12.5]},
  }; return {...poses[zone],room:"project-hub"};
}
export function worldGeometry(loaded:readonly RoomId[],options:RoomOptions=DEFAULT_ROOM_OPTIONS) {
  const floors=loaded.map(id=>ROOMS[id].floor);
  const colliders=loaded.flatMap(id=>ROOMS[id].colliders.map(c=>c.id==="living.chair"&&options.chairSlot==="conversation"?{...c,minZ:c.minZ+.8,maxZ:c.maxZ+.8}:c));
  for(const e of CONNECTIONS){
    if(!loaded.includes(e.from)&&!loaded.includes(e.to))continue;
    if(loaded.includes(e.from)&&loaded.includes(e.to)){
      floors.push(e.floor);
      if(e.fromPoint[0]===e.toPoint[0])colliders.push(wall(e.id+".west",e.floor.minX-.09,(e.floor.minZ+e.floor.maxZ)/2,.18,e.floor.maxZ-e.floor.minZ),wall(e.id+".east",e.floor.maxX+.09,(e.floor.minZ+e.floor.maxZ)/2,.18,e.floor.maxZ-e.floor.minZ));
      else colliders.push(wall(e.id+".north",(e.floor.minX+e.floor.maxX)/2,e.floor.minZ-.09,e.floor.maxX-e.floor.minX,.18),wall(e.id+".south",(e.floor.minX+e.floor.maxX)/2,e.floor.maxZ+.09,e.floor.maxX-e.floor.minX,.18));
    }else{
      const [x,,z]=loaded.includes(e.from)?e.fromPoint:e.toPoint;const horizontal=e.fromPoint[0]!==e.toPoint[0];
      colliders.push(wall(e.id+".closed",x,z,horizontal?.18:2.4,horizontal?2.4:.18,2.8));
    }
  }
  return {floors,colliders};
}
export function validateRegistry(){
  for(const r of ROOM_LIST){
    if(!/^[a-z][a-z0-9-]{0,47}$/.test(r.id)||r.floor.minX>=r.floor.maxX||r.floor.minZ>=r.floor.maxZ||r.ceiling<2.8||!contains(r.floor,r.landing))throw Error("Invalid room definition");
    if(r.availability==="available"&&!r.load)throw Error("Available room has no loader");
  }
  for(const e of CONNECTIONS){
    const a=ROOMS[e.from],b=ROOMS[e.to];
    if(!a||!b||!contains(a.floor,e.fromPoint)||!contains(b.floor,e.toPoint))throw Error("Disconnected portal");
    if(!contains(e.floor,e.fromPoint)||!contains(e.floor,e.toPoint))throw Error("Disconnected passage floor");
  }
}
validateRegistry();
