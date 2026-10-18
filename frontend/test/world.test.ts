import assert from "node:assert/strict";
import test from "node:test";
import { cameraPath, clearSegment, movePlayer, safePoint } from "../src/world/collision.ts";
import { ASTRA_HOME, CONNECTIONS, contains, ROOMS, roomAt, validateRegistry, worldGeometry, zonePose } from "../src/world/registry.ts";
import { WorldController } from "../src/world/WorldController.ts";
import type { CameraPose, Point, RoomModule } from "../src/world/types.ts";
const module:RoomModule={default:()=>null};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const ready=async()=>{const controller=new WorldController(async()=>module);controller.focusWorkspace("studio");await tick();controller.arrive(controller.getSnapshot().request!.id);return controller;};

test("room graph has level, aligned real passages and preserves native zone identities",()=>{
  validateRegistry();assert.equal(CONNECTIONS.length,3);
  for(const e of CONNECTIONS){assert.ok(contains(ROOMS[e.from].floor,e.fromPoint));assert.ok(contains(ROOMS[e.to].floor,e.toPoint));assert.ok(contains(e.floor,e.fromPoint));assert.ok(contains(e.floor,e.toPoint));assert.equal(e.fromPoint[1],e.toPoint[1]);}
  for(const id of ["studio","hardware","software","ai-lab","github","companion"] as const)assert.equal(zonePose(id).room,"project-hub");
});
test("unloaded floors are blocked at doors; loaded floor union has no false seam",()=>{
  const cold=worldGeometry(["project-hub"]);assert.equal(safePoint([0,1.62,-6.6],cold.floors,cold.colliders),false);
  const warm=worldGeometry(["project-hub","atrium"]);
  for(let z=-7.2;z< -3.1;z+=.03)assert.equal(safePoint([0,1.62,z],warm.floors,warm.colliders),true);
  assert.equal(safePoint([1.1,1.62,-5],warm.floors,warm.colliders),false);
  assert.equal(safePoint([-4,1.62,0],warm.floors,warm.colliders),false);
});
test("player cannot tunnel through furniture/walls, leave a floor or cross Astra",()=>{
  const g=worldGeometry(["project-hub","atrium"]);let p:Point=[0,1.62,-7.3];
  for(let i=0;i<300;i++)p=movePlayer(p,100,0,g.floors,g.colliders);
  assert.ok(p[0]<5.75);assert.ok(safePoint(p,g.floors,g.colliders));
  p=[ASTRA_HOME[0],1.62,-10.5];for(let i=0;i<150;i++)p=movePlayer(p,0,-.1,g.floors,g.colliders);assert.ok(p[2]>ASTRA_HOME[2]+.64);
  assert.deepEqual(movePlayer(p,NaN,0,g.floors,g.colliders),p);
});
test("collision sliding preserves the tangential component and rejects floor holes",()=>{
  const floors=[{minX:-3,maxX:3,minZ:-3,maxZ:3}];const wall={id:"wall",minX:0,maxX:.2,minZ:-3,maxZ:3,minY:0,maxY:3};
  const p=movePlayer([-.27,1.62,0],.05,.05,floors,[wall]);assert.ok(p[0]<-.26);assert.ok(p[2]>.04);
  assert.equal(safePoint([10,1.62,0],floors,[]),false);
});
test("cinematic paths remain collision-safe around a central obstacle",()=>{
  const floors=[{minX:-3,maxX:3,minZ:-3,maxZ:3}];const box={id:"box",minX:-.5,maxX:.5,minZ:-.5,maxZ:.5,minY:0,maxY:3};
  const start:Point=[0,1.62,2],end:Point=[0,1.62,-2];assert.equal(clearSegment(start,end,floors,[box]),false);
  const path=cameraPath(start,end,floors,[box]);assert.ok(path.length>1);
  path.forEach((p,i)=>assert.ok(clearSegment(i?path[i-1]!:start,p,floors,[box])));assert.deepEqual(path.at(-1),end);
});
test("every workspace camera is inside the loaded room and clear of actual migration obstacles",()=>{
  const g=worldGeometry(["project-hub"]);
  for(const id of ["studio","hardware","software","ai-lab","github","companion"] as const)assert.ok(safePoint(zonePose(id).position,g.floors,g.colliders,.12,false),id);
  assert.equal(roomAt(zonePose("studio").position,["project-hub"]),"project-hub");
});
test("room travel preserves selected zone; workspace commands return to Hub",async()=>{
  const c=await ready();c.travel("atrium");await tick();let s=c.getSnapshot();assert.equal(s.room,"project-hub");assert.equal(s.phase,"travelling");assert.equal(s.selectedZone,"studio");c.arrive(s.request!.id);assert.equal(c.getSnapshot().room,"atrium");
  c.focusWorkspace("software");await tick();s=c.getSnapshot();assert.equal(s.request!.room,"project-hub");assert.equal(s.selectedZone,"software");c.arrive(s.request!.id);assert.equal(c.getSnapshot().room,"project-hub");
});
test("latest travel intent wins over a late room import and stale arrival",async()=>{
  let release!: (m:RoomModule)=>void;const pending=new Promise<RoomModule>(r=>{release=r;});
  const c=new WorldController(id=>id==="atrium"?pending:Promise.resolve(module));c.focusWorkspace("studio");await tick();c.arrive(c.getSnapshot().request!.id);
  c.travel("atrium");c.focusWorkspace("hardware");await tick();const request=c.getSnapshot().request!;release(module);await tick();assert.equal(c.getSnapshot().request!.id,request.id);c.arrive(request.id-1);assert.equal(c.getSnapshot().room,"project-hub");c.arrive(request.id);assert.equal(c.getSnapshot().selectedZone,"hardware");
});
test("failed import leaves a usable room and retry succeeds without resetting workspace",async()=>{
  let fail=true;const c=new WorldController(async id=>{if(id==="atrium"&&fail)throw Error("unavailable module");return module;});c.focusWorkspace("github");await tick();c.arrive(c.getSnapshot().request!.id);c.travel("atrium");await tick();assert.equal(c.getSnapshot().phase,"error");assert.equal(c.getSnapshot().room,"project-hub");assert.equal(c.getSnapshot().selectedZone,"github");fail=false;c.retry();await tick();c.arrive(c.getSnapshot().request!.id);assert.equal(c.getSnapshot().room,"atrium");
});
test("cancellation ignores pending imports and recovers a safe landing",async()=>{
  let release!:(m:RoomModule)=>void;const c=new WorldController(id=>id==="atrium"?new Promise(r=>{release=r;}):Promise.resolve(module));c.focusWorkspace("studio");await tick();c.arrive(c.getSnapshot().request!.id);c.travel("atrium");c.cancel();const cancelled=c.getSnapshot().request!;release(module);await tick();assert.equal(c.getSnapshot().request!.id,cancelled.id);assert.equal(cancelled.instant,true);c.arrive(cancelled.id);assert.equal(c.getSnapshot().phase,"idle");assert.equal(c.getSnapshot().room,"project-hub");
});
test("all three physical destinations are available independently of native workspace selection",async()=>{
 const c=await ready();for(const room of ["living","gaming","project-hub"] as const){assert.equal(ROOMS[room].availability,"available");assert.ok(ROOMS[room].load);c.travel(room);await tick();c.arrive(c.getSnapshot().request!.id);assert.equal(c.getSnapshot().room,room);assert.equal(c.getSnapshot().selectedZone,"studio");assert.ok(c.getSnapshot().loaded.length<=2);}
});

test("inspect snapshots retain exact pose and physical room independently of logical context",async()=>{
  const c=await ready();const pose:CameraPose={position:[0,1.62,2.7],target:[0,1.7,-3.4],room:"atrium"};c.focusWorkspace("companion",pose);await tick();c.arrive(c.getSnapshot().request!.id);const captured=c.capture();captured.position[0]=999;assert.equal(c.capture().position[0],0);assert.equal(c.capture().room,"atrium");assert.equal(c.getSnapshot().selectedZone,"companion");
});
test("twenty repeated visits retain at most current plus adjacent modules",async()=>{
  const c=await ready();for(let i=0;i<20;i++){c.travel(i%2?"project-hub":"atrium");await tick();c.arrive(c.getSnapshot().request!.id);assert.ok(c.getSnapshot().loaded.length<=2);assert.ok(Object.keys(c.getSnapshot().modules).length<=2);}c.setMode("explore");assert.equal(c.getSnapshot().mode,"explore");
});
test("cancelled initial startup exposes retry rather than a false ready room",async()=>{
  const c=new WorldController(async()=>module);c.focusWorkspace("studio");c.cancel();await tick();assert.equal(c.getSnapshot().phase,"error");assert.equal(c.getSnapshot().loaded.length,0);c.retry();await tick();c.arrive(c.getSnapshot().request!.id);assert.equal(c.getSnapshot().phase,"idle");
});

test("opening a passage loads its floor without changing the camera, mode or selected workspace",async()=>{
  const c=await ready();const pose=c.capture();c.setMode("explore");c.openDoor("atrium");assert.equal(c.getSnapshot().phase,"preparing");await tick();assert.equal(c.getSnapshot().phase,"idle");assert.equal(c.getSnapshot().room,"project-hub");assert.equal(c.getSnapshot().mode,"explore");assert.equal(c.getSnapshot().request,undefined);assert.ok(c.getSnapshot().loaded.includes("atrium"));assert.deepEqual(c.capture(),pose);
});
test("pointer release during a door load stays released after the module arrives",async()=>{
  let release!:(module:RoomModule)=>void;const c=new WorldController(id=>id==="atrium"?new Promise(r=>{release=r;}):Promise.resolve(module));c.focusWorkspace("studio");await tick();c.arrive(c.getSnapshot().request!.id);c.setMode("explore");c.openDoor("atrium");c.setMode("inspect");release(module);await tick();assert.equal(c.getSnapshot().mode,"inspect");assert.equal(c.getSnapshot().phase,"idle");
});

test("equipment registry retains native adapters, unique stable IDs and collision-safe fitted poses",async()=>{
  const {EQUIPMENT}=await import("../src/world/interactions/registry.ts");const geometry=worldGeometry(["project-hub"]);
  assert.equal(new Set(EQUIPMENT.map(e=>e.id)).size,EQUIPMENT.length);
  assert.deepEqual([...new Set(EQUIPMENT.map(e=>e.zone))].sort(),["ai-lab","github","hardware","software"]);
  for(const item of EQUIPMENT){assert.ok(safePoint(item.focus.position,geometry.floors,geometry.colliders,.12,false),item.id);assert.ok(item.proxy.size.every(v=>Number.isFinite(v)&&v>0));assert.ok(item.focus.target.every(Number.isFinite));}
});
test("object inspection preserves the selected logical workspace and restores its exact physical pose",async()=>{
  const {EQUIPMENT}=await import("../src/world/interactions/registry.ts");const c=await ready();c.focusWorkspace("software");await tick();c.arrive(c.getSnapshot().request!.id);const prior=c.capture();
  c.inspect(EQUIPMENT[0]!.focus);await tick();c.arrive(c.getSnapshot().request!.id);assert.equal(c.getSnapshot().selectedZone,"software");c.inspect(prior);await tick();c.arrive(c.getSnapshot().request!.id);assert.deepEqual(c.capture(),prior);assert.equal(c.getSnapshot().selectedZone,"software");
});

test("Living and Gaming passages open continuously along X and close from either side when unloaded",()=>{
 for(const id of ["living","gaming"] as const){const edge=CONNECTIONS.find(e=>e.to===id)!;for(const loaded of [["atrium"],[id]] as const){const g=worldGeometry(loaded);const p=loaded[0]==="atrium"?edge.fromPoint:edge.toPoint;assert.equal(safePoint(p,g.floors,g.colliders),false);}
 const g=worldGeometry(["atrium",id]);const low=Math.min(edge.fromPoint[0],edge.toPoint[0]),high=Math.max(edge.fromPoint[0],edge.toPoint[0]);for(let x=low-.1;x<high+.1;x+=.03)assert.ok(safePoint([x,1.62,0],g.floors,g.colliders));assert.equal(safePoint([(low+high)/2,1.62,1.1],g.floors,g.colliders),false);}
});
test("new room cameras clear fitted furniture and room settings survive resource eviction",async()=>{
 for(const id of ["living","gaming"] as const){const g=worldGeometry([id]);assert.ok(safePoint(ROOMS[id].introduction.position,g.floors,g.colliders,.12,false),id);assert.ok(safePoint(ROOMS[id].landing,g.floors,g.colliders),id);}
 const c=await ready();c.setRoomOptions({curtainsOpen:false,livingPalette:"terracotta",livingLights:false});c.travel("living");await tick();c.arrive(c.getSnapshot().request!.id);c.travel("gaming");await tick();c.arrive(c.getSnapshot().request!.id);assert.equal(c.getSnapshot().options.curtainsOpen,false);assert.equal(c.getSnapshot().options.livingLights,false);assert.equal(c.getSnapshot().options.livingPalette,"terracotta");assert.ok(!c.getSnapshot().loaded.includes("project-hub"));
});
