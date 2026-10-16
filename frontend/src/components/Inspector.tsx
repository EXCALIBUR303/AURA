import { useEffect, useState } from "react";
import type { CommitSummary, ProjectRecord, RepositorySummary, ZoneId } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { getZone, ZONES } from "../studio/zones.ts";
import { ArrowIcon } from "./Icon.tsx";
import { ZoneIcon } from "./ZoneIcon.tsx";

type Draft = { notes: string; zone: ZoneId | ""; pinned: boolean };

export function Inspector({ zone, navigate }: { zone: ZoneId; navigate: (zone: ZoneId) => void }) {
  const [repos, setRepos] = useState<RepositorySummary[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scope, setScope] = useState<"all" | "zone">("all");
  const [loading, setLoading] = useState(true);
  const [commitLoading, setCommitLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    void Promise.all([bridge.call("github.listRepositories", {}), bridge.call("projects.list", {})]).then(([page, records]) => {
      if (!live) return;
      setRepos(page.items); setProjects(records); setSelected((value) => value || page.items[0]?.fullName || "");
    }).catch(() => { if (live) setError("Workstation data is unavailable. Try again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    setCommits([]); setCommitLoading(true); setError(null);
    void bridge.call("github.listCommits", { fullName: selected, limit: 3 }).then((value) => { if (live) setCommits(value); })
      .catch(() => { if (live) setError("Recent commits could not be loaded."); })
      .finally(() => { if (live) setCommitLoading(false); });
    return () => { live = false; };
  }, [selected, reload]);

  useEffect(() => { setSaved(false); }, [selected]);

  const station = getZone(zone);
  const record = projects.find((project) => project.id === selected);
  const draft = drafts[selected] ?? { notes: record?.notes ?? "", zone: record?.zone ?? "", pinned: record?.pinned ?? false };
  const { notes, zone: assigned, pinned } = draft;
  function edit(change: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [selected]: { ...draft, ...change } }));
    setSaved(false);
  }
  const scoped = repos.filter((repo) => projects.some((project) => project.id === repo.fullName && project.zone === zone));
  const visible = scope === "zone" ? scoped : repos;
  const repo = repos.find((item) => item.fullName === selected);
  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const record = await bridge.call("projects.update", { id: selected, notes, pinned, zone: assigned || null });
      setProjects((current) => [...current.filter((item) => item.id !== record.id), record]);
      setDrafts((current) => { const next = { ...current }; delete next[record.id]; return next; }); setSaved(true);
    } catch { setError("Project changes could not be saved. Your edits are still here."); }
    finally { setSaving(false); }
  }

  return <aside className="inspector glass" aria-labelledby="inspector-heading">
    <div className="rail-heading"><span className="eyebrow">{zone === "studio" ? "WORKSPACE" : station.label}</span><span className="rail-symbol"><ZoneIcon zone={zone} size={22} /></span></div>
    <h2 id="inspector-heading">Workstation inspector</h2>
    <p className="muted compact">{zone === "studio" ? "Your projects, close at hand." : "Projects in the context of your workstation."}</p>
    <div className="data-label">{bridge.transportKind === "mock" ? "Mock bridge · sample data" : "Native bridge"}</div>
    {error && <div role="alert" className="inline-error">{error} <button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    {loading ? <p role="status">Loading repositories…</p> : repos.length === 0 ? <p>No repositories are available.</p> : <>
      <section className="repo-section">
        <h3>Project repositories <span className="count">{repos.length}</span></h3>
        <div className="project-scope" role="group" aria-label="Project scope">
          <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>All projects</button>
          <button aria-pressed={scope === "zone"} onClick={() => setScope("zone")}>This workstation <span>{scoped.length}</span></button>
        </div>
        {visible.length === 0 && <p className="empty-projects">No projects assigned here yet. Select a project from All projects to assign it.</p>}
        <div className="repo-list" role="group" aria-label="Project repositories">
          {visible.map((item) => <button key={item.fullName} onClick={() => setSelected(item.fullName)} disabled={saving}
            aria-pressed={item.fullName === selected} className={`repo-row ${item.fullName === selected ? "active" : ""}`}>
            <span className="repo-icon"><ZoneIcon zone="github" size={17} /></span><span><strong>{item.name}</strong><small>{item.owner} · {item.primaryLanguage ?? "No language"}</small></span>
            {projects.find((project) => project.id === item.fullName)?.pinned && <span aria-label="Pinned">◆</span>}
          </button>)}
        </div>
      </section>
      {repo && <>
        <section className="repository-detail">
          <div className="section-heading"><h3>Repository details</h3><span className="tag">{repo.isPrivate ? "Private" : "Public"}</span></div>
          <p className="mono repo-fullname">{repo.fullName}</p>
          <p className="muted compact">{repo.description ?? "No description provided."}</p>
          <dl className="facts"><dt>Branch</dt><dd>{repo.defaultBranch}</dd><dt>Language</dt><dd>{repo.primaryLanguage ?? "—"}</dd></dl>
        </section>
        <details className="recent-commits">
          <summary>Recent commits <span className="count">{commits.length}</span></summary>
          {commitLoading ? <p role="status">Loading commits…</p> : commits.length === 0 ? <p className="muted">No commits available.</p> :
            <ol className="commit-list">{commits.map((commit) => <li key={commit.sha}>
              <span className="commit-dot" aria-hidden="true" /><div><p>{commit.message}</p><small>{commit.authorName} · <code>{commit.sha.slice(0, 7)}</code></small></div>
            </li>)}</ol>}
        </details>
        <form className="project-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="section-heading"><h3>Local project</h3>{drafts[selected] && <span className="draft-label">Unsaved edits</span>}</div>
          {record?.zone && <button type="button" className="project-location" onClick={() => navigate(record.zone!)}><ZoneIcon zone={record.zone} size={14} />Visit {getZone(record.zone).label}<ArrowIcon /></button>}
          {zone !== "studio" && assigned !== zone && <button type="button" className="assign-here" disabled={saving} onClick={() => edit({ zone })}>Assign to {station.label}</button>}
          <label htmlFor="project-zone">Studio zone</label>
          <select id="project-zone" value={assigned} disabled={saving} onChange={(event) => { edit({ zone: event.target.value as ZoneId | "" }); }}>
            <option value="">Unassigned</option>{ZONES.map((item) => <option key={item.id} value={item.id}>{item.label}{item.id === zone ? " · current" : ""}</option>)}
          </select>
          <label htmlFor="project-notes">Notes</label>
          <textarea id="project-notes" rows={2} value={notes} disabled={saving} placeholder="A note for your next session…" onChange={(event) => { edit({ notes: event.target.value }); }} />
          <label className="checkbox"><input type="checkbox" checked={pinned} disabled={saving} onChange={(event) => { edit({ pinned: event.target.checked }); }} /> Pin this project</label>
          <button className="primary save-project" disabled={saving}>{saving ? "Saving…" : "Save project"}<ArrowIcon /></button>
          <p role="status" className="save-status">{saved ? "Saved to the project store." : bridge.transportKind === "mock" ? "Mock project changes last for this session." : "Stored locally on this Mac."}</p>
        </form>
      </>}
    </>}
  </aside>;
}
