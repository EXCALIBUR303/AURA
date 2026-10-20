import { GLTFLoader } from "three-stdlib";
import type { GLTF } from "three-stdlib";
import { Material, Mesh, Texture } from "three";
import type { RoomId } from "../types.ts";
import { traceMark } from "../../studio/frameTrace.ts";

export type AssetId = "workstation" | "room-kit" | "sofa" | "chair";
export const ASSETS:Record<AssetId,{url:string;title:string;requiredBy:readonly RoomId[]}>= {
 workstation:{url:"./world/workstation.glb",title:"AURA original workstation kit",requiredBy:["project-hub","gaming"]},
 "room-kit":{url:"./world/room-kit.glb",title:"AURA original room kit",requiredBy:["living","gaming"]},
 sofa:{url:"./world/GlamVelvetSofa.glb",title:"GlamVelvetSofa / Eric Chadwick, Wayfair / CC BY 4.0",requiredBy:["living","gaming"]},
 chair:{url:"./world/SheenChair.glb",title:"Sheen Chair / Eric Chadwick, Wayfair / CC0",requiredBy:["living"]},
};
type Entry = { owners:Set<RoomId>; value?:GLTF; pending?:Promise<GLTF>; timing?:{downloadMs:number;decodeMs:number;prefetched:boolean} };
const BYTE_LIMIT=8_100_000;
const ASSET_BYTES:Record<AssetId,number>={workstation:999936,"room-kit":741932,sofa:3149844,chair:4125648};
type WarmBytes={abort:AbortController;promise:Promise<{buffer:ArrayBuffer;downloadMs:number}>};
const warmBytes=new Map<AssetId,WarmBytes>();
async function download(id:AssetId,signal?:AbortSignal){
 const start=performance.now();const response=await fetch(ASSETS[id].url,{signal,credentials:"omit"});
 if(!response.ok)throw Error("Local room model is unavailable");
 const buffer=await response.arrayBuffer();return{buffer,downloadMs:performance.now()-start};
}
/** At most 8.1 MB of local bytes; no parsed scenes, textures, floors or extra room owners. */
export function warmRoomBytes(room:RoomId){
 const ids=(Object.keys(ASSETS) as AssetId[]).filter(id=>ASSETS[id].requiredBy.includes(room)&&!entries.get(id)?.value&&!entries.get(id)?.pending&&!warmBytes.has(id));
 const reserved=[...warmBytes.keys()].reduce((n,id)=>n+ASSET_BYTES[id],0);
 if(reserved+ids.reduce((n,id)=>n+ASSET_BYTES[id],0)>BYTE_LIMIT)return()=>{};
 const owned:WarmBytes[]=[];
 for(const id of ids){if(warmBytes.has(id))continue;const abort=new AbortController();
  const item:WarmBytes={abort,promise:download(id,abort.signal)};warmBytes.set(id,item);owned.push(item);
  // Failed speculative work never becomes an unhandled rejection or poisons Retry.
  void item.promise.catch(()=>{if(warmBytes.get(id)===item)warmBytes.delete(id);});
 }
 return()=>{for(const [id,item] of warmBytes)if(owned.includes(item)){warmBytes.delete(id);item.abort.abort();}};
}
const REQUIRED_PARTS:Partial<Record<AssetId,string[]>>={workstation:["desk","chair","pc","fan","monitor","monitor-panel","monitor-stand","keyboard","mouse","speaker","laptop"],"room-kit":["coffee-table","console","bookshelf","floor-lamp","pendant","plant","curtain","arcade","controller","game-console","display","art-frame"]};
const entries = new Map<AssetId,Entry>();
let desiredOwners:readonly RoomId[]=[];
const mountedRooms=new Map<RoomId,number>();
const loader = new GLTFLoader(); // Uncompressed, embedded GLBs. No external decoders or CDN.
function dispose(value:GLTF){
  const geometry=new Set<Mesh["geometry"]>(),materials=new Set<Material>(),textures=new Set<Texture>();
  value.scene.traverse(object=>{if(!(object instanceof Mesh))return;geometry.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);for(const item of Object.values(material))if(item instanceof Texture)textures.add(item);}});
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
async function acquire(id:AssetId,owner:RoomId){
  let entry=entries.get(id);if(!entry){entry={owners:new Set()};entries.set(id,entry);}entry.owners.add(owner);
  if(entry.value)return entry.value;
  const current=entry;
  if(!current.pending)current.pending=(async()=>{
    const warm=warmBytes.get(id);warmBytes.delete(id); // Transfer the request out of speculative ownership.
    let prefetched=!!warm;
    const bytes=warm?await warm.promise.catch(()=>{prefetched=false;return download(id);}):await download(id);
    const start=performance.now();
    const value=await loader.parseAsync(bytes.buffer,new URL("./world/",document.baseURI).href);
    current.timing={downloadMs:Math.round(bytes.downloadMs),decodeMs:Math.round(performance.now()-start),prefetched};
    traceMark(`decode:${id}`,performance.now()-start);
    return value;
  })().then(value=>{
    if(REQUIRED_PARTS[id]?.some(name=>!value.scene.getObjectByName(name))){dispose(value);throw Error("Incomplete workstation asset");}
    current.pending=undefined;
    if(!current.owners.size){dispose(value);if(entries.get(id)===current)entries.delete(id);}else current.value=value;
    return value;
  }).catch(error=>{current.pending=undefined;if(entries.get(id)===current)entries.delete(id);throw error;});
  return current.pending;
}
export async function prepareAssets(room:RoomId){await Promise.all((Object.keys(ASSETS) as AssetId[]).filter(id=>ASSETS[id].requiredBy.includes(room)).map(id=>acquire(id,room)));}
/** DOM navigation intent may commit before the separate R3F root removes old meshes. */
function sweepOwners(){
  const keep=new Set([...desiredOwners,...mountedRooms.keys()]);
  for(const [id,entry] of entries){for(const owner of entry.owners)if(!keep.has(owner))entry.owners.delete(owner);
    if(!entry.owners.size&&entry.value){dispose(entry.value);entries.delete(id);}
  }
}
export function retainAssetOwners(owners:readonly RoomId[]){desiredOwners=[...owners];sweepOwners();}
/** A passive cleanup inside the R3F root runs after its host meshes have been unlinked. */
export function pinRenderedRoom(room:RoomId){
 mountedRooms.set(room,(mountedRooms.get(room)??0)+1);
 let released=false;
 return ()=>{if(released)return;released=true;const count=(mountedRooms.get(room)??1)-1;if(count)mountedRooms.set(room,count);else mountedRooms.delete(room);sweepOwners();};
}
export function readAsset(id:AssetId):GLTF {const value=entries.get(id)?.value;if(!value)throw Error("Required room asset is unavailable");return value;}
export function assetSummary(){return [...entries].map(([id,e])=>({id,owners:[...e.owners],ready:!!e.value,loading:!!e.pending,...e.timing}));}
