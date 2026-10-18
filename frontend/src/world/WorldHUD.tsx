import { useEffect, useRef, useState } from "react";
import { Modal, UiIcon } from "../components/ui.tsx";
import { ROOM_LIST, ROOMS } from "./registry.ts";
import type { WorldController } from "./WorldController.ts";
import type { WorldSnapshot } from "./types.ts";

export function WorldHUD({controller,snapshot,mapOpen,setMapOpen,openSettings}:{openSettings:()=>void;controller:WorldController;snapshot:WorldSnapshot;mapOpen:boolean;setMapOpen:(open:boolean)=>void}){
  const [lockIssue,setLockIssue]=useState<string|null>(null);const intent=useRef(0);
  useEffect(()=>{
    const changed=()=>{if(document.pointerLockElement)setLockIssue(null);};
    const failed=()=>setLockIssue("Mouse capture was not granted. Room map and Inspect remain available.");
    document.addEventListener("pointerlockchange",changed);document.addEventListener("pointerlockerror",failed);
    return()=>{intent.current++;document.removeEventListener("pointerlockchange",changed);document.removeEventListener("pointerlockerror",failed);};
  },[]);
  const travel=(room:typeof snapshot.room)=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();setMapOpen(false);controller.travel(room);};
  const explore=async()=>{
    const request=++intent.current;const canvas=document.querySelector<HTMLCanvasElement>(".scene-canvas canvas");
    if(!canvas?.requestPointerLock){setLockIssue("Mouse capture is unavailable in this host. Use the room map and Inspect controls.");return;}
    setLockIssue(null);
    try{await canvas.requestPointerLock();if(request!==intent.current||document.querySelector("dialog[open]")){if(document.pointerLockElement===canvas)document.exitPointerLock();return;}}
    catch{if(request===intent.current)setLockIssue("Mouse capture was not granted. Room map and Inspect remain available.");}
  };
  const stopExplore=()=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();controller.setMode("inspect");};
  const busy=snapshot.phase==="preparing"||snapshot.phase==="travelling";
  return <>
    <nav className="world-hud" aria-label="World navigation">
      <button onClick={()=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();setMapOpen(true);}} aria-haspopup="dialog"><span aria-hidden="true">⌘</span> World map</button>
      <span className="world-room-name">{ROOMS[snapshot.room].title}</span><span className="world-hud-divider"/>
      <button aria-pressed={snapshot.mode==="inspect"} disabled={busy} onClick={stopExplore}>Inspect</button>
      <button aria-pressed={snapshot.mode==="explore"} disabled={snapshot.phase!=="idle"} onClick={()=>void explore()}>Free Explore</button>
      <button aria-label="World settings" title="World settings" onClick={openSettings}><UiIcon name="settings"/></button>
      {snapshot.mode==="explore"&&<button onClick={stopExplore}>Exit · Esc</button>}
    </nav>
    {snapshot.mode==="explore"&&<div className="explore-hint" role="status">W A S D to walk · mouse to look · E opens a nearby passage · Esc to release</div>}
    {(busy||snapshot.error||lockIssue)&&<div className="world-feedback" role="status" aria-live="polite">
      <span>{snapshot.error??lockIssue??`${snapshot.phase==="preparing"?"Preparing":"Travelling to"} ${ROOMS[snapshot.pending??snapshot.room].title}…`}</span>
      {snapshot.phase==="error"&&<button onClick={controller.retry}>Retry room</button>}
      {busy&&<button onClick={controller.cancel}>Cancel travel</button>}
      {(lockIssue||snapshot.error)&&<button onClick={()=>{setLockIssue(null);controller.clearIssue();}}>Dismiss</button>}
    </div>}
    {mapOpen&&<Modal title="Your AURA world" subtitle="CONNECTED SPACES" close={()=>setMapOpen(false)} wide>
      <div className="ui-dialog-body world-map-body"><p className="help">Three destinations connected by a central atrium. Room travel keeps your current project and conversation. Map visits use camera travel where a loaded route is available, or direct placement. Walk through the atrium for continuous exploration.</p>
        <div className="world-map-diagram" aria-hidden="true"><span className="map-hub">Project Hub</span><span className="map-atrium">Atrium</span><span className="map-living">Living</span><span className="map-gaming">Gaming</span></div>
        <div className="world-room-list">{ROOM_LIST.map(room=><article key={room.id} data-room={room.id}><div><h3>{room.title}{room.id===snapshot.room&&<span className="world-current">Current room</span>}</h3><p>{room.description}</p>{room.availability==="planned"&&<p className="help">{room.reason}</p>}</div><button data-initial-focus={room.availability==="available"&&room.id!==snapshot.room||undefined} disabled={room.availability!=="available"||room.id===snapshot.room&&snapshot.phase==="idle"} onClick={()=>travel(room.id)}>{room.availability==="planned"?"Planned":room.id===snapshot.room?"Here":"Visit"}</button></article>)}</div>
        <p className="help">World navigation is session-only. Existing developer workspace shortcuts ⌘1–6 remain available. Future expansion is reserved; no playable games are installed.</p>
      </div>
    </Modal>}
  </>;
}
