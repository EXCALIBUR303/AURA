import { useState } from "react";
import { IconButton } from "../../components/ui.tsx";
import { COMPONENTS, EQUIPMENT, interactionById } from "./registry.ts";
import type { ZoneId } from "@aura/contracts";
import type { WorldController } from "../WorldController.ts";
import { HardwareInspector, escapeInspection } from "../hardware/HardwareInspector.tsx";
export function EquipmentPanel({world,reduced,selected,select,openTool,close,ready}:{world:WorldController;reduced:boolean;selected:string|null;select:(id:string)=>void;openTool:(zone:ZoneId)=>void;close:()=>void;ready:boolean}){
  const item=selected?interactionById(selected):undefined;
  const [component,setComponent]=useState<string>("chassis");const detail=COMPONENTS.find(c=>c.id===component)!;
  return <aside className="equipment-panel" aria-label="Workstation equipment" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();if(selected==="hardware.pc")escapeInspection(close);else close();}}}>
    <header><div><span className="eyebrow">PROJECT HUB / EQUIPMENT</span><h2>{item?.label??"Explore the workbench"}</h2></div><IconButton name="close" label="Return from equipment inspection" onClick={close}/></header>
    <div className="equipment-body">
      <label className="ui-field">Equipment<select aria-label="Choose equipment" value={selected??""} onChange={e=>select(e.target.value)}><option value="" disabled>Choose an object…</option>{EQUIPMENT.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
      {!item&&<p>Inspect the authored equipment or open its existing project workspace. You can also select a PC directly in the room.</p>}
      {item&&<>{item.id!=="hardware.pc"&&<p>{item.description}</p>}{item.id==="hardware.pc"&&<HardwareInspector world={world} close={close} reduced={reduced}/>}{item.category==="inspectable"&&item.id!=="hardware.pc"&&<><div className="equipment-components" role="group" aria-label="PC components">{COMPONENTS.map(c=><button key={c.id} aria-pressed={c.id===component} onClick={()=>setComponent(c.id)}>{c.name}</button>)}</div><section aria-live="polite"><h3>{detail.name}</h3><p>{detail.detail}</p></section></>}
      <div className="equipment-actions"><button className="primary" disabled={!ready} onClick={()=>openTool(item.zone)}>Open {item.zone==="ai-lab"?"AI / LLM":item.zone} workspace</button><button onClick={close}>Return to room</button></div>{!ready&&<p role="status">Focusing equipment…</p>}</>}
    </div>
  </aside>;
}
