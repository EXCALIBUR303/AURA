// Phase 1 shell: validation scene + bridge status. Codex owns this file from
// Phase 2 onward and is expected to replace it entirely.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo } from "@aura/contracts";
import { bridge, useBridgeEvent } from "./platform/bridge.ts";
import { log } from "./platform/log.ts";
import { AvatarProbe, EMPTY_DIAGNOSTICS } from "./validation/AvatarProbe.tsx";
import type { AvatarDiagnostics } from "./validation/AvatarProbe.tsx";
import "./validation/probe.css";

declare global {
  interface Window {
    /** Read by automated checks; not part of the app's API. */
    __AURA_DIAGNOSTICS__?: AvatarDiagnostics;
  }
}

export function App() {
  const [diagnostics, setDiagnostics] = useState<AvatarDiagnostics>(EMPTY_DIAGNOSTICS);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string>("none");

  const report = useCallback((patch: Partial<AvatarDiagnostics>) => {
    setDiagnostics((current) => ({ ...current, ...patch }));
  }, []);

  const latest = useRef(diagnostics);
  useEffect(() => {
    latest.current = diagnostics;
    window.__AURA_DIAGNOSTICS__ = diagnostics;
  }, [diagnostics]);

  // One summary line ~5 s after load so the native host's log captures a
  // settled FPS reading from inside WKWebView.
  useEffect(() => {
    if (diagnostics.status !== "loaded") return;
    const timer = setTimeout(() => {
      const d = latest.current;
      // Values go in the message (logged publicly); `context` is redacted natively.
      log.notice(
        `avatar diagnostics clips=${d.clips.map((c) => `${c.name}:${c.durationSec.toFixed(1)}s`).join(",")}` +
          ` triangles=${d.triangles} bones=${d.bones} heightMeters=${d.heightMeters} loadMs=${d.loadMs}` +
          ` fps=${d.fps} webgl2=${d.renderer?.webgl2} pixelRatio=${d.renderer?.pixelRatio} gpu="${d.renderer?.renderer}"`,
      );
    }, 5000);
    return () => clearTimeout(timer);
  }, [diagnostics.status]);

  useEffect(() => {
    if (diagnostics.status === "loaded") log.info("avatar loaded", { clips: String(diagnostics.clips.length) });
    if (diagnostics.status === "error") log.error("avatar failed to load", { error: diagnostics.error ?? "" });
  }, [diagnostics.status, diagnostics.clips.length, diagnostics.error]);

  useEffect(() => {
    bridge
      .call("app.getInfo", {})
      .then(setAppInfo)
      .catch((error: unknown) => setBridgeError(String(error)));
  }, []);

  useBridgeEvent("app.command", (payload) => setLastCommand(JSON.stringify(payload)));

  const d = diagnostics;
  return (
    <div className="probe-root">
      <AvatarProbe report={report} />

      <aside className="probe-panel" aria-label="Phase 1 validation diagnostics">
        <h1>AURA · Phase 1 validation</h1>

        <section>
          <h2>Bridge</h2>
          <dl>
            <dt>Transport</dt>
            <dd>{bridge.transportKind}</dd>
            <dt>Host</dt>
            <dd>{appInfo ? `${appInfo.host} · v${appInfo.appVersion} · protocol ${appInfo.bridgeVersion}` : bridgeError ?? "…"}</dd>
            <dt>Last command</dt>
            <dd>{lastCommand}</dd>
          </dl>
        </section>

        <section>
          <h2>Renderer</h2>
          <dl>
            <dt>WebGL2</dt>
            <dd>{d.renderer ? String(d.renderer.webgl2) : "…"}</dd>
            <dt>GPU</dt>
            <dd>{d.renderer?.renderer ?? "…"}</dd>
            <dt>Max texture</dt>
            <dd>{d.renderer?.maxTextureSize ?? "…"}</dd>
            <dt>Pixel ratio</dt>
            <dd>{d.renderer?.pixelRatio ?? "…"}</dd>
            <dt>FPS (this tab)</dt>
            <dd className="tnum">{d.fps ?? "…"}</dd>
          </dl>
        </section>

        <section>
          <h2>Astra Lumen II</h2>
          <dl data-testid="avatar-status">
            <dt>Status</dt>
            <dd>{d.status}{d.error ? ` — ${d.error}` : ""}</dd>
            <dt>Load</dt>
            <dd className="tnum">{d.loadMs !== undefined ? `${d.loadMs} ms` : "…"}</dd>
            <dt>Height</dt>
            <dd className="tnum">{d.heightMeters !== undefined ? `${d.heightMeters} m` : "…"}</dd>
            <dt>Triangles</dt>
            <dd className="tnum">{d.triangles || "…"}</dd>
            <dt>Skinned / bones</dt>
            <dd className="tnum">{d.skinnedMeshes} / {d.bones}</dd>
            <dt>Morph targets</dt>
            <dd className="tnum">{d.morphTargets}</dd>
            <dt>Materials</dt>
            <dd>{d.materials.join(", ") || "…"}</dd>
            <dt>Textures</dt>
            <dd>{d.textures.join(", ") || "…"}</dd>
            <dt>Clips</dt>
            <dd data-testid="avatar-clips">
              {d.clips.length === 0
                ? "…"
                : d.clips.map((c) => `${c.name} (${c.durationSec.toFixed(1)} s, ${c.tracks} tracks)`).join(", ")}
            </dd>
            <dt>Playing</dt>
            <dd>{d.playingClip ?? "—"}</dd>
          </dl>
        </section>
      </aside>

      <footer className="probe-credit">
        “Astra Lumen II, a rigged companion android” by{" "}
        <a href="https://sketchfab.com/pinckneyb">XRProfXR</a>, licensed{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </footer>
    </div>
  );
}
