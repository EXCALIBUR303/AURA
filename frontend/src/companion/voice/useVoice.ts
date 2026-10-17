import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { bridge } from "../../platform/bridge.ts";
import { VoiceController } from "./VoiceController.ts";
import type { VoiceSamples } from "./VoiceController.ts";

export function useVoice(options: Parameters<VoiceController["configure"]>[0], samples: VoiceSamples, blocked: boolean) {
  const ref = useRef<VoiceController | null>(null);
  if (!ref.current) ref.current = new VoiceController(bridge, samples);
  const controller = ref.current;
  const view = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const latest = useRef({ options, blocked, view }); latest.current = { options, blocked, view };
  useLayoutEffect(() => { controller.configure(options); });
  useEffect(() => controller.mount(), [controller]);
  useEffect(() => {
    const { status, busy } = controller.snapshot();
    // Keep settings/context/approval dialogs free of an in-flight spoken send.
    if (blocked && (busy || status?.listening || status?.phase === "recognizing")) void controller.cancel();
  }, [blocked, controller]);
  useEffect(() => {
    let held = false;
    const hasModal = () => !!document.querySelector("dialog[open]");
    const down = (event: KeyboardEvent) => {
      const { options, blocked, view } = latest.current;
      if (!options.visible || hasModal() || blocked || event.isComposing) return;
      if (event.key === "Escape") {
        if (view.status?.listening || view.status?.phase === "recognizing" || view.busy) {
          event.preventDefault(); event.stopImmediatePropagation(); held = false; void controller.cancel();
        } else if (view.status?.speaking) {
          event.preventDefault(); event.stopImmediatePropagation(); void controller.stopSpeaking();
        }
        return;
      }
      if (event.code !== "Space" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || held || !document.hasFocus()) return;
      if (!options.canTalk || view.busy || view.status?.listening || view.status?.phase === "recognizing") return;
      event.preventDefault(); held = true; void controller.start("push_to_talk");
    };
    const up = (event: KeyboardEvent) => {
      if (!held || event.code !== "Space" && event.key !== "Alt") return;
      event.preventDefault(); held = false; void controller.finish();
    };
    const blur = () => { if (held || latest.current.view.status?.listening || latest.current.view.status?.phase === "recognizing") { held = false; void controller.cancel(); } };
    const focus = () => void controller.refresh();
    const visibility = () => { if (document.hidden) blur(); else focus(); };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller]);
  return { controller, view };
}
