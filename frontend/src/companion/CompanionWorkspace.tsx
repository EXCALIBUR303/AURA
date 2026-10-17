import { lazy, Suspense, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type { AITurnState, CompanionState, ZoneId } from "@aura/contracts";
import { bridge } from "../platform/bridge.ts";
import { IconButton, Modal, UiIcon } from "../components/ui.tsx";
import { ZoneIcon } from "../components/ZoneIcon.tsx";
import type { GitHubWorkspace } from "../github/useGitHubWorkspace.ts";
import { ApprovalDialog } from "./ApprovalDialog.tsx";
import { useConversation } from "./useConversation.ts";

const Markdown = lazy(() => import("./Markdown.tsx").then((module) => ({ default: module.Markdown })));
const ContextDialog = lazy(() => import("./ContextDialog.tsx").then((module) => ({ default: module.ContextDialog })));
const ProviderSettings = lazy(() => import("./ProviderSettings.tsx").then((module) => ({ default: module.ProviderSettings })));

export type ConversationLayout = "compact" | "expanded" | "focus";
export type CompanionPresentation = { state: CompanionState; activity: AITurnState; label: string };
export type CompanionHandle = { focus: () => void; context: (selected?: boolean) => void; providers: () => void; newConversation: () => void };
const labels: Record<AITurnState, string> = { idle: "Ready", completed: "Reply complete", cancelled: "Reply stopped", preparing_context: "Preparing context", requesting: "Thinking", streaming: "Responding", waiting_for_tool: "Reading project context", waiting_for_approval: "Your approval is needed", error: "Reply unavailable" };

export function CompanionWorkspace({ ref, zone, workspace: g, layout, changeLayout, report, visible, resized, resize }: {
  ref?: Ref<CompanionHandle>; zone: ZoneId; workspace: GitHubWorkspace; layout: ConversationLayout; changeLayout: (layout: ConversationLayout) => void;
  report: (presentation: CompanionPresentation) => void; visible: boolean; resized: number; resize: (width: number | null) => void;
}) {
  const c = useConversation(zone);
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState<"context" | "providers" | "history" | "reset" | null>(null);
  const [preferSelected, setPreferSelected] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [unseen, setUnseen] = useState(false);
  const [turnLimit, setTurnLimit] = useState(8);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const prompt = useRef<HTMLTextAreaElement>(null), scroll = useRef<HTMLDivElement>(null), follow = useRef(true), savedScroll = useRef(0);
  const provider = c.providers.find((value) => value.id === c.providerId);
  const conversation = c.conversation;
  const state = c.state;
  const speakState: CompanionState = state === "error" ? "error" : ["preparing_context", "requesting", "streaming", "waiting_for_tool", "waiting_for_approval"].includes(state) ? "thinking" : "idle";
  useEffect(() => { report({ state: speakState, activity: state, label: labels[state] }); }, [report, speakState, state]);
  useImperativeHandle(ref, () => ({
    focus: () => { changeLayout("expanded"); requestAnimationFrame(() => prompt.current?.focus({ preventScroll: true })); },
    context: (selected = false) => { setPreferSelected(selected); setDialog("context"); }, providers: () => setDialog("providers"),
    newConversation: () => { changeLayout("expanded"); void c.newConversation(); },
  }));
  const activeText = c.turns.at(-1)?.replyText;
  useLayoutEffect(() => {
    if (!scroll.current || layout === "compact" || !visible) return;
    // The welcome view starts at its heading; only message history follows a tail.
    if (!c.turns.length) { scroll.current.scrollTop = 0; follow.current = true; setUnseen(false); return; }
    if (follow.current) { scroll.current.scrollTop = scroll.current.scrollHeight; setUnseen(false); }
    else setUnseen(true);
  }, [activeText, c.turns.length, c.loading, layout, visible]);
  useLayoutEffect(() => {
    if (scroll.current && layout !== "compact" && !follow.current) scroll.current.scrollTop = savedScroll.current;
  }, [layout]);
  useEffect(() => {
    if (layout === "compact" || !visible) return;
    const content = scroll.current?.querySelector(".reading-measure");
    if (!content) return;
    const observer = new ResizeObserver(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
    observer.observe(content); return () => observer.disconnect();
  }, [layout, visible, c.turns.length]);
  useEffect(() => { follow.current = true; savedScroll.current = 0; setUnseen(false); setTurnLimit(8); }, [conversation?.conversationId]);
  useLayoutEffect(() => { if (prepend.current && scroll.current) { scroll.current.scrollTop = prepend.current.top + scroll.current.scrollHeight - prepend.current.height; savedScroll.current = scroll.current.scrollTop; prepend.current = null; } }, [turnLimit]);
  async function send(text = draft) {
    if (!text.trim()) return;
    if (layout === "compact") changeLayout("expanded");
    follow.current = true;
    const accepted = await c.send(text);
    if (accepted) setDraft((current) => current === text ? "" : current);
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopyNotice("Reply copied."); } catch { setCopyNotice("Copy is unavailable. Select the reply text to copy it."); } }
  const contextCount = (c.context.files?.length ?? 0) + Object.values(c.context.include ?? {}).filter(Boolean).length + (c.context.zone ? 1 : 0);
  const disabled = c.loading || c.working || c.active || c.invalidProvider || !provider?.available;
  return <section className="companion-workspace" aria-label="Astra conversation" data-layout={layout} data-visible={visible} data-state={state}>
    {layout === "expanded" && <div className="conversation-splitter" role="separator" aria-label="Conversation width" aria-orientation="vertical" aria-valuemin={440} aria-valuemax={Math.min(650, innerWidth - 600)} aria-valuenow={resized} tabIndex={0} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(innerWidth - event.clientX); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} onKeyDown={(event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); resize(event.key === "Home" ? 440 : event.key === "End" ? 650 : resized + (event.key === "ArrowLeft" ? 16 : -16)); }
    }} />}
    <header className="conversation-heading"><span className="astra-mark"><ZoneIcon zone="companion" size={22} /></span><div><h2>{layout === "compact" ? "Work with Astra" : "Astra"}</h2><small>{conversation?.providerName ?? provider?.displayName ?? "No provider configured"}{layout === "compact" ? " · text conversation" : " · This session"}</small></div><div className="conversation-actions">
      {layout !== "compact" && <><IconButton name="history" label="Conversation history this session" onClick={() => { void c.list(); setDialog("history"); }} /><IconButton name="plus" label="New conversation" disabled={c.active || c.working} onClick={() => void c.newConversation()} /></>}
      <IconButton name={layout === "focus" ? "collapse" : "expand"} label={layout === "compact" ? "Expand conversation" : layout === "focus" ? "Leave focus mode" : "Enter focus mode"} onClick={() => changeLayout(layout === "focus" ? "expanded" : layout === "compact" ? "expanded" : "focus")} />
      {layout !== "compact" && <IconButton name="close" label="Collapse conversation" onClick={() => changeLayout("compact")} />}
    </div></header>
    <div className="conversation-controls"><div className="conversation-context"><button onClick={() => setDialog("context")}><ZoneIcon zone="github" size={14} /><span>{conversation?.repository?.fullName ?? "No project context"}</span><UiIcon name="chevron" /></button>{conversation?.repository?.branch && <span className="status-badge">{conversation.repository.branch}</span>}<span className="context-count">{contextCount} selected</span></div>
      <div className="conversation-provider"><label>Provider<select aria-label="Conversation provider" value={c.providerId} disabled={c.active || c.working} onChange={(event) => { const choice = c.providers.find((value) => value.id === event.target.value); if (choice) { c.setProviderId(choice.id); c.setModel(choice.defaultModel ?? choice.models[0] ?? ""); if (conversation) void c.newConversation(choice.id, choice.defaultModel ?? choice.models[0] ?? ""); } }}><option value="" disabled>Choose provider</option>{c.providers.map((value) => <option key={value.id} value={value.id}>{value.displayName}{!value.available ? " · Not ready" : ""}</option>)}</select></label><label>Model<select aria-label="Conversation model" disabled={c.active || c.working || !provider} value={c.model} onChange={(event) => { c.setModel(event.target.value); if (conversation) void c.newConversation(c.providerId, event.target.value); }}>{provider?.models.map((value) => <option key={value}>{value}</option>)}</select></label></div>
      {conversation && <p className="conversation-session-note">Provider and model are fixed per conversation. Choosing another starts a new one.</p>}
      {bridge.transportKind === "mock" && <p className="conversation-mock-note">Browser mock · simulated AI and tool activity</p>}
    </div>
    <div className="conversation-transcript" ref={scroll} tabIndex={0} aria-label="Conversation messages" onScroll={() => { const node = scroll.current; if (node) { savedScroll.current = node.scrollTop; follow.current = node.scrollHeight - node.clientHeight - node.scrollTop < 48; if (follow.current) setUnseen(false); } }}>
      {c.loading ? <p role="status" className="conversation-loading">Restoring Astra conversations…</p> : !c.turns.length ? <div className="conversation-empty"><span className="large-astra"><ZoneIcon zone="companion" size={36} /></span><span className="eyebrow">A LITTLE CONTEXT. A CLEARER NEXT STEP.</span><h3>Start with the work<br />in front of you.</h3><p>Bring a question, a project, or a line of code. Choose the context Astra can use.</p>{["Help me understand this project", "Review the current architecture", "Think through the next step"].map((value) => <button key={value} disabled={!provider?.available || c.working} onClick={() => { setDraft(value); prompt.current?.focus(); }}>{value}<UiIcon name="arrow" /></button>)}</div> : <div className="reading-measure">{c.turns.length > turnLimit && <button className="load-earlier ui-button" onClick={() => { if (scroll.current) prepend.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop }; follow.current = false; setTurnLimit((limit) => limit + 8); }}>Show earlier messages · {c.turns.length - turnLimit} remaining</button>}{c.turns.slice(-turnLimit).map((turn) => <article className="conversation-turn" key={turn.streamId}><div className="user-message"><span>You</span><p>{turn.userText}</p></div><div className="answer-label"><ZoneIcon zone="companion" size={17} /><strong>Astra</strong><span>{labels[turn.state]}</span></div>
        {turn.tools.length > 0 && <div className="tool-list" aria-label="Read-only tool activity">{turn.tools.map((tool) => <details className="tool-card" key={tool.callId}><summary><UiIcon name="file" /><span><strong>{tool.summary}</strong><small>{tool.tool}</small></span><span className={`status-badge tool-${tool.status}`}>{({ running: "Running", succeeded: "Completed", failed: "Failed", denied: "Denied", awaiting_approval: "Needs approval", cancelled: "Cancelled" } as const)[tool.status]}</span><UiIcon name="chevron" /></summary><div className="tool-details">{tool.message && <p>{tool.message}</p>}{tool.sources.map((source, index) => <p key={index}><code>{source.fullName}{source.path ? ` / ${source.path}` : ""}{source.lines ? `:${source.lines.start}–${source.lines.end}` : ""}</code>{source.ref && <small>Read at {source.ref}</small>}</p>)}{!tool.message && !tool.sources.length && <p>The host has not returned source details for this tool.</p>}</div></details>)}</div>}
        {turn.replyText ? <Suspense fallback={<p className="reply-placeholder">{turn.replyText}</p>}><Markdown text={turn.replyText} streaming={!turn.finishReason && c.active} paused={layout === "compact" || !visible} /></Suspense> : <p className="reply-placeholder">{turn.finishReason === "cancelled" ? "Stopped before any response text." : turn.finishReason === "error" ? "No response text was returned." : labels[turn.state]}</p>}
        {turn.finishReason === "length" && <p className="warning-note">The native reply limit was reached. The partial response is preserved.</p>}{turn.finishReason === "cancelled" && <p className="help">Reply stopped by the host. Partial text is preserved.</p>}
        {turn.sources.length > 0 && <details className="reply-sources"><summary>Sources used · {turn.sources.length}</summary>{turn.sources.map((source, index) => <p key={index}><code>{source.fullName ?? "Workspace"}{source.path ? ` / ${source.path}` : ""}{source.lines ? `:${source.lines.start}–${source.lines.end}` : ""}</code>{source.ref && <small>{source.ref}</small>}</p>)}</details>}
        {turn.finishReason && <div className="reply-actions"><button disabled={!turn.replyText} onClick={() => void copy(turn.replyText)}><UiIcon name="copy" />Copy reply</button><button disabled={disabled} onClick={() => void send(turn.userText)}>Send again</button></div>}
      </article>)}</div>}
    </div>
    {unseen && layout !== "compact" && <button className="jump-latest" onClick={() => { follow.current = true; setUnseen(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }}>Jump to latest</button>}
    <div className="conversation-feedback"><p className="turn-status" role="status" aria-live="polite">{c.stopping ? "Stopping reply…" : c.working && !c.active ? "Preparing conversation…" : c.active ? labels[state] : ""}</p>
      {c.restoring && <p className="warning-note">{state === "waiting_for_approval" && !c.view?.approval ? "An outstanding approval could not be restored. Stop this reply and send again." : "Recovering the reply from the host after a missing event."}</p>}
      {c.issue && <div className="inline-error" role="alert"><p>{c.issue.text}</p><div className="button-row"><button disabled={c.loading || c.working} onClick={() => void c.retry()}>Refresh conversation</button>{["permission_denied", "not_found", "unavailable"].includes(c.issue.code) && <button disabled={c.active || c.working} onClick={() => void c.newConversation()}>Start a new conversation</button>}{c.issue.code === "permission_denied" && conversation && <button disabled={c.working} onClick={() => setDialog("reset")}>Reset conversation</button>}</div></div>}
      {c.notice && <p className="inline-notice" role="status">{c.notice}<button aria-label="Dismiss conversation notice" onClick={() => c.setNotice("")}><UiIcon name="close" /></button></p>}{copyNotice && <p className="copy-status" role="status">{copyNotice}</p>}
    </div>
    <div className="conversation-composer"><form onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor="companion-prompt">Message Astra</label><textarea ref={prompt} id="companion-prompt" autoComplete="off" rows={2} maxLength={32000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What would you like to work on?" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!disabled && draft.trim()) void send(); } }} /><div className="composer-actions"><button type="button" className="context-trigger" onClick={() => setDialog("context")}><UiIcon name="plus" /><span>{conversation?.repository?.fullName.split("/").at(-1) ?? "Add context"}{contextCount ? ` · ${contextCount}` : ""}</span></button>{c.active || c.working ? <button key="stop" type="button" className="stop-reply" aria-label="Stop reply" disabled={c.stopping} onClick={(event) => { event.preventDefault(); void c.cancel(); }}><UiIcon name="stop" />{c.stopping ? "Stopping…" : "Stop"}</button> : <button key="send" type="submit" className="send-message" aria-label="Send message" disabled={disabled || !draft.trim()}><UiIcon name="arrow" /></button>}</div></form><div className="composer-help"><span title="Native voice capture is not implemented in this phase">Text conversation · Voice unavailable</span><button onClick={() => setDialog("providers")}>Provider settings</button></div>{!provider?.available && !c.loading && <p className="help">{provider ? "This provider needs configuration or a stored key." : "Add a provider to start a conversation."}</p>}
    </div>
    {layout === "expanded" && <button className="reset-pane-width" onClick={() => resize(null)}>Reset panel width</button>}
    {c.view?.approval && c.active && <ApprovalDialog key={c.view.approval.approvalId} approval={c.view.approval} respond={c.approve} cancel={c.cancel} />}
    <Suspense fallback={<p role="status" className="inline-notice">Loading controls…</p>}>{dialog === "context" && !c.view?.approval && <ContextDialog controller={c} workspace={g} zone={zone} preferSelected={preferSelected} close={() => { setDialog(null); setPreferSelected(false); }} />}
    {dialog === "providers" && !c.view?.approval && <ProviderSettings controller={c} close={() => setDialog(null)} />}</Suspense>
    {dialog === "history" && <Modal title="Conversations this session" subtitle="ASTRA / SESSION HISTORY" close={() => setDialog(null)}><div className="ui-dialog-body"><p className="help">Conversations are held in memory on this Mac. Quitting AURA clears them. Each keeps its original provider and project binding.</p>{!c.sessions.length && <p className="help">No conversations in this session yet.</p>}<div className="session-list">{c.sessions.map((item) => <button disabled={c.active || c.working} key={item.conversationId} aria-pressed={item.conversationId === conversation?.conversationId} onClick={() => { void c.restore(item.conversationId); setDialog(null); }}><strong>{item.repository?.fullName ?? "Workspace conversation"}</strong><small>{item.providerName} · {item.model} · {item.turnCount} turns</small><span>{labels[item.state]}</span></button>)}</div>{c.active && <p className="help">Stop the current reply before switching conversations.</p>}</div><footer className="ui-dialog-actions"><button className="ui-button" disabled={!conversation || c.working} onClick={() => setDialog("reset")}>Manage current conversation</button><button className="ui-button" onClick={() => setDialog(null)}>Done</button></footer></Modal>}
    {dialog === "reset" && <Modal title="Manage this conversation" subtitle="ASTRA / SESSION CONTROLS" close={() => setDialog(null)}><div className="ui-dialog-body"><p>Reset cancels the current reply, clears history and approvals, and keeps its provider and repository. End also removes the conversation from this session.</p></div><footer className="ui-dialog-actions"><button className="ui-button" data-initial-focus onClick={() => setDialog(null)}>Keep conversation</button><button className="ui-button" disabled={c.working} onClick={() => { void c.reset(); setDialog(null); }}>Reset conversation</button><button className="ui-button danger" disabled={c.working} onClick={() => { void c.reset(true); setDialog(null); }}>End conversation</button></footer></Modal>}
  </section>;
}
