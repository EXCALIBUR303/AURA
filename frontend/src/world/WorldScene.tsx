import { useMemo } from "react";
import { Object3D } from "three";
import { CONNECTIONS, ROOMS } from "./registry.ts";
import type { RoomId, WorldSnapshot } from "./types.ts";
import type { ReactNode } from "react";
import { ArchitectureBatch, Block } from "./rooms/Architecture.tsx";

export function WorldScene({snapshot,travel,openMap,children}:{snapshot:WorldSnapshot;travel:(id:RoomId)=>void;openMap:()=>void;children:ReactNode}){
  const keyTarget=useMemo(()=>new Object3D(),[]);const room=ROOMS[snapshot.room];keyTarget.position.set(room.origin[0],0,room.origin[2]);
  return <>
    <color attach="background" args={["#cbd3d7"]}/><fog attach="fog" args={["#cbd3d7",28,65]}/>
    <hemisphereLight args={["#edf3ff","#746958",1.3]}/>
    <primitive object={keyTarget}/>
    <directionalLight position={[room.origin[0]-3,7,room.origin[2]-2]} target={keyTarget} color="#fff0d8" intensity={3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-.0008}/>
    <directionalLight position={[room.origin[0]+3,3,room.origin[2]+3]} target={keyTarget} intensity={1.2} color="#d6e4f0"/>
    {snapshot.loaded.map(id=>{const Shell=snapshot.modules[id]?.default;return Shell?<Shell key={id} connected={snapshot.loaded} travel={travel} openMap={openMap}>{id==="project-hub"?children:null}</Shell>:null;})}
    {CONNECTIONS.filter(e=>snapshot.loaded.includes(e.from)&&snapshot.loaded.includes(e.to)).map(e=>{
      const f=e.floor;return <ArchitectureBatch key={e.id}><group><Block at={[(f.minX+f.maxX)/2,-.08,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.16,f.maxZ-f.minZ]} color="#aaa89c"/>
        <Block at={[f.minX-.09,1.5,(f.minZ+f.maxZ)/2]} size={[.18,3,f.maxZ-f.minZ]} color="#a7ada7"/><Block at={[f.maxX+.09,1.5,(f.minZ+f.maxZ)/2]} size={[.18,3,f.maxZ-f.minZ]} color="#a7ada7"/>
        <Block at={[(f.minX+f.maxX)/2,3.09,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.18,f.maxZ-f.minZ]} color="#b6b8ac"/>
      </group></ArchitectureBatch>;
    })}
  </>;
}
