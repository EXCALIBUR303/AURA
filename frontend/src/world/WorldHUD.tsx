import { useEffect, useRef, useState } from "react";
import { Modal, UiIcon } from "../components/ui.tsx";
import { RoomPortal } from "../spatial/RoomPortal.tsx";
import { ROOM_LIST, ROOMS } from "./registry.ts";
import type { WorldController } from "./WorldController.ts";
import type { WorldSnapshot } from "./types.ts";

export function WorldHUD({controller,snapshot,mapOpen,setMapOpen,openSettings}:{openSettings:()=>void;controller:WorldController;snapshot:WorldSnapshot;mapOpen:boolean;setMapOpen:(open:boolean)=>void}){
  const [lockIssue,setLockIssue]=useState<string|null>(null);const intent=useRef(0);
  useEffect(()=>{
    const changed=()=>{if(document.pointerLockElement)setLockIssue(null);};
    const failed=()=>setLockIssue("Pointer capture is unavailable. Drag to look and WASD remain available.");
    document.addEventListener("pointerlockchange",changed);document.addEventListener("pointerlockerror",failed);
    return()=>{intent.current++;document.removeEventListener("pointerlockchange",changed);document.removeEventListener("pointerlockerror",failed);};
  },[]);
  const travel=(room:typeof snapshot.room)=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();setMapOpen(false);controller.travel(room);};
  const capture=async()=>{
    const request=++intent.current;const canvas=document.querySelector<HTMLCanvasElement>(".scene-canvas canvas");
    if(!canvas?.requestPointerLock){setLockIssue("Pointer capture is unavailable. Drag to look and WASD remain available.");return;}
    setLockIssue(null);
    try{await canvas.requestPointerLock();if(request!==intent.current||document.querySelector("dialog[open]")){if(document.pointerLockElement===canvas)document.exitPointerLock();return;}}
    catch{if(request===intent.current)setLockIssue("Pointer capture is unavailable. Drag to look and WASD remain available.");}
  };
  const explore=()=>{setLockIssue(null);controller.setMode("explore");document.querySelector<HTMLCanvasElement>(".scene-canvas canvas")?.focus({preventScroll:true});};
  const stopExplore=()=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();controller.setMode("inspect");};
  const busy=snapshot.phase==="preparing"||snapshot.phase==="travelling";
  return <>
    <nav className="world-hud" aria-label="World navigation">
      <button onClick={()=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();setMapOpen(true);}} aria-haspopup="dialog"><span aria-hidden="true">⌘</span> World map</button>
      <span className="world-room-name">{ROOMS[snapshot.room].title}</span><span className="world-hud-divider"/>
      <button aria-pressed={snapshot.mode==="inspect"} disabled={busy} onClick={stopExplore}>Inspect</button>
      <button aria-pressed={snapshot.mode==="explore"} disabled={snapshot.phase!=="idle"} onClick={explore}>Free Explore</button>
      <button aria-label="World settings" title="World settings" onClick={openSettings}><UiIcon name="settings"/></button>
      {snapshot.mode==="explore"&&<button onClick={()=>void capture()}>Capture pointer</button>}
    </nav>
    {snapshot.mode==="explore"&&<div className="explore-hint" role="status">Drag to look · WASD to walk · Arrow keys to look · E opens passage · Esc exits</div>}
    {(busy||snapshot.error||lockIssue)&&<div className="world-feedback" role="status" aria-live="polite">
      <span>{snapshot.error??lockIssue??`${snapshot.phase==="preparing"?"Preparing":"Travelling to"} ${ROOMS[snapshot.pending??snapshot.room].title}…`}</span>
      {snapshot.phase==="preparing"&&<small>Loading local models and textures. The first visit can take a few seconds.</small>}
      {snapshot.phase==="error"&&<button onClick={controller.retry}>Retry room</button>}
      {snapshot.phase==="travelling"&&<button onClick={controller.skip} title="Skip to arrival · Enter">Skip</button>}{busy&&<button onClick={controller.cancel}>Cancel travel</button>}
      {(lockIssue||snapshot.error)&&<button onClick={()=>{setLockIssue(null);controller.clearIssue();}}>Dismiss</button>}
    </div>}
    {mapOpen&&<Modal title="Your AURA world" subtitle="ASTRA / SPATIAL NAVIGATION" close={()=>setMapOpen(false)} wide>
      <div className="ui-dialog-body spatial-room-selector">
        <div className="spatial-map-intro"><p>One universe.<br /><strong>Four places to be.</strong></p><span>Choose a space. Your project and conversation stay with you.</span></div>
        <div className="world-room-list">{ROOM_LIST.map((room,index)=><article key={room.id} data-room={room.id} data-current={room.id===snapshot.room}>
          <div className="room-portal-heading"><span className="room-coordinate">0{index+1} / {room.id==="project-hub"?"CREATE":room.id==="atrium"?"CONNECT":room.id==="living"?"UNWIND":"PLAY"}</span>{room.id===snapshot.room&&<span className="world-current">You are here</span>}</div>
          <RoomPortal room={room.id}/>
          <div className="room-portal-copy"><h3>{room.id==="atrium"?"Central Hub":room.id==="living"?"Living Space":room.id==="gaming"?"Gaming Space":room.title}</h3><p>{room.id==="project-hub"?"Ideas into systems. Hardware, software, AI and your GitHub projects.":room.id==="atrium"?"The architectural heart of AURA. A passage to every space.":room.description}</p></div>
          <button data-initial-focus={index===0&&room.id!==snapshot.room||index===1&&snapshot.room==="project-hub"||undefined} disabled={room.availability!=="available"||room.id===snapshot.room&&snapshot.phase==="idle"} onClick={()=>travel(room.id)}><span>{room.availability==="planned"?"Planned":room.id===snapshot.room?"Here":"Visit"}</span><span className="portal-arrow"><UiIcon name="arrow"/></span></button>
        </article>)}</div>
        <p className="spatial-map-footnote">Room illustrations · Use the doors for continuous exploration. Developer shortcuts ⌘1–6 remain available.</p>
      </div>
    </Modal>}

  </>;
}
