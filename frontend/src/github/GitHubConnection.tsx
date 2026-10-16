import { ArrowIcon } from "../components/Icon.tsx";
import { useEffect, useRef, useState } from "react";
import type { GitHubWorkspace } from "./useGitHubWorkspace.ts";
import { githubURL } from "./model.ts";
import { bridge } from "../platform/bridge.ts";

export function GitHubLink({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = githubURL(href);
  return safe ? <a href={safe} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>;
}

function Authorization({ workspace }: { workspace: GitHubWorkspace }) {
  const [now, setNow] = useState(Date.now);
  const [copy, setCopy] = useState("");
  const code = useRef<HTMLElement>(null);
  useEffect(() => { code.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const auth = workspace.auth;
  if (auth?.state !== "authorizing") return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(auth.expiresAt) - now) / 1000));
  return <div className="authorization-step">
    <p>Enter this code on GitHub to authorize AURA.</p>
    <div className="device-code"><code ref={code} tabIndex={0} aria-live="polite" aria-label={`Authorization code ${auth.userCode}`}>{auth.userCode}</code>
      <button onClick={() => { void navigator.clipboard?.writeText(auth.userCode).then(() => setCopy("Code copied.")).catch(() => setCopy("Select the code and copy it manually.")); if (!navigator.clipboard) setCopy("Select the code and copy it manually."); }}>Copy code</button></div>
    <div className="authorization-actions"><GitHubLink href={auth.verificationUri}>Open GitHub authorization <ArrowIcon /></GitHubLink>
      <button disabled={workspace.busy} onClick={() => void workspace.disconnect()}>Cancel authorization</button></div>
    <p role="status">{copy || (seconds ? "Waiting for authorization…" : "Authorization window ended. Request a new code.")}</p>
    {seconds > 0 && <p aria-live="off">Code expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>}
    {!seconds && <button className="primary" disabled={workspace.busy} onClick={() => void workspace.connect()}>Request new code</button>}
  </div>;
}

export function GitHubConnection({ workspace }: { workspace: GitHubWorkspace }) {
  const g = workspace;
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm) { dialog.current?.showModal(); cancel.current?.focus(); }
    else dialog.current?.close();
  }, [confirm]);
  const auth = g.auth;
  const connected = auth?.state === "connected" || auth?.state === "rate_limited";
  useEffect(() => { if (!connected) setConfirm(false); }, [connected]);
  return <section className="github-connection" aria-label="GitHub connection" aria-busy={g.busy}>
    <p className="sr-only" role="status">{auth && "account" in auth ? `GitHub ${auth.state === "connected" ? "connected" : "rate limited"} as ${auth.account.login}.` : auth ? `GitHub connection: ${auth.state}.` : "Checking GitHub connection."}</p>
    {bridge.transportKind === "mock" && <p className="mock-label">Mock bridge · sample data · no GitHub authorization occurs</p>}
    {g.authIssue && <p role="alert" className="github-feedback">{g.authIssue.text} <button disabled={g.busy} onClick={() => void g.retryStatus()}>Retry connection status</button></p>}
    {!auth && <p role="status">Checking GitHub connection…</p>}
    {auth?.state === "disconnected" && <div className="connection-intro"><div><h2>Connect your GitHub workspace</h2><p>Browse the repositories you share with AURA. Credentials stay in the macOS Keychain.</p></div><button className="primary" disabled={g.busy} onClick={() => void g.connect()}>{g.busy ? "Connecting…" : "Connect GitHub"}</button></div>}
    {auth?.state === "authorizing" && <><h2>Authorize AURA on GitHub</h2><Authorization workspace={g} /></>}
    {auth?.state === "expired" && <div className="connection-intro"><div><h2>{auth.reason === "revoked" ? "GitHub access was revoked" : "GitHub session expired"}</h2><p>{auth.login ? `Reconnect as ${auth.login}.` : "Reconnect to restore your repository workspace."}</p></div><button className="primary" disabled={g.busy} onClick={() => void g.connect()}>Reconnect GitHub</button></div>}
    {auth?.state === "error" && <div className="connection-intro"><div><h2>{auth.reason === "configuration" ? "GitHub sign-in is misconfigured" : auth.reason === "denied" ? "Authorization was declined" : auth.reason === "code_expired" ? "Authorization code expired" : "GitHub connection interrupted"}</h2><p>{auth.reason === "network" ? "Your saved session is kept. Retry when your connection returns." : "Your studio remains available."}</p><p className="developer-detail">{auth.message}</p></div>{auth.retryable && <button className="primary" disabled={g.busy} onClick={() => void (auth.reason === "network" ? g.refresh() : g.connect())}>Retry GitHub connection</button>}</div>}
    {connected && <>
      <div className="account-row"><span className="account-monogram" aria-hidden="true">{auth.account.login.slice(0, 1).toUpperCase()}</span><div><strong>{auth.account.name ?? auth.account.login}</strong><small><GitHubLink href={auth.account.htmlUrl}>@{auth.account.login}</GitHubLink> · GitHub connected</small></div>
        <button className="disconnect-button" onClick={() => setConfirm(true)} disabled={g.busy}>Disconnect GitHub</button></div>
      <details className="installation-details"><summary>Repository access · {auth.installations.length} installation{auth.installations.length === 1 ? "" : "s"}</summary>
        {auth.installations.length === 0 ? <p>Install AURA Developer Companion on GitHub. <GitHubLink href="https://github.com/settings/installations">Manage GitHub installations</GitHubLink></p> : auth.installations.map((item) => <div key={item.id} className="installation-row"><strong>{item.accountLogin}</strong><span className="tag">{item.readOnly ? "Read-only" : "Review granted permissions"}</span><span>{item.repositorySelection === "all" ? "All repositories" : "Selected repositories"}</span><GitHubLink href={item.manageUrl}>Change repository access</GitHubLink></div>)}
      </details>
      {auth.state === "rate_limited" && <p className="github-feedback" role="status">GitHub limit reached; resumes at {new Date(auth.resetAt).toLocaleString()}. Loaded data remains available.</p>}
    </>}
    {g.issue && <p role="alert" className="github-feedback">{g.issue.text} {g.issue.code === "not_authenticated" ? <button disabled={g.busy} onClick={() => void g.connect()}>Reconnect GitHub</button> : <button disabled={g.busy || auth?.state === "rate_limited"} onClick={() => void g.refresh()}>Retry GitHub data</button>}</p>}
    {auth?.state === "disconnected" && <p className="revoke-note">To revoke completely, visit <GitHubLink href="https://github.com/settings/apps/authorizations">GitHub app authorizations</GitHubLink>.</p>}
    <dialog ref={dialog} className="github-disconnect-dialog" aria-labelledby="disconnect-title" onCancel={(event) => { event.preventDefault(); setConfirm(false); }}>
      <h2 id="disconnect-title">Disconnect GitHub from AURA?</h2><p>This removes the saved session and cached GitHub data from AURA. Saved local project notes and assignments remain on this Mac. Unsaved edits will be discarded.</p><p>You can revoke the app authorization separately in GitHub settings.</p>
      <div className="dialog-actions"><button ref={cancel} onClick={() => setConfirm(false)}>Keep connected</button><button className="danger-button" onClick={() => { setConfirm(false); void g.disconnect(); }}>Disconnect</button></div>
    </dialog>
  </section>;
}
