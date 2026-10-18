import type { ZoneId } from "@aura/contracts";
import { ROOMS, zonePose } from "./registry.ts";
import { safeLanding } from "./collision.ts";
import type { CameraMode, CameraPose, RoomId, RoomModule, WorldSnapshot } from "./types.ts";

export class WorldController {
  private snapshot:WorldSnapshot={room:"project-hub",mode:"inspect",phase:"preparing",modules:{},loaded:[],selectedZone:"studio"};
  private listeners=new Set<()=>void>();
  private generation=0;
  private pendingLoads=new Map<RoomId,Promise<RoomModule>>();
  private lastPose:CameraPose={...zonePose("studio")};
  private retryRequest:{room:RoomId;pose:CameraPose;kind:"workspace"|"travel"|"door"} | undefined;
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
  private async request(room:RoomId,pose:CameraPose,kind:"travel"|"workspace"|"door"){
    const definition=ROOMS[room];
    if(definition.availability!=="available"){this.patch({error:definition.reason});return;}
    const id=++this.generation;this.retryRequest={room,pose,kind};
    this.patch({phase:"preparing",pending:room,error:undefined,request:undefined,mode:kind==="door"?this.snapshot.mode:"cinematic"});
    try{
      const module=await this.load(room);if(id!==this.generation)return;
      // Only current + destination room instances are retained; shared Astra lives above these modules.
      const keep=[...new Set([this.snapshot.room,room])].filter(r=>r===room||this.snapshot.modules[r]);
      const modules:Partial<Record<RoomId,RoomModule>>={};for(const r of keep)modules[r]=r===room?module:this.snapshot.modules[r];
      if(kind==="door")this.patch({phase:"idle",pending:undefined,error:undefined,loaded:keep,modules,request:undefined});
      else this.patch({phase:"travelling",loaded:keep,modules,request:{id,room,pose:{...pose,room},kind}});
    }catch{
      if(id!==this.generation)return;
      this.patch({phase:"error",pending:undefined,request:undefined,mode:"inspect",error:`${definition.title} could not load. Your current room and tools are still available.`});
    }
  }
  travel=(room:RoomId)=>{if(room===this.snapshot.room&&this.snapshot.phase==="idle")return;void this.request(room,ROOMS[room].introduction,"travel");};
  openDoor=(room:RoomId)=>{if(this.snapshot.phase!=="idle"||this.snapshot.loaded.includes(room))return;void this.request(room,this.capture(),"door");};
  clearIssue=()=>this.patch({error:undefined});
  focusWorkspace=(zone:ZoneId,restore?:CameraPose|null)=>{
    this.patch({selectedZone:zone});const room=restore?.room&&ROOMS[restore.room].availability==="available"?restore.room:"project-hub";
    void this.request(room,restore??zonePose(zone),"workspace");
  };
  retry=()=>{const r=this.retryRequest;if(r)void this.request(r.room,r.pose,r.kind);};
  arrive=(id:number)=>{const request=this.snapshot.request;if(!request||request.id!==id)return;this.lastPose=request.pose;this.patch({room:request.room,pending:undefined,phase:"idle",mode:"inspect",request:undefined,error:undefined});};
  updatePose=(pose:CameraPose)=>{this.lastPose={position:[...pose.position],target:[...pose.target],room:pose.room??this.snapshot.room};};
  capture=():CameraPose=>({...this.lastPose,position:[...this.lastPose.position],target:[...this.lastPose.target]});
  setMode=(mode:CameraMode)=>{if(mode==="cinematic"||this.snapshot.phase!=="idle"&&!(mode==="inspect"&&this.snapshot.phase==="preparing"&&this.retryRequest?.kind==="door"))return;this.patch({mode,error:undefined});};
  enter=(room:RoomId)=>{if(this.snapshot.loaded.includes(room)&&room!==this.snapshot.room)this.patch({room});};
  cancel=()=>{
    ++this.generation;
    if(!this.snapshot.loaded.length){this.patch({phase:"error",mode:"inspect",pending:undefined,request:undefined,error:"World startup was cancelled. Choose Retry room to load the studio."});return;}
    const safe=safeLanding(this.lastPose.position,this.snapshot.loaded);
    const pose:CameraPose={position:safe.position,target:[safe.position[0],1.62,safe.position[2]-1],room:safe.room};this.lastPose=pose;
    this.patch({phase:"travelling",mode:"cinematic",room:safe.room,pending:undefined,error:undefined,request:{id:this.generation,room:safe.room,pose,kind:"restore",instant:true}});
  };
  suspend=()=>{++this.generation;this.pendingLoads.clear();};
}
