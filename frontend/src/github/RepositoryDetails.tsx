import { useEffect, useState } from "react";
import type { BranchSummary, CommitSummary, RepositorySummary } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import type { GitHubWorkspace } from "./useGitHubWorkspace.ts";
import { dateLabel, issueFor } from "./model.ts";
import { GitHubLink } from "./GitHubConnection.tsx";

export function RepositoryDetails({ workspace: g, repo }: { workspace: GitHubWorkspace; repo: RepositorySummary }) {
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchPage, setBranchPage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [branch, setBranch] = useState(repo.defaultBranch);
  const [branchLoading, setBranchLoading] = useState(false);
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [commitLoading, setCommitLoading] = useState(g.canRead);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const detail = g.metadata[repo.fullName];
  useEffect(() => {
    if (!g.canRead) { setDetailLoading(false); setBranchLoading(false); return; }
    let live = true;
    setDetailLoading(true); setBranchLoading(true); setBranchPage(null); setErrors({});
    void g.loadRepository(repo.fullName).catch((error: unknown) => { if (live) { setErrors((v) => ({ ...v, detail: issueFor(error).text })); g.sessionFailure(error); } }).finally(() => { if (live) setDetailLoading(false); });
    void bridge.call("github.listBranches", { fullName: repo.fullName, perPage: 30 }).then((page) => { if (live) { setBranches(page.items); setCursor(page.nextCursor); } })
      .catch((error: unknown) => { if (live) { setErrors((v) => ({ ...v, branches: issueFor(error).text })); g.sessionFailure(error); } })
      .finally(() => { if (live) setBranchLoading(false); });
    return () => { live = false; };
  }, [repo.fullName, g.canRead, g.epoch, g.revision, g.loadRepository, g.sessionFailure, retry]);
  useEffect(() => {
    if (!g.canRead) { setCommitLoading(false); return; }
    let live = true;
    setCommits([]); setCommitLoading(true); setErrors((v) => { const next = { ...v }; delete next.commits; return next; });
    void bridge.call("github.listCommits", { fullName: repo.fullName, branch, limit: 3 }).then((items) => { if (live) setCommits(items); })
      .catch((error: unknown) => { if (live) { setErrors((v) => ({ ...v, commits: issueFor(error).text })); g.sessionFailure(error); } })
      .finally(() => { if (live) setCommitLoading(false); });
    return () => { live = false; };
  }, [repo.fullName, branch, g.canRead, g.epoch, g.revision, g.sessionFailure, retry]);
  useEffect(() => {
    if (!branchPage || !g.canRead) return;
    // Additional pages are requested explicitly, never by scrolling the scene.
    let live = true;
    void bridge.call("github.listBranches", { fullName: repo.fullName, cursor: branchPage, perPage: 30 }).then((page) => {
      if (live) { setBranches((current) => [...new Map([...current, ...page.items].map((b) => [b.name, b])).values()]); setCursor(page.nextCursor); }
    }).catch((error: unknown) => { if (live) { setErrors((v) => ({ ...v, branches: issueFor(error).text })); g.sessionFailure(error); } })
      .finally(() => { if (live) { setBranchLoading(false); setBranchPage(null); } });
    return () => { live = false; };
  }, [branchPage, g.canRead, g.epoch, repo.fullName, g.sessionFailure]);
  const selectedBranch = branches.find((b) => b.name === branch);
  const totalBytes = detail?.languages.reduce((sum, language) => sum + language.bytes, 0) ?? 0;
  return <>
    <section className="repository-detail">
      <div className="section-heading"><h3>Repository details</h3><span className="tag">{repo.isPrivate ? "Private" : "Public"}</span></div>
      <p className="mono repo-fullname"><GitHubLink href={repo.htmlUrl}>{repo.fullName}</GitHubLink></p>
      <p className="muted compact">{repo.description ?? "No description provided."}</p>
      {(repo.isArchived || repo.isFork) && <p className="repository-flags">{repo.isArchived && <span className="tag">Archived</span>}{repo.isFork && <span className="tag">Fork</span>}</p>}
      <dl className="facts"><dt>Default branch</dt><dd>{repo.defaultBranch}</dd><dt>Language</dt><dd>{repo.primaryLanguage ?? "—"}</dd>
        {detail && <><dt>Stars / forks</dt><dd>{detail.stargazerCount} / {detail.forksCount}</dd><dt>Open issues</dt><dd>{detail.openIssuesCount}</dd><dt>License</dt><dd>{detail.license ?? "Not detected"}</dd><dt>Created</dt><dd>{dateLabel(detail.createdAt)}</dd><dt>Updated</dt><dd>{dateLabel(detail.updatedAt)}</dd></>}
      </dl>
      {detailLoading && !detail && <p role="status" className="compact muted">Loading repository metadata…</p>}
      {detail && <div className="language-breakdown">{totalBytes > 0 ? <><div className="language-bar" aria-hidden="true">{detail.languages.map((language, i) => <span key={language.name} className={`language-segment language-${i % 5}`} style={{ flexGrow: language.bytes }} />)}</div><ul aria-label="Repository languages">{detail.languages.map((language) => <li key={language.name}>{language.name} <span>{(language.bytes / totalBytes * 100).toFixed(1)}%</span></li>)}</ul></> : <p className="compact muted">No language breakdown available.</p>}</div>}
      {[...new Set(Object.values(errors))].map((text, index) => <p key={`${index}:${text}`} role="alert" className="inline-error">{text}</p>)}
      {Object.keys(errors).length > 0 && <button className="detail-retry" disabled={!g.canRead} onClick={() => setRetry((v) => v + 1)}>Retry repository details</button>}
      {Object.keys(errors).length > 0 && g.auth && "installations" in g.auth && <GitHubLink href={g.auth.installations[0]?.manageUrl ?? "https://github.com/settings/installations"}>Change repository access</GitHubLink>}
    </section>
    <section className="branch-section">
      <label htmlFor="repository-branch">Commit branch</label><select id="repository-branch" value={branch} disabled={!g.canRead || branchLoading} onChange={(e) => setBranch(e.target.value)}>
        <option value={repo.defaultBranch}>{repo.defaultBranch} · default</option>{branches.filter((b) => b.name !== repo.defaultBranch).map((b) => <option key={b.name}>{b.name}</option>)}
      </select>
      {selectedBranch?.isProtected && <span className="tag">Protected branch</span>}
      {cursor && <button disabled={!g.canRead || branchLoading} onClick={() => { setBranchLoading(true); setBranchPage(cursor); }}>{branchLoading ? "Loading branches…" : "Load more branches"}</button>}
    </section>
    <details className="recent-commits" open><summary>Recent commits <span className="count">{commits.length}</span></summary>
      {commitLoading ? <p role="status" className="compact muted">Loading commits…</p> : !g.canRead && !commits.length ? <p className="compact muted">Commit history will load when GitHub is available.</p> : !errors.commits && (commits.length === 0 ? <p className="muted compact">No commits available on this branch.</p> : <ol className="commit-list">{commits.map((commit) => <li key={commit.sha}><span className="commit-dot" aria-hidden="true" /><div><p>{commit.message}</p><small>{commit.authorLogin ? `@${commit.authorLogin}` : commit.authorName} · <GitHubLink href={commit.htmlUrl}>{commit.sha.slice(0, 7)}</GitHubLink> · {dateLabel(commit.committedAt)}</small></div></li>)}</ol>)}
    </details>
  </>;
}
