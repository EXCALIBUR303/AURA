import { EMPTY_SCREEN_STATE } from "../world/assets/MonitorAtlas.tsx";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AIProviderInfo, RepositorySummary, RepositoryTree, ZoneId } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { useWorld } from "../world/useWorld.ts";
import { Studio } from "../studio/Studio.tsx";
import { getZone, ZONES } from "../studio/zones.ts";
import type { StudioDiagnostics } from "../studio/diagnostics.ts";
import { EMPTY_DIAGNOSTICS } from "../validation/AvatarProbe.tsx";
import { ZoneIcon } from "../components/ZoneIcon.tsx";

type Layout = "compact" | "expanded" | "focus";
type DialogName = "context" | "approval" | "providers" | null;
type Specimen = "conversation" | "tools" | "empty" | "error";
type IconName = "arrow" | "expand" | "collapse" | "close" | "plus" | "chevron" | "settings" | "file" | "check" | "lock" | "copy" | "search" | "back";
const ICONS: Record<IconName, string> = {
  arrow: "M12 19V5m-5 5 5-5 5 5", expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5", close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14", chevron: "m8 10 4 4 4-4",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6", file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8m-8 4h5",
  check: "m5 12 4 4L19 6", lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
  copy: "M8 8h12v13H8zM4 16H2V2h13v2", search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  back: "m10 5-7 7 7 7M3 12h18",
};
function Icon({ name }: { name: IconName }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}
function IconButton({ name, label, onClick }: { name: IconName; label: string; onClick: () => void }) {
  return <button className="d-icon-button" aria-label={label} title={label} onClick={onClick}><Icon name={name} /></button>;
}

function Modal({ title, subtitle, children, close }: { title: string; subtitle: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="d-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-subtitle" onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  }}>
    <header className="d-dialog-heading"><div><span className="d-kicker">ASTRA / {subtitle}</span><h2 id="dialog-title">{title}</h2></div><IconButton name="close" label="Close dialog" onClick={close} /></header>
    <p id="dialog-subtitle" className="d-prototype-note">Design preview · no service changes or data sharing</p>
    {children}
  </dialog>;
}

// Existing scene, geometry, lifecycle policy and avatar. No second canvas.
const DesignScene = memo(function DesignScene({ zone, revision, reducedMotion, maxDpr, navigate, focus }: {
  zone: ZoneId; revision: number; reducedMotion: boolean; maxDpr: number; navigate: (zone: ZoneId) => void; focus: () => void;
}) {
  const [key, setKey] = useState(0);
  const {controller,snapshot}=useWorld();
  useEffect(()=>controller.focusWorkspace(zone),[controller,zone,revision]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const report = useCallback((patch: Partial<StudioDiagnostics>) => {
    window.__AURA_DIAGNOSTICS__ = { ...EMPTY_DIAGNOSTICS, zone: "studio", cameraSettled: false, context: "ready", perZone: {}, ...window.__AURA_DIAGNOSTICS__, ...patch };
    if (patch.status) setStatus(patch.status);
  }, []);
  const restart = useCallback(() => { setKey((value) => value + 1); setStatus("loading"); }, []);
  return <><Studio key={key} zone={zone} revision={revision} reducedMotion={reducedMotion} maxDpr={maxDpr} state="idle" speechLevel={0} report={report} navigate={navigate} restart={restart} focusCompanion={focus} world={snapshot} worldController={controller} inspectEquipment={()=>{}} selectedEquipment={null} screens={EMPTY_SCREEN_STATE} openWorldMap={focus} />
    {status === "loading" && <div className="d-scene-status" role="status">Loading Astra Lumen II…</div>}
    {status === "error" && <div className="d-scene-status" role="alert">The studio could not load. <button onClick={restart}>Retry scene</button></div>}
  </>;
});

const codeSpecimen = 'const { streamId } = await bridge.call(\n  "ai.sendMessage", {\n    conversationId,\n    text: message,\n  },\n);';

function CodeSpecimen({ announce }: { announce: (text: string) => void }) {
  const [wrap, setWrap] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(codeSpecimen); announce("Code example copied."); }
    catch { announce("Copy was unavailable. Select the code to copy it."); }
  }
  return <section className="d-code" aria-label="Authored TypeScript example">
    <header><span>TypeScript <span className="d-code-label">/ bridge example</span></span><div><button aria-pressed={wrap} onClick={() => setWrap(!wrap)}>Wrap</button><button onClick={() => void copy()}><Icon name="copy" />Copy</button></div></header>
    <pre tabIndex={0} className={wrap ? "wrap" : undefined}><code><span className="d-syntax-keyword">const</span>{' { streamId } = '}<span className="d-syntax-keyword">await</span>{' bridge.call(\n  '}<span className="d-syntax-string">"ai.sendMessage"</span>{', {\n    conversationId,\n    text: message,\n  },\n);'}</code></pre>
  </section>;
}

function ToolSpecimen({ running }: { running: boolean }) {
  return <details className="d-tool"><summary><span className="d-tool-icon"><Icon name="file" /></span><span><strong>Read README.md</strong><small>Tool-state specimen · no tool executed</small></span><span className={`d-badge ${running ? "working" : "neutral"}`}>{running ? "Running" : "Completed"}</span><Icon name="chevron" /></summary>
    <div className="d-tool-detail">The application will show the host-written summary, outcome, and source references here. A completed tool does not imply that the full answer is complete.</div>
  </details>;
}

function ContextDialog({ repos, selected, apply, close }: { repos: RepositorySummary[]; selected: string; apply: (repo: string, files: number) => void; close: () => void }) {
  const [repository, setRepository] = useState(selected);
  const [tree, setTree] = useState<RepositoryTree | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [issue, setIssue] = useState("");
  useEffect(() => {
    let live = true;
    setTree(null); setPaths([]); setIssue("");
    if (repository) void bridge.call("github.listFiles", { fullName: repository }).then((value) => { if (live) setTree(value); }).catch(() => { if (live) setIssue("Sample file paths could not load."); });
    return () => { live = false; };
  }, [repository]);
  const repo = repos.find((value) => value.fullName === repository);
  return <Modal title="Choose your context" subtitle="CONVERSATION CONTEXT" close={close}>
    <div className="d-dialog-body">
      <p className="d-help">Keep the conversation connected to the work you choose. Changing this selection in the app requires an explicit native update.</p>
      <label className="d-field">Repository<select value={repository} onChange={(event) => setRepository(event.target.value)}><option value="">No project context</option>{repos.map((value) => <option key={value.fullName}>{value.fullName}</option>)}</select></label>
      {repo && <><div className="d-context-repo"><Icon name="file" /><strong>{repo.name}</strong><span className="d-badge neutral">{repo.defaultBranch}</span><span className="d-badge neutral">{repo.isPrivate ? "Private" : "Public"}</span></div>
        <fieldset className="d-context-options"><legend>Include with the next message</legend>{["Workspace", "Repository metadata", "Recent commits", "Project notes", "README"].map((label, index) => <label key={label}><input type="checkbox" defaultChecked={index < 2} />{label}</label>)}</fieldset>
        <div className="d-section-heading"><h3>Selected files</h3><span>{paths.length} / 5</span></div>
        <div className="d-file-list">{!tree && !issue && <p role="status">Loading sample paths…</p>}{issue && <p role="alert">{issue}</p>}{tree?.entries.filter((entry) => entry.type === "file").map((entry) => <label key={entry.path}><input type="checkbox" checked={paths.includes(entry.path)} disabled={!paths.includes(entry.path) && paths.length >= 5} onChange={() => setPaths((current) => current.includes(entry.path) ? current.filter((path) => path !== entry.path) : [...current, entry.path])} /><Icon name="file" /><code>{entry.path}</code></label>)}</div>
      </>}
      <p className="d-policy-note"><Icon name="lock" />The native service decides what can be shared. A selection is never permission to send private source.</p>
    </div><footer className="d-dialog-actions"><button className="d-button" onClick={close}>Cancel</button><button className="d-button primary" onClick={() => apply(repository, paths.length)}>Apply preview</button></footer>
  </Modal>;
}

function ApprovalDialog({ repository, decide, close }: { repository?: RepositorySummary; decide: (decision: string) => void; close: () => void }) {
  return <Modal title="Share selected source?" subtitle="YOUR APPROVAL" close={close}>
    <div className="d-dialog-body"><div className="d-consent-symbol"><Icon name="lock" /></div><p className="d-consent-lead">Review what leaves your workspace.</p><p className="d-help">This specimen shows how a request to share private repository source with an external provider will be presented.</p>
      <dl className="d-consent-facts"><dt>Repository</dt><dd>{repository?.fullName ?? "Loading sample repository…"}</dd><dt>Destination</dt><dd>External provider <small>Layout specimen</small></dd><dt>Requested source</dt><dd><code>README.md</code></dd><dt>Scope</dt><dd>This source request, or this conversation</dd></dl>
      <div className="d-warning"><strong>You stay in control.</strong><p>In the application, nothing is shared until the native service accepts your decision. Approval expiry is supplied by the host.</p></div>
    </div><footer className="d-dialog-actions consent"><button className="d-button" data-initial-focus onClick={() => decide("Deny")}>Deny</button><button className="d-button" onClick={() => decide("Allow for this conversation")}>Allow for this conversation</button><button className="d-button primary" onClick={() => decide("Allow once")}>Allow once</button></footer>
  </Modal>;
}

function ProvidersDialog({ providers, close, announce }: { providers: AIProviderInfo[]; close: () => void; announce: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return <Modal title="AI providers" subtitle="SETTINGS" close={close}>
    <div className="d-dialog-body"><p className="d-help">Choose where Astra thinks. Provider networking and credentials are managed by AURA on your Mac.</p>
      <div className="d-provider-list">{providers.map((provider) => <div className="d-provider-row" key={provider.id}><span className="d-provider-mark"><ZoneIcon zone="companion" /></span><div><strong>{provider.displayName}</strong><small>{provider.builtIn ? "Built in · simulated responses" : provider.baseUrl}</small></div><span className="d-badge neutral">{provider.builtIn ? "Offline mock" : "Configured"}</span></div>)}</div>
      {!editing ? <button className="d-add-provider" onClick={() => setEditing(true)}><Icon name="plus" /><span><strong>Add an OpenAI-compatible provider</strong><small>Local runtime or compatible HTTPS service</small></span><Icon name="chevron" /></button> : <form className="d-provider-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); announce("Provider form previewed. No configuration was saved."); }}>
        <div className="d-section-heading"><h3>OpenAI-compatible</h3><button onClick={() => setEditing(false)} type="button">Cancel</button></div>
        <label className="d-field">Display name<input required placeholder="Your provider name" /></label>
        <label className="d-field">Endpoint<input type="url" required placeholder="http://127.0.0.1:11434/v1" /></label>
        <label className="d-field">Model<input required placeholder="Model identifier" /></label>
        <p className="d-help">API keys are entered only in the native secure sheet. No key field belongs in this view.</p><button className="d-button primary">Preview configuration</button>
        {saved && <p role="status" className="d-inline-notice">Form preview complete. Nothing was saved or checked.</p>}
      </form>}
      <div className="d-policy-note"><Icon name="lock" /><span>Connection checks and key entry are specified for Phase 3 implementation. This prototype makes neither request.</span></div>
    </div><footer className="d-dialog-actions"><span className="d-help">Live hosted inference has not been verified.</span><button className="d-button" onClick={close}>Done</button></footer>
  </Modal>;
}

function Projects({ repos, selected, select, openConversation }: { repos: RepositorySummary[]; selected: string; select: (repo: string) => void; openConversation: () => void }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("activity");
  const visible = repos.filter((repo) => `${repo.fullName} ${repo.description}`.toLowerCase().includes(query.toLowerCase()) && (!language || repo.primaryLanguage === language)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  const repo = repos.find((value) => value.fullName === selected);
  return <section className="d-projects" aria-label="Project explorer design">
    <div className="d-project-main"><header className="d-project-heading"><div><span className="d-kicker">GITHUB / MOCK DATA</span><h1>Your projects, <em>within reach.</em></h1><p>Choose a project. Bring its context into the conversation.</p></div><span className="d-account">mock-user <span className="d-badge neutral">Sample account</span></span></header>
      <div className="d-project-filters"><label className="d-search"><Icon name="search" /><input aria-label="Search sample repositories" placeholder="Find a repository…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter sample language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="">All languages</option>{[...new Set(repos.map((value) => value.primaryLanguage))].filter(Boolean).map((value) => <option key={value!}>{value}</option>)}</select><select aria-label="Sort sample repositories" value={sort} onChange={(event) => setSort(event.target.value)}><option value="activity">Recent push</option><option value="name">Name</option></select></div>
      <div className="d-collection-label"><span>{visible.length} repositories</span><span>Repository selection is separate from conversation context</span></div>
      <div className="d-project-grid">{visible.map((value) => <button className="d-project-card" aria-pressed={selected === value.fullName} key={value.fullName} onClick={() => select(value.fullName)}><span className="d-card-top"><ZoneIcon zone="github" /><span className="d-badge neutral">{value.isPrivate ? "Private" : "Public"}</span></span><strong>{value.name}</strong><small>{value.owner}</small><p>{value.description}</p><span className="d-card-bottom"><span>{value.primaryLanguage}</span><span>{selected === value.fullName ? <><Icon name="check" />Selected</> : "Select project"}</span></span></button>)}</div>
      {!visible.length && <div className="d-empty-results"><h2>No matching repositories</h2><p>Try a different name or language.</p><button className="d-button" onClick={() => { setQuery(""); setLanguage(""); }}>Clear filters</button></div>}
      {repo && <div className="d-inline-project-context"><span><strong>{repo.name}</strong><small>{repo.defaultBranch} · {repo.primaryLanguage}</small></span><button className="d-button primary" onClick={openConversation}>Use in conversation <Icon name="arrow" /></button></div>}
    </div>
    <aside className="d-project-inspector"><span className="d-kicker">SELECTED PROJECT</span><ZoneIcon zone="github" size={26} /><h2>{repo?.name ?? "Select a repository"}</h2><p>{repo?.description}</p><dl><dt>Repository</dt><dd>{repo?.fullName}</dd><dt>Default branch</dt><dd>{repo?.defaultBranch}</dd><dt>Language</dt><dd>{repo?.primaryLanguage}</dd><dt>Visibility</dt><dd>{repo?.isPrivate ? "Private" : "Public"}</dd></dl><button className="d-button primary" disabled={!repo} onClick={openConversation}>Use in conversation <Icon name="arrow" /></button><p className="d-help">The application will ask before changing an active conversation’s context.</p></aside>
  </section>;
}

export function AstraDesignPreview() {
  // Keep the design study from touching real native accounts or providers.
  if (bridge.transportKind !== "mock") return <main className="d-guard"><h1>Browser design preview</h1><p>This study uses the existing browser mock only. Open the normal AURA entry point for the native application.</p></main>;
  return <Preview />;
}

function Preview() {
  const [repos, setRepos] = useState<RepositorySummary[]>([]);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [selected, setSelected] = useState("");
  const [contextRepo, setContextRepo] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [zone, setZone] = useState<ZoneId>("studio");
  const [revision, setRevision] = useState(0);
  const [layout, setLayout] = useState<Layout>("compact");
  const [specimen, setSpecimen] = useState<Specimen>("conversation");
  const [review, setReview] = useState("compact");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [motionOff, setMotionOff] = useState(false);
  const [systemReduced, setSystemReduced] = useState(matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [maxDpr, setMaxDpr] = useState(2);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const previousZone = useRef<ZoneId>("studio");
  const prompt = useRef<HTMLTextAreaElement>(null);
  const reduced = motionOff || systemReduced;
  useEffect(() => {
    const clamp = () => setPaneWidth((value) => value === null ? null : Math.max(440, Math.min(650, innerWidth - 600, value)));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);
  useEffect(() => {
    let live = true;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(media.matches);
    media.addEventListener("change", changed);
    void Promise.all([bridge.call("github.listRepositories", {}), bridge.call("ai.listProviders", {}), bridge.call("prefs.get", {})]).then(([page, list, prefs]) => {
      if (!live) return;
      setRepos(page.items); setProviders(list); setMotionOff(prefs.reduceMotion); setMaxDpr(prefs.graphics.maxPixelRatio);
      const first = page.items.find((item) => item.primaryLanguage === "TypeScript") ?? page.items[0];
      setSelected(first?.fullName ?? ""); setContextRepo(first?.fullName ?? "");
    }).catch(() => { if (live) setNotice("Sample data could not load. Layout controls remain available."); });
    return () => { live = false; media.removeEventListener("change", changed); };
  }, []);
  const navigate = useCallback((next: ZoneId) => { setZone(next); setRevision((value) => value + 1); }, []);
  const focus = useCallback(() => { navigate("companion"); setLayout("expanded"); setReview("expanded"); requestAnimationFrame(() => prompt.current?.focus()); }, [navigate]);
  const repo = repos.find((value) => value.fullName === contextRepo);
  const provider = providers.find((value) => value.builtIn);
  const changeLayout = (next: Layout) => {
    if (next === "focus" && layout !== "focus") { previousZone.current = zone; navigate("companion"); }
    if (layout === "focus" && next !== "focus") navigate(previousZone.current);
    setLayout(next); setReview(next);
  };
  const selectReview = (value: string) => {
    setReview(value); setDialog(null); setNotice(""); setSpecimen("conversation");
    if (["compact", "expanded", "focus"].includes(value)) { changeLayout(value as Layout); if (zone === "github") navigate("studio"); }
    else if (value === "projects") { navigate("github"); setLayout("compact"); }
    else { if (zone === "github") navigate("companion"); setLayout("expanded");
      if (["context", "approval", "providers"].includes(value)) setDialog(value as DialogName);
      else setSpecimen(value as Specimen);
    }
  };
  const resize = (value: number) => setPaneWidth(Math.max(440, Math.min(650, innerWidth - 600, value)));
  const composition = <form className="d-composer" onSubmit={(event) => { event.preventDefault(); setNotice("Draft retained. Sending to Astra begins in the Phase 3 implementation."); }}>
    <textarea ref={prompt} aria-label="Message Astra design draft" placeholder="What would you like to work on?" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} />
    <div className="d-composer-actions"><button type="button" className="d-context-button" onClick={() => setDialog("context")}><Icon name="plus" /><span>{repo?.name ?? "Add context"}{fileCount ? ` · ${fileCount} ${fileCount === 1 ? "file" : "files"}` : ""}</span></button><button className="d-send" disabled={!draft.trim()} aria-label="Preview send action" title="Preview send action"><Icon name="arrow" /></button></div>
  </form>;
  return <div className="d-app" data-layout={layout} data-zone={zone} data-reduced-motion={reduced} style={{ "--design-panel-width": paneWidth ? `${paneWidth}px` : "clamp(440px, 33.34vw, 500px)" } as CSSProperties}>
    <a className="d-skip" href="#design-working-area">Skip to workspace</a>
    <header className="d-chrome"><div className="d-brand"><ZoneIcon zone="studio" size={24} /><strong>AURA</strong></div><nav className="d-zone-nav" aria-label="Design studio zones">{ZONES.map((value) => <button key={value.id} aria-current={zone === value.id ? "page" : undefined} onClick={() => { navigate(value.id); if (value.id === "companion") { setLayout("expanded"); setReview("expanded"); } else if (value.id === "github") { setLayout("compact"); setReview("projects"); } else if (layout === "focus") setLayout("expanded"); }}><ZoneIcon zone={value.id} size={15} />{value.shortLabel}</button>)}</nav><div className="d-chrome-actions"><span className="d-mock-status">Browser mock</span><IconButton name="settings" label="AI provider settings" onClick={() => setDialog("providers")} /></div></header>
    <div className="d-context-strip"><span className="d-workspace-name"><span className="d-workspace-index">{String(ZONES.findIndex((value) => value.id === zone) + 1).padStart(2, "0")}</span>{getZone(zone).label}</span><div><button className="d-project-chip" onClick={() => setDialog("context")}><ZoneIcon zone="github" size={14} />{repo?.name ?? "No project context"}<span className="d-branch">{repo?.defaultBranch}</span><Icon name="chevron" /></button><span className="d-strip-divider" /><button onClick={() => { navigate("studio"); setLayout("compact"); setReview("compact"); }}><Icon name="back" />Overview</button></div></div>
    <main className="d-working-area" id="design-working-area" tabIndex={-1}>
      <section className="d-scene viewport" aria-label="Existing interactive 3D studio"><DesignScene zone={zone} revision={revision} reducedMotion={reduced} maxDpr={maxDpr} navigate={navigate} focus={focus} />
        <div className="d-scene-caption"><span className="d-kicker">A PERSONAL DEVELOPMENT STUDIO</span>{layout === "compact" ? <><h1>Room to <em>think clearly.</em></h1><p>Your projects. Your perspective. Astra, alongside.</p></> : <><h1>{zone === "companion" ? <>Astra, <em>alongside.</em></> : "Your workspace."}</h1><p>Drag to orbit · scroll to explore</p></>}</div>
        <button className="d-astra-presence" onClick={focus}><span className="d-presence-mark"><ZoneIcon zone="companion" size={23} /></span><span><strong>Astra Lumen II</strong><small>Ready for your next thought</small></span><span className="d-presence-dot" /></button>
        {layout === "compact" && zone !== "github" && <section className="d-compact-dock" aria-label="Compact conversation"><header><span className="d-astra-mark"><ZoneIcon zone="companion" size={20} /></span><div><strong>Work with Astra</strong><small>{provider?.displayName ?? "Loading provider…"} · text conversation</small></div><IconButton name="expand" label="Expand conversation" onClick={() => changeLayout("expanded")} /></header>{composition}</section>}
        <div className="d-scene-foot"><span>INTERACTIVE STUDIO</span><button onClick={() => { navigate("studio"); setNotice("Overview camera restored."); }}>Reset view</button></div>
      </section>
      {layout !== "compact" && zone !== "github" && <section className="d-conversation" aria-label="Conversation layout prototype">
        {layout === "expanded" && <div className="d-splitter" role="separator" aria-label="Conversation width" aria-orientation="vertical" aria-valuemin={440} aria-valuemax={Math.min(650, innerWidth - 600)} aria-valuenow={paneWidth ?? Math.min(500, Math.max(440, innerWidth / 3))} tabIndex={0} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(innerWidth - event.clientX); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); resize(event.key === "Home" ? 440 : event.key === "End" ? 650 : (paneWidth ?? 480) + (event.key === "ArrowLeft" ? 16 : -16)); } }} />}
        <header className="d-conversation-heading"><span className="d-astra-mark"><ZoneIcon zone="companion" size={22} /></span><div><h2>Astra</h2><small>{provider?.displayName ?? "Loading provider…"} <span>·</span> This session</small></div><div className="d-pane-actions"><IconButton name="plus" label="New conversation specimen" onClick={() => { setSpecimen("empty"); setReview("empty"); setDraft(""); }} /><IconButton name={layout === "focus" ? "collapse" : "expand"} label={layout === "focus" ? "Leave focus mode" : "Enter focus mode"} onClick={() => changeLayout(layout === "focus" ? "expanded" : "focus")} /><IconButton name="close" label="Collapse conversation" onClick={() => changeLayout("compact")} /></div></header>
        <div className="d-conversation-context"><button onClick={() => setDialog("context")}><ZoneIcon zone="github" size={14} /><span>{repo?.name ?? "No project context"}</span><Icon name="chevron" /></button><span className="d-badge neutral">{repo?.defaultBranch ?? "Workspace"}</span></div>
        <div className="d-transcript" tabIndex={0} aria-label="Authored conversation specimen">
          {specimen === "empty" ? <div className="d-conversation-empty"><span className="d-large-astra"><ZoneIcon zone="companion" size={36} /></span><span className="d-kicker">A LITTLE CONTEXT. A CLEARER NEXT STEP.</span><h3>Start with the work<br />in front of you.</h3><p>Bring a question, a project, or a line of code. Choose the context Astra can use.</p>{["Help me understand this project", "Review the current architecture", "Think through the next step"].map((value) => <button key={value} onClick={() => { setDraft(value); prompt.current?.focus(); }}>{value}<Icon name="arrow" /></button>)}</div> : <div className="d-reading-measure"><p className="d-specimen-label">CONVERSATION SPECIMEN · AUTHORED DESIGN CONTENT</p><div className="d-user-message"><span>You</span><p>How can this workspace support a focused review?</p></div><div className="d-answer-label"><ZoneIcon zone="companion" size={17} /><strong>Astra</strong><span>Layout specimen</span></div><article className="d-answer"><h3>Keep the room.<br />Make space for the work.</h3><p>A conversation should feel like part of your workspace. Keep the project in view, give the explanation room to breathe, and choose exactly what context to bring along.</p><ToolSpecimen running={specimen === "tools"} /><p>The expanded pane supports quick questions. Focus mode gives longer explanations and code a comfortable reading width.</p><CodeSpecimen announce={setNotice} /><p className="d-answer-note">This is an authored interface specimen, not a generated response. Real replies will use the existing native conversation service.</p></article>
            {specimen === "error" && <div className="d-error" role="alert"><strong>The reply could not be completed.</strong><p>Error-state specimen. Keep partial text and offer a recovery action appropriate to the native error code.</p><button className="d-button" onClick={() => { setSpecimen("empty"); setNotice("Recovery layout previewed. No message sent."); }}>Preview recovery</button></div>}
          </div>}
        </div>
        <div className="d-pane-composer">{composition}<div className="d-composer-help"><span>Context stays in your control</span><button onClick={() => setDialog("providers")}>Provider settings</button></div></div>
      </section>}
      {zone === "github" && <Projects repos={repos} selected={selected} select={setSelected} openConversation={() => { setContextRepo(selected); navigate("companion"); setLayout("expanded"); setReview("expanded"); setNotice("Conversation context previewed. No native conversation was changed."); }} />}
    </main>
    {notice && <div className="d-notice" role="status"><Icon name="check" /><span>{notice}</span><IconButton name="close" label="Dismiss notice" onClick={() => setNotice("")} /></div>}
    <footer className="d-footer"><span>AURA <span>/</span> Design study 01</span><span>“Astra Lumen II” by <a href="https://sketchfab.com/pinckneyb" target="_blank" rel="noreferrer">XRProfXR</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://sketchfab.com/3d-models/astra-lumen-ii-a-rigged-companion-android-84761f55aa17493d9b226bb1f7101428" target="_blank" rel="noreferrer">Source</a></span></footer>
    <aside className="d-review-bar" aria-label="Design review controls"><strong>INTERACTION STUDY</strong><span>Prototype only · no AI requests</span><label>View<select aria-label="Design scenario" value={review} onChange={(event) => selectReview(event.target.value)}>{[["compact", "Compact studio"], ["expanded", "Expanded conversation"], ["focus", "Focus reading"], ["context", "Context selection"], ["tools", "Tool activity"], ["approval", "Consent dialog"], ["providers", "Provider settings"], ["projects", "Project explorer"], ["empty", "Empty conversation"], ["error", "Recovery state"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={motionOff} onChange={(event) => setMotionOff(event.target.checked)} />Reduce motion</label></aside>
    {dialog === "context" && <ContextDialog repos={repos} selected={contextRepo} close={() => setDialog(null)} apply={(value, count) => { setContextRepo(value); setFileCount(count); setDialog(null); setNotice("Context selection previewed. No data sent."); }} />}
    {dialog === "approval" && <ApprovalDialog repository={repos.find((value) => value.isPrivate)} close={() => { setDialog(null); setNotice("Deny choice previewed. No approval was sent."); }} decide={(value) => { setDialog(null); setNotice(`${value} choice previewed. No approval was sent.`); }} />}
    {dialog === "providers" && <ProvidersDialog providers={providers} close={() => setDialog(null)} announce={setNotice} />}
  </div>;
}
