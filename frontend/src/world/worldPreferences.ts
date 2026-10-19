import { useEffect, useState, useSyncExternalStore } from "react";
import { WORLD_PREFERENCES_VERSION } from "@aura/contracts";
import type { Preferences } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { log } from "../platform/log.ts";
import type { WorldController } from "./WorldController.ts";
import { WorldPreferenceSync } from "./worldPreferenceSync.ts";
import type { WorldPersistence } from "./worldPreferenceSync.ts";

export type { WorldPersistence } from "./worldPreferenceSync.ts";

/** Wires WorldPreferenceSync to useStudio's preferences, navigation revision and the world's idle phase. */
export function useWorldPreferences(controller: WorldController, prefs: Preferences | null, prefsError: boolean, revision: number, phase: string): WorldPersistence {
  const [sync] = useState(() => new WorldPreferenceSync(controller, {
    version: WORLD_PREFERENCES_VERSION,
    update: (patch) => bridge.call("prefs.update", patch),
    get: () => bridge.call("prefs.get", {}),
    onSaveError: () => log.error("world preference could not be saved"),
  }));
  useEffect(() => {
    const detach = sync.attach();
    const hidden = () => { if (document.hidden) sync.flush(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", sync.flush);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", sync.flush); detach(); };
  }, [sync]);
  useEffect(() => { if (revision > 0) sync.navigated(); }, [sync, revision]);
  useEffect(() => { if (prefs) sync.receive(prefs); else if (prefsError) sync.readFailed(); }, [sync, prefs, prefsError]);
  useEffect(() => { sync.tryRestore(); }, [sync, phase, prefs]);
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}
