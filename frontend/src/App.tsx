import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGLTF } from "@react-three/drei";
import type { AppInfo, ZoneId } from "@aura/contracts";
import { bridge, useBridgeEvent } from "./platform/bridge.ts";
import { log } from "./platform/log.ts";
import { Studio } from "./studio/Studio.tsx";
import type { CameraPose, StudioCameraHandle } from "./studio/Studio.tsx";
import { useStudio } from "./studio/useStudio.ts";
import { getZone, ZONES } from "./studio/zones.ts";
import type { StudioDiagnostics } from "./studio/diagnostics.ts";
import { EMPTY_DIAGNOSTICS, AvatarProbe, AVATAR_URL } from "./validation/AvatarProbe.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { ArrowIcon } from "./components/Icon.tsx";
import { IconButton, Modal, UiIcon } from "./components/ui.tsx";
import { ZoneIcon } from "./components/ZoneIcon.tsx";
import { useGitHubWorkspace } from "./github/useGitHubWorkspace.ts";
import { RepositoryExplorer } from "./github/RepositoryExplorer.tsx";
import { CompanionWorkspace } from "./companion/CompanionWorkspace.tsx";
import type { CompanionHandle, CompanionPresentation, ConversationLayout } from "./companion/CompanionWorkspace.tsx";
import "./studio.css";
import "./github/github.css";
import "./experience.css";

const StableStudio = memo(Studio);
export function App() {
  const [restorePose, setRestorePose] = useState<CameraPose | null>(null);
  const clearRestorePose = useCallback(() => setRestorePose(null), []);
  const studio = useStudio(clearRestorePose);
  const [layout, setLayout] = useState<ConversationLayout>("compact");
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const zoneRef = useRef(studio.zone); zoneRef.current = studio.zone;
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false), [commandQuery, setCommandQuery] = useState("");
  const [paneWidth, setPaneWidth] = useState<number | null>(null), [windowWidth, setWindowWidth] = useState(innerWidth);
  const [presentation, setPresentation] = useState<CompanionPresentation>({ state: "idle", activity: "idle", label: "Ready when you are" });
  const companion = useRef<CompanionHandle>(null), camera = useRef<StudioCameraHandle>(null);
  const previousView = useRef<{ zone: ZoneId; pose?: CameraPose } | null>(null);
  const navigate = useCallback((next: ZoneId) => {
    previousView.current = null; setRestorePose(null); studio.navigate(next);
    setInspectorOpen(["hardware", "software", "ai-lab"].includes(next) || next === "github" && innerWidth > 1250);
    setLayout((current) => next === "companion" ? "expanded" : current === "focus" ? "expanded" : current);
  }, [studio.navigate]);
  const github = useGitHubWorkspace(studio.zone, navigate);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<StudioDiagnostics>({ ...EMPTY_DIAGNOSTICS, zone: "studio", cameraSettled: false, context: "ready", perZone: {} });
  const [showDiagnostics, setShowDiagnostics] = useState(false), [sceneKey, setSceneKey] = useState(0);
  const diagnosticsRef = useRef(diagnostics); diagnosticsRef.current = diagnostics;
  const report = useCallback((patch: Partial<StudioDiagnostics>) => { setDiagnostics((current) => { const next = { ...current, ...patch }; window.__AURA_DIAGNOSTICS__ = next; return next; }); }, []);
  const restart = useCallback(() => { if (diagnosticsRef.current.status === "error") useGLTF.clear(AVATAR_URL); report({ status: "loading", error: undefined, context: "restoring", cameraSettled: false, perZone: {} }); setSceneKey((value) => value + 1); }, [report]);
  const returnToView = useCallback(() => {
    const saved = previousView.current; previousView.current = null;
    if (saved) { studio.navigate(saved.zone); setRestorePose(saved.pose ?? null); }
    setLayout("expanded");
  }, [studio.navigate]);
  const changeLayout = useCallback((next: ConversationLayout) => {
    if (next === "focus" && layoutRef.current !== "focus") {
      if (!previousView.current || zoneRef.current !== "companion") previousView.current = { zone: zoneRef.current, pose: camera.current?.capture() };
      setRestorePose(null); studio.navigate("companion");
    } else if (layoutRef.current === "focus" && next !== "focus") {
      const saved = previousView.current; previousView.current = null;
      if (saved) { studio.navigate(saved.zone); setRestorePose(saved.pose ?? null); }
    }
    setLayout(next);
  }, [studio.navigate]);
  const focusCompanion = useCallback(() => {
    if (zoneRef.current !== "companion") previousView.current = { zone: zoneRef.current, pose: camera.current?.capture() };
    setRestorePose(null); studio.navigate("companion"); setLayout("expanded"); companion.current?.focus();
  }, [studio.navigate]);
  const reportCompanion = useCallback((value: CompanionPresentation) => setPresentation((current) => current.state === value.state && current.activity === value.activity && current.label === value.label ? current : value), []);
  const resize = useCallback((width: number | null) => setPaneWidth(width === null ? null : Math.max(440, Math.min(650, innerWidth - 600, width))), []);
  useEffect(() => { const update = () => { setWindowWidth(innerWidth); if (innerWidth <= 1250 && zoneRef.current === "github") setInspectorOpen(false); setPaneWidth((width) => width === null ? null : Math.max(440, Math.min(650, innerWidth - 600, width))); }; window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  useEffect(() => { if (["hardware", "software", "ai-lab"].includes(studio.zone) || studio.zone === "github" && innerWidth > 1250) setInspectorOpen(true); if (studio.zone !== "companion" && layoutRef.current === "focus" || studio.zone === "companion" && layoutRef.current === "compact") setLayout("expanded"); }, [studio.zone]);
  useEffect(() => { let live = true; void bridge.call("app.getInfo", {}).then((info) => { if (live) setAppInfo(info); }).catch(() => log.error("app info unavailable")); return () => { live = false; }; }, []);
  useEffect(() => { if (diagnostics.status === "error") log.error("studio avatar load failed"); }, [diagnostics.status]);
  useBridgeEvent("app.command", (event) => { if (event.command === "focusCompanion") focusCompanion(); if (event.command === "openCommandPalette") setCommandOpen(true); });
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.repeat) return; if (bridge.transportKind === "mock" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); } }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, []);
  const useProject = () => { changeLayout("expanded"); companion.current?.context(true); };
  const zone = getZone(studio.zone), project = github.repos.find((repo) => repo.fullName === github.selected);
  const inspector = inspectorOpen && layout === "compact";
  const width = paneWidth ?? Math.min(500, Math.max(440, windowWidth / 3));
  const probe = new URLSearchParams(location.search).has("probe");
  const commands = [...ZONES.map((item) => ({ label: `Go to ${item.label}`, run: () => navigate(item.id) })), { label: "Focus Astra companion", run: focusCompanion }, { label: "New Astra conversation", run: () => companion.current?.newConversation() }, { label: "AI provider settings", run: () => companion.current?.providers() }, { label: "Choose conversation context", run: () => companion.current?.context() }, { label: "Show render diagnostics", run: () => setShowDiagnostics(true) }].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase()));
  return <div className="aura-app experience" data-layout={layout} data-inspector={inspector} data-reduced-motion={studio.reducedMotion} data-zone={studio.zone} style={{ "--zone-accent": zone.accent, "--conversation-width": `${width}px` } as CSSProperties}>
    <a className="skip-link" href="#companion-prompt" onClick={() => { if (studio.zone === "github" && layout === "compact") setLayout("expanded"); }}>Skip to companion</a>
    <header className="app-bar"><div className="titlebar-drag-surface" data-aura-drag-region /><div className="brand" data-aura-drag-region><span className="brand-mark"><ZoneIcon zone="studio" size={24} /></span><strong>AURA</strong></div><nav aria-label="Studio zones" className="zone-nav">{ZONES.map((item, index) => <button key={item.id} aria-current={studio.zone === item.id ? "page" : undefined} onClick={() => navigate(item.id)} title={`${item.label} · ⌘${index + 1} / Ctrl+${index + 1}`}><ZoneIcon zone={item.id} size={14} />{item.shortLabel}<kbd>{index + 1}</kbd></button>)}</nav><div className="chrome-actions"><span className="connection-chip">{bridge.transportKind === "mock" ? "Browser mock" : "Native bridge"}</span><IconButton name="search" label="Open command menu" onClick={() => setCommandOpen(true)} /><IconButton name="settings" label="AI provider settings" onClick={() => companion.current?.providers()} /></div></header>
    <div className="workspace-context-strip"><span><span className="mono">{String(ZONES.findIndex((item) => item.id === studio.zone) + 1).padStart(2, "0")}</span>{zone.label}</span><div>{project && <button className="selected-project-chip" title="Choose this project for conversation context" onClick={useProject}><ZoneIcon zone="github" size={14} /><span>{project.name}</span><code>{github.selectedBranch}</code><UiIcon name="plus" /></button>}{studio.zone === "companion" && previousView.current && <button onClick={returnToView}><UiIcon name="back" />Previous view</button>}<button aria-pressed={inspector} onClick={() => { changeLayout("compact"); setInspectorOpen(!inspector); }}><UiIcon name="file" />{inspector ? "Hide inspector" : "Project inspector"}</button><button onClick={() => { setLayout("expanded"); companion.current?.focus(); }}><ZoneIcon zone="companion" size={14} />Astra</button></div></div>
    <main className="workspace">
      <section className={`viewport ${studio.zone === "github" ? "exploring" : ""}`} aria-label="Interactive 3D studio">
        {probe ? <AvatarProbe report={report} maxPixelRatio={studio.prefs?.graphics.maxPixelRatio ?? 2} /> : <StableStudio key={sceneKey} zone={studio.zone} revision={studio.revision} reducedMotion={studio.reducedMotion} maxDpr={studio.prefs?.graphics.maxPixelRatio ?? 2} state={presentation.state} speechLevel={0} report={report} navigate={navigate} restart={restart} focusCompanion={focusCompanion} cameraHandle={camera} restorePose={restorePose} />}
        {studio.zone !== "github" && <div className="viewport-heading"><div className="eyebrow">A PERSONAL DEVELOPMENT STUDIO</div><h1>{zone.id === "studio" ? <>Room to <em>think clearly.</em></> : zone.id === "companion" ? <>Astra, <em>alongside.</em></> : zone.label}</h1><p>{zone.caption}</p><div className="view-actions"><button onClick={() => navigate("studio")}><ArrowIcon reset /> Reset overview</button><span>Drag to orbit · scroll to explore</span></div></div>}
        {studio.zone === "github" && <RepositoryExplorer workspace={github} navigate={navigate} />}
        <div className={`companion-pill ${presentation.state}`} data-activity={presentation.activity}><button className="astra-spark" onClick={focusCompanion} aria-label="Focus Astra companion"><ZoneIcon zone="companion" size={24} /></button><span><strong>ASTRA LUMEN II</strong><small>{presentation.label}</small></span><i className={`state-dot ${presentation.state}`} /></div>
        {(diagnostics.context !== "ready" || diagnostics.status === "error") && <div className="scene-message" role="alert"><strong>{diagnostics.context === "lost" ? "The graphics connection was interrupted." : diagnostics.error ?? "Restoring your studio…"}</strong><p>Your workstation is still available. Restart the scene to continue.</p><button className="primary" onClick={restart}>Retry scene</button></div>}
        {diagnostics.status === "loading" && diagnostics.context === "ready" && <span className="loading-model" role="status">Loading Astra…</span>}
        <div className="viewport-tools"><button aria-pressed={showDiagnostics} onClick={() => setShowDiagnostics(!showDiagnostics)}>▤ <span>Diagnostics</span></button>{diagnostics.fps !== undefined && <span className="mono">{diagnostics.fps} fps · {diagnostics.renderer?.pixelRatio}×</span>}</div>
        {showDiagnostics && <aside className="diagnostics glass" aria-label="Measured render diagnostics"><div className="section-heading"><h2>Render diagnostics</h2><button aria-label="Close diagnostics" onClick={() => setShowDiagnostics(false)}>×</button></div><dl className="facts"><dt>Zone</dt><dd>{diagnostics.zone}</dd><dt>FPS</dt><dd>{diagnostics.fps ?? "Measuring…"}</dd><dt>Draw calls</dt><dd>{diagnostics.drawCalls ?? "—"}</dd><dt>Scene triangles</dt><dd>{diagnostics.sceneTriangles?.toLocaleString() ?? "—"}</dd><dt>Avatar height</dt><dd>{diagnostics.heightMeters ?? "—"} m</dd><dt>Animation</dt><dd>{diagnostics.playingClip ?? "—"}</dd><dt>WebGL2</dt><dd>{String(diagnostics.renderer?.webgl2 ?? "—")}</dd></dl><p className="compact muted">{diagnostics.renderer?.renderer ?? "Detecting renderer…"}</p><p className="compact muted">Measured in this environment. Per-zone samples are available in window.__AURA_DIAGNOSTICS__.</p></aside>}
        {studio.error && <p className="preference-error" role="status">{studio.error}</p>}
      </section>
      <CompanionWorkspace ref={companion} zone={studio.zone} workspace={github} layout={layout} changeLayout={changeLayout} report={reportCompanion} visible={studio.zone !== "github" || layout !== "compact"} resized={width} resize={resize} />
      {inspector && <Inspector zone={studio.zone} navigate={navigate} workspace={github} useInConversation={useProject} close={() => setInspectorOpen(false)} />}
    </main>
    <footer className="app-footer"><span>AURA{appInfo ? ` / ${appInfo.appVersion}` : ""}<span className="footer-divider">/</span>Spatial workspace</span><span className="model-credit">“Astra Lumen II, a rigged companion android” by <a href="https://sketchfab.com/pinckneyb" target="_blank" rel="noreferrer">XRProfXR</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428" target="_blank" rel="noreferrer">Source</a></span></footer>
    {commandOpen && <Modal title="Go somewhere useful" subtitle="AURA / COMMANDS" close={() => { setCommandOpen(false); setCommandQuery(""); }}><div className="ui-dialog-body"><label className="ui-field">Find a command<input data-initial-focus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search destinations and actions…" /></label><div className="command-list" role="group" aria-label="Available commands" onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    }}>{commands.map((command) => <button key={command.label} onClick={() => { setCommandOpen(false); setCommandQuery(""); requestAnimationFrame(command.run); }}>{command.label}<UiIcon name="arrow" /></button>)}{!commands.length && <p className="help">No matching commands.</p>}</div></div></Modal>}
  </div>;
}
