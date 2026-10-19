import { useSyncExternalStore } from "react";
import { componentById } from "./catalog.ts";
import type { ComponentId } from "./catalog.ts";

/**
 * Session-only state of the interactive hardware inspection, shared by the 3D rig (inside the R3F
 * root) and the DOM inspector panel. Nothing here is persisted or sent over the bridge. The camera
 * is still owned by WorldController; the inspector asks it to move.
 */
export type InspectionState = { open: boolean; selected: ComponentId | null; hovered: ComponentId | null; exploded: boolean;
  /** Bumped by Reset view so the camera returns to the overview even when the state is otherwise unchanged. */ nonce: number };
const INITIAL: InspectionState = { open: false, selected: null, hovered: null, exploded: false, nonce: 0 };

export class HardwareInspection {
  private state: InspectionState = INITIAL;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<InspectionState>) {
    const next = { ...this.state, ...patch };
    if ((Object.keys(next) as (keyof InspectionState)[]).every((k) => next[k] === this.state[k])) return;
    this.state = next; this.listeners.forEach((fn) => fn());
  }
  open = () => this.set({ open: true });
  /** Closing reassembles; the rig finishes the return animation before it swaps back to the merged tower. */
  close = () => this.set({ ...INITIAL });
  select = (id: string | null) => { const def = id ? componentById(id) : undefined; this.set({ selected: def?.selectable ? def.id : null }); };
  hover = (id: ComponentId | null) => this.set({ hovered: id });
  setExploded = (exploded: boolean) => this.set({ exploded });
  toggleExploded = () => this.set({ exploded: !this.state.exploded });
  /** Back to the overview: nothing selected, tower reassembled. */
  reset = () => this.set({ selected: null, hovered: null, exploded: false, nonce: this.state.nonce + 1 });
}
export const hardwareInspection = new HardwareInspection();
export const useHardwareInspection = () => useSyncExternalStore(hardwareInspection.subscribe, hardwareInspection.getSnapshot);
