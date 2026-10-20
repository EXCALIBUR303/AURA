import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Ref } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as Orbit } from "three-stdlib";
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { cameraPath, clearSegment, doorwayPath, movePlayer, passagesFor, safePoint } from "./collision.ts";
import { planTravel } from "./cinematic.ts";
import type { TravelPlan } from "./cinematic.ts";
import { connectionFor, roomAt, ROOMS, CONNECTIONS, worldGeometry } from "./registry.ts";
import type { CameraPose, Point, WorldSnapshot } from "./types.ts";
import type { WorldController } from "./WorldController.ts";
import { travelSignal } from "./travelSignal.ts";
import type { Report } from "../studio/diagnostics.ts";
export type WorldCameraHandle={capture:()=>CameraPose|undefined};

export function WorldNavigation({controller,snapshot,reducedMotion,active,report,revision,cameraHandle}:{controller:WorldController;snapshot:WorldSnapshot;reducedMotion:boolean;active:boolean;report:Report;revision:number;cameraHandle?:Ref<WorldCameraHandle>}){
  const {camera,gl}=useThree();const orbit=useRef<Orbit>(null);const keys=useRef(new Set<string>());
  const latest=useRef({snapshot,active});latest.current={snapshot,active};
  const geometry=useMemo(()=>worldGeometry(snapshot.loaded,snapshot.options,snapshot.inspectionZone),[snapshot.loaded,snapshot.options.chairSlot,snapshot.inspectionZone]);
  const requestId=useRef(-1);const goal=useRef<CameraPose|null>(null);const settled=useRef(true);
  const plan=useRef<TravelPlan|null>(null),elapsed=useRef(0),velocity=useRef(new Vector3()),veil=useRef<HTMLDivElement|null>(null),veilValue=useRef(0);
  const setVeil=(value:number)=>{const v=Math.round(value*100)/100;if(v===veilValue.current)return;veilValue.current=v;if(veil.current)veil.current.style.opacity=String(v);};
  const safe=useRef<CameraPose>(controller.capture());const look=useRef(new Euler(0,0,0,"YXZ"));const direction=useRef(new Vector3());
  const point=useRef(new Vector3()),target=useRef(new Vector3());
  const releaseInput=useRef<()=>void>(()=>{});
  /** Zoom limits apply to the zone that is active after arrival; set them before controls resume so they never clamp the arrival pose. */
  const applyLimits=(zone:"hardware"|undefined)=>{const o=orbit.current;if(o){o.minDistance=zone?0.16:0.65;o.maxDistance=zone?1.3:7;}};
  useImperativeHandle(cameraHandle,()=>({capture:()=>orbit.current?{position:camera.position.toArray(),target:orbit.current.target.toArray(),room:controller.getSnapshot().room}:undefined}),[camera,controller]);
  useEffect(()=>{
    if(snapshot.request)return;const pose=controller.capture();camera.position.fromArray(pose.position);orbit.current?.target.fromArray(pose.target);orbit.current?.update();
    if(snapshot.phase==="idle")report({cameraSettled:true,cameraSampledAt:Date.now(),camera:{position:camera.position.toArray(),target:pose.target,fov:camera instanceof PerspectiveCamera?camera.fov:undefined}});
  },[camera,controller,report]);
  useEffect(()=>{
    const request=snapshot.request;if(!request||requestId.current===request.id)return;
    if(plan.current)report({travel:{kind:plan.current.kind,plannedMs:Math.round(plan.current.duration*1000),elapsedMs:Math.round(elapsed.current*1000),outcome:"replaced"}});
    requestId.current=request.id;keys.current.clear();velocity.current.set(0,0,0);gl.domElement.style.cursor="";
    if(document.pointerLockElement===gl.domElement)document.exitPointerLock();
    const from=camera.position.toArray() as Point;
    const valid=safePoint(request.pose.position,geometry.floors,geometry.colliders,.12,false);
    // An unsafe requested pose falls back to the room's landing, framed by the bridge transition.
    const destination:CameraPose=valid?request.pose:{...request.pose,position:[...ROOMS[request.room].landing]};goal.current=destination;
    // Only rooms joined by a passage have a walkway; others use the depart/veil/arrive bridge.
    // Rooms joined by a passage, or by a room in between (a journey), are walked; anything else uses the depart/veil/arrive bridge.
    const source=roomAt(from,snapshot.loaded);const walkway=valid&&(!source||source===request.room||!!connectionFor(source,request.room)||!!request.via&&snapshot.loaded.includes(request.via));
    // Between rooms, walk through the middle of each doorway; within a room, the grid route.
    const rooms=!source||source===request.room?[]:connectionFor(source,request.room)?[source,request.room]:request.via?[source,request.via,request.room]:[];
    const route:Point[]=walkway&&rooms.length?doorwayPath(from,destination.position,rooms,geometry.floors,geometry.colliders):[];
    // Through the passages' centres the view is held along each passage; a grid fallback route keeps the plain walk.
    const doors=route.length?passagesFor(rooms):[];
    if(walkway&&!route.length)route.push(...cameraPath(from,destination.position,geometry.floors,geometry.colliders));
    plan.current=planTravel({from:{position:from,target:(orbit.current?.target.toArray()??destination.target) as Point},to:destination,route,geometry,reduced:reducedMotion,instant:!!request.instant,carryVeil:veilValue.current,journey:!!request.via&&!!source&&source!==request.room&&!connectionFor(source,request.room),doors});elapsed.current=0;
    travelSignal.destination=request.room;travelSignal.via=request.via??null;travelSignal.kind=plan.current.kind;travelSignal.progress=0;
    if(orbit.current)orbit.current.enabled=false;
    if(plan.current.kind==="cut"){setVeil(0);applyLimits(controller.zoneAfterArrival());camera.position.fromArray(destination.position);target.current.fromArray(destination.target);orbit.current?.target.copy(target.current);orbit.current?.update();}
    settled.current=false;report({zone:snapshot.selectedZone,cameraRevision:revision,cameraSettled:false,travel:{kind:plan.current.kind,plannedMs:Math.round(plan.current.duration*1000)}});
  },[snapshot.request,snapshot.loaded,snapshot.selectedZone,geometry,camera,controller,gl,report,revision,reducedMotion]);
  useEffect(()=>{if(snapshot.phase!=="idle")settled.current=false;report({world:{room:snapshot.room,mode:snapshot.mode,phase:snapshot.phase,loadedRooms:snapshot.loaded,pending:snapshot.pending,loadTiming:snapshot.loadTiming},...(snapshot.phase!=="idle"?{cameraSettled:false}: {})});},[report,snapshot.room,snapshot.mode,snapshot.phase,snapshot.loaded,snapshot.pending,snapshot.loadTiming]);
  // Finish already-authorized travel even when native throttling stops frame callbacks.
  // The destination is loaded and collision-checked above; no time delta is replayed on restore.
  useEffect(()=>{
    const request=snapshot.request,controls=orbit.current,destination=goal.current;
    if(active||!request||!controls||!destination)return;
    keys.current.clear();velocity.current.set(0,0,0);setVeil(0);
    if(plan.current)report({travel:{kind:plan.current.kind,plannedMs:Math.round(plan.current.duration*1000),elapsedMs:Math.round(elapsed.current*1000),outcome:"settled-inactive"}});
    plan.current=null;controls.enabled=false;applyLimits(controller.zoneAfterArrival());
    camera.position.fromArray(destination.position);controls.target.fromArray(destination.target);controls.update();
    safe.current={...destination,room:request.room};goal.current=null;travelSignal.destination=null;travelSignal.via=null;travelSignal.kind=null;
    controller.arrive(request.id);controller.updatePose(safe.current);settled.current=true;
    report({cameraSettled:true,cameraRevision:revision,cameraSampledAt:Date.now(),camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera instanceof PerspectiveCamera?camera.fov:undefined}});
  },[active,snapshot.request,camera,controller,report,revision]);
  // A DOM veil over the canvas only (HUD and panels stay readable); opacity is driven per frame without React renders.
  useEffect(()=>{const host=gl.domElement.parentElement;if(!host)return;const element=document.createElement("div");element.className="travel-veil";element.setAttribute("aria-hidden","true");element.style.opacity=String(veilValue.current);host.appendChild(element);veil.current=element;return()=>{element.remove();veil.current=null;};},[gl]);
  const previousMode=useRef(snapshot.mode);
  useEffect(()=>{
    if(orbit.current)orbit.current.enabled=active&&snapshot.mode==="inspect"&&snapshot.phase==="idle";
    if(snapshot.mode!=="explore"){
      keys.current.clear();if(document.pointerLockElement===gl.domElement)document.exitPointerLock();
    }else if(previousMode.current!=="explore"){
      const p:Point=[camera.position.x,1.62,camera.position.z];
      camera.position.fromArray(safePoint(p,geometry.floors,geometry.colliders)?p:ROOMS[snapshot.room].landing);
      look.current.setFromQuaternion(camera.quaternion,"YXZ");
    }
    previousMode.current=snapshot.mode;
  },[snapshot.mode,snapshot.phase,snapshot.room,geometry,camera,gl,active]);
  useEffect(()=>{
    const canvas=gl.domElement;const blocked=()=>!!document.querySelector("dialog[open]");
    let drag:{id:number;x:number;y:number;distance:number}|undefined;
    let dragged=false;
    const stopInput=()=>{
      keys.current.clear();velocity.current.set(0,0,0);
      if(drag)dragged=true; // A cancelled press must not become a portal/equipment click.
      if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
      drag=undefined;
      if(document.pointerLockElement===canvas)document.exitPointerLock();
    };
    releaseInput.current=stopInput;
    const canLook=()=>latest.current.active&&controller.getSnapshot().mode==="explore"&&controller.getSnapshot().phase==="idle"&&!blocked();
    const turn=(x:number,y:number)=>{const k=.002*latest.current.snapshot.lookSensitivity;look.current.y-=x*k;look.current.x=Math.max(-1.3,Math.min(1.3,look.current.x-y*k));camera.quaternion.setFromEuler(look.current);};
    const lock=()=>{keys.current.clear();if(document.pointerLockElement===canvas){if(!canLook()){document.exitPointerLock();return;}canvas.focus({preventScroll:true});}};
    const down=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||blocked())return;
      if(e.key==="Escape"){
        if(latest.current.snapshot.phase==="preparing"||latest.current.snapshot.phase==="travelling"){e.preventDefault();controller.cancel();}
        else if(controller.getSnapshot().mode==="explore"){e.preventDefault();stopInput();controller.setMode("inspect");}return;
      }
      // Enter or Space skips to the arrival framing when nothing else on the page wants the key.
      if((e.key==="Enter"||e.key===" ")&&controller.getSnapshot().phase==="travelling"&&(document.activeElement===canvas||document.activeElement===document.body)){e.preventDefault();controller.skip();return;}
      if(!canLook()||document.activeElement!==canvas||e.altKey||e.metaKey||e.ctrlKey||e.isComposing)return;
      if(e.code==="KeyE"&&!e.repeat){
        const room=controller.getSnapshot().room;
        const nearby=CONNECTIONS.filter(edge=>edge.from===room||edge.to===room).map(edge=>({edge,point:edge.from===room?edge.fromPoint:edge.toPoint})).sort((a,b)=>camera.position.distanceToSquared(point.current.fromArray(a.point))-camera.position.distanceToSquared(target.current.fromArray(b.point)))[0];
        if(nearby&&camera.position.distanceTo(point.current.fromArray(nearby.point))<=2.2){e.preventDefault();controller.openDoor(nearby.edge.from===room?nearby.edge.to:nearby.edge.from);}return;
      }
      if(["KeyW","KeyA","KeyS","KeyD","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","ShiftLeft","ShiftRight"].includes(e.code)){e.preventDefault();keys.current.add(e.code);}
    };
    const up=(e:KeyboardEvent)=>{keys.current.delete(e.code);};
    const pointerDown=(e:PointerEvent)=>{
      dragged=false;if(e.button!==0||!canLook())return;
      canvas.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};canvas.setPointerCapture(e.pointerId);
    };
    const pointerMove=(e:PointerEvent)=>{
      if(!drag||e.pointerId!==drag.id||document.pointerLockElement===canvas||!canLook())return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.distance+=Math.hypot(dx,dy);
      if(drag.distance>4){dragged=true;turn(dx,dy);}
    };
    const pointerUp=(e:PointerEvent)=>{if(drag?.id!==e.pointerId)return;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);drag=undefined;};
    // A look gesture must never activate an equipment/portal click at its end.
    const click=(e:MouseEvent)=>{if(dragged){e.preventDefault();e.stopImmediatePropagation();dragged=false;}};
    const move=(e:MouseEvent)=>{if(document.pointerLockElement===canvas&&canLook())turn(e.movementX,e.movementY);};
    const visibility=()=>{if(document.hidden)stopInput();};
    const focusIn=(event:FocusEvent)=>{if(event.target!==canvas)stopInput();};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",stopInput);
    canvas.addEventListener("pointerdown",pointerDown);window.addEventListener("pointermove",pointerMove);window.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",stopInput);canvas.addEventListener("click",click,true);
    document.addEventListener("pointerlockchange",lock);document.addEventListener("mousemove",move);document.addEventListener("visibilitychange",visibility);document.addEventListener("focusin",focusIn);
    return()=>{stopInput();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",stopInput);
      canvas.removeEventListener("pointerdown",pointerDown);window.removeEventListener("pointermove",pointerMove);window.removeEventListener("pointerup",pointerUp);canvas.removeEventListener("pointercancel",stopInput);canvas.removeEventListener("click",click,true);
      document.removeEventListener("pointerlockchange",lock);document.removeEventListener("mousemove",move);document.removeEventListener("visibilitychange",visibility);document.removeEventListener("focusin",focusIn);};
  },[camera,controller,gl]);
  useEffect(()=>{if(!active)releaseInput.current();},[active]);
  useFrame((_,delta)=>{
    const controls=orbit.current;if(!controls||gl.getContext().isContextLost()||!active){keys.current.clear();return;}
    const request=snapshot.request;
    if(request&&goal.current&&plan.current){
      controls.enabled=false;const travel=plan.current;
      const skipped=snapshot.skip===request.id&&elapsed.current<travel.duration;
      // Real time, capped at 1/30 s per frame: a room-mount hitch slows the move for one frame instead of jumping along the path.
      const shown=elapsed.current;elapsed.current=skipped?travel.duration:elapsed.current+Math.min(delta,1/30);
      const sample=travel.sample(elapsed.current);travelSignal.progress=travel.duration?Math.min(1,elapsed.current/travel.duration):1;
      camera.position.fromArray(sample.position);controls.target.fromArray(sample.target);camera.lookAt(controls.target);setVeil(sample.veil);
      controller.updatePose({position:sample.position,target:sample.target,room:roomAt(sample.position,snapshot.loaded)??snapshot.room});
      if(elapsed.current>=travel.duration){
        const destination=goal.current;applyLimits(controller.zoneAfterArrival());camera.position.fromArray(destination.position);controls.target.fromArray(destination.target);controls.update();setVeil(0);
        goal.current=null;plan.current=null;const previousRoom=controller.getSnapshot().room;controller.arrive(request.id);settled.current=true;
        if(request.room!==previousRoom||travel.kind==="journey"){travelSignal.arrivedAt=performance.now();travelSignal.arrivedRoom=request.room;}travelSignal.destination=null;travelSignal.via=null;travelSignal.kind=null;safe.current={position:camera.position.toArray(),target:controls.target.toArray(),room:request.room};controller.updatePose(safe.current);
        report({cameraSettled:true,cameraRevision:revision,zone:snapshot.selectedZone,cameraSampledAt:Date.now(),travel:{kind:travel.kind,plannedMs:Math.round(travel.duration*1000),elapsedMs:Math.round((skipped?shown:elapsed.current)*1000),outcome:skipped?"skipped":"arrived"},camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera instanceof PerspectiveCamera?camera.fov:undefined}});
      }
      return;
    }
    if(snapshot.phase!=="idle"){controls.enabled=false;return;}
    if(snapshot.mode==="explore"){
      controls.enabled=false;
      const dt=Math.min(delta,.05),v=velocity.current;
      if(keys.current.size&&(document.querySelector("dialog[open]")||document.activeElement!==gl.domElement))keys.current.clear();
      if(keys.current.size){
        const turnSpeed=dt*1.1*snapshot.lookSensitivity;
        look.current.y+=(Number(keys.current.has("ArrowLeft"))-Number(keys.current.has("ArrowRight")))*turnSpeed;
        look.current.x=Math.max(-1.3,Math.min(1.3,look.current.x+(Number(keys.current.has("ArrowUp"))-Number(keys.current.has("ArrowDown")))*turnSpeed));
        camera.quaternion.setFromEuler(look.current);
      }
      // Eased walking: velocity approaches the wanted speed (and zero on release) instead of starting or stopping dead.
      const forward=Number(keys.current.has("KeyW"))-Number(keys.current.has("KeyS"));const side=Number(keys.current.has("KeyD"))-Number(keys.current.has("KeyA"));
      const norm=Math.hypot(forward,side)||1;const speed=2.2*(keys.current.has("ShiftLeft")||keys.current.has("ShiftRight")?1.7:1)/norm;
      const blend=1-Math.exp(-14*dt);
      v.x+=((-Math.sin(look.current.y)*forward+Math.cos(look.current.y)*side)*speed-v.x)*blend;
      v.z+=((-Math.cos(look.current.y)*forward-Math.sin(look.current.y)*side)*speed-v.z)*blend;
      if(!forward&&!side&&Math.hypot(v.x,v.z)<.03)v.set(0,0,0);
      if(v.x||v.z)camera.position.fromArray(movePlayer(camera.position.toArray(),v.x*dt,v.z*dt,geometry.floors,geometry.colliders));
      camera.getWorldDirection(direction.current);controls.target.copy(camera.position).add(direction.current);
      const room=roomAt(camera.position.toArray(),snapshot.loaded);if(room)controller.enter(room);
    }else{
      const pos=camera.position.toArray();const ceiling=ROOMS[snapshot.room].ceiling;
      const previous=safe.current.position;
      const valid=(p:Point)=>p[1]>=.3&&p[1]<=ceiling-.16&&safePoint(p,geometry.floors,geometry.colliders,.12,false)&&clearSegment(previous,p,geometry.floors,geometry.colliders);
      if(!valid(pos)){
        let low=0,high=1;
        for(let i=0;i<12;i++){const t=(low+high)/2;const p=previous.map((v,j)=>v+(pos[j]!-v)*t) as Point;if(valid(p))low=t;else high=t;}
        camera.position.fromArray(previous.map((v,j)=>v+(pos[j]!-v)*low) as Point);controls.target.fromArray(safe.current.target);camera.lookAt(controls.target);
      }
      controls.enabled=active;
    }
    safe.current={position:camera.position.toArray(),target:controls.target.toArray(),room:snapshot.room};controller.updatePose(safe.current);
    if(!settled.current){settled.current=true;report({cameraSettled:true});}
  });
  return <OrbitControls ref={orbit} makeDefault enablePan={false} enableDamping={!reducedMotion} minDistance={snapshot.inspectionZone && !snapshot.request ? 0.16 : 0.65} maxDistance={snapshot.inspectionZone && !snapshot.request ? 1.3 : 7} minPolarAngle={.2} maxPolarAngle={1.65} rotateSpeed={.45} zoomSpeed={.6}/>;
}
