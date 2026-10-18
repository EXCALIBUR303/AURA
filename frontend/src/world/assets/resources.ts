import { GLTFLoader } from "three-stdlib";
import type { GLTF } from "three-stdlib";
import { Material, Mesh, Texture } from "three";
import type { RoomId } from "../types.ts";

export type AssetId = "workstation";
export const ASSETS = { workstation: { url:"./world/workstation.glb", title:"AURA original workstation kit", requiredBy:["project-hub"] as readonly RoomId[] } };
type Entry = { owners:Set<RoomId>; value?:GLTF; pending?:Promise<GLTF> };
const entries = new Map<AssetId,Entry>();
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
  if(!current.pending)current.pending=loader.loadAsync(ASSETS[id].url).then(value=>{
    if(id==="workstation"&&!["desk","chair","pc","fan","monitor","keyboard","mouse","speaker","laptop"].every(name=>value.scene.getObjectByName(name))){dispose(value);throw Error("Incomplete workstation asset");}
    current.pending=undefined;
    if(!current.owners.size){dispose(value);if(entries.get(id)===current)entries.delete(id);}else current.value=value;
    return value;
  }).catch(error=>{current.pending=undefined;if(entries.get(id)===current)entries.delete(id);throw error;});
  return current.pending;
}
export async function prepareAssets(room:RoomId){await Promise.all((Object.keys(ASSETS) as AssetId[]).filter(id=>ASSETS[id].requiredBy.includes(room)).map(id=>acquire(id,room)));}
/** Run after React commits the new room set, never from a room's render/unmount. */
export function retainAssetOwners(owners:readonly RoomId[]){
  for(const [id,entry] of entries){for(const owner of entry.owners)if(!owners.includes(owner))entry.owners.delete(owner);
    if(!entry.owners.size&&entry.value){dispose(entry.value);entries.delete(id);}
  }
}
export function readAsset(id:AssetId):GLTF {const value=entries.get(id)?.value;if(!value)throw Error("Required room asset is unavailable");return value;}
export function assetSummary(){return [...entries].map(([id,e])=>({id,owners:[...e.owners],ready:!!e.value,loading:!!e.pending}));}
