export type RoomOptions={livingLights:boolean;gamingLights:boolean;curtainsOpen:boolean;livingPalette:"forest"|"terracotta";chairSlot:"reading"|"conversation"};
export const DEFAULT_ROOM_OPTIONS:RoomOptions={livingLights:true,gamingLights:true,curtainsOpen:true,livingPalette:"forest",chairSlot:"reading"};
export function roomOptionsPatch(current:RoomOptions,patch:Partial<RoomOptions>):RoomOptions{
 const next={...current};
 for(const key of ["livingLights","gamingLights","curtainsOpen"] as const)if(typeof patch[key]==="boolean")next[key]=patch[key];
 if(patch.livingPalette==="forest"||patch.livingPalette==="terracotta")next.livingPalette=patch.livingPalette;
 if(patch.chairSlot==="reading"||patch.chairSlot==="conversation")next.chairSlot=patch.chairSlot;
 return next;
}

export type LightingPreset="daylight"|"sunset"|"night";
export type PresentationMode="static"|"floating"|"hybrid";
export type WorldSettings={schemaVersion:1;presentation:PresentationMode;floatIntensity:number;lightingPreset:LightingPreset;reduceMotion:boolean};
export const DEFAULT_WORLD_SETTINGS:WorldSettings={schemaVersion:1,presentation:"static",floatIntensity:.35,lightingPreset:"daylight",reduceMotion:false};
export function worldSettingsPatch(current:WorldSettings,patch:Partial<WorldSettings>):WorldSettings{
 const next={...current};
 if(patch.schemaVersion!==undefined&&patch.schemaVersion!==1)return next;
 if(patch.presentation==="static"||patch.presentation==="floating"||patch.presentation==="hybrid")next.presentation=patch.presentation;
 if(typeof patch.floatIntensity==="number"&&Number.isFinite(patch.floatIntensity))next.floatIntensity=Math.min(1,Math.max(0,patch.floatIntensity));
 if(patch.lightingPreset==="daylight"||patch.lightingPreset==="sunset"||patch.lightingPreset==="night")next.lightingPreset=patch.lightingPreset;
 if(typeof patch.reduceMotion==="boolean")next.reduceMotion=patch.reduceMotion;
 return next;
}
/** Stable eligibility: screens only. Architecture/furniture/colliders are not motion targets. */
export function displayLift(settings:WorldSettings,id:string,time:number,reduced:boolean){
 if(reduced||settings.presentation==="static"||settings.presentation==="hybrid"&&!["ai-lab","github","gaming"].includes(id))return 0;
 return settings.floatIntensity*(.10+.018*Math.sin(time*.65+(id==="github"?1.2:0)));
}
export type MotionSamples={fanAngle:number;displayLifts:Record<string,number>};
