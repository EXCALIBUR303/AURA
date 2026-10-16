import { useEffect, useState } from "react";
import type { CommitSummary, ProjectRecord, RepositorySummary, ZoneId } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { ZONES } from "../studio/zones.ts";
import { ArrowIcon } from "./Icon.tsx";

export function Inspector({ zone }: { zone: ZoneId }) {
  const [repos, setRepos] = useState<RepositorySummary[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [notes, setNotes] = useState("");
  const [assigned, setAssigned] = useState<ZoneId | "">("");
  const [pinned, setPinned] = useState(false);
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

  useEffect(() => {
    const record = projects.find((project) => project.id === selected);
    setNotes(record?.notes ?? ""); setAssigned(record?.zone ?? ""); setPinned(record?.pinned ?? false);
  }, [selected, projects]);
  useEffect(() => { setSaved(false); }, [selected]);

  const repo = repos.find((item) => item.fullName === selected);
  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const record = await bridge.call("projects.update", { id: selected, notes, pinned, zone: assigned || null });
      setProjects((current) => [...current.filter((item) => item.id !== record.id), record]); setSaved(true);
    } catch { setError("Project changes could not be saved. Your edits are still here."); }
    finally { setSaving(false); }
  }

  return <aside className="inspector glass" aria-labelledby="inspector-heading">
    <div className="rail-heading"><span className="eyebrow">WORKSPACE</span><span className="rail-symbol" aria-hidden="true">▥</span></div>
    <h2 id="inspector-heading">Workstation inspector</h2>
    <p className="muted compact">Your projects, close at hand.</p>
    <div className="data-label">{bridge.transportKind === "mock" ? "Mock bridge · sample data" : "Native bridge"}</div>
    {error && <div role="alert" className="inline-error">{error} <button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    {loading ? <p role="status">Loading repositories…</p> : repos.length === 0 ? <p>No repositories are available.</p> : <>
      <section className="repo-section">
        <h3>Project repositories <span className="count">{repos.length}</span></h3>
        <div className="repo-list" role="group" aria-label="Project repositories">
          {repos.map((item) => <button key={item.fullName} onClick={() => setSelected(item.fullName)} disabled={saving}
            aria-pressed={item.fullName === selected} className={`repo-row ${item.fullName === selected ? "active" : ""}`}>
            <span className="repo-icon" aria-hidden="true">⑂</span><span><strong>{item.name}</strong><small>{item.owner} · {item.primaryLanguage ?? "No language"}</small></span>
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
        <section>
          <h3>Recent commits</h3>
          {commitLoading ? <p role="status">Loading commits…</p> : commits.length === 0 ? <p className="muted">No commits available.</p> :
            <ol className="commit-list">{commits.map((commit) => <li key={commit.sha}>
              <span className="commit-dot" aria-hidden="true" /><div><p>{commit.message}</p><small>{commit.authorName} · <code>{commit.sha.slice(0, 7)}</code></small></div>
            </li>)}</ol>}
        </section>
        <form className="project-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <h3>Local project</h3>
          <label htmlFor="project-zone">Studio zone</label>
          <select id="project-zone" value={assigned} disabled={saving} onChange={(event) => { setAssigned(event.target.value as ZoneId | ""); setSaved(false); }}>
            <option value="">Unassigned</option>{ZONES.map((item) => <option key={item.id} value={item.id}>{item.label}{item.id === zone ? " · current" : ""}</option>)}
          </select>
          <label htmlFor="project-notes">Notes</label>
          <textarea id="project-notes" rows={2} value={notes} disabled={saving} placeholder="A note for your next session…" onChange={(event) => { setNotes(event.target.value); setSaved(false); }} />
          <label className="checkbox"><input type="checkbox" checked={pinned} disabled={saving} onChange={(event) => { setPinned(event.target.checked); setSaved(false); }} /> Pin this project</label>
          <button className="primary save-project" disabled={saving}>{saving ? "Saving…" : "Save project"}<ArrowIcon /></button>
          <p role="status" className="save-status">{saved ? "Saved to the project store." : bridge.transportKind === "mock" ? "Mock project changes last for this session." : "Stored locally on this Mac."}</p>
        </form>
      </>}
    </>}
  </aside>;
}
