import { useEffect, useMemo } from "react";
import { Box3, Light, Mesh, MeshPhysicalMaterial, Vector3 } from "three";
import { readAsset } from "./resources.ts";
import type { Point } from "../types.ts";
export function Seating({kind,position,rotation=0,palette}:{kind:"sofa"|"chair";position:Point;rotation?:number;palette?:"forest"|"terracotta"}){
 const source=readAsset(kind).scene;
 const model=useMemo(()=>{const scene=source.clone(true);const owned:MeshPhysicalMaterial[]=[];
  scene.traverse(o=>{if(o instanceof Light){o.visible=false;return;}if(!(o instanceof Mesh))return;o.castShadow=true;o.receiveShadow=true;
   const materials=Array.isArray(o.material)?o.material:[o.material];const cloned=materials.map(m=>{const clone=m.clone() as MeshPhysicalMaterial;owned.push(clone);
    if(palette&&m.name.includes("fabric")){clone.color.set(palette==="forest"?"#375849":"#9d634b");clone.sheenColor.set(palette==="forest"?"#7b9a7f":"#cb9a77");clone.specularColor.set("#e4d8b9");}
    return clone;});o.material=Array.isArray(o.material)?cloned:cloned[0]!;
  });
  scene.updateMatrixWorld(true);const box=new Box3().setFromObject(scene);const center=box.getCenter(new Vector3());scene.position.set(-center.x,-box.min.y,-center.z);return {scene,owned};
 },[source,palette]);
 useEffect(()=>()=>model.owned.forEach(m=>m.dispose()),[model]);
 return <group position={position} rotation={[0,rotation,0]}><primitive object={model.scene} dispose={null}/></group>;
}
