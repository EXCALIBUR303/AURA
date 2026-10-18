import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { retainAssetOwners } from "./assets/resources.ts";
import { WorldController } from "./WorldController.ts";
export function useWorld(){
  const release=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [controller]=useState(()=>new WorldController());
  const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>{retainAssetOwners([...snapshot.loaded,...snapshot.pending?[snapshot.pending]:[]]);},[snapshot.loaded,snapshot.pending]);
  useEffect(()=>{clearTimeout(release.current);return()=>{controller.suspend();release.current=setTimeout(()=>retainAssetOwners([]),0);};},[controller]);
  return {controller,snapshot};
}
