import { useEffect, useRef, useState } from "react";
import type { AIContextSnapshot, AIFileSelection, BranchSummary, RepositoryTree } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { errorText, Modal, UiIcon } from "../components/ui.tsx";
import type { GitHubWorkspace } from "../github/useGitHubWorkspace.ts";
import type { ConversationContext, ConversationController } from "./useConversation.ts";

const omissions: Record<string, string> = { sharing_disabled: "Context sharing is off", private_repository: "Private repository policy prevents sharing", not_connected: "GitHub is not connected", not_found: "Source was not found", unavailable: "Source is unavailable", budget: "Context size limit reached", consent_required: "Native approval required before private source can be sent", binary: "Binary file cannot be included", too_large: "File exceeds the native size limit" };
export function ContextDialog({ controller: c, workspace: g, zone, close, preferSelected = false }: { controller: ConversationController; workspace: GitHubWorkspace; zone: ConversationContext["zone"]; close: () => void; preferSelected?: boolean }) {
  const binding = c.conversation?.repository;
  const [repository, setRepository] = useState(preferSelected ? g.selected : binding?.fullName ?? "");
  const [branch, setBranch] = useState(preferSelected ? g.selectedBranch : binding?.branch ?? "");
  const [branches, setBranches] = useState<BranchSummary[]>([]), [branchCursor, setBranchCursor] = useState<string | null>(null);
  const [tree, setTree] = useState<RepositoryTree | null>(null), [query, setQuery] = useState("");
  const [selection, setSelection] = useState<ConversationContext>({ ...c.context, files: [...(c.context.files ?? [])], include: { ...c.context.include } });
  const [snapshot, setSnapshot] = useState<AIContextSnapshot | null>(null), [failure, setFailure] = useState(""), [pending, setPending] = useState(false), [pathsLoading, setPathsLoading] = useState(false), [retry, setRetry] = useState(0);
  const [pathDraft, setPathDraft] = useState("");
  const locked = useRef(false), generation = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => { setSelection({ ...c.context, files: [...(c.context.files ?? [])], include: { ...c.context.include } }); setSnapshot(null); }, [binding?.fullName, binding?.branch, g.epoch]);
  useEffect(() => {
    const request = ++generation.current;
    setTree(null); setBranches([]); setBranchCursor(null); setSnapshot(null); setFailure("");
    if (!repository || !g.canRead) { setPathsLoading(false); return; }
    setPathsLoading(true);
    void Promise.all([bridge.call("github.listFiles", { fullName: repository, ...(branch ? { branch } : {}), limit: 1000 }), bridge.call("github.listBranches", { fullName: repository, perPage: 100 })]).then(([files, page]) => {
      if (!alive.current || request !== generation.current) return;
      setTree(files); setBranches(page.items); setBranchCursor(page.nextCursor);
    }).catch((error) => { if (alive.current && request === generation.current) { setFailure(errorText(error).text); g.sessionFailure(error); } }).finally(() => { if (alive.current && request === generation.current) setPathsLoading(false); });
  }, [repository, branch, g.canRead, g.epoch, retry, g.sessionFailure]);
  const matches = (repository || null) === (binding?.fullName ?? null) && (!repository || (branch || null) === (binding?.branch ?? null));
  const files = selection.files ?? [];
  const validRanges = files.every((file) => (file.startLine === undefined || Number.isInteger(file.startLine) && file.startLine >= 1) && (file.endLine === undefined || Number.isInteger(file.endLine) && file.endLine >= (file.startLine ?? 1)));
  function update(next: ConversationContext) { setSelection(next); setSnapshot(null); }
  function toggle(path: string) { update({ ...selection, files: files.some((file) => file.path === path) ? files.filter((file) => file.path !== path) : [...files, { path }].slice(0, 5) }); }
  function range(path: string, field: "startLine" | "endLine", value: string) { update({ ...selection, files: files.map((file) => file.path === path ? { ...file, [field]: value ? Number(value) : undefined } : file) }); }
  async function bind() {
    if (locked.current) return;
    locked.current = true; setPending(true); setFailure("");
    const success = await c.bindRepository(repository ? { fullName: repository, ...(branch ? { branch } : {}) } : null);
    if (alive.current) { if (success) { setSelection({ include: {}, files: [] }); setSnapshot(null); } else setFailure("The repository was not changed. Review the conversation notice and try again."); setPending(false); }
    locked.current = false;
  }
  async function preview() {
    if (locked.current || !matches || !validRanges) return;
    locked.current = true; setPending(true); setFailure("");
    const id = c.conversation?.conversationId, request = generation.current;
    try { const result = await bridge.call("ai.previewContext", { context: { ...selection, zone: selection.zone ? zone : undefined }, ...(id ? { conversationId: id } : { providerId: c.providerId }) }); if (alive.current && request === generation.current) setSnapshot(result); }
    catch (error) { if (alive.current && request === generation.current) setFailure(errorText(error).text); }
    finally { locked.current = false; if (alive.current) setPending(false); }
  }
  async function moreBranches() {
    if (!branchCursor || pending) return;
    setPending(true); const request = generation.current;
    try { const page = await bridge.call("github.listBranches", { fullName: repository, cursor: branchCursor, perPage: 100 }); if (alive.current && request === generation.current) { setBranches((items) => [...new Map([...items, ...page.items].map((item) => [item.name, item])).values()]); setBranchCursor(page.nextCursor); } }
    catch (error) { if (alive.current) setFailure(errorText(error).text); }
    finally { if (alive.current) setPending(false); }
  }
  function addPath() { const path = pathDraft.trim(); if (!path || files.length >= 5 || files.some((file) => file.path === path)) return; update({ ...selection, files: [...files, { path }] }); setPathDraft(""); }
  return <Modal title="Choose your context" subtitle="ASTRA / CONVERSATION CONTEXT" close={close} wide>
    <div className="ui-dialog-body"><p className="help">The conversation uses its own repository binding. Browsing or selecting another project does not change it.</p>
      <label className="ui-field">Repository<select aria-label="Conversation repository" disabled={pending || c.active || c.working} value={repository} onChange={(event) => { setRepository(event.target.value); setBranch(g.repos.find((repo) => repo.fullName === event.target.value)?.defaultBranch ?? ""); }}><option value="">No project context</option>{g.repos.map((repo) => <option value={repo.fullName} key={repo.fullName}>{repo.fullName}{repo.isPrivate ? " · Private" : ""}</option>)}</select></label>
      {repository && <label className="ui-field">Branch<select aria-label="Conversation branch" value={branch} disabled={pending || c.active || !g.canRead} onChange={(event) => setBranch(event.target.value)}><option value="">Default branch</option>{branch && !branches.some((item) => item.name === branch) && <option>{branch}</option>}{branches.map((item) => <option key={item.name}>{item.name}</option>)}</select>{branchCursor && <button className="text-button" disabled={pending} onClick={() => void moreBranches()}>Load more branches</button>}</label>}
      {!matches && <div className="binding-change"><p>Changing the repository or branch clears attached context and prior source approvals. The update takes effect immediately in the host.</p><button className="ui-button" disabled={pending || c.active || c.working || (!!repository && !g.canRead)} onClick={() => void bind()}>{pending ? "Updating…" : repository ? "Use this repository and branch" : "Clear project context"}</button></div>}
      {c.active && <p className="warning-note">Stop the current reply before changing its context.</p>}
      {!g.canRead && <p className="help">Reconnect GitHub to choose repository context. You can still clear the project binding.</p>}
      {failure && <p role="alert" className="inline-error">{failure}<button className="text-button" onClick={() => setRetry((value) => value + 1)}>Retry source listing</button></p>}
      <fieldset className="context-options" disabled={!matches || c.active || pending}><legend>Include with the next message</legend>{([['workspace', 'Current workspace'], ['repository', 'Repository metadata'], ['commits', 'Recent commits'], ['notes', 'Project notes'], ['readme', 'README']] as const).map(([id, label]) => <label key={id}><input type="checkbox" disabled={id !== "workspace" && !binding} checked={id === "workspace" ? !!selection.zone : !!selection.include?.[id]} onChange={(event) => update(id === "workspace" ? { ...selection, zone: event.target.checked ? zone : undefined } : { ...selection, include: { ...selection.include, [id]: event.target.checked } })} />{label}</label>)}</fieldset>
      {repository && matches && <><div className="section-heading"><h3>Explicit files</h3><span className="muted compact">{files.length} / 5</span></div><label className="ui-field">Filter loaded paths<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="context-file-list" aria-busy={pathsLoading}>
        {pathsLoading && <p role="status">Loading repository paths…</p>}{tree?.entries.filter((entry) => entry.type === "file" && entry.path.toLowerCase().includes(query.toLowerCase())).slice(0, 150).map((entry) => <label key={entry.path}><input type="checkbox" disabled={c.active || pending || (!files.some((file) => file.path === entry.path) && files.length >= 5)} checked={files.some((file) => file.path === entry.path)} onChange={() => toggle(entry.path)} /><UiIcon name="file" /><code>{entry.path}</code></label>)}
        {!pathsLoading && tree && !tree.entries.some((entry) => entry.type === "file" && entry.path.toLowerCase().includes(query.toLowerCase())) && <p className="help">No matching loaded paths.</p>}
      </div>{tree && <p className="help">Showing up to 150 matching paths from {tree.entries.length} loaded entries.{tree.truncated && " The host truncated this tree; enter a specific file path below."}</p>}
      <div className="file-path-entry"><label className="ui-field">Add an explicit repository-relative path<input value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} placeholder="Sources/App.swift" /></label><button className="ui-button" disabled={!pathDraft.trim() || files.length >= 5 || c.active || pending} onClick={addPath}>Add file</button></div>
      {files.map((file: AIFileSelection) => <div className="file-selection" key={file.path}><code>{file.path}</code><label>Start line<input type="number" min={1} value={file.startLine ?? ""} disabled={c.active || pending} onChange={(event) => range(file.path, "startLine", event.target.value)} /></label><label>End line<input type="number" min={file.startLine ?? 1} value={file.endLine ?? ""} disabled={c.active || pending} onChange={(event) => range(file.path, "endLine", event.target.value)} /></label><button className="text-button" disabled={c.active || pending} onClick={() => toggle(file.path)}>Remove</button></div>)}
      {!validRanges && <p role="alert" className="inline-error">Use positive whole line numbers, with the end at or after the start.</p>}</>}
      <details className="privacy-settings"><summary>Native privacy settings</summary><p className="help">Sharing policy is enforced by the host. Tightening it can require a conversation reset.</p><label className="checkbox"><input type="checkbox" checked={c.prefs?.ai.contextSharing ?? false} disabled={pending || !c.prefs} onChange={(event) => { setPending(true); void bridge.call("prefs.update", { ai: { contextSharing: event.target.checked } }).catch((error) => setFailure(errorText(error).text)).finally(() => { if (alive.current) setPending(false); }); }} />Allow workspace context sharing</label><label className="ui-field">Private repository policy<select aria-label="Private repository sharing" value={c.prefs?.ai.privateRepositoryContext ?? "never"} disabled={pending || !c.prefs} onChange={(event) => { setPending(true); void bridge.call("prefs.update", { ai: { privateRepositoryContext: event.target.value as "never" | "local_only" | "all" } }).catch((error) => setFailure(errorText(error).text)).finally(() => { if (alive.current) setPending(false); }); }}><option value="never">Never share private repository context</option><option value="local_only">Local providers only</option><option value="all">Local and cloud providers, with required approvals</option></select></label></details>
      <p className="policy-note"><UiIcon name="lock" />Preview sends no inference request. Private source may be omitted until the native approval flow runs.</p>
      {snapshot && <section className="context-preview"><h3>Exact outgoing context preview</h3><p className="help">{snapshot.totalChars.toLocaleString()} characters. Repository text below is untrusted data.</p>{snapshot.sections.length === 0 && <p>No context sections would be attached.</p>}{snapshot.sections.map((section, index) => <details key={`${section.id}:${index}`} open><summary>{section.title}{section.truncated ? " · Truncated" : ""}</summary><pre tabIndex={0}>{section.text}</pre></details>)}{snapshot.omitted.map((item, index) => <p className="warning-note" key={index}>{item.path ?? item.section}: {omissions[item.reason] ?? item.reason}</p>)}</section>}
    </div><footer className="ui-dialog-actions"><button className="ui-button" disabled={pending || !matches || !validRanges} onClick={() => void preview()}>{pending ? "Working…" : "Preview context"}</button><button className="ui-button primary" disabled={pending || c.active || !matches || !validRanges} onClick={() => { c.setContext(selection); c.setNotice("Context selection updated. The host will enforce sharing policy when you send."); close(); }}>Apply context</button><button className="ui-button" onClick={close}>Close</button></footer>
  </Modal>;
}
