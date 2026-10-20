import type { RoomId } from "./types.ts";
import type { LightingPreset } from "./settings.ts";
type Environment={sky:string;ground:string;key:string;keyPower:number;fill:string;fillPower:number;ambient:number;background:string};
const PALETTES:Record<RoomId,{day:string;ground:string;accent:string}>= {
 "project-hub":{day:"#e5eef1",ground:"#94978a",accent:"#b7d3d2"},
 atrium:{day:"#e0edf7",ground:"#a6a08e",accent:"#a8bcd9"},
 living:{day:"#eee8d8",ground:"#ab8b72",accent:"#bbc8b1"},
 gaming:{day:"#d6e0f3",ground:"#6e788f",accent:"#9aafd6"},
};
export function roomEnvironment(room:RoomId,preset:LightingPreset):Environment{
 const palette=PALETTES[room];
 if(preset==="night")return{sky:palette.accent,ground:palette.ground,key:room==="gaming"?"#c0cbef":"#f4c68d",keyPower:1.1,fill:"#9bafd3",fillPower:.8,ambient:1.15,background:"#18283d"};
 if(preset==="sunset")return{sky:"#edc7a2",ground:palette.ground,key:"#ffd4a2",keyPower:1.9,fill:palette.accent,fillPower:1.1,ambient:1.65,background:"#ac9e99"};
 if(room==="project-hub"||room==="atrium")return{sky:"#bbd6ec",ground:"#465569",key:"#f5dfc4",keyPower:2.15,fill:"#91bfeb",fillPower:.8,ambient:1.35,background:"#122135"};
 return{sky:palette.day,ground:palette.ground,key:"#fff0d8",keyPower:1.75,fill:palette.accent,fillPower:1.15,ambient:1.95,background:"#cbd3d7"};
}

/** Practical light colour each room is known by: doorway strips, journey light, arrival glow. */
export const ROOM_GLOW:Record<RoomId,string>={"project-hub":"#7fd0cf",atrium:"#b4c8ee",living:"#f2c08a",gaming:"#a690ff"};
