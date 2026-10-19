import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Object3D } from "three";
import type { Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Point } from "../types.ts";
import { readAsset } from "./resources.ts";
import type { AssetId } from "./resources.ts";
import { surfaceTexture } from "../rooms/Surfaces.tsx";
export type Part = {name:string;position:Point;rotation?:number;scale?:Point};
export function collect(scene:Object3D,parts:Part[]){
 const groups=new Map<Material,BufferGeometry[]>();
 for(const part of parts){const root=scene.getObjectByName(part.name);if(!root)throw Error("Missing authored equipment part");
  const placed=new Object3D();placed.position.fromArray(part.position);placed.rotation.y=part.rotation??0;if(part.scale)placed.scale.fromArray(part.scale);placed.updateMatrix();
  root.updateWorldMatrix(true,true);const inverse=new Matrix4().copy(root.matrixWorld).invert();
  root.traverse(o=>{if(!(o instanceof Mesh))return;const material=o.material as Material;
   const g=o.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(placed.matrix,new Matrix4().multiplyMatrices(inverse,o.matrixWorld)));
   if(!g.hasAttribute("uv"))g.setAttribute("uv",new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count*2),2));
   if(!g.hasAttribute("normal"))g.computeVertexNormals();
   const list=groups.get(material)??[];list.push(g);groups.set(material,list);
  });
 }
 return [...groups].map(([material,list])=>{const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());if(!geometry)throw Error("Incompatible authored model geometry");return {material,geometry};});
}

export function ModelBatch({asset,parts,lights=true}:{asset:AssetId;parts:Part[];lights?:boolean}){
 const source=readAsset(asset).scene;const wood=useMemo(()=>surfaceTexture("walnut"),[]);
 const batches=useMemo(()=>collect(source,parts).map(b=>{
  const material=b.material.clone() as MeshStandardMaterial;
  if(material.name==="Walnut"){material.map=wood;material.color.set("#ffffff");}
  if(material.name==="Lamp")material.emissiveIntensity=lights ? .65 : 0;
  return {...b,material};
 }),[source,parts,wood,lights]);
 useEffect(()=>()=>{batches.forEach(b=>{b.geometry.dispose();b.material.dispose();});},[batches]);
 useEffect(()=>()=>wood.dispose(),[wood]);
 return <group>{batches.map((b,i)=><mesh key={i} geometry={b.geometry} material={b.material} castShadow={!b.material.transparent&&b.material.name!=="Lamp"} receiveShadow dispose={null}/>)}</group>;
}
