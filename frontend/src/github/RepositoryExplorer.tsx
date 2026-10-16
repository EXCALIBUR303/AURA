import { ArrowIcon } from "../components/Icon.tsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ZoneId } from "@aura/contracts";
import type { GitHubWorkspace } from "./useGitHubWorkspace.ts";
import { dateLabel, filterRepositories, issueFor } from "./model.ts";
import type { RepositorySort } from "./model.ts";
import { GitHubConnection, GitHubLink } from "./GitHubConnection.tsx";
import { getZone } from "../studio/zones.ts";
import { ZoneIcon } from "../components/ZoneIcon.tsx";

export function RepositoryExplorer({ workspace, navigate }: { workspace: GitHubWorkspace; navigate: (zone: ZoneId) => void }) {
  const g = workspace;
  const sheet = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const panel = sheet.current, viewport = panel?.closest(".viewport"), dock = viewport?.querySelector(".command-dock");
    if (!panel || !viewport || !dock) return;
    const measure = () => { panel.style.bottom = `${Math.max(62, viewport.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 18)}px`; };
    const observer = new ResizeObserver(measure); observer.observe(dock); observer.observe(viewport); measure();
    return () => observer.disconnect();
  }, []);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<RepositorySort>("activity");
  const [dateLoading, setDateLoading] = useState(false);
  const [dateIssue, setDateIssue] = useState("");
  const [retryDates, setRetryDates] = useState(0);
  useEffect(() => {
    if (sort !== "updated" || !g.canRead) { setDateLoading(false); return; }
    let live = true, index = 0;
    setDateLoading(true); setDateIssue("");
    const work = async () => {
      while (live && index < g.repos.length) {
        const repo = g.repos[index++]; if (!repo) return;
        try { await g.loadRepository(repo.fullName); }
        catch (error) { if (live) { setDateIssue(issueFor(error).text); g.sessionFailure(error); } return; }
      }
    };
    void Promise.all([work(), work(), work()]).finally(() => { if (live) setDateLoading(false); });
    return () => { live = false; };
  }, [sort, g.repos, g.canRead, g.loadRepository, g.sessionFailure, g.revision, retryDates]);
  const languages = useMemo(() => [...new Set(g.repos.flatMap((r) => r.primaryLanguage ? [r.primaryLanguage] : []))].sort(), [g.repos]);
  const visible = filterRepositories(g.repos, query, language, sort, g.metadata);
  const connected = g.auth?.state === "connected" || g.auth?.state === "rate_limited" || (g.auth?.state === "error" && g.auth.reason === "network" && g.repos.length > 0);
  return <section ref={sheet} className="github-explorer glass" aria-labelledby="explorer-heading">
    <header className="explorer-heading"><div><span className="eyebrow">GITHUB / PROJECT COLLECTION</span><h1 id="explorer-heading">Your code, <em>in context.</em></h1></div><button aria-label="Return to 3D overview" onClick={() => navigate("studio")}><ZoneIcon zone="studio" size={16} />3D overview</button></header>
    <div className="explorer-scroll">
      <GitHubConnection workspace={g} />
      {connected && <>
        <div className="explorer-toolbar">
          <label className="repository-search">Search repositories<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, description, or topic" /></label>
          <label>Primary language<select aria-label="Primary language" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">All languages</option>{languages.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Sort repositories<select aria-label="Sort repositories" value={sort} onChange={(e) => setSort(e.target.value as RepositorySort)}><option value="activity">Recent push</option><option value="name">Name</option><option value="updated">Last updated</option></select></label>
          <button className="refresh-repositories" disabled={g.busy || g.loading || g.auth?.state === "rate_limited"} onClick={() => void g.refresh()}>Refresh</button>
        </div>
        <div className="collection-summary"><p role="status">{g.loading ? "Loading repositories…" : `${visible.length} of ${g.repos.length} loaded repositories${g.nextCursor ? " · more available" : ""}`}</p><span>Manual workspace assignments</span></div>
        {dateLoading && <p role="status" className="metadata-status">Loading repository update dates…</p>}
        {dateIssue && <p role="alert" className="github-feedback">Some update dates are unavailable. {dateIssue} <button disabled={!g.canRead} onClick={() => setRetryDates((v) => v + 1)}>Retry update dates</button></p>}
        {g.loading && g.repos.length === 0 && <div className="repository-skeleton" aria-hidden="true"><div /><div /></div>}
        {!g.loading && !g.issue && g.repos.length === 0 && <div className="explorer-empty"><ZoneIcon zone="github" size={28} /><h2>{g.auth && "installations" in g.auth && g.auth.installations.length === 0 ? "Install AURA Developer Companion on GitHub" : "No repositories are shared with AURA"}</h2><p>Choose which repositories AURA can read in GitHub’s installation settings.</p><GitHubLink href={g.auth && "installations" in g.auth ? g.auth.installations[0]?.manageUrl ?? "https://github.com/settings/installations" : "https://github.com/settings/installations"}>Change repository access <ArrowIcon /></GitHubLink></div>}
        {!g.loading && g.repos.length > 0 && visible.length === 0 && <div className="explorer-empty"><h2>No matching repositories</h2><p>Search and filters apply to loaded repositories.</p><button onClick={() => { setQuery(""); setLanguage(""); }}>Clear filters</button></div>}
        <div className="repository-grid" role="group" aria-label="GitHub repositories">
          {visible.map((repo) => {
            const record = g.projects.find((p) => p.id === repo.fullName);
            return <article key={repo.fullName} className={`repository-card ${g.selected === repo.fullName ? "is-selected" : ""}`}>
              <div className="repository-card-title"><ZoneIcon zone="github" size={18} /><span className="tag">{repo.isPrivate ? "Private" : "Public"}</span>{repo.isArchived && <span className="tag">Archived</span>}{repo.isFork && <span className="tag">Fork</span>}{record?.pinned && <span className="pinned-label">Pinned</span>}</div>
              <button className="repository-select" aria-pressed={g.selected === repo.fullName} aria-label={`Inspect ${repo.fullName}`} onClick={() => g.select(repo.fullName)}><strong>{repo.name}</strong><small>{repo.owner}</small></button>
              <p className="repository-description">{repo.description || "No description provided."}</p>
              <div className="repository-topics">{repo.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}</div>
              <div className="repository-card-meta"><span>{repo.primaryLanguage ?? "No primary language"}</span><span>★ {repo.stargazerCount}</span><span>{sort === "updated" ? `Updated ${dateLabel(g.metadata[repo.fullName]?.updatedAt ?? null)}` : `Pushed ${dateLabel(repo.pushedAt)}`}</span></div>
              <div className="repository-card-zone"><span>{record?.zone ? getZone(record.zone).label : "Unassigned workspace"}</span><GitHubLink href={repo.htmlUrl}>GitHub <ArrowIcon /></GitHubLink></div>
            </article>;
          })}
        </div>
        {g.nextCursor && <div className="load-more-row"><button disabled={!g.canRead || g.loadingMore || g.loading} onClick={() => void g.more()}>{g.loadingMore ? "Loading more…" : "Load more repositories"}</button><small>Search includes loaded pages. Load more to search further.</small></div>}
      </>}
    </div>
  </section>;
}
