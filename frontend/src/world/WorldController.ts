import { DEFAULT_ROOM_OPTIONS, roomOptionsPatch, DEFAULT_WORLD_SETTINGS, worldSettingsPatch } from "./settings.ts";
import type { RoomOptions, WorldSettings } from "./settings.ts";
import type { ZoneId } from "@aura/contracts";
import { ROOMS, zonePose, connectionFor, worldGeometry } from "./registry.ts";
import { safeLanding, safePoint } from "./collision.ts";
import type { CameraMode, CameraPose, RoomId, RoomModule, WorldSnapshot } from "./types.ts";

/** Frontend intents for a future adapter to the host-owned Preferences.world contract.
 * Restore/sync does not emit user changes; room intents only follow settled travel/passage. */
export type WorldUserChange={type:"settings";value:WorldSettings}|{type:"camera";value:"inspect"|"explore"}|{type:"room";value:RoomId};
export class WorldController {
  private snapshot:WorldSnapshot={settings:{...DEFAULT_WORLD_SETTINGS},options:{...DEFAULT_ROOM_OPTIONS},room:"project-hub",mode:"inspect",phase:"preparing",modules:{},loaded:[],selectedZone:"studio",lookSensitivity:1};
  private listeners=new Set<()=>void>();
  private generation=0;
  private userListeners=new Set<(change:WorldUserChange)=>void>();
  subscribeUserChanges=(listener:(change:WorldUserChange)=>void)=>{this.userListeners.add(listener);return()=>{this.userListeners.delete(listener);};};
  private userChange(change:WorldUserChange){this.userListeners.forEach(listener=>listener(change));}
  private pendingLoads=new Map<RoomId,Promise<RoomModule>>();
  private lastPose:CameraPose={...zonePose("studio")};
  private retryRequest:{room:RoomId;pose:CameraPose;kind:"workspace"|"travel"|"door"|"restore";arrivalMode:"inspect"|"explore"} | undefined;
  constructor(privateLoader?:(id:RoomId)=>Promise<RoomModule>){this.loader=privateLoader??(id=>ROOMS[id].load!());}
  private loader:(id:RoomId)=>Promise<RoomModule>;
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private patch(patch:Partial<WorldSnapshot>){this.snapshot={...this.snapshot,...patch};this.listeners.forEach(fn=>fn());}
  private async load(id:RoomId){
    const ready=this.snapshot.modules[id];if(ready)return ready;
    let promise=this.pendingLoads.get(id);
    if(!promise){promise=this.loader(id);this.pendingLoads.set(id,promise);}
    try{return await promise;}finally{if(this.pendingLoads.get(id)===promise)this.pendingLoads.delete(id);}
  }
  private async request(room:RoomId,pose:CameraPose,kind:"travel"|"workspace"|"door"|"restore",arrivalMode:"inspect"|"explore"="inspect"){
    const definition=ROOMS[room];
    if(definition.availability!=="available"){this.patch({error:definition.reason});return;}
    const id=++this.generation;this.retryRequest={room,pose,kind,arrivalMode};
    this.patch({loadTiming:{room,startedAt:performance.now()},phase:"preparing",pending:room,error:undefined,request:undefined,skip:undefined,mode:kind==="door"?this.snapshot.mode:"cinematic"});
    try{
      const module=await this.load(room);if(id!==this.generation)return;
      // At most two room instances: the destination and the room being left. A room that is not
      // connected to the destination is released on arrival (see arrive), after the cinematic veil.
      const keep=[...new Set([this.snapshot.room,room])].filter(r=>r===room||!!this.snapshot.modules[r]&&(kind!=="door"||!!connectionFor(r,room)));
      const modules:Partial<Record<RoomId,RoomModule>>={};for(const r of keep)modules[r]=r===room?module:this.snapshot.modules[r];
      const loadTiming={...this.snapshot.loadTiming!,readyMs:Math.round(performance.now()-this.snapshot.loadTiming!.startedAt)};
      if(kind==="door")this.patch({loadTiming,phase:"idle",pending:undefined,error:undefined,loaded:keep,modules,request:undefined});
      else this.patch({loadTiming,phase:"travelling",loaded:keep,modules,request:{id,room,pose:{...pose,room},kind,arrivalMode,instant:kind==="restore"}});
    }catch{
      if(id!==this.generation)return;
      this.patch({phase:"error",pending:undefined,request:undefined,mode:"inspect",error:`${definition.title} could not load. Your current room and tools are still available.`});
    }
  }
  travel=(room:RoomId)=>{if(room===this.snapshot.room&&this.snapshot.phase==="idle")return;void this.request(room,ROOMS[room].introduction,"travel");};
  openDoor=(room:RoomId)=>{if(this.snapshot.phase!=="idle"||this.snapshot.loaded.includes(room))return;void this.request(room,this.capture(),"door");};
  setRoomOptions=(patch:Partial<RoomOptions>)=>{const options=roomOptionsPatch(this.snapshot.options,patch);
    if(options.chairSlot!==this.snapshot.options.chairSlot&&this.snapshot.room==="living"){const geometry=worldGeometry(this.snapshot.loaded,options);if(!safePoint(this.lastPose.position,geometry.floors,geometry.colliders)){this.patch({error:"Move away from the chair before changing its position."});return;}}
    this.patch({options,error:undefined});
  };
  setWorldSettings=(patch:Partial<WorldSettings>)=>{
    const settings=worldSettingsPatch(this.snapshot.settings,patch);
    if(JSON.stringify(settings)===JSON.stringify(this.snapshot.settings))return;
    this.patch({settings});this.userChange({type:"settings",value:settings});
  };
  /** Adapter calls this only after checking the native schema version. No bridge casts/storage. */
  restoreWorld=(settings:WorldSettings,room:string,mode:"inspect"|"explore")=>{
    if(settings.schemaVersion!==1)return false;
    const available=Object.values(ROOMS).find(r=>r.id===room&&r.availability==="available")?.id??"project-hub";
    this.patch({settings:worldSettingsPatch(this.snapshot.settings,settings)});
    void this.request(available,ROOMS[available].introduction,"restore",mode);return true;
  };
  clearIssue=()=>this.patch({error:undefined});
  /** Finish the current cinematic travel at its arrival pose. Cancel (Escape) instead stops at a safe landing. */
  skip=()=>{const request=this.snapshot.request;if(this.snapshot.phase==="travelling"&&request&&this.snapshot.skip!==request.id)this.patch({skip:request.id});};
  setLookSensitivity=(value:number)=>{if(!Number.isFinite(value))return;const next=Math.round(Math.min(2,Math.max(.4,value))*10)/10;if(next!==this.snapshot.lookSensitivity)this.patch({lookSensitivity:next});};
  focusWorkspace=(zone:ZoneId,restore?:CameraPose|null)=>{
    this.patch({selectedZone:zone});const room=restore?.room&&ROOMS[restore.room].availability==="available"?restore.room:"project-hub";
    void this.request(room,restore??zonePose(zone),"workspace");
  };
  private clearZoneOnArrive=false;
  /** Frames a pose in the current room. `zone` opens close inspection of a desk object; a later inspect without it (the exit) keeps that allowance until the camera has arrived. */
  inspect=(pose:CameraPose,zone?:"hardware")=>{
    if(zone){this.clearZoneOnArrive=false;if(this.snapshot.inspectionZone!==zone)this.patch({inspectionZone:zone});}
    else if(this.snapshot.inspectionZone)this.clearZoneOnArrive=true;
    void this.request(pose.room??this.snapshot.room,pose,"travel");
  };
  retry=()=>{const r=this.retryRequest;if(r)void this.request(r.room,r.pose,r.kind,r.arrivalMode);};
  arrive=(id:number)=>{const request=this.snapshot.request;if(!request||request.id!==id)return;const previousRoom=this.snapshot.room;this.lastPose=request.pose;
    const loaded=this.snapshot.loaded.filter(r=>r===request.room||!!connectionFor(r,request.room));const modules:Partial<Record<RoomId,RoomModule>>={};for(const r of loaded)modules[r]=this.snapshot.modules[r];
    if(this.clearZoneOnArrive){this.clearZoneOnArrive=false;this.snapshot={...this.snapshot,inspectionZone:undefined};}
    this.patch({loaded,modules,skip:undefined,room:request.room,pending:undefined,phase:"idle",mode:request.arrivalMode??"inspect",request:undefined,error:undefined,loadTiming:this.snapshot.loadTiming?{...this.snapshot.loadTiming,settledMs:Math.round(performance.now()-this.snapshot.loadTiming.startedAt)}:undefined});
    if(request.kind!=="restore"&&request.room!==previousRoom)this.userChange({type:"room",value:request.room});
  };
  updatePose=(pose:CameraPose)=>{this.lastPose={position:[...pose.position],target:[...pose.target],room:pose.room??this.snapshot.room};};
  capture=():CameraPose=>({...this.lastPose,position:[...this.lastPose.position],target:[...this.lastPose.target]});
  setMode=(mode:CameraMode)=>{if(mode==="cinematic"||this.snapshot.phase!=="idle"&&!(mode==="inspect"&&this.snapshot.phase==="preparing"&&this.retryRequest?.kind==="door"))return;if(mode===this.snapshot.mode)return;this.patch({mode,error:undefined});this.userChange({type:"camera",value:mode});};
  enter=(room:RoomId)=>{if(this.snapshot.phase==="idle"&&this.snapshot.loaded.includes(room)&&room!==this.snapshot.room){this.patch({room});this.userChange({type:"room",value:room});}};
  cancel=()=>{
    ++this.generation;
    if(!this.snapshot.loaded.length){this.patch({phase:"error",mode:"inspect",pending:undefined,request:undefined,error:"World startup was cancelled. Choose Retry room to load the studio."});return;}
    const safe=safeLanding(this.lastPose.position,this.snapshot.loaded);
    const pose:CameraPose={position:safe.position,target:[safe.position[0],1.62,safe.position[2]-1],room:safe.room};this.lastPose=pose;
    this.patch({phase:"travelling",mode:"cinematic",room:safe.room,pending:undefined,error:undefined,request:{id:this.generation,room:safe.room,pose,kind:"restore",instant:true}});
  };
  suspend=()=>{++this.generation;this.pendingLoads.clear();};
}
