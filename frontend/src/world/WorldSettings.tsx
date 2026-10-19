import { Modal } from "../components/ui.tsx";
import { DEFAULT_ROOM_OPTIONS, DEFAULT_WORLD_SETTINGS } from "./settings.ts";
import type { PresentationMode, LightingPreset } from "./settings.ts";
import type { WorldController } from "./WorldController.ts";
import type { WorldSnapshot } from "./types.ts";
import type { WorldPersistence } from "./worldPreferences.ts";

const PERSISTENCE_COPY:Record<WorldPersistence,string>={
 loading:"Loading your saved world settings…",
 saved:"Presentation, lighting, float intensity, camera mode and your last room are saved on this Mac. Reduce world motion and room options stay session only.",
 unsaved:"Could not save the latest change. It applies for this session; AURA will try again on your next change.",
 session:"Session only. These options are not saved to your Mac in this session. Developer, privacy and voice preferences stay in their existing native settings.",
};
export function WorldSettingsDialog({controller,snapshot,nativeReduced,persistence="session",close}:{controller:WorldController;snapshot:WorldSnapshot;nativeReduced:boolean;persistence?:WorldPersistence;close:()=>void}){
 const settings=snapshot.settings;const reduced=nativeReduced||settings.reduceMotion;
 return <Modal title="Shape your atmosphere" subtitle="AURA / WORLD SETTINGS" close={close}><div className="ui-dialog-body world-settings">
  <p className="help" role="status">{PERSISTENCE_COPY[persistence]}</p>
  <label className="ui-field">Presentation<select data-initial-focus aria-label="World presentation" value={settings.presentation} onChange={e=>controller.setWorldSettings({presentation:e.target.value as PresentationMode})}><option value="static">Static / grounded</option><option value="floating">Floating / eligible displays</option><option value="hybrid">Hybrid / selected technology</option></select></label>
  <label className="ui-field">Lighting<select aria-label="World lighting" value={settings.lightingPreset} onChange={e=>controller.setWorldSettings({lightingPreset:e.target.value as LightingPreset})}><option value="daylight">Daylight</option><option value="sunset">Sunset</option><option value="night">Night</option></select></label>
  <label className="ui-field">Float intensity <output>{Math.round(settings.floatIntensity*100)}%</output><input type="range" aria-label="Float intensity" aria-valuetext={`${Math.round(settings.floatIntensity*100)} percent`} min="0" max="1" step="0.05" value={settings.floatIntensity} disabled={settings.presentation==="static"||reduced} onChange={e=>controller.setWorldSettings({floatIntensity:Number(e.target.value)})}/></label>
  <label className="room-switch"><input type="checkbox" checked={reduced} disabled={nativeReduced} onChange={e=>controller.setWorldSettings({reduceMotion:e.target.checked})}/>Reduce world motion</label>
  <p className="help">{nativeReduced?"System or native Reduce Motion is active and takes precedence.":"Motion reduction grounds eligible displays and stops nonessential fan and ambient movement."} Floors, walls, furniture and collision boundaries always stay grounded.</p>
  <button className="ui-button" onClick={()=>{controller.setWorldSettings(DEFAULT_WORLD_SETTINGS);controller.setRoomOptions(DEFAULT_ROOM_OPTIONS);}}>Reset appearance</button>
 </div></Modal>;
}
