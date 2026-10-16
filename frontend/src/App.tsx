import { useCallback, useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { AppInfo } from "@aura/contracts";
import { bridge } from "./platform/bridge.ts";
import { log } from "./platform/log.ts";
import { Studio } from "./studio/Studio.tsx";
import { useStudio } from "./studio/useStudio.ts";
import { getZone, ZONES } from "./studio/zones.ts";
import type { StudioDiagnostics } from "./studio/diagnostics.ts";
import { EMPTY_DIAGNOSTICS, AvatarProbe, AVATAR_URL } from "./validation/AvatarProbe.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { CommandDock } from "./components/CommandDock.tsx";
import { useCompanion } from "./components/useCompanion.ts";
import { ArrowIcon } from "./components/Icon.tsx";
import "./studio.css";

export function App() {
  const studio = useStudio();
  const companion = useCompanion();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<StudioDiagnostics>({ ...EMPTY_DIAGNOSTICS,
    zone: "studio", cameraSettled: false, context: "ready", perZone: {} });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const report = useCallback((patch: Partial<StudioDiagnostics>) => {
    setDiagnostics((current) => {
      const next = { ...current, ...patch };
      window.__AURA_DIAGNOSTICS__ = next;
      return next;
    });
  }, []);
  const restart = useCallback(() => {
    if (diagnostics.status === "error") useGLTF.clear(AVATAR_URL);
    report({ status: "loading", error: undefined, context: "restoring", cameraSettled: false, perZone: {} });
    setSceneKey((value) => value + 1);
  }, [report, diagnostics.status]);
  const zone = getZone(studio.zone);
  const probe = new URLSearchParams(location.search).has("probe");

  useEffect(() => {
    let live = true;
    void bridge.call("app.getInfo", {}).then((info) => { if (live) setAppInfo(info); }).catch(() => log.error("app info unavailable"));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (diagnostics.status === "error") log.error("studio avatar load failed");
  }, [diagnostics.status]);

  return <div className="aura-app" data-reduced-motion={studio.reducedMotion}>
    <a className="skip-link" href="#companion-prompt">Skip to companion</a>
    <header className="app-bar">
      <div className="titlebar-drag-surface" data-aura-drag-region />
      <div className="brand" data-aura-drag-region><span className="brand-mark" aria-hidden="true">◈</span><strong>AURA</strong><span className="brand-divider" /><span>Spatial studio</span></div>
      <nav aria-label="Studio zones" className="zone-nav">
        {ZONES.map((item, index) => <button key={item.id} aria-current={studio.zone === item.id ? "page" : undefined}
          onClick={() => studio.navigate(item.id)} title={`${item.label} · ⌘${index + 1} / Ctrl+${index + 1}`}>
          {item.shortLabel}<kbd>{index + 1}</kbd>
        </button>)}
      </nav>
      <span className="connection-chip"><i />{bridge.transportKind === "mock" ? "Mock connected" : "Native connected"}</span>
    </header>
    <main className="workspace">
      <section className="viewport" aria-label="Interactive 3D studio">
        {probe ? <AvatarProbe report={report} maxPixelRatio={studio.prefs?.graphics.maxPixelRatio ?? 2} /> :
          <Studio key={sceneKey} zone={studio.zone} revision={studio.revision} reducedMotion={studio.reducedMotion}
            maxDpr={studio.prefs?.graphics.maxPixelRatio ?? 2} state={companion.state} speechLevel={companion.speechLevel}
            report={report} navigate={studio.navigate} restart={restart} />}
        <div className="viewport-heading">
          <div className="eyebrow"><span className="live-dot" />YOUR DEVELOPER UNIVERSE <span className="heading-slash">/</span> {String(ZONES.findIndex((item) => item.id === studio.zone) + 1).padStart(2, "0")}</div>
          <h1>{zone.id === "studio" ? <>Room for your next <em>idea.</em></> : zone.label}</h1>
          <p>{zone.id === "studio" ? "A little space. A different perspective." : zone.caption}</p>
          <div className="view-actions"><button onClick={() => studio.navigate("studio")}><ArrowIcon reset /> Reset overview</button><span>Drag to orbit · scroll to explore</span></div>
        </div>
        <div className={`companion-pill ${companion.state}`} aria-live="polite">
          <span className="astra-spark" aria-hidden="true">✧</span><span><strong>ASTRA LUMEN II</strong><small>{companion.state === "idle" ? "Here when you need a hand" : companion.state}</small></span><i className={`state-dot ${companion.state}`} />
        </div>
        {(diagnostics.context !== "ready" || diagnostics.status === "error") && <div className="scene-message" role="alert">
          <strong>{diagnostics.context === "lost" ? "The graphics connection was interrupted." : diagnostics.error ?? "Restoring your studio…"}</strong>
          <p>Your workstation is still available. Restart the scene to continue.</p><button className="primary" onClick={restart}>Retry scene</button>
        </div>}
        {diagnostics.status === "loading" && diagnostics.context === "ready" && <span className="loading-model" role="status">Loading Astra…</span>}
        <CommandDock companion={companion} reducedMotion={studio.reducedMotion} />
        <div className="viewport-tools">
          <button aria-pressed={showDiagnostics} onClick={() => setShowDiagnostics(!showDiagnostics)}>▤ <span>Diagnostics</span></button>
          {diagnostics.fps !== undefined && <span className="mono">{diagnostics.fps} fps · {diagnostics.renderer?.pixelRatio}×</span>}
        </div>
        {showDiagnostics && <aside className="diagnostics glass" aria-label="Measured render diagnostics">
          <div className="section-heading"><h2>Render diagnostics</h2><button aria-label="Close diagnostics" onClick={() => setShowDiagnostics(false)}>×</button></div>
          <dl className="facts"><dt>Zone</dt><dd>{diagnostics.zone}</dd><dt>FPS</dt><dd>{diagnostics.fps ?? "Measuring…"}</dd>
            <dt>Draw calls</dt><dd>{diagnostics.drawCalls ?? "—"}</dd><dt>Scene triangles</dt><dd>{diagnostics.sceneTriangles?.toLocaleString() ?? "—"}</dd>
            <dt>Avatar height</dt><dd>{diagnostics.heightMeters ?? "—"} m</dd><dt>Animation</dt><dd>{diagnostics.playingClip ?? "—"}</dd>
            <dt>WebGL2</dt><dd>{String(diagnostics.renderer?.webgl2 ?? "—")}</dd></dl>
          <p className="compact muted">{diagnostics.renderer?.renderer ?? "Detecting renderer…"}</p>
          <p className="compact muted">Current measurements. Per-zone samples are available in window.__AURA_DIAGNOSTICS__.</p>
        </aside>}
        {studio.error && <p className="preference-error" role="status">{studio.error}</p>}
      </section>
      <Inspector zone={studio.zone} />
    </main>
    <footer className="app-footer">
      <span>AURA{appInfo ? ` / ${appInfo.appVersion}` : ""}<span className="footer-divider">/</span>WebGL studio</span>
      <span className="model-credit">“Astra Lumen II, a rigged companion android” by <a href="https://sketchfab.com/pinckneyb" target="_blank" rel="noreferrer">XRProfXR</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428" target="_blank" rel="noreferrer">Source</a></span>
    </footer>
  </div>;
}
