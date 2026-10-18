import type { RoomId } from "./types.ts";
import type { LightingPreset } from "./settings.ts";
type Environment={sky:string;ground:string;key:string;keyPower:number;fill:string;fillPower:number;ambient:number;background:string};
const PALETTES:Record<RoomId,{day:string;ground:string;accent:string}>= {
 "project-hub":{day:"#e5eef1",ground:"#756450",accent:"#b7d3d2"},
 atrium:{day:"#e0edf7",ground:"#8c795f",accent:"#a8bcd9"},
 living:{day:"#eee8d8",ground:"#886547",accent:"#bbc8b1"},
 gaming:{day:"#d6e0f3",ground:"#524960",accent:"#9aafd6"},
};
export function roomEnvironment(room:RoomId,preset:LightingPreset):Environment{
 const palette=PALETTES[room];
 if(preset==="night")return{sky:palette.accent,ground:palette.ground,key:room==="gaming"?"#c0cbef":"#f4c68d",keyPower:1.45,fill:"#9bafd3",fillPower:.5,ambient:.65,background:"#18283d"};
 if(preset==="sunset")return{sky:"#edc7a2",ground:palette.ground,key:"#ffd4a2",keyPower:2.8,fill:palette.accent,fillPower:.8,ambient:1.05,background:"#ac9e99"};
 return{sky:palette.day,ground:palette.ground,key:"#fff0d8",keyPower:3,fill:palette.accent,fillPower:1.2,ambient:1.3,background:"#cbd3d7"};
}
