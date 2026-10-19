import { useEffect, useRef } from "react";
import type { WorldController } from "../WorldController.ts";
import { COMPONENTS, GROUPS, componentById, focusPose } from "./catalog.ts";
import { hardwareInspection, useHardwareInspection } from "./inspection.ts";
import "./hardware.css";

/** Escape peels back one level: a selected part first, then the whole inspection. */
export function escapeInspection(close: () => void) {
  if (hardwareInspection.getSnapshot().selected) hardwareInspection.select(null); else close();
}

export function HardwareInspector({ world, close, reduced }: { world: WorldController; close: () => void; reduced: boolean }) {
  const view = useHardwareInspection();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { hardwareInspection.open(); return () => hardwareInspection.close(); }, []);
  // The camera follows the selection, the exploded state and Reset view; orbit and zoom stay with the user in between.
  useEffect(() => { if (view.open) world.inspect(focusPose(view.selected, view.exploded), "hardware"); }, [world, view.open, view.selected, view.exploded, view.nonce]);
  // Escape while focus is on the 3D view (focus inside the panel is handled by the panel itself).
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.target instanceof Node && root.current?.closest(".equipment-panel")?.contains(event.target)) return;
      event.preventDefault(); escapeInspection(close);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [close]);
  const info = view.selected ? componentById(view.selected)?.info : undefined;
  const selected = view.selected ? componentById(view.selected) : undefined;
  return <div ref={root} className="hardware-inspector">
    <div className="equipment-actions" role="group" aria-label="Hardware view">
      <button type="button" className="primary" aria-pressed={view.exploded} onClick={hardwareInspection.toggleExploded}>{view.exploded ? "Reassemble" : "Explode view"}</button>
      <button type="button" onClick={hardwareInspection.reset}>Reset view</button>
    </div>
    <p className="hw-hint">Drag to rotate. Scroll or pinch to zoom. Click a part in the scene, or choose it below.{reduced ? " Reduced motion: view changes apply instantly." : ""}</p>
    {GROUPS.map((group) => <div key={group} role="group" aria-label={group} className="hw-group">
      <span className="hw-group-label" aria-hidden="true">{group}</span>
      <div className="equipment-components">
        {COMPONENTS.filter((c) => c.selectable && c.group === group).map((c) =>
          <button type="button" key={c.id} aria-pressed={view.selected === c.id} onClick={() => hardwareInspection.select(view.selected === c.id ? null : c.id)}>{c.label}</button>)}
      </div>
    </div>)}
    <section aria-live="polite" className="hw-detail">
      {selected && info ? <>
        <h3>{selected.label}</h3>
        <dl>
          <dt>Type</dt><dd>{info.kind}</dd>
          <dt>Purpose</dt><dd>{info.purpose}</dd>
          <dt>Connections</dt><dd>{info.connects}</dd>
          <dt>Cooling</dt><dd>{info.cooling}</dd>
          <dt>How it works</dt><dd>{info.explanation}</dd>
        </dl>
      </> : <p>Choose a component to frame it and read how it works. Use Explode view to separate the parts. The cooler covers the processor until the view is exploded.</p>}
    </section>
    <p className="hw-note" role="note">An original, generic illustration. Spinning fans and lighting are decorative and simulated: AURA does not read temperatures, fan speeds or usage from your computer, and no figure here is measured.</p>
  </div>;
}
