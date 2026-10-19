import { useEffect, useMemo } from "react";
import { Object3D } from "three";
import { pinRenderedRoom } from "./assets/resources.ts";
import { roomEnvironment } from "./environment.ts";
import { CONNECTIONS, ROOMS } from "./registry.ts";
import type { RoomId, WorldSnapshot } from "./types.ts";
import type { MotionSamples } from "./settings.ts";
import type { ReactNode } from "react";
import { ArchitectureBatch, Block } from "./rooms/Architecture.tsx";

function RoomAssetScope({room,children}:{room:RoomId;children:ReactNode}){useEffect(()=>pinRenderedRoom(room),[room]);return <group>{children}</group>;}

export function WorldScene({snapshot,travel,openMap,children,act,active,reduced,motion}:{motion:MotionSamples;act:(id:string)=>void;active:boolean;reduced:boolean;snapshot:WorldSnapshot;travel:(id:RoomId)=>void;openMap:()=>void;children:ReactNode}){
  const keyTarget=useMemo(()=>new Object3D(),[]);const room=ROOMS[snapshot.room];keyTarget.position.set(room.origin[0],0,room.origin[2]);
  const environment=roomEnvironment(snapshot.room,snapshot.settings.lightingPreset);
  const windowFactor=snapshot.room==="living"&&!snapshot.options.curtainsOpen ? .5 : 1;
  return <>
    <color attach="background" args={[environment.background]}/><fog attach="fog" args={[environment.background,28,65]}/>
    <hemisphereLight args={[environment.sky,environment.ground,environment.ambient]}/>
    <primitive object={keyTarget}/>
    <directionalLight position={[room.origin[0]-3,room.ceiling-.35,room.origin[2]+1]} target={keyTarget} color={environment.key} intensity={environment.keyPower*windowFactor} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-.0008} shadow-normalBias={.018} shadow-radius={3}/>
    <directionalLight position={[room.origin[0]+3,3,room.origin[2]+3]} target={keyTarget} intensity={environment.fillPower} color={environment.fill}/>
    {snapshot.loaded.map(id=>{const Shell=snapshot.modules[id]?.default;return Shell?<RoomAssetScope key={id} room={id}><Shell connected={snapshot.loaded} travel={travel} openMap={openMap} motion={motion} settings={snapshot.settings} options={snapshot.options} active={active&&id===snapshot.room} reduced={reduced} act={act}>{id==="project-hub"?children:null}</Shell></RoomAssetScope>:null;})}
    {CONNECTIONS.filter(e=>snapshot.loaded.includes(e.from)&&snapshot.loaded.includes(e.to)).map(e=>{
      const f=e.floor;return <ArchitectureBatch key={e.id}><group><Block at={[(f.minX+f.maxX)/2,-.08,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.16,f.maxZ-f.minZ]} color="#aaa89c"/>
        {e.fromPoint[0]===e.toPoint[0] ? <><Block at={[f.minX-.09,1.4,(f.minZ+f.maxZ)/2]} size={[.18,2.8,f.maxZ-f.minZ]} color="#a7ada7"/><Block at={[f.maxX+.09,1.4,(f.minZ+f.maxZ)/2]} size={[.18,2.8,f.maxZ-f.minZ]} color="#a7ada7"/></> : <><Block at={[(f.minX+f.maxX)/2,1.4,f.minZ-.09]} size={[f.maxX-f.minX,2.8,.18]} color="#a7ada7"/><Block at={[(f.minX+f.maxX)/2,1.4,f.maxZ+.09]} size={[f.maxX-f.minX,2.8,.18]} color="#a7ada7"/></>}
        <Block at={[(f.minX+f.maxX)/2,2.89,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.18,f.maxZ-f.minZ]} color="#b6b8ac"/>
      </group></ArchitectureBatch>;
    })}
  </>;
}
