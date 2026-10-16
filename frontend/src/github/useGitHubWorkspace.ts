import { BridgeCallError } from "@aura/bridge";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubAuthStatus, ProjectPatch, ProjectRecord, ProjectZoneSuggestion, RepositoryDetail, RepositorySummary, ZoneId } from "@aura/contracts";
import { bridge, useBridgeEvent } from "../platform/bridge.ts";
import { issueFor } from "./model.ts";
import type { GitHubIssue } from "./model.ts";

export type ProjectDraft = { notes: string; zone: ZoneId | ""; pinned: boolean };
export type GitHubWorkspace = ReturnType<typeof useGitHubWorkspace>;

/** One connection/catalog/selection for the explorer and every workstation. */
export function useGitHubWorkspace(zone: ZoneId, navigate: (zone: ZoneId) => void) {
  const [auth, setAuth] = useState<GitHubAuthStatus | null>(null);
  const authRef = useRef(auth);
  const [authIssue, setAuthIssue] = useState<GitHubIssue | null>(null);
  const [issue, setIssue] = useState<GitHubIssue | null>(null);
  const [projectIssue, setProjectIssue] = useState<GitHubIssue | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const projectLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [revision, setRevision] = useState(0);
  const [repos, setRepos] = useState<RepositorySummary[]>([]);
  const [projectsReady, setProjectsReady] = useState(false);
  const syncSelection = useRef(true);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [suggestions, setSuggestions] = useState<ProjectZoneSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ProjectDraft>>({});
  const [metadata, setMetadata] = useState<Record<string, RepositoryDetail>>({});
  const metadataRef = useRef(metadata);
  const pendingMetadata = useRef(new Map<string, Promise<RepositoryDetail>>());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(false);
  const epoch = useRef(0);
  const statusRevision = useRef(0);
  const pageRequest = useRef(0);
  const pageBusy = useRef(false);
  const account = useRef<string | null>(null);

  const clear = useCallback(() => {
    epoch.current++; pageRequest.current++; pageBusy.current = false;
    syncSelection.current = true; setProjectsReady(false); setRepos([]); setProjects([]); setSuggestions([]); setSelected(""); setDrafts({}); setDismissed(new Set());
    setMetadata({}); metadataRef.current = {}; pendingMetadata.current.clear();
    setNextCursor(null); setIssue(null); setProjectIssue(null); setLoading(false); setLoadingMore(false);
  }, []);
  const applyStatus = useCallback((value: GitHubAuthStatus, authoritative = false) => {
    if (!alive.current) return;
    statusRevision.current++;
    const login = "account" in value ? value.account.login : null;
    const invalidated = ["disconnected", "expired", "authorizing"].includes(value.state) || (value.state === "error" && value.reason !== "network");
    if (invalidated || (login && login !== account.current)) { clear(); account.current = login; }
    else if (login) account.current = login;
    authRef.current = value; setAuth(value); setAuthIssue(null);
    if (value.state === "connected" && authoritative) setIssue((current) => current?.code === "not_authenticated" || current?.code === "rate_limited" ? null : current);
  }, [clear]);
  useBridgeEvent("github.authChanged", (value) => applyStatus(value, true));
  const readStatus = useCallback(async () => {
    const before = statusRevision.current;
    try {
      const value = await bridge.call("github.getAuthStatus", {});
      if (alive.current && statusRevision.current === before) applyStatus(value);
    } catch (error) { if (alive.current && statusRevision.current === before) setAuthIssue(issueFor(error)); }
  }, [applyStatus]);
  useEffect(() => {
    alive.current = true; void readStatus();
    return () => { alive.current = false; epoch.current++; pageRequest.current++; };
  }, [readStatus]);

  const canRead = auth?.state === "connected" && !["not_authenticated", "rate_limited"].includes(issue?.code ?? "");
  const failure = useCallback((error: unknown) => {
    if (!alive.current) return;
    const value = issueFor(error); if (value.code === "not_authenticated") clear(); setIssue(value);
    if (value.code === "not_authenticated" || value.code === "rate_limited") void readStatus();
  }, [readStatus, clear]);
  const sessionFailure = useCallback((error: unknown) => {
    if (error instanceof BridgeCallError && ["not_authenticated", "rate_limited"].includes(error.code)) failure(error);
  }, [failure]);
  const act = useCallback(async (method: "github.connect" | "github.disconnect" | "github.refresh") => {
    if (actionLock.current || projectLock.current) return;
    actionLock.current = true; setBusy(true); setAuthIssue(null);
    const before = statusRevision.current;
    try {
      const value = await bridge.call(method, {});
      // Newer events (including very fast authorization) win over an older reply.
      if (alive.current && statusRevision.current === before) applyStatus(value, true);
      if (alive.current && method === "github.refresh") {
        setIssue(null); setProjectIssue(null); setProjectsReady(false); metadataRef.current = {}; setMetadata({}); pendingMetadata.current.clear();
        epoch.current++; setRevision((v) => v + 1);
      }
    } catch (error) { if (alive.current) setAuthIssue(issueFor(error)); }
    finally { actionLock.current = false; if (alive.current) setBusy(false); }
  }, [applyStatus]);

  const loadPage = useCallback(async (cursor?: string) => {
    if (pageBusy.current || authRef.current?.state !== "connected") return;
    pageBusy.current = true;
    const request = ++pageRequest.current, generation = epoch.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setIssue(null); }
    try {
      const page = await bridge.call("github.listRepositories", { ...(cursor ? { cursor } : {}), perPage: 30 });
      if (!alive.current || generation !== epoch.current || request !== pageRequest.current) return;
      setRepos((current) => [...new Map([...(cursor ? current : []), ...page.items].map((r) => [r.fullName, r])).values()]);
      setNextCursor(page.nextCursor);
      if (!cursor) setSelected((current) => page.items.some((r) => r.fullName === current) ? current : page.items[0]?.fullName ?? "");
      return true;
    } catch (error) { if (alive.current && generation === epoch.current && request === pageRequest.current) failure(error); }
    finally {
      if (request === pageRequest.current) { pageBusy.current = false; if (alive.current) { setLoading(false); setLoadingMore(false); } }
    }
  }, [failure]);
  useEffect(() => {
    if (!canRead) { pageRequest.current++; pageBusy.current = false; setLoading(false); setLoadingMore(false); return; }
    const generation = epoch.current;
    const page = loadPage();
    void bridge.call("projects.list", {}).then((records) => {
      if (!alive.current || generation !== epoch.current) return;
      setProjects(records); setProjectsReady(true); setProjectIssue(null);
    }).catch((error: unknown) => { if (alive.current && generation === epoch.current) setProjectIssue(issueFor(error)); });
    // Suggestions share the native catalog. Warm it once before classification
    // rather than starting two installation/repository traversals at launch.
    void page.then(async (loaded) => {
      if (!loaded || !alive.current || generation !== epoch.current || authRef.current?.state !== "connected") return;
      const ideas = await bridge.call("projects.suggestZones", {});
      if (alive.current && generation === epoch.current) setSuggestions(ideas);
    }).catch((error: unknown) => { if (alive.current && generation === epoch.current) setProjectIssue(issueFor(error)); });
    return () => { pageRequest.current++; pageBusy.current = false; };
  }, [canRead, revision, loadPage]);

  const previousZone = useRef(zone);
  useEffect(() => {
    if (previousZone.current !== zone) { previousZone.current = zone; syncSelection.current = true; }
    if (!syncSelection.current || !projectsReady || !repos.length) return;
    syncSelection.current = false;
    if (!["hardware", "software", "ai-lab"].includes(zone)) return;
    const assigned = repos.filter((repo) => projects.some((p) => p.id === repo.fullName && p.zone === zone));
    if (assigned.length) setSelected((current) => assigned.some((r) => r.fullName === current) ? current : assigned[0]!.fullName);
  }, [zone, projects, repos, projectsReady]);
  const select = (id: string) => {
    setSelected(id);
    const destination = projects.find((p) => p.id === id)?.zone;
    if (destination && destination !== zone) navigate(destination);
  };
  const updateProject = async (patch: ProjectPatch) => {
    if (projectLock.current) throw new Error("A project update is already in progress");
    projectLock.current = true; setProjectBusy(true);
    const generation = epoch.current;
    try {
      const record = await bridge.call("projects.update", patch);
      if (!alive.current || generation !== epoch.current) throw new Error("Superseded session");
      setProjects((current) => [...current.filter((p) => p.id !== record.id), record]);
      return record;
    } finally { projectLock.current = false; if (alive.current) setProjectBusy(false); }
  };
  const loadRepository = useCallback((id: string): Promise<RepositoryDetail> => {
    if (metadataRef.current[id]) return Promise.resolve(metadataRef.current[id]);
    const pending = pendingMetadata.current.get(id); if (pending) return pending;
    const generation = epoch.current;
    const request = bridge.call("github.getRepository", { fullName: id }).then((value) => {
      if (alive.current && generation === epoch.current) {
        metadataRef.current = { ...metadataRef.current, [id]: value }; setMetadata(metadataRef.current);
      }
      return value;
    }).finally(() => { if (generation === epoch.current) pendingMetadata.current.delete(id); });
    pendingMetadata.current.set(id, request); return request;
  }, []);
  return { auth, authIssue, issue, projectIssue, busy: busy || projectBusy, canRead, loading, loadingMore, repos, projects, projectsReady, selected, select,
    drafts, setDrafts, metadata, loadRepository, revision, epoch: epoch.current, nextCursor, failure, sessionFailure,
    suggestions: suggestions.filter((s) => !dismissed.has(s.id) && !projects.some((p) => p.id === s.id && p.zone)),
    dismiss: (id: string) => setDismissed((current) => new Set([...current, id])), updateProject,
    connect: () => act("github.connect"), disconnect: () => act("github.disconnect"), refresh: () => act("github.refresh"),
    retryStatus: readStatus, more: () => nextCursor && canRead ? loadPage(nextCursor) : Promise.resolve(),
  };
}
