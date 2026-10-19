import { IconButton } from "../../components/ui.tsx";
import type { RoomId } from "../types.ts";
import { ROOM_OBJECTS } from "./registry.ts";
import type { RoomOptions } from "../settings.ts";
export function RoomPanel({room,options,change,selected,select,openGames,close}:{room:RoomId;options:RoomOptions;change:(patch:Partial<RoomOptions>)=>void;selected:string|null;select:(id:string)=>void;openGames:()=>void;close:()=>void}){
 const living=room==="living";const object=selected?ROOM_OBJECTS[selected as keyof typeof ROOM_OBJECTS]:undefined;
 return <aside className="equipment-panel room-controls" aria-label="Room controls" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();close();}}}>
  <header><div><span className="eyebrow">{living?"PERSONAL LIVING":"GAMING"} / ATMOSPHERE</span><h2>Make yourself at home.</h2></div><IconButton name="close" label="Close room controls" onClick={close}/></header>
  <div className="equipment-body"><p className="help">Scene controls · session only. These settings are not saved yet.</p>
   <label className="room-switch"><input type="checkbox" checked={living?options.livingLights:options.gamingLights} onChange={e=>change(living?{livingLights:e.target.checked}:{gamingLights:e.target.checked})}/>Room lamps</label>
   {living?<><label className="room-switch"><input type="checkbox" checked={options.curtainsOpen} onChange={e=>change({curtainsOpen:e.target.checked})}/>Open curtains</label>
    <label className="ui-field">Sofa palette<select aria-label="Sofa palette" value={options.livingPalette} onChange={e=>change({livingPalette:e.target.value as RoomOptions["livingPalette"]})}><option value="forest">Forest velvet</option><option value="terracotta">Terracotta velvet</option></select></label>
    <label className="ui-field">Chair position<select aria-label="Chair position" value={options.chairSlot} onChange={e=>change({chairSlot:e.target.value as RoomOptions["chairSlot"]})}><option value="reading">Reading nook</option><option value="conversation">Conversation corner</option></select></label>
    <div className="equipment-components" role="group" aria-label="Inspect room objects">{Object.entries(ROOM_OBJECTS).map(([id,o])=><button key={id} aria-pressed={selected===id} onClick={()=>select(id)}>{o.title}</button>)}</div>
    {object&&<section aria-live="polite"><h3>{object.title}</h3><p>{object.detail}</p></section>}
   </>:<><p>An original arcade, console and game library. No games or external entertainment services are installed.</p><button className="primary" onClick={openGames}>Browse game library</button></>}
  </div>
 </aside>;
}
