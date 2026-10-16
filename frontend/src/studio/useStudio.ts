import { useCallback, useEffect, useRef, useState } from "react";
import type { Preferences, ZoneId } from "@aura/contracts";
import { bridge, useBridgeEvent } from "../platform/bridge.ts";
import { log } from "../platform/log.ts";
import { isZone, readBrowserZone, writeBrowserZone, ZONES } from "./zones.ts";

export function useStudio() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [zone, setZone] = useState<ZoneId>("studio");
  const [revision, setRevision] = useState(0);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [error, setError] = useState<string | null>(null);
  const navigated = useRef(false);
  const saves = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    let live = true;
    void bridge.call("prefs.get", {}).then((value) => {
      if (!live) return;
      setPrefs(value);
      if (!navigated.current) {
        const restored = bridge.transportKind === "mock" ? readBrowserZone() ?? value.lastZone : value.lastZone;
        setZone(restored);
      }
    }).catch(() => { if (live) setError("Preferences unavailable. Your changes may not be saved."); });
    return () => { live = false; media.removeEventListener("change", update); };
  }, []);

  useBridgeEvent("prefs.changed", (value) => { setPrefs(value); });

  const navigate = useCallback((next: ZoneId) => {
    navigated.current = true;
    setZone(next);
    setRevision((value) => value + 1);
    if (bridge.transportKind === "mock") writeBrowserZone(next);
    // Keep writes ordered when navigation is faster than the native bridge.
    saves.current = saves.current.catch(() => {}).then(() => bridge.call("prefs.update", { lastZone: next }))
      .then(() => setError(null)).catch(() => {
        setError("Could not save this zone. Try navigating again.");
        log.error("zone preference could not be saved");
      });
  }, []);

  useBridgeEvent("app.command", (event) => {
    if (event.command === "navigate") navigate(event.zone);
    if (event.command === "focusCompanion") { navigate("companion"); document.getElementById("companion-prompt")?.focus(); }
    if (event.command === "openCommandPalette") document.getElementById("companion-prompt")?.focus();
  });

  useEffect(() => {
    if (bridge.transportKind !== "mock") return;
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const index = Number(event.key) - 1;
      const next = ZONES[index];
      if (next && isZone(next.id)) { event.preventDefault(); navigate(next.id); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [navigate]);

  return { prefs, zone, revision, navigate, error, reducedMotion: systemReduced || (prefs?.reduceMotion ?? true) };
}
