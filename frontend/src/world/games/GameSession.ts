import type { CameraPose } from "../types.ts";
import type { GameDefinition, GameRuntime } from "./registry.ts";
export type GameSnapshot={phase:"idle"|"preparing"|"loading"|"running"|"paused"|"exiting"|"error";id?:string;error?:string};
type Host={prepareInput:()=>Promise<boolean>;capture:()=>CameraPose;restore:(pose:CameraPose)=>void};
/** Future installed games share one exclusive lifecycle; catalogue-only entries never reach it. */
export class GameSession{
 private view:GameSnapshot={phase:"idle"};private listeners=new Set<()=>void>();private generation=0;
 private abort:AbortController|undefined;private runtime:GameRuntime|undefined;private saved:CameraPose|undefined;
 private host:Host;
 constructor(host:Host){this.host=host;}
 getSnapshot=()=>this.view;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private update(view:GameSnapshot){this.view=view;this.listeners.forEach(fn=>fn());}
 start=async(game:GameDefinition,container:HTMLElement)=>{
  if(game.availability!=="installed"||!game.load||!["idle","error"].includes(this.view.phase))return;
  const id=++this.generation;this.abort=new AbortController();this.saved=this.host.capture();this.update({phase:"preparing",id:game.id});
  try{
   if(!await this.host.prepareInput())throw Error("Astra input or audio could not be released. Close the library and review voice controls before retrying.");
   if(id!==this.generation)return;
   if(typeof document!=="undefined"&&document.pointerLockElement)document.exitPointerLock();
   this.update({phase:"loading",id:game.id});const module=await game.load();if(id!==this.generation)return;
   const runtime=await module.mount(container,{signal:this.abort.signal});if(id!==this.generation){await runtime.dispose();return;}
   this.runtime=runtime;this.update({phase:"running",id:game.id});container.focus();
  }catch{if(id===this.generation){this.abort.abort();if(this.runtime){try{await this.runtime.dispose();}catch{/* Release world input even if a third-party runtime fails. */}this.runtime=undefined;}this.update({phase:"error",id:game.id,error:"The game could not start safely. Your world and conversation are preserved. Close the library to review input, or retry."});}}
 };
 pause=()=>{if(this.view.phase!=="running")return;try{this.runtime?.pause();this.update({...this.view,phase:"paused"});}catch{void this.exit();}};
 resume=()=>{if(this.view.phase!=="paused")return;try{this.runtime?.resume();this.update({...this.view,phase:"running"});}catch{void this.exit();}};
 exit=async(restore=true)=>{
  ++this.generation;this.abort?.abort();const runtime=this.runtime;this.runtime=undefined;const saved=this.saved;this.saved=undefined;
  if(this.view.phase==="idle")return;this.update({phase:"exiting",id:this.view.id});
  try{await runtime?.dispose();}catch{/* World restoration remains mandatory. */}
  this.update({phase:"idle"});if(saved&&restore)this.host.restore(saved);
 };
}
