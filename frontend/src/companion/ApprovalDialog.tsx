import { useEffect, useRef, useState } from "react";
import type { AIApprovalDecision, AIApprovalRequest } from "@aura/contracts";
import { errorText, Modal, UiIcon } from "../components/ui.tsx";

export function ApprovalDialog({ approval, respond, cancel }: { approval: AIApprovalRequest; respond: (id: string, decision: AIApprovalDecision) => Promise<void>; cancel: () => Promise<boolean> }) {
  const deadline = useRef(Date.now() + approval.expiresInSeconds * 1000);
  const [remaining, setRemaining] = useState(approval.expiresInSeconds), [pending, setPending] = useState(false), [received, setReceived] = useState(false), [failure, setFailure] = useState("");
  const lock = useRef(false), expired = useRef(false), mounted = useRef(true);
  async function decide(decision: AIApprovalDecision) {
    if (lock.current) return;
    lock.current = true; setPending(true); setFailure("");
    try { await respond(approval.approvalId, decision); if (mounted.current) setReceived(true); }
    catch (error) { if (mounted.current) { setFailure(errorText(error).text); lock.current = false; } }
    finally { if (mounted.current) setPending(false); }
  }
  async function stop() {
    if (lock.current) return;
    lock.current = true; setPending(true); setFailure("");
    const confirmed = await cancel();
    if (mounted.current) { setPending(false); if (confirmed) setReceived(true); else { lock.current = false; setFailure("Cancellation was not confirmed. Try Stop again or deny this request."); } }
  }
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => { const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); setRemaining(seconds); if (!seconds && !expired.current) { expired.current = true; void decide("deny"); } }, 1000);
    return () => { mounted.current = false; clearInterval(timer); };
    // A new approval is mounted with its approvalId as key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Modal title={approval.kind === "app_action" ? "Allow this action?" : "Share selected source?"} subtitle="ASTRA / YOUR APPROVAL" close={() => void decide("deny")}>
    <div className="ui-dialog-body"><div className="consent-symbol"><UiIcon name="lock" /></div><p className="consent-summary">{approval.summary}</p><dl className="consent-facts"><dt>Destination</dt><dd>{approval.providerName}<small>{approval.providerKind === "cloud" ? "External cloud provider" : "Local provider"}</small></dd>{approval.repository && <><dt>Repository</dt><dd>{approval.repository}</dd></>}{approval.paths.length > 0 && <><dt>Requested source</dt><dd>{approval.paths.map((path) => <code key={path}>{path}<br /></code>)}</dd></>}<dt>Expires in</dt><dd>{remaining > 0 ? `${remaining} seconds` : "Expired — declining this request"}</dd></dl>
      <p className="policy-note">{approval.kind === "share_private_source" ? "Allow once covers this request. Allow for this conversation covers private source from this repository for this conversation only." : "Only this requested navigation action will be allowed."}</p>
      <button className="text-button" disabled={pending || received} onClick={() => void stop()}>Stop this reply</button>
      {failure && <p role="alert" className="inline-error">{failure} You can retry Deny or stop the reply.</p>}{received && <p role="status" className="inline-notice">Decision received by the host. Waiting for the reply to continue.</p>}
    </div><footer className="ui-dialog-actions consent"><button className="ui-button" data-initial-focus disabled={pending || received} onClick={() => void decide("deny")}>{pending ? "Sending decision…" : "Deny"}</button>{approval.kind === "share_private_source" && <button className="ui-button" disabled={pending || received || !remaining} onClick={() => void decide("allow_for_conversation")}>Allow for this conversation</button>}<button className="ui-button primary" disabled={pending || received || !remaining} onClick={() => void decide("allow_once")}>{approval.kind === "app_action" ? "Allow" : "Allow once"}</button></footer>
  </Modal>;
}
