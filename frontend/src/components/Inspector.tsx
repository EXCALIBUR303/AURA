import { useEffect, useState } from "react";
import type { ZoneId } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { getZone, ZONES } from "../studio/zones.ts";
import { ArrowIcon } from "./Icon.tsx";
import { ZoneIcon } from "./ZoneIcon.tsx";
import type { GitHubWorkspace, ProjectDraft } from "../github/useGitHubWorkspace.ts";
import { RepositoryDetails } from "../github/RepositoryDetails.tsx";
import { issueFor } from "../github/model.ts";
import { IconButton } from "./ui.tsx";

export function Inspector({ zone, navigate, workspace: g, useInConversation, close }: { zone: ZoneId; navigate: (zone: ZoneId) => void; workspace: GitHubWorkspace; useInConversation?: () => void; close?: () => void }) {
  const [scope, setScope] = useState<"all" | "zone" | "pinned">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState("");
  const [suggestionNotice, setSuggestionNotice] = useState("");
  useEffect(() => { setSavedFor(""); setError(null); setSuggestionNotice(""); }, [g.selected, g.epoch]);
  const station = getZone(zone);
  const record = g.projects.find((p) => p.id === g.selected);
  const draft = g.drafts[g.selected] ?? { notes: record?.notes ?? "", zone: record?.zone ?? "", pinned: record?.pinned ?? false };
  const { notes, zone: assigned, pinned } = draft;
  function edit(change: Partial<ProjectDraft>) {
    g.setDrafts((current) => ({ ...current, [g.selected]: { ...draft, ...change } })); setSavedFor("");
  }
  const scoped = g.repos.filter((repo) => g.projects.some((p) => p.id === repo.fullName && p.zone === zone));
  const visible = scope === "zone" ? scoped : scope === "pinned" ? g.repos.filter((r) => g.projects.some((p) => p.id === r.fullName && p.pinned)) : g.repos;
  const repo = g.repos.find((r) => r.fullName === g.selected);
  const suggestion = g.suggestions.find((s) => s.id === g.selected);
  const showData = (g.auth?.state === "connected" && g.issue?.code !== "not_authenticated") || g.auth?.state === "rate_limited" || (g.auth?.state === "error" && g.auth.reason === "network" && g.repos.length > 0);
  async function save() {
    const id = g.selected;
    setSaving(true); setError(null); setSavedFor("");
    try {
      await g.updateProject({ id, notes, pinned, zone: assigned || null });
      g.setDrafts((current) => { const next = { ...current }; delete next[id]; return next; }); setSavedFor(id);
    } catch (failure) { setError(`${issueFor(failure).text} Your edits are still here.`); }
    finally { setSaving(false); }
  }
  async function acceptSuggestion() {
    if (!suggestion) return;
    setSaving(true); setError(null);
    try {
      await g.updateProject({ id: suggestion.id, zone: suggestion.zone });
      g.setDrafts((current) => current[suggestion.id] ? { ...current, [suggestion.id]: { ...current[suggestion.id]!, zone: suggestion.zone } } : current);
      setSuggestionNotice("Workspace suggestion applied locally."); navigate(suggestion.zone);
    } catch (failure) { setError(issueFor(failure).text); }
    finally { setSaving(false); }
  }
  return <aside className="inspector glass" aria-labelledby="inspector-heading">
    <header className="inspector-summary">
      <div className="rail-heading"><span className="eyebrow">{zone === "studio" ? "WORKSPACE" : station.label}</span><span className="rail-symbol"><ZoneIcon zone={zone} size={22} /></span></div>
      <div className="section-heading"><h2 id="inspector-heading">Workstation inspector</h2>{close && <IconButton name="close" label="Close project inspector" onClick={close} />}</div><p className="muted compact">Your projects, close at hand.</p>
      <div className="data-label">{bridge.transportKind === "mock" ? "Mock bridge · sample data" : "Native GitHub bridge"}</div>
      <div className="inspector-connection"><span>{g.auth && "account" in g.auth ? `@${g.auth.account.login} · ${g.auth.state === "rate_limited" ? "Rate limited" : "GitHub connected"}` : g.auth?.state === "authorizing" ? "Waiting for GitHub authorization" : "GitHub not connected"}</span><button onClick={() => navigate("github")}>Manage GitHub</button></div>
      {g.projectIssue && <p role="alert" className="inline-error">Project assignments or suggestions are unavailable. {g.projectIssue.text}<button disabled={g.busy || !g.canRead} onClick={() => void g.refresh()}>Retry projects</button></p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </header>
    {!showData ? <div className="inspector-empty"><ZoneIcon zone="github" size={26} /><p>{!g.auth ? "Checking GitHub connection…" : "Connect GitHub to bring your repositories into the studio."}</p><button className="primary" onClick={() => navigate("github")}>Open GitHub connection</button></div> : <div className="inspector-body">
      {g.auth?.state !== "connected" && <p className="compact cached-notice">Showing loaded data. GitHub requests are paused.</p>}
      <section className="repo-section"><h3>Project repositories <span className="count">{g.repos.length}</span></h3>
        <div className="project-scope" role="group" aria-label="Project scope"><button aria-pressed={scope === "all"} onClick={() => setScope("all")}>All projects</button><button aria-pressed={scope === "zone"} onClick={() => setScope("zone")}>This workstation <span>{scoped.length}</span></button>{zone === "studio" && <button aria-pressed={scope === "pinned"} onClick={() => setScope("pinned")}>Pinned</button>}</div>
        {g.loading && <p role="status" className="compact muted">Loading repositories…</p>}
        {!g.loading && visible.length === 0 && <p className="empty-projects">{scope === "zone" ? "No projects assigned here yet. Select a project from All projects to assign it." : scope === "pinned" ? "Pin a project to keep it close in your main studio." : "No repositories loaded. Open GitHub to connect, retry, or change repository access."}</p>}
        <div className="repo-list" role="group" aria-label="Project repositories">{visible.map((item) => <button key={item.fullName} onClick={() => g.select(item.fullName)} disabled={saving} aria-pressed={item.fullName === g.selected} className={`repo-row ${item.fullName === g.selected ? "active" : ""}`}><span className="repo-icon"><ZoneIcon zone={g.projects.find((p) => p.id === item.fullName)?.zone ?? "github"} size={17} /></span><span><strong>{item.name}</strong><small>{item.owner} · {item.primaryLanguage ?? "No language"}</small></span>{g.projects.find((p) => p.id === item.fullName)?.pinned && <span aria-label="Pinned">◆</span>}</button>)}</div>
        <button className="browse-projects" onClick={() => navigate("github")}>Browse and search repositories <ArrowIcon /></button>
      </section>
      {repo && <div className="inspector-project">
        {useInConversation && <button className="ui-button use-project-context" disabled={!g.canRead} onClick={useInConversation}>Use project in conversation <ArrowIcon /></button>}
        {record?.zone && record.zone !== zone && !["studio", "github", "companion"].includes(zone) && <p className="compact muted selected-project-context">Selected project: {getZone(record.zone).label}. Assign it here or visit its saved workstation below.</p>}
        <RepositoryDetails key={`${g.epoch}:${repo.fullName}`} workspace={g} repo={repo} />
        <form className="project-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={saving || !g.projectsReady}>
          <div className="section-heading"><h3>Local project</h3>{g.drafts[g.selected] && <span className="draft-label">Unsaved edits</span>}</div>
          {record?.zone && <button type="button" className="project-location" onClick={() => navigate(record.zone!)}><ZoneIcon zone={record.zone} size={14} />Visit {getZone(record.zone).label}<ArrowIcon /></button>}
          {zone !== "studio" && zone !== "github" && assigned !== zone && <button type="button" className="assign-here" disabled={saving} onClick={() => edit({ zone })}>Assign to {station.label}</button>}
          {suggestion && <div className="zone-suggestion"><span className="eyebrow">SUGGESTED WORKSPACE</span><strong>{getZone(suggestion.zone).label}</strong><p>{suggestion.confidence} confidence · {suggestion.reasons.join(" · ")}</p><div><button type="button" disabled={saving || !g.canRead} onClick={() => void acceptSuggestion()}>Accept suggested workspace</button><button type="button" disabled={saving} onClick={() => g.dismiss(suggestion.id)}>Dismiss suggestion</button></div></div>}
          {suggestionNotice && <p role="status" className="compact">{suggestionNotice}</p>}
          <label htmlFor="project-zone">Studio zone</label><select id="project-zone" value={assigned} disabled={saving} onChange={(event) => edit({ zone: event.target.value as ZoneId | "" })}><option value="">Unassigned</option>{ZONES.map((item) => <option key={item.id} value={item.id}>{item.label}{item.id === zone ? " · current" : ""}</option>)}</select>
          <label htmlFor="project-notes">Notes</label><textarea id="project-notes" rows={2} value={notes} disabled={saving} placeholder="A note for your next session…" onChange={(event) => edit({ notes: event.target.value })} />
          <label className="checkbox"><input type="checkbox" checked={pinned} disabled={saving} onChange={(event) => edit({ pinned: event.target.checked })} /> Pin this project</label>
          <button className="primary save-project" disabled={saving}>{saving ? "Saving…" : "Save project"}<ArrowIcon /></button><p role="status" className="save-status">{savedFor === g.selected ? "Saved to the project store." : bridge.transportKind === "mock" ? "Mock project changes last for this session." : "Stored locally on this Mac. GitHub stays read-only."}</p>
          </fieldset>
        </form>
      </div>}
    </div>}
  </aside>;
}
