import type { ZoneId } from "@aura/contracts";
import type { CameraPose, Collider, Connection, Point, Rect, RoomDefinition, RoomId } from "./types.ts";

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
export const ROOMS: Readonly<Record<RoomId,RoomDefinition>> = {
  "project-hub": {id:"project-hub",title:"Project Hub",description:"Hardware, software, AI and GitHub. Your original tools, together.",accent:"#287d83",availability:"available",origin:HUB_ORIGIN,floor:{minX:-6,maxX:6,minZ:-15.5,maxZ:-6.5},ceiling:3.6,landing:[0,1.62,-7.3],introduction:{position:[0,2.6,-7.5],target:[0,1,-11.7]},colliders:[...hubWalls,...hubProps,wall("astra",ASTRA_HOME[0],ASTRA_HOME[2],.8,.8,1.9)],load:()=>import("./rooms/ProjectHub.tsx")},
  atrium:{id:"atrium",title:"Central Atrium",description:"A stone crossing connecting AURA’s three destinations.",accent:"#305a9d",availability:"available",origin:[0,0,0],floor:{minX:-4,maxX:4,minZ:-4,maxZ:4},ceiling:4.6,landing:[0,1.62,-2.7],introduction:{position:[0,1.62,2.7],target:[0,1.7,-3.4]},colliders:[...atriumWalls,wall("map",2.5,2.4,1.2,.5,1.3)],load:()=>import("./rooms/Atrium.tsx")},
  living:{id:"living",title:"Personal Living Space",description:"Walnut, soft fabric and a quieter pace.",accent:"#48634f",availability:"planned",reason:"This room is not available yet.",origin:[-11,0,0],floor:{minX:-15.5,maxX:-6.5,minZ:-4,maxZ:4},ceiling:3.2,landing:[-7.7,1.62,0],introduction:{position:[-7.5,2.2,2.8],target:[-11.8,.9,-.7]},colliders:[]},
  gaming:{id:"gaming",title:"Gaming & Entertainment",description:"A separate destination for play and a future game library.",accent:"#514a7b",availability:"planned",reason:"This room is not available yet. No games are installed.",origin:[11,0,0],floor:{minX:6.5,maxX:15.5,minZ:-4,maxZ:4},ceiling:3.2,landing:[7.7,1.62,0],introduction:{position:[7.9,2.2,2.8],target:[11.7,1,-2]},colliders:[]},
};
export const ROOM_LIST = Object.values(ROOMS);
export const contains = (r:Rect, p:Point) => p[0]>=r.minX && p[0]<=r.maxX && p[2]>=r.minZ && p[2]<=r.maxZ;
export function roomAt(p:Point, loaded:readonly RoomId[]): RoomId | undefined { return loaded.find(id=>contains(ROOMS[id].floor,p)); }
export function connectionFor(a:RoomId,b:RoomId) { return CONNECTIONS.find(e=>(e.from===a&&e.to===b)||(e.from===b&&e.to===a)); }
export function zonePose(zone:ZoneId):CameraPose {
  const poses:Record<ZoneId,CameraPose> = {
    studio:ROOMS["project-hub"].introduction,
    hardware:{position:[-.6,2,-11.7],target:[-3.25,1.2,-13.5]},
    software:{position:[.6,2,-11.7],target:[3.25,1.2,-13.5]},
    "ai-lab":{position:[-.6,2,-10.4],target:[-3.25,1.2,-8.5]},
    github:{position:[.6,2,-10.4],target:[3.25,1.2,-8.5]},
    companion:{position:[.5,1.9,-10.1],target:[-1.25,.9,-12.5]},
  }; return {...poses[zone],room:"project-hub"};
}
export function worldGeometry(loaded:readonly RoomId[]) {
  const floors=loaded.map(id=>ROOMS[id].floor);
  const colliders=loaded.flatMap(id=>ROOMS[id].colliders);
  for(const e of CONNECTIONS){
    if(!loaded.includes(e.from))continue;
    if(loaded.includes(e.to)){
      floors.push(e.floor);
      if(e.fromPoint[0]===e.toPoint[0])colliders.push(wall(e.id+".west",e.floor.minX-.09,(e.floor.minZ+e.floor.maxZ)/2,.18,e.floor.maxZ-e.floor.minZ),wall(e.id+".east",e.floor.maxX+.09,(e.floor.minZ+e.floor.maxZ)/2,.18,e.floor.maxZ-e.floor.minZ));
      else colliders.push(wall(e.id+".north",(e.floor.minX+e.floor.maxX)/2,e.floor.minZ-.09,e.floor.maxX-e.floor.minX,.18),wall(e.id+".south",(e.floor.minX+e.floor.maxX)/2,e.floor.maxZ+.09,e.floor.maxX-e.floor.minX,.18));
    }else{
      const [x,,z]=e.fromPoint;const horizontal=e.fromPoint[0]!==e.toPoint[0];
      colliders.push(wall(e.id+".closed",x,z,horizontal?.18:2.4,horizontal?2.4:.18,2.8));
    }
  }
  // The Hub is the initial room, so close its portal until Atrium has loaded too.
  if(loaded.includes("project-hub")&&!loaded.includes("atrium"))colliders.push(wall("hub.closed",0,-6.5,2.4,.18,2.8));
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
