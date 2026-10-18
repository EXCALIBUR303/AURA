export type RoomOptions={livingLights:boolean;gamingLights:boolean;curtainsOpen:boolean;livingPalette:"forest"|"terracotta"};
export const DEFAULT_ROOM_OPTIONS:RoomOptions={livingLights:true,gamingLights:true,curtainsOpen:true,livingPalette:"forest"};
export function roomOptionsPatch(current:RoomOptions,patch:Partial<RoomOptions>):RoomOptions{
 const next={...current};
 for(const key of ["livingLights","gamingLights","curtainsOpen"] as const)if(typeof patch[key]==="boolean")next[key]=patch[key];
 if(patch.livingPalette==="forest"||patch.livingPalette==="terracotta")next.livingPalette=patch.livingPalette;
 return next;
}
