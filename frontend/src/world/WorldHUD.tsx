import { useEffect, useRef, useState } from "react";
import { Modal, UiIcon } from "../components/ui.tsx";
import { RoomPortal } from "../spatial/RoomPortal.tsx";
import { CONNECTIONS, ROOM_LIST, ROOMS } from "./registry.ts";
import { travelSignal } from "./travelSignal.ts";
import { getZone } from "../studio/zones.ts";
import type { RoomId } from "./types.ts";
import type { WorldController } from "./WorldController.ts";
import type { WorldSnapshot } from "./types.ts";

/** Progress line for the running camera move, written per animation frame (no React renders). */
function JourneyProgress(){
  const bar=useRef<HTMLSpanElement>(null);
  useEffect(()=>{let frame=0;const tick=()=>{if(bar.current)bar.current.style.transform=`scaleX(${travelSignal.progress.toFixed(3)})`;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[]);
  return <span className="journey-track" aria-hidden="true"><span ref={bar}/></span>;
}
/** A short establishing title when the camera enters a different room (travel or walking through a door). */
function ArrivalTitle({room,phase}:{room:RoomId;phase:string}){
  const [arrival,setArrival]=useState<{room:RoomId;n:number}|null>(null);const previous=useRef(room);const count=useRef(0);
  useEffect(()=>{if(room===previous.current)return;previous.current=room;if(phase!=="idle")return;setArrival({room,n:++count.current});},[room,phase]);
  // The hide timer belongs to each arrival, so a later phase change (the next trip starting) cannot cancel it.
  useEffect(()=>{if(!arrival)return;const timer=window.setTimeout(()=>setArrival(current=>current===arrival?null:current),2600);return()=>window.clearTimeout(timer);},[arrival]);
  if(!arrival)return null;const shown=arrival.room;const r=ROOMS[shown];
  return <div className="arrival-title" key={arrival.n} style={{["--room-accent" as string]:r.accent}} aria-hidden="true"><span>{shown==="project-hub"?"CREATE":shown==="atrium"?"CONNECT":shown==="living"?"UNWIND":"PLAY"}</span><strong>{r.title}</strong><small>{r.description}</small></div>;
}
/** In Free Explore, name the doorway the camera is standing at and what E does there. */
function usePassagePrompt(controller:WorldController,enabled:boolean){
  const [prompt,setPrompt]=useState<string|null>(null);
  useEffect(()=>{if(!enabled){setPrompt(null);return;}
    const timer=window.setInterval(()=>{const s=controller.getSnapshot();const p=controller.capture().position;
      const near=CONNECTIONS.filter(e=>e.from===s.room||e.to===s.room).map(e=>{const mine=e.from===s.room;const at=mine?e.fromPoint:e.toPoint;return{other:mine?e.to:e.from,d:Math.hypot(p[0]-at[0],p[2]-at[2])};}).sort((a,b)=>a.d-b.d)[0];
      const next=near&&near.d<=2.2?(s.loaded.includes(near.other)?`Walk through to ${ROOMS[near.other].title}`:`E · Open the doorway to ${ROOMS[near.other].title}`):null;
      setPrompt(current=>current===next?current:next);},250);
    return()=>window.clearInterval(timer);},[controller,enabled]);
  return prompt;
}

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
  const passage=usePassagePrompt(controller,snapshot.mode==="explore"&&snapshot.phase==="idle");
  const destination=snapshot.request?.room??snapshot.pending??snapshot.room;
  const travelling=snapshot.phase==="travelling"&&!snapshot.error;
  return <>
    <nav className="world-hud" aria-label="World navigation">
      <button onClick={()=>{intent.current++;if(document.pointerLockElement)document.exitPointerLock();setMapOpen(true);}} aria-haspopup="dialog"><span aria-hidden="true">⌘</span> World map</button>
      <span className="world-room-name">{ROOMS[snapshot.room].title}</span><span className="world-hud-divider"/>
      <button aria-pressed={snapshot.mode==="inspect"} disabled={busy} onClick={stopExplore}>Inspect</button>
      <button aria-pressed={snapshot.mode==="explore"} disabled={snapshot.phase!=="idle"} onClick={explore}>Free Explore</button>
      <button aria-label="World settings" title="World settings" onClick={openSettings}><UiIcon name="settings"/></button>
      {snapshot.mode==="explore"&&<button onClick={()=>void capture()}>Capture pointer</button>}
    </nav>
    {snapshot.mode==="explore"&&<div className="explore-hint" role="status">{passage?<strong>{passage}</strong>:null}{passage?" · ":""}Drag to look · WASD to walk · Arrow keys to look · E opens passage · Esc exits</div>}
    {travelling&&!lockIssue&&<div className="journey-bar" role="status" aria-live="polite" data-kind={snapshot.request?.via?"journey":undefined}>
      <span className="journey-copy">{destination!==snapshot.room?<><small>{snapshot.request?.via?`Through the ${ROOMS[snapshot.request.via].title}`:"Travelling to"}</small><strong>{ROOMS[destination].title}</strong></>
        :<><small>Within {ROOMS[destination].title}</small><strong>{snapshot.request?.kind==="workspace"?getZone(snapshot.selectedZone).label:"Framing the view"}</strong></>}</span>
      <JourneyProgress/>
      <button onClick={controller.skip} title="Skip to arrival · Enter">Skip</button><button onClick={controller.cancel} title="Stop here · Esc">Cancel travel</button>
    </div>}
    <ArrivalTitle room={snapshot.room} phase={snapshot.phase}/>
    {(snapshot.phase==="preparing"||snapshot.error||lockIssue)&&<div className="world-feedback" role="status" aria-live="polite">
      <span>{snapshot.error??lockIssue??`${snapshot.phase==="preparing"?"Preparing":"Travelling to"} ${ROOMS[snapshot.pending??snapshot.room].title}…`}</span>
      {snapshot.phase==="preparing"&&<small>Loading local models and textures. The first visit can take a few seconds.</small>}
      {snapshot.phase==="error"&&<button onClick={controller.retry}>Retry room</button>}
      {snapshot.phase==="preparing"&&<button onClick={controller.cancel}>Cancel travel</button>}
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
