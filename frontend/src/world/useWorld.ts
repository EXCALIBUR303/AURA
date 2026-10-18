import { useEffect, useState, useSyncExternalStore } from "react";
import { WorldController } from "./WorldController.ts";
export function useWorld(){
  const [controller]=useState(()=>new WorldController());
  const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>()=>controller.suspend(),[controller]);
  return {controller,snapshot};
}
