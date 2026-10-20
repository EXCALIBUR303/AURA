/**
 * Opt-in frame tracing for profiling inside the native app (`window.__AURA_TRACE__`, driven by the
 * dev world probe). Off by default: every mark is one boolean check, and nothing is retained.
 * When on, each rendered frame records the time spent in frame callbacks and in the renderer, the
 * renderer's resource counts (a rise in programs is a shader compile, in textures an upload), and
 * labelled marks from scene construction, React commits and travel.
 */
export type TraceMark = { t: number; label: string; ms?: number };
export type TraceFrame = { start: number; callbacksMs: number; renderMs: number; syncMs?: number; programs: number; textures: number; geometries: number; calls: number };
export const trace = { on: false, sync: false, marks: [] as TraceMark[], frames: [] as TraceFrame[] };

export function traceMark(label: string, ms?: number) { if (trace.on) trace.marks.push({ t: performance.now(), label, ms }); }
/** Runs `work`, recording how long it took when tracing. */
export function traceTime<T>(label: string, work: () => T): T {
  if (!trace.on) return work();
  const t = performance.now();
  try { return work(); } finally { trace.marks.push({ t, label, ms: performance.now() - t }); }
}

declare global { interface Window { __AURA_TRACE__?: { start: (options?: { sync?: boolean }) => void; stop: () => { marks: TraceMark[]; frames: TraceFrame[] } } } }
if (typeof window !== "undefined") window.__AURA_TRACE__ = {
  start: (options) => { trace.marks = []; trace.frames = []; trace.sync = !!options?.sync; trace.on = true; },
  stop: () => { trace.on = false; const out = { marks: trace.marks, frames: trace.frames }; trace.marks = []; trace.frames = []; return out; },
};
