import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { traceMark, traceTime } from "../studio/frameTrace.ts";
import { Box3, Color, Fog, Frustum, Matrix4, Object3D, Vector3 } from "three";
import type { Camera, DirectionalLight, Group, HemisphereLight, MeshStandardMaterial, PointLight, Scene, Texture, WebGLRenderer } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { pinRenderedRoom } from "./assets/resources.ts";
import { ROOM_GLOW, roomEnvironment } from "./environment.ts";
import { CONNECTIONS, ROOM_LIST, ROOMS, passageAt, roomAt } from "./registry.ts";
import { STATIONS } from "./interactions/registry.ts";
import { roomVisible, travelSignal } from "./travelSignal.ts";
import type { RoomId, WorldSnapshot } from "./types.ts";
import type { MotionSamples } from "./settings.ts";
import type { ReactNode } from "react";
import type { ZoneId } from "@aura/contracts";
import { ArchitectureBatch, Block } from "./rooms/Architecture.tsx";

/** Hub station light colours (a focused station is lit softly in its own colour). */
const STATION_GLOW:Partial<Record<ZoneId,string>>={hardware:"#6fc3c0",software:"#8fb0f0","ai-lab":"#b3a4f0",github:"#9cc9a4",companion:"#9ad7df"};
type Mix={sky:Color;ground:Color;key:Color;fill:Color;background:Color;keyPower:number;fillPower:number;ambient:number;origin:Vector3};
const mixOf=(room:RoomId,preset:Parameters<typeof roomEnvironment>[1],curtains:number):Mix=>{const e=roomEnvironment(room,preset);const o=ROOMS[room].origin;
  return{sky:new Color(e.sky),ground:new Color(e.ground),key:new Color(e.key),fill:new Color(e.fill),background:new Color(e.background),keyPower:e.keyPower*(room==="living"?curtains:1),fillPower:e.fillPower,ambient:e.ambient,origin:new Vector3(o[0],0,o[2])};};
const addScaled=(into:Color,c:Color,w:number)=>{into.r+=c.r*w;into.g+=c.g*w;into.b+=c.b*w;};
/** How much each room's atmosphere applies at a camera position: one room, or a blend along a passage. */
export function atmosphereWeights(p:[number,number,number],loaded:readonly RoomId[],fallback:RoomId):[RoomId,number][]{
  const room=roomAt(p,loaded);if(room)return [[room,1]];
  const edge=passageAt(p);
  if(edge&&loaded.includes(edge.from)&&loaded.includes(edge.to)){
    const a=edge.fromPoint,b=edge.toPoint;const len=Math.hypot(b[0]-a[0],b[2]-a[2])||1;
    const t=Math.min(1,Math.max(0,((p[0]-a[0])*(b[0]-a[0])+(p[2]-a[2])*(b[2]-a[2]))/(len*len)));
    return [[edge.from,1-t],[edge.to,t]];
  }
  return [[fallback,1]];
}

/**
 * Lighting follows the camera, not the logical room: walking through a doorway blends one room's
 * sky, key light, background and fog into the next, so arrival never pops. One extra point light
 * (always present, so no shader recompiles) carries the destination's colour along a journey and
 * softly lights the focused Hub station when idle.
 */
/**
 * Room lamps (the Living floor lamp, the Gaming desk lights): lit while the camera rests in that room
 * with its lamps on. They share one light that is always in the scene, because a light mounting or
 * unmounting changes the scene's light count, which recompiles every lit material on the next frame.
 */
const LAMPS:Partial<Record<RoomId,{at:[number,number,number];color:string;on:(o:WorldSnapshot["options"])=>boolean}>>={
  living:{at:[-2.1,1.5,-1.9],color:"#ffd09b",on:o=>o.livingLights},
  gaming:{at:[2.6,1.45,2.3],color:"#a4b5e2",on:o=>o.gamingLights},
};
function Atmosphere({snapshot,reduced}:{snapshot:WorldSnapshot;reduced:boolean}){
  const {scene,camera}=useThree();
  const hemi=useRef<HemisphereLight>(null),key=useRef<DirectionalLight>(null),fill=useRef<DirectionalLight>(null),accent=useRef<PointLight>(null),practical=useRef<PointLight>(null);
  const keyTarget=useMemo(()=>new Object3D(),[]);
  const curtains=snapshot.options.curtainsOpen?1:.5;
  const palettes=useMemo(()=>Object.fromEntries(ROOM_LIST.map(r=>[r.id,mixOf(r.id,snapshot.settings.lightingPreset,curtains)])) as Record<RoomId,Mix>,[snapshot.settings.lightingPreset,curtains]);
  const state=useMemo(()=>{const first=palettes[snapshot.room];return{sky:first.sky.clone(),ground:first.ground.clone(),key:first.key.clone(),fill:first.fill.clone(),background:first.background.clone(),keyPower:first.keyPower,fillPower:first.fillPower,ambient:first.ambient,origin:first.origin.clone(),fog:new Fog(first.background.clone(),28,65),accentColor:new Color(),accentLevel:0,primed:false};},[]);// eslint-disable-line react-hooks/exhaustive-deps
  const latest=useRef(snapshot);latest.current=snapshot;
  const want=useMemo(()=>({sky:new Color(),ground:new Color(),key:new Color(),fill:new Color(),background:new Color(),origin:new Vector3(),forward:new Vector3(),glow:new Color()}),[]);
  useEffect(()=>{scene.background=state.background;scene.fog=state.fog;return()=>{scene.background=null;scene.fog=null;};},[scene,state]);
  useFrame((_,delta)=>{
    const snap=latest.current;const weights=atmosphereWeights(camera.position.toArray() as [number,number,number],snap.loaded,snap.room);
    want.sky.setRGB(0,0,0);want.ground.setRGB(0,0,0);want.key.setRGB(0,0,0);want.fill.setRGB(0,0,0);want.background.setRGB(0,0,0);want.origin.set(0,0,0);
    let keyPower=0,fillPower=0,ambient=0;
    for(const [room,w] of weights){const m=palettes[room];
      addScaled(want.sky,m.sky,w);addScaled(want.ground,m.ground,w);addScaled(want.key,m.key,w);addScaled(want.fill,m.fill,w);addScaled(want.background,m.background,w);
      want.origin.addScaledVector(m.origin,w);keyPower+=m.keyPower*w;fillPower+=m.fillPower*w;ambient+=m.ambient*w;}
    const k=state.primed?1-Math.exp(-6*Math.min(delta,.1)):1;state.primed=true;
    state.sky.lerp(want.sky,k);state.ground.lerp(want.ground,k);state.key.lerp(want.key,k);state.fill.lerp(want.fill,k);state.background.lerp(want.background,k);state.fog.color.copy(state.background);
    state.origin.lerp(want.origin,k);state.keyPower+=(keyPower-state.keyPower)*k;state.fillPower+=(fillPower-state.fillPower)*k;state.ambient+=(ambient-state.ambient)*k;
    const ceiling=ROOMS[snap.room].ceiling;
    if(hemi.current){hemi.current.color.copy(state.sky);hemi.current.groundColor.copy(state.ground);hemi.current.intensity=state.ambient;}
    if(key.current){key.current.color.copy(state.key);key.current.intensity=state.keyPower;key.current.position.set(state.origin.x-3,ceiling-.35,state.origin.z+1);}
    if(fill.current){fill.current.color.copy(state.fill);fill.current.intensity=state.fillPower;fill.current.position.set(state.origin.x+3,3,state.origin.z+3);}
    keyTarget.position.copy(state.origin);keyTarget.updateMatrixWorld();
    const lamp=LAMPS[snap.room],lit=!!lamp&&snap.phase==="idle"&&lamp.on(snap.options);
    if(practical.current){
      if(lamp){const o=ROOMS[snap.room].origin;practical.current.position.set(o[0]+lamp.at[0],lamp.at[1],o[2]+lamp.at[2]);practical.current.color.set(lamp.color);}
      practical.current.intensity=lit?4:0;
    }
    // Accent: the destination's colour just ahead of the camera on a walk between rooms; otherwise the focused Hub station.
    const light=accent.current;if(!light)return;
    let goal=0;
    if(!reduced&&travelSignal.destination&&(travelSignal.kind==="journey"||travelSignal.kind==="route"&&travelSignal.destination!==snap.room)){
      camera.getWorldDirection(want.forward);want.forward.y=0;want.forward.normalize();
      light.position.copy(camera.position).addScaledVector(want.forward,2.4);light.position.y=2.35;
      want.glow.set(ROOM_GLOW[travelSignal.destination]);goal=5.5*Math.sin(Math.PI*travelSignal.progress);
    }else if(snap.room==="project-hub"&&snap.phase==="idle"&&STATION_GLOW[snap.selectedZone]){
      const station=STATIONS.find(s=>s.id===snap.selectedZone);
      if(station)light.position.set(station.x,2.75,station.z-11+(station.z>0?-.2:.2));else light.position.set(0,2.75,-12.2);
      want.glow.set(STATION_GLOW[snap.selectedZone]!);goal=station?3.2:1.6;
    }
    const a=reduced?1:1-Math.exp(-5*Math.min(delta,.1));state.accentLevel+=(goal-state.accentLevel)*a;state.accentColor.lerp(want.glow,goal>0?a:0);
    light.color.copy(state.accentColor);light.intensity=state.accentLevel;
  });
  return <>
    <hemisphereLight ref={hemi}/>
    <primitive object={keyTarget}/>
    <directionalLight ref={key} target={keyTarget} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-.0008} shadow-normalBias={.018} shadow-radius={3}/>
    <directionalLight ref={fill} target={keyTarget}/>
    <pointLight ref={accent} intensity={0} distance={7} decay={1.6}/>
    <pointLight ref={practical} intensity={0} distance={5} decay={2}/>
  </>;
}

/**
 * Rooms are closed boxes joined only by doorways, so a loaded neighbour can only be seen through
 * the doorway between it and the camera's room. While the camera rests in a room, a neighbour
 * whose doorway is outside the view frustum is hidden (no draw calls, no shadow casting). During
 * travel, and in a passage, everything loaded stays visible.
 */
const doorwayBoxes=new Map<string,Box3>();
function doorwayBox(id:string){let box=doorwayBoxes.get(id);if(!box){const e=CONNECTIONS.find(c=>c.id===id)!;box=new Box3(new Vector3(e.floor.minX,0,e.floor.minZ),new Vector3(e.floor.maxX,2.9,e.floor.maxZ));doorwayBoxes.set(id,box);}return box;}
/**
 * A room that has just mounted stays hidden while the GPU work its first frame would otherwise do
 * at once is spread over the next few frames: shader programs are created at most one per frame,
 * then each is checked (the check waits for its compile and link) one per frame, then textures upload within a small
 * per-frame budget. It is revealed when that is done, or after WARM_CAP_MS whatever happens, so
 * a slow driver can never keep a room hidden. Geometry still uploads on the first visible frame.
 */
const WARM_CAP_MS=500;
const TEXTURE_KEYS=["map","normalMap","roughnessMap","metalnessMap","emissiveMap","aoMap","alphaMap"] as const;
type Warm={started:number;stage:"compile"|"link"|"textures"|"done";queue?:Object3D[];programs:{isReady:()=>boolean;getUniforms:()=>unknown}[];textures:Texture[]};
function warmStep(w:Warm,g:Group,gl:WebGLRenderer,camera:Camera,scene:Scene){
  if(w.stage==="compile"){
    // One object at a time, stopping once a frame has created a new program: the driver compiles
    // shaders in the GPU process, so creating every program at once stalls presentation for one long frame.
    if(!w.queue){w.queue=[];g.traverse(o=>{if((o as Object3D&{material?:unknown}).material)w.queue!.push(o);});}
    const before=gl.info.programs?.length??0;
    while(w.queue.length&&(gl.info.programs?.length??0)===before){
      for(const m of gl.compile(w.queue.shift()!,camera,scene)){
        const program=(gl.properties.get(m) as {currentProgram?:unknown}).currentProgram as Warm["programs"][number]|undefined;if(program&&!w.programs.includes(program))w.programs.push(program);
        for(const key of TEXTURE_KEYS){const t=(m as MeshStandardMaterial&{alphaMap?:Texture|null})[key];if(t&&!w.textures.includes(t))w.textures.push(t);}
      }
    }
    if(!w.queue.length)w.stage="link";return;
  }
  if(w.stage==="link"){
    // Without KHR_parallel_shader_compile every program reports ready and its first check blocks, so one per frame.
    const p=w.programs[0];if(p&&p.isReady()){p.getUniforms();w.programs.shift();}
    if(!w.programs.length)w.stage="textures";return;
  }
  if(w.stage==="textures"){const until=performance.now()+4;while(w.textures.length&&performance.now()<until)gl.initTexture(w.textures.shift()!);if(!w.textures.length)w.stage="done";}
}
function RoomAssetScope({room,children,snapshot}:{room:RoomId;children:ReactNode;snapshot:{current:WorldSnapshot}}){
  const group=useRef<Group>(null);const {gl,camera,scene}=useThree();
  const view=useMemo(()=>({frustum:new Frustum(),matrix:new Matrix4()}),[]);
  const warm=useRef<Warm|null>(null);
  // Before the first frame that could draw the room.
  useLayoutEffect(()=>{traceMark(`mount:${room}`);if(group.current)group.current.visible=false;roomVisible[room]=false;warm.current={started:performance.now(),stage:"compile",programs:[],textures:[]};
    return()=>{traceMark(`unmount:${room}`);warm.current=null;};},[room]);
  useFrame(()=>{
    const g=group.current;if(!g)return;const w=warm.current;
    if(w){
      if(w.stage!=="done"&&performance.now()-w.started<WARM_CAP_MS){g.visible=false;roomVisible[room]=false;traceTime(`warm:${w.stage}:${room}`,()=>warmStep(w,g,gl,camera,scene));return;}
      traceMark(w.stage==="done"?`reveal:${room}`:`reveal-capped:${room}`);warm.current=null;
    }
    const s=snapshot.current;
    const here=s.phase==="idle"?roomAt(camera.position.toArray() as [number,number,number],s.loaded):undefined;
    if(!here||here===room)g.visible=true;
    else{
      const edge=CONNECTIONS.find(e=>(e.from===here&&e.to===room)||(e.to===here&&e.from===room));
      if(!edge)g.visible=false;
      else{view.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);view.frustum.setFromProjectionMatrix(view.matrix);g.visible=view.frustum.intersectsBox(doorwayBox(edge.id));}
    }
    roomVisible[room]=g.visible;
  });
  useEffect(()=>()=>{delete roomVisible[room];},[room]);
  useEffect(()=>pinRenderedRoom(room),[room]);
  return <group ref={group}>{children}</group>;
}

export function WorldScene({snapshot,travel,openMap,children,act,active,reduced,motion}:{motion:MotionSamples;act:(id:string)=>void;active:boolean;reduced:boolean;snapshot:WorldSnapshot;travel:(id:RoomId)=>void;openMap:()=>void;children:ReactNode}){
  const latest=useRef(snapshot);latest.current=snapshot;traceMark("render:world");
  useLayoutEffect(()=>traceMark("commit:world"));
  return <>
    <Atmosphere snapshot={snapshot} reduced={reduced}/>
    {snapshot.loaded.map(id=>{const Shell=snapshot.modules[id]?.default;return Shell?<RoomAssetScope key={id} room={id} snapshot={latest}><Shell connected={snapshot.loaded} travel={travel} openMap={openMap} motion={motion} settings={snapshot.settings} options={snapshot.options} active={active&&id===snapshot.room} reduced={reduced} act={act}>{id==="project-hub"?children:null}</Shell></RoomAssetScope>:null;})}
    {CONNECTIONS.filter(e=>snapshot.loaded.includes(e.from)&&snapshot.loaded.includes(e.to)).map(e=>{
      const f=e.floor;return <ArchitectureBatch key={e.id}><group><Block at={[(f.minX+f.maxX)/2,-.08,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.16,f.maxZ-f.minZ]} color="#aaa89c"/>
        {e.fromPoint[0]===e.toPoint[0] ? <><Block at={[f.minX-.09,1.4,(f.minZ+f.maxZ)/2]} size={[.18,2.8,f.maxZ-f.minZ]} color="#a7ada7"/><Block at={[f.maxX+.09,1.4,(f.minZ+f.maxZ)/2]} size={[.18,2.8,f.maxZ-f.minZ]} color="#a7ada7"/></> : <><Block at={[(f.minX+f.maxX)/2,1.4,f.minZ-.09]} size={[f.maxX-f.minX,2.8,.18]} color="#a7ada7"/><Block at={[(f.minX+f.maxX)/2,1.4,f.maxZ+.09]} size={[f.maxX-f.minX,2.8,.18]} color="#a7ada7"/></>}
        <Block at={[(f.minX+f.maxX)/2,2.89,(f.minZ+f.maxZ)/2]} size={[f.maxX-f.minX,.18,f.maxZ-f.minZ]} color="#b6b8ac"/>
      </group></ArchitectureBatch>;
    })}
  </>;
}
