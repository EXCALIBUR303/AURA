import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { trace } from "./frameTrace.ts";

/** Records per-frame callback and renderer time while `window.__AURA_TRACE__` is running; inert otherwise. */
export function FrameTracer() {
  const gl = useThree((state) => state.gl);
  const started = useRef(0);
  // Runs before every other frame callback (lowest priority value), without taking over rendering.
  useFrame(() => { if (trace.on) started.current = performance.now(); }, -1000);
  useEffect(() => {
    const render = gl.render;
    const pixel = new Uint8Array(4);
    gl.render = function (scene, camera) {
      if (!trace.on) return render.call(this, scene, camera);
      const t = performance.now();
      render.call(this, scene, camera);
      const end = performance.now();
      let syncMs: number | undefined;
      // Optional: wait for the GPU (a 1-pixel read back) to attribute GPU time; distorts pacing, so only on request.
      if (trace.sync) { const context = gl.getContext(); context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel); syncMs = performance.now() - end; }
      trace.frames.push({ start: started.current || t, callbacksMs: started.current ? t - started.current : 0, renderMs: end - t, syncMs, programs: gl.info.programs?.length ?? 0, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, calls: gl.info.render.calls });
      started.current = 0;
    };
    return () => { gl.render = render; };
  }, [gl]);
  return null;
}
