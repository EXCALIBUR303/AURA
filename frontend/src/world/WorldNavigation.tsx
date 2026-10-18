import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Ref } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as Orbit } from "three-stdlib";
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { cameraPath, clearSegment, movePlayer, safePoint } from "./collision.ts";
import { roomAt, ROOMS, CONNECTIONS, worldGeometry } from "./registry.ts";
import type { CameraPose, Point, WorldSnapshot } from "./types.ts";
import type { WorldController } from "./WorldController.ts";
import type { Report } from "../studio/diagnostics.ts";
export type WorldCameraHandle={capture:()=>CameraPose|undefined};

export function WorldNavigation({controller,snapshot,reducedMotion,active,report,revision,cameraHandle}:{controller:WorldController;snapshot:WorldSnapshot;reducedMotion:boolean;active:boolean;report:Report;revision:number;cameraHandle?:Ref<WorldCameraHandle>}){
  const {camera,gl}=useThree();const orbit=useRef<Orbit>(null);const keys=useRef(new Set<string>());
  const latest=useRef({snapshot,active});latest.current={snapshot,active};
  const geometry=useMemo(()=>worldGeometry(snapshot.loaded),[snapshot.loaded]);
  const path=useRef<Point[]>([]),requestId=useRef(-1);const goal=useRef<CameraPose|null>(null);const settled=useRef(true);
  const safe=useRef<CameraPose>(controller.capture());const look=useRef(new Euler(0,0,0,"YXZ"));const direction=useRef(new Vector3());
  const point=useRef(new Vector3()),target=useRef(new Vector3());
  useImperativeHandle(cameraHandle,()=>({capture:()=>orbit.current?{position:camera.position.toArray(),target:orbit.current.target.toArray(),room:controller.getSnapshot().room}:undefined}),[camera,controller]);
  useEffect(()=>{
    if(snapshot.request)return;const pose=controller.capture();camera.position.fromArray(pose.position);orbit.current?.target.fromArray(pose.target);orbit.current?.update();
    if(snapshot.phase==="idle")report({cameraSettled:true,cameraSampledAt:Date.now(),camera:{position:camera.position.toArray(),target:pose.target,fov:camera instanceof PerspectiveCamera?camera.fov:undefined}});
  },[camera,controller,report]);
  useEffect(()=>{
    const request=snapshot.request;if(!request||requestId.current===request.id)return;requestId.current=request.id;keys.current.clear();gl.domElement.style.cursor="";
    if(document.pointerLockElement===gl.domElement)document.exitPointerLock();
    const destination=request.pose;goal.current=destination;
    const from=camera.position.toArray() as Point;
    const valid=safePoint(destination.position,geometry.floors,geometry.colliders,.12,false);
    // A map action may use explicit direct placement when a safe cinematic route is unavailable.
    path.current=valid?cameraPath(from,destination.position,geometry.floors,geometry.colliders):[];
    if(!valid){const landing=ROOMS[request.room].landing;goal.current={...destination,position:[...landing]};path.current=[];}
    if(reducedMotion||request.instant||!path.current.length){camera.position.fromArray(goal.current.position);target.current.fromArray(goal.current.target);orbit.current?.target.copy(target.current);if(orbit.current){orbit.current.enabled=false;orbit.current.update();}path.current=[];}
    settled.current=false;report({zone:snapshot.selectedZone,cameraRevision:revision,cameraSettled:false});
  },[snapshot.request,snapshot.loaded,snapshot.selectedZone,geometry,camera,controller,gl,report,revision,reducedMotion]);
  useEffect(()=>{if(snapshot.phase!=="idle")settled.current=false;report({world:{room:snapshot.room,mode:snapshot.mode,phase:snapshot.phase,loadedRooms:snapshot.loaded,pending:snapshot.pending},...(snapshot.phase!=="idle"?{cameraSettled:false}: {})});},[report,snapshot.room,snapshot.mode,snapshot.phase,snapshot.loaded,snapshot.pending]);
  useEffect(()=>{
    if(orbit.current)orbit.current.enabled=snapshot.mode==="inspect"&&snapshot.phase==="idle";
    if(snapshot.mode!=="explore"){keys.current.clear();if(document.pointerLockElement===gl.domElement)document.exitPointerLock();}else look.current.setFromQuaternion(camera.quaternion,"YXZ");
  },[snapshot.mode,snapshot.phase,camera,gl]);
  useEffect(()=>{
    const canvas=gl.domElement;const blocked=()=>!!document.querySelector("dialog[open]");
    const release=()=>{keys.current.clear();if(document.pointerLockElement===canvas)document.exitPointerLock();if(controller.getSnapshot().mode==="explore")controller.setMode("inspect");};
    const lock=()=>{keys.current.clear();if(document.pointerLockElement===canvas){const s=controller.getSnapshot();const g=worldGeometry(s.loaded);const p:Point=[camera.position.x,1.62,camera.position.z];look.current.setFromQuaternion(camera.quaternion,"YXZ");camera.position.fromArray(safePoint(p,g.floors,g.colliders)?p:ROOMS[s.room].landing);controller.setMode("explore");canvas.focus();}else if(controller.getSnapshot().mode==="explore")controller.setMode("inspect");};
    const down=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||blocked())return;
      if(e.key==="Escape"){
        if(latest.current.snapshot.phase==="preparing"||latest.current.snapshot.phase==="travelling"){e.preventDefault();controller.cancel();}
        else if(document.pointerLockElement===canvas){e.preventDefault();release();}return;
      }
      if(!latest.current.active||document.pointerLockElement!==canvas||e.altKey||e.metaKey||e.ctrlKey||e.isComposing)return;
      if(e.target instanceof HTMLElement&&(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)))return;
      if(e.code==="KeyE"&&!e.repeat){
        const room=controller.getSnapshot().room;
        const nearby=CONNECTIONS.filter(edge=>edge.from===room||edge.to===room).map(edge=>({edge,point:edge.from===room?edge.fromPoint:edge.toPoint})).sort((a,b)=>camera.position.distanceToSquared(point.current.fromArray(a.point))-camera.position.distanceToSquared(target.current.fromArray(b.point)))[0];
        if(nearby&&camera.position.distanceTo(point.current.fromArray(nearby.point))<=2.2){e.preventDefault();controller.openDoor(nearby.edge.from===room?nearby.edge.to:nearby.edge.from);}return;
      }
      if(["KeyW","KeyA","KeyS","KeyD"].includes(e.code)){e.preventDefault();keys.current.add(e.code);}
    };
    const up=(e:KeyboardEvent)=>{keys.current.delete(e.code);};
    const move=(e:MouseEvent)=>{if(document.pointerLockElement!==canvas||!latest.current.active||blocked())return;look.current.y-=e.movementX*.002;look.current.x=Math.max(-1.3,Math.min(1.3,look.current.x-e.movementY*.002));camera.quaternion.setFromEuler(look.current);};
    const visibility=()=>{if(document.hidden)release();};
    const focusIn=(event:FocusEvent)=>{if(document.pointerLockElement===canvas&&event.target!==canvas)release();};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",release);
    document.addEventListener("pointerlockchange",lock);document.addEventListener("mousemove",move);document.addEventListener("visibilitychange",visibility);document.addEventListener("focusin",focusIn);
    return()=>{release();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",release);document.removeEventListener("pointerlockchange",lock);document.removeEventListener("mousemove",move);document.removeEventListener("visibilitychange",visibility);document.removeEventListener("focusin",focusIn);};
  },[camera,controller,gl]);
  useEffect(()=>{if(!active){keys.current.clear();if(document.pointerLockElement===gl.domElement)document.exitPointerLock();}},[active,gl]);
  useFrame((_,delta)=>{
    const controls=orbit.current;if(!controls||gl.getContext().isContextLost()||!active){keys.current.clear();return;}
    const request=snapshot.request;
    if(request&&goal.current){
      controls.enabled=false;const next=path.current[0];
      if(next){point.current.fromArray(next);const distance=camera.position.distanceTo(point.current);const step=Math.min(distance,Math.min(delta,.05)*10);camera.position.addScaledVector(direction.current.copy(point.current).sub(camera.position).normalize(),step);if(distance<=step+.005)path.current.shift();}
      target.current.fromArray(goal.current.target);controls.target.lerp(target.current,reducedMotion?1:1-Math.exp(-9*Math.min(delta,.05)));camera.lookAt(controls.target);
      controller.updatePose({position:camera.position.toArray(),target:controls.target.toArray(),room:roomAt(camera.position.toArray(),snapshot.loaded)??snapshot.room});
      if(!path.current.length&&(reducedMotion||controls.target.distanceTo(target.current)<.015)){camera.position.fromArray(goal.current.position);controls.target.copy(target.current);controls.update();goal.current=null;controller.arrive(request.id);settled.current=true;safe.current={position:camera.position.toArray(),target:controls.target.toArray(),room:request.room};controller.updatePose(safe.current);report({cameraSettled:true,cameraRevision:revision,zone:snapshot.selectedZone,cameraSampledAt:Date.now(),camera:{position:camera.position.toArray(),target:controls.target.toArray(),fov:camera instanceof PerspectiveCamera?camera.fov:undefined}});}
      return;
    }
    if(snapshot.phase!=="idle"){controls.enabled=false;return;}
    if(snapshot.mode==="explore"){
      controls.enabled=false;
      if(active&&document.pointerLockElement===gl.domElement&&keys.current.size){
        if(document.querySelector("dialog[open]")||document.activeElement!==gl.domElement)keys.current.clear();
        const forward=Number(keys.current.has("KeyW"))-Number(keys.current.has("KeyS"));const side=Number(keys.current.has("KeyD"))-Number(keys.current.has("KeyA"));
        const norm=Math.hypot(forward,side)||1;const speed=2.2*Math.min(delta,.05)/norm;
        const dx=(-Math.sin(look.current.y)*forward+Math.cos(look.current.y)*side)*speed;
        const dz=(-Math.cos(look.current.y)*forward-Math.sin(look.current.y)*side)*speed;
        camera.position.fromArray(movePlayer(camera.position.toArray(),dx,dz,geometry.floors,geometry.colliders));
      }
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
  return <OrbitControls ref={orbit} makeDefault enablePan={false} enableDamping={!reducedMotion} minDistance={.65} maxDistance={7} minPolarAngle={.2} maxPolarAngle={1.65} rotateSpeed={.45} zoomSpeed={.6}/>;
}
