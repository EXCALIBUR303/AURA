import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { retainAssetOwners, warmRoomBytes } from "./assets/resources.ts";
import { WorldController } from "./WorldController.ts";
export function useWorld(){
  const release=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [controller]=useState(()=>new WorldController());
  const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>{retainAssetOwners([...snapshot.loaded,...snapshot.pending?[snapshot.pending]:[]]);},[snapshot.loaded,snapshot.pending]);
  useEffect(()=>{
    if(snapshot.room!=="atrium"||snapshot.phase!=="idle"||document.hidden)return;
    let cancel:(()=>void)|undefined;
    const timer=setTimeout(()=>{cancel=warmRoomBytes("living");},700);
    const hidden=()=>{if(document.hidden){clearTimeout(timer);cancel?.();}};
    document.addEventListener("visibilitychange",hidden);
    return()=>{clearTimeout(timer);cancel?.();document.removeEventListener("visibilitychange",hidden);};
  },[snapshot.room,snapshot.phase]);
  useEffect(()=>{clearTimeout(release.current);return()=>{controller.suspend();release.current=setTimeout(()=>retainAssetOwners([]),0);};},[controller]);
  return {controller,snapshot};
}
