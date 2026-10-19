import type { Preferences, PreferencesPatch, WorldPreferences } from "@aura/contracts";
import type { WorldController, WorldUserChange } from "./WorldController.ts";
import type { WorldSettings } from "./settings.ts";

/**
 * P4-N1 adapter between the frontend WorldController and the host-owned
 * `Preferences.world` (docs/PHASE4_NATIVE_INTEGRATION.md §3/§5,
 * frontend/WORLD_PREFERENCES_INTEGRATION.md).
 *
 * - Reads the preferences useStudio already requested; never a second launch read.
 * - Restores once, when the world is idle, unless the user navigated or changed the
 *   world first. Project Hub restores settings/camera only, so lastZone keeps its pose.
 * - Writes only explicit user changes, field by field; float intensity is debounced.
 *   Restores and host syncs are applied with echo suppression (no save loop).
 * - Room options and the world "Reduce world motion" switch stay session-only.
 */
export type WorldPersistence = "loading" | "saved" | "unsaved" | "session";
type WorldPatch = NonNullable<PreferencesPatch["world"]>;

export interface WorldPreferenceDeps {
  /** WORLD_PREFERENCES_VERSION from the contract (passed in so this file has no runtime imports). */
  version: number;
  update: (patch: PreferencesPatch) => Promise<Preferences>;
  get: () => Promise<Preferences>;
  onSaveError?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  debounceMs?: number;
}

export class WorldPreferenceSync {
  private status: WorldPersistence = "loading";
  private listeners = new Set<() => void>();
  private host: WorldPreferences | null = null;
  private restored = false;
  private superseded = false;
  private settingsTouched = false;
  private applying = false;
  private pending: WorldPatch = {};
  private timer: unknown;
  private inflight = 0;
  /** The controller's settings after the last change we processed or applied, to diff user changes. */
  private lastSettings: WorldSettings | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly debounceMs: number;

  private readonly controller: WorldController;
  private readonly deps: WorldPreferenceDeps;

  constructor(controller: WorldController, deps: WorldPreferenceDeps) {
    this.controller = controller;
    this.deps = deps;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.debounceMs = deps.debounceMs ?? 300;
  }

  /** Starts listening for user changes; the returned function flushes and stops. */
  attach = () => {
    this.lastSettings = this.controller.getSnapshot().settings;
    const stop = this.controller.subscribeUserChanges(this.userChange);
    return () => { this.flush(); stop(); };
  };

  private supported(world: WorldPreferences | undefined): world is WorldPreferences {
    return !!world && world.schemaVersion === this.deps.version;
  }

  getStatus = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setStatus(next: WorldPersistence) { if (next !== this.status) { this.status = next; this.listeners.forEach((fn) => fn()); } }

  /** A user or native workspace navigation happened: a late launch read must not move the camera. */
  navigated() { if (!this.restored) this.superseded = true; }

  /** The preferences read failed: world settings stay session-only for this launch. */
  readFailed() { if (this.status === "loading") this.setStatus("session"); }

  /** Initial read and every `prefs.changed`. */
  receive(prefs: Preferences) {
    const world = prefs.world;
    if (!this.supported(world)) {
      this.host = null;
      this.dropPending();
      this.setStatus("session");
      return;
    }
    const first = this.host === null;
    this.host = world;
    if (first) { this.setStatus("saved"); this.tryRestore(); return; }
    // A host change while nothing of ours is queued or in flight is authoritative: mirror settings only.
    if (this.restored && this.inflight === 0 && !this.hasPending() && this.differs(world)) this.applySettings(world);
  }

  /** Call when the world may have become idle. */
  tryRestore() {
    const host = this.host;
    if (!host || this.restored || this.controller.getSnapshot().phase !== "idle") return;
    this.restored = true;
    this.applying = true;
    try {
      const settings = this.toSettings(host);
      const room = host.lastRoomId;
      const current = this.controller.getSnapshot().room;
      if (this.superseded) {
        if (!this.settingsTouched) this.controller.setWorldSettings(settings);
      } else if (room === current || room === "project-hub") {
        if (!this.settingsTouched) this.controller.setWorldSettings(settings);
        this.controller.setMode(host.cameraMode);
      } else if (!this.controller.restoreWorld(settings, room, host.cameraMode)) {
        this.setStatus("session");
      }
    } finally {
      this.applying = false;
      this.lastSettings = this.controller.getSnapshot().settings;
    }
  }

  /** Sends anything still debounced (window hidden or page leaving). */
  flush = () => { if (this.timer !== undefined) { this.clearTimer(this.timer); this.timer = undefined; } this.send(); };

  private userChange = (change: WorldUserChange) => {
    if (this.applying) return;
    if (change.type === "settings" && this.status !== "saved" && this.status !== "unsaved") this.lastSettings = change.value;
    if (!this.restored) {
      this.superseded = this.superseded || change.type !== "settings";
      if (change.type === "settings") this.settingsTouched = true;
    }
    if (this.status !== "saved" && this.status !== "unsaved") return;
    if (change.type === "room") this.queue({ lastRoomId: change.value }, false);
    else if (change.type === "camera") this.queue({ cameraMode: change.value }, false);
    else {
      const { presentation, floatIntensity, lightingPreset } = change.value;
      const base = this.lastSettings ?? change.value;
      this.lastSettings = change.value;
      const patch: WorldPatch = {};
      if (presentation !== base.presentation) patch.presentation = presentation;
      if (lightingPreset !== base.lightingPreset) patch.lightingPreset = lightingPreset;
      const floatChanged = floatIntensity !== base.floatIntensity;
      if (floatChanged) patch.floatIntensity = floatIntensity;
      // reduceMotion is session-only here (see module comment); it is never written.
      if (Object.keys(patch).length) this.queue(patch, floatChanged && Object.keys(patch).length === 1);
    }
  };

  private queue(patch: WorldPatch, debounce: boolean) {
    this.pending = { ...this.pending, ...patch };
    if (this.timer !== undefined) { this.clearTimer(this.timer); this.timer = undefined; }
    if (debounce) this.timer = this.setTimer(() => { this.timer = undefined; this.send(); }, this.debounceMs);
    else this.send();
  }

  private send() {
    if (!this.host) return;
    const patch = this.pending;
    this.pending = {};
    if (!Object.keys(patch).length) return;
    this.inflight++;
    this.chain = this.chain.then(() => this.deps.update({ world: patch })).then((prefs) => {
      if (this.supported(prefs.world)) this.host = prefs.world;
      this.setStatus("saved");
    }, (error: unknown) => this.failed(error)).finally(() => { this.inflight--; });
  }

  private async failed(error: unknown) {
    if ((error as { code?: unknown } | null)?.code === "invalid_request") {
      // The host refused the value (or a newer AURA owns the schema): reconcile without saving back.
      try {
        const fresh = await this.deps.get();
        if (!this.supported(fresh.world)) { this.host = null; this.dropPending(); this.setStatus("session"); return; }
        this.host = fresh.world;
        this.applySettings(fresh.world);
        this.setStatus("saved");
      } catch { this.setStatus("unsaved"); }
      return;
    }
    this.deps.onSaveError?.();
    this.setStatus("unsaved");
  }

  private applySettings(world: WorldPreferences) {
    this.applying = true;
    try { this.controller.setWorldSettings(this.toSettings(world)); } finally { this.applying = false; this.lastSettings = this.controller.getSnapshot().settings; }
  }

  private toSettings(world: WorldPreferences): WorldSettings {
    return { ...this.controller.getSnapshot().settings, schemaVersion: 1, presentation: world.presentation,
      floatIntensity: world.floatIntensity, lightingPreset: world.lightingPreset };
  }

  private differs(world: WorldPreferences) {
    const s = this.controller.getSnapshot().settings;
    return s.presentation !== world.presentation || s.floatIntensity !== world.floatIntensity || s.lightingPreset !== world.lightingPreset;
  }

  private hasPending() { return this.timer !== undefined || Object.keys(this.pending).length > 0; }
  private dropPending() { if (this.timer !== undefined) this.clearTimer(this.timer); this.timer = undefined; this.pending = {}; }
}

