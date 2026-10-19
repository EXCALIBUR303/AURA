import { useRef } from "react";
import { Modal } from "../../components/ui.tsx";
import { GAMES } from "./registry.ts";
import type { GameSession, GameSnapshot } from "./GameSession.ts";
export function GameLibrary({session,snapshot,close}:{session:GameSession;snapshot:GameSnapshot;close:()=>void}){
 const container=useRef<HTMLDivElement>(null);const live=["loading","running","paused","exiting"].includes(snapshot.phase);
 return <Modal title="Your game library" subtitle="AURA / GAMING & ENTERTAINMENT" close={close} wide>
  <div className="ui-dialog-body game-library"><p className="help">No games are installed. These original concepts reserve future library slots; they are not playable demos.</p>
   {!live&&<div className="game-grid">{GAMES.map(game=><article key={game.id}><div className="game-cover" aria-hidden="true"><svg width="70" height="70" viewBox="0 0 70 70" fill="none"><circle cx="35" cy="35" r="24" stroke="currentColor"/>{game.icon==="circuit"?<path d="M12 35h18V18h22v34H30V35m-6-11v28m22-28v28" stroke="currentColor"/>:<><ellipse cx="35" cy="35" rx="30" ry="12" transform="rotate(-30 35 35)" stroke="currentColor"/><circle cx="35" cy="35" r="5" fill="currentColor"/></>}</svg></div><h3>{game.name}</h3><p>{game.description}</p><small>{game.reason}</small><button disabled={game.availability!=="installed"||snapshot.phase==="preparing"} onClick={()=>{if(container.current)void session.start(game,container.current);}}>{game.availability==="installed"?"Play":"Upcoming · not installed"}</button></article>)}</div>}
   {snapshot.error&&<p role="alert">{snapshot.error}</p>}
   {snapshot.phase==="preparing"&&<p role="status">Releasing Astra audio and preparing exclusive input…</p>}
   {snapshot.phase==="loading"&&<p role="status">Loading the selected game…</p>}
   <div ref={container} className="game-runtime" aria-label="Installed game runtime" tabIndex={live?0:-1} hidden={!live}/>
   {live&&<div className="equipment-actions"><button onClick={snapshot.phase==="paused"?session.resume:session.pause} disabled={!["running","paused"].includes(snapshot.phase)}>{snapshot.phase==="paused"?"Resume game":"Pause game"}</button><button onClick={close}>Exit to room</button></div>}
   <p className="help">Future installed games must support pause, safe exit and resource cleanup. No copyrighted game, browser audio capture or streaming connection is bundled.</p>
  </div>
 </Modal>;
}
