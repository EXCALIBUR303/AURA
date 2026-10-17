import { useCallback, useEffect, useRef, useState } from "react";
import type { AIApprovalDecision, AIContextRequest, AIConversationInfo, AIConversationTurn, AIProviderInfo, AITurnState, Preferences, ZoneId } from "@aura/contracts";
import { applyReplyEvent, bridge, newReply, useBridgeEvent } from "../platform/bridge.ts";
import type { ReplyEvent, ReplyView } from "../platform/bridge.ts";
import { errorText } from "../components/ui.tsx";
import type { UiIssue } from "../components/ui.tsx";

export type ConversationContext = Omit<AIContextRequest, "repository">;
const emptyContext: ConversationContext = { include: {} };
export const ACTIVE_STATES = new Set<AITurnState>(["preparing_context", "requesting", "streaming", "waiting_for_tool", "waiting_for_approval"]);

/** UI coordinator only. The native host owns history, tools and decisions.
 * Reuse the platform's reply folder with subscriptions installed before send:
 * useReply(streamId) alone cannot retain events delivered before the id resolves.
 * The small pre-return buffer is replayed through that same folder, not a second
 * conversation engine. Missing sequence/snapshot state is reconciled via the host.
 */
export function useConversation(zone: ZoneId) {
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [sessions, setSessions] = useState<AIConversationInfo[]>([]);
  const [conversation, setConversation] = useState<AIConversationInfo | null>(null);
  const [turns, setTurns] = useState<AIConversationTurn[]>([]);
  const [view, setView] = useState<ReplyView | null>(null);
  const [context, setContext] = useState<ConversationContext>(emptyContext);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [issue, setIssue] = useState<UiIssue | null>(null);
  const [notice, setNotice] = useState("");
  const [invalidProvider, setInvalidProvider] = useState(false);
  const alive = useRef(false), epoch = useRef(0), read = useRef(0), sessionRead = useRef(0), locked = useRef(false), cancelWanted = useRef(false);
  const current = useRef<AIConversationInfo | null>(null), stream = useRef<string | null>(null), folded = useRef<ReplyView | null>(null);
  const starting = useRef(false), early = useRef<ReplyEvent[]>([]), lostEarly = useRef(false), account = useRef<string | null>(null);
  const blockedPrivate = useRef(false);
  const install = useCallback((info: AIConversationInfo | null) => { current.current = info; setConversation(info); }, []);
  const discardReply = useCallback(() => { stream.current = null; folded.current = null; early.current = []; starting.current = false; setView(null); setStopping(false); setRestoring(false); }, []);
  const list = useCallback(async () => {
    const request = ++sessionRead.current;
    try { const result = await bridge.call("ai.listConversations", {}); if (alive.current && request === sessionRead.current) setSessions(result.filter((item) => !blockedPrivate.current || (!item.repository?.isPrivate && !item.carriesPrivateContext))); }
    catch (error) { if (alive.current && request === sessionRead.current) setIssue(errorText(error)); }
  }, []);
  const refresh = useCallback(async (id = current.current?.conversationId) => {
    if (!id) return;
    const generation = epoch.current, request = ++read.current;
    try {
      const detail = await bridge.call("ai.getConversation", { conversationId: id });
      if (!alive.current || generation !== epoch.current || request !== read.current || current.current?.conversationId !== id) return;
      if (blockedPrivate.current && (detail.conversation.carriesPrivateContext || detail.conversation.repository?.isPrivate)) return;
      install(detail.conversation); setTurns(detail.turns);
      if (detail.conversation.activeStreamId && stream.current !== detail.conversation.activeStreamId) {
        stream.current = detail.conversation.activeStreamId; folded.current = newReply(stream.current); setView(folded.current); setRestoring(true);
      }
      if (!detail.conversation.activeStreamId) { stream.current = null; setStopping(false); setRestoring(false); }
    } catch (error) { if (alive.current && generation === epoch.current && request === read.current) setIssue(errorText(error)); }
  }, [install]);
  const restore = useCallback(async (id: string) => {
    if (locked.current) return;
    const generation = ++epoch.current;
    discardReply(); setTurns([]); setIssue(null); setContext(emptyContext); setLoading(true);
    try {
      const detail = await bridge.call("ai.getConversation", { conversationId: id });
      if (!alive.current || generation !== epoch.current) return;
      if (blockedPrivate.current && (detail.conversation.carriesPrivateContext || detail.conversation.repository?.isPrivate)) return;
      install(detail.conversation); setTurns(detail.turns); setProviderId(detail.conversation.providerId); setModel(detail.conversation.model); setInvalidProvider(false);
      if (detail.conversation.activeStreamId) {
        stream.current = detail.conversation.activeStreamId; folded.current = newReply(stream.current); setView(folded.current); setRestoring(true);
        setNotice("Restoring the active reply from the host. If an approval cannot be restored, stop and send again.");
      }
    } catch (error) { if (alive.current && generation === epoch.current) setIssue(errorText(error)); }
    finally { if (alive.current && generation === epoch.current) setLoading(false); }
  }, [discardReply, install]);

  useEffect(() => {
    alive.current = true;
    const generation = ++epoch.current;
    void Promise.all([bridge.call("ai.listProviders", {}), bridge.call("prefs.get", {}), bridge.call("ai.listConversations", {})]).then(async ([list, preferences, history]) => {
      if (!alive.current || generation !== epoch.current) return;
      setProviders(list); setPrefs(preferences); setSessions(history);
      const provider = list.find((item) => item.id === preferences.ai.defaultProviderId) ?? list.find((item) => item.available) ?? list[0];
      setProviderId(provider?.id ?? ""); setModel(provider?.defaultModel ?? provider?.models[0] ?? "");
      const last = history.at(-1);
      if (last) await restore(last.conversationId);
    }).catch((error) => { if (alive.current && generation === epoch.current) setIssue(errorText(error)); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; epoch.current++; };
  }, [restore]);
  useBridgeEvent("prefs.changed", setPrefs);
  useBridgeEvent("ai.providersChanged", (list) => {
    const id = current.current?.providerId;
    const before = providers.find((item) => item.id === id), after = list.find((item) => item.id === id);
    if (id && (!after || before && (before.baseUrl !== after.baseUrl || before.kind !== after.kind || before.api !== after.api))) {
      setInvalidProvider(true); setIssue({ code: "permission_denied", text: "The provider configuration changed. Start a new conversation to continue." });
    }
    setProviders(list);
  });
  useBridgeEvent("github.authChanged", (status) => {
    const login = "account" in status ? status.account.login : null;
    const invalid = !["connected", "rate_limited"].includes(status.state) || (account.current !== null && login !== account.current);
    account.current = login;
    blockedPrivate.current = invalid;
    if (invalid) {
      setSessions((items) => items.filter((item) => !item.repository?.isPrivate && !item.carriesPrivateContext));
      if (current.current?.repository?.isPrivate || current.current?.carriesPrivateContext) {
        epoch.current++; discardReply(); install(null); setTurns([]); setContext(emptyContext); setNotice("GitHub access changed. Private conversation content was removed from this view.");
      }
    }
  });
  useBridgeEvent("ai.conversationChanged", (event) => {
    void list();
    if (event.conversationId !== current.current?.conversationId) return;
    if (["reset", "repository_changed", "github_access_changed", "provider_changed", "ended", "evicted"].includes(event.reason)) {
      epoch.current++; discardReply(); setContext(emptyContext);
      if (["reset", "github_access_changed", "ended", "evicted"].includes(event.reason)) setTurns([]);
      install(event.conversation);
    }
    if (event.reason === "github_access_changed") setNotice("GitHub access changed. The host cleared private context and approvals.");
    if (event.reason === "repository_changed") setNotice("Conversation repository updated. File selections and source approvals were cleared.");
    if (event.reason === "provider_changed") { setInvalidProvider(true); setIssue({ code: "permission_denied", text: "The provider changed. Start a new conversation to continue." }); }
    if (event.reason === "tools_unavailable") setNotice("This provider does not support the offered tools. Astra will continue without them.");
    if (event.conversation) void refresh(event.conversationId);
  });

  function receive(event: ReplyEvent) {
    if (starting.current && !stream.current) {
      if (early.current.length < 512) early.current.push(event); else lostEarly.current = true;
      return;
    }
    if (!stream.current || event.payload.streamId !== stream.current) return;
    const before = folded.current ?? newReply(stream.current);
    const next = applyReplyEvent(before, event);
    if (next === before) return;
    folded.current = next; setView(next);
    if (next.gap) setRestoring(true);
    if (next.error) setIssue(errorText(next.error));
    if (next.ended) { setStopping(false); void refresh(); void list(); }
  }
  useBridgeEvent("ai.turnState", (payload) => receive({ name: "ai.turnState", payload }));
  useBridgeEvent("ai.chunk", (payload) => receive({ name: "ai.chunk", payload }));
  useBridgeEvent("ai.toolActivity", (payload) => receive({ name: "ai.toolActivity", payload }));
  useBridgeEvent("ai.approvalRequested", (payload) => receive({ name: "ai.approvalRequested", payload }));
  useBridgeEvent("ai.done", (payload) => receive({ name: "ai.done", payload }));
  useBridgeEvent("ai.error", (payload) => receive({ name: "ai.error", payload }));
  useEffect(() => {
    if (!restoring || !conversation?.activeStreamId) return;
    let live = true, timer = 0;
    const poll = async () => { await refresh(); if (live) timer = window.setTimeout(() => void poll(), 600); };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [restoring, conversation?.activeStreamId, refresh]);

  async function create(targetProvider = providerId, targetModel = model) {
    const info = await bridge.call("ai.startConversation", { providerId: targetProvider, ...(targetModel ? { model: targetModel } : {}) });
    if (!alive.current) return info;
    discardReply(); install(info); setTurns([]); setIssue(null); setNotice(""); setInvalidProvider(false); setProviderId(info.providerId); setModel(info.model); void list();
    return info;
  }
  async function newConversation(targetProvider = providerId, targetModel = model) {
    if (locked.current || stream.current) { setNotice("Stop the current reply before starting another conversation."); return; }
    locked.current = true; setWorking(true);
    try { epoch.current++; await create(targetProvider, targetModel); setContext(emptyContext); }
    catch (error) { setIssue(errorText(error)); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  }
  async function send(text: string) {
    if (!text.trim() || text.length > 32000 || locked.current || stream.current || invalidProvider) return false;
    locked.current = true; cancelWanted.current = false; setWorking(true); setIssue(null); setNotice("");
    try {
      const info = current.current ?? await create();
      const generation = epoch.current;
      starting.current = true; early.current = []; lostEarly.current = false;
      const result = await bridge.call("ai.sendMessage", { conversationId: info.conversationId, text: text.trim(), context: { ...context, zone: context.zone ? zone : undefined } });
      if (!alive.current || generation !== epoch.current || current.current?.conversationId !== info.conversationId) { void bridge.call("ai.cancel", result).catch(() => {}); return false; }
      stream.current = result.streamId; folded.current = newReply(result.streamId); setView(folded.current);
      install({ ...info, activeStreamId: result.streamId, state: "preparing_context" });
      setTurns((items) => [...items, { streamId: result.streamId, userText: text.trim(), replyText: "", finishReason: null, state: "preparing_context", tools: [], sources: [] } satisfies AIConversationTurn].slice(-40));
      starting.current = false;
      const buffer = early.current; early.current = []; buffer.forEach(receive);
      if (lostEarly.current) setRestoring(true);
      if (cancelWanted.current) await cancel();
      return true;
    } catch (error) { if (alive.current) { setIssue(errorText(error)); await refresh(); } return false; }
    finally { starting.current = false; locked.current = false; if (alive.current) { setWorking(false); if (!stream.current) setStopping(false); } }
  }
  async function cancel() {
    cancelWanted.current = true; setStopping(true);
    const id = stream.current;
    if (!id) { if (!locked.current) setStopping(false); return false; }
    try { await bridge.call("ai.cancel", { streamId: id }); await refresh(); return true; }
    catch (error) { setStopping(false); setIssue({ ...errorText(error), text: "Cancellation was not confirmed. Try Stop again or check the connection." }); return false; }
  }
  async function bindRepository(repository: { fullName: string; branch?: string } | null) {
    if (locked.current || stream.current) return false;
    locked.current = true; setWorking(true); setIssue(null);
    try {
      const info = current.current ?? await create();
      const result = await bridge.call("ai.setConversationRepository", { conversationId: info.conversationId, repository });
      if (current.current?.conversationId !== info.conversationId) return false;
      install(result); setContext(emptyContext); void list(); return true;
    } catch (error) { setIssue(errorText(error)); return false; }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  }
  async function reset(end = false) {
    const id = current.current?.conversationId;
    if (!id || locked.current) return;
    locked.current = true; setWorking(true); setIssue(null);
    try {
      if (end) { await bridge.call("ai.endConversation", { conversationId: id }); install(null); }
      else { const info = await bridge.call("ai.resetConversation", { conversationId: id }); install(info); }
      discardReply(); setTurns([]); setContext(emptyContext); setNotice(end ? "Conversation ended." : "Conversation reset by the host."); void list();
    } catch (error) { setIssue(errorText(error)); }
    finally { locked.current = false; setWorking(false); }
  }
  async function approve(approvalId: string, decision: AIApprovalDecision) {
    if (!current.current) throw new Error("No conversation");
    await bridge.call("ai.respondToApproval", { conversationId: current.current.conversationId, approvalId, decision });
  }
  const activeView = view?.streamId === conversation?.activeStreamId || (view?.ended && turns.some((turn) => turn.streamId === view.streamId)) ? view : null;
  const visibleTurns = turns.map((turn) => activeView?.streamId === turn.streamId && !restoring && !activeView.gap ? { ...turn, replyText: activeView.text, state: activeView.state, tools: activeView.tools, finishReason: activeView.error ? "error" as const : activeView.finishReason } : turn);
  const active = !!conversation?.activeStreamId && !activeView?.ended;
  const state = active ? activeView?.state === "idle" || restoring ? conversation?.state ?? "preparing_context" : activeView?.state ?? conversation?.state ?? "idle" : issue ? "error" : visibleTurns.at(-1)?.state ?? "idle";
  return { providers, providerId, model, setProviderId, setModel, sessions, conversation, turns: visibleTurns, view: activeView, context, setContext, prefs, loading, working, stopping, restoring,
    active, state, issue, setIssue, notice, setNotice, invalidProvider, newConversation, send, cancel, bindRepository, reset, approve, restore, refresh, list };
}

export type ConversationController = ReturnType<typeof useConversation>;
