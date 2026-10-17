import { useEffect, useRef, useState } from "react";
import type { AIProviderInfo, AIProviderSettings } from "@aura/contracts";
import { bridge, useBridgeEvent } from "../platform/bridge.ts";
import { errorText, Modal, UiIcon } from "../components/ui.tsx";
import type { ConversationController } from "./useConversation.ts";

const blank: AIProviderSettings = { id: "", displayName: "", api: "openai_compatible", baseUrl: "", models: [], defaultModel: null };
export function ProviderSettings({ controller: c, close }: { controller: ConversationController; close: () => void }) {
  const [editing, setEditing] = useState<AIProviderSettings | null>(null), [modelText, setModelText] = useState("");
  const [pending, setPending] = useState(false), [failure, setFailure] = useState(""), [notice, setNotice] = useState("");
  const [secureSheet, setSecureSheet] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ provider: AIProviderInfo; kind: "provider" | "key" } | null>(null);
  const locked = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useBridgeEvent("ai.providersChanged", () => { setSecureSheet(null); });
  async function act(action: () => Promise<unknown>, success?: string) {
    if (locked.current) return false;
    locked.current = true; setPending(true); setFailure(""); setNotice("");
    try { await action(); if (live.current && success) setNotice(success); return true; }
    catch (error) { if (live.current) setFailure(errorText(error).text); return false; }
    finally { locked.current = false; if (live.current) setPending(false); }
  }
  function edit(provider?: AIProviderInfo) {
    setConfirm(null); setFailure(""); setNotice("");
    setEditing(provider ? { id: provider.id, displayName: provider.displayName, api: "openai_compatible", baseUrl: provider.baseUrl ?? "", models: provider.models, defaultModel: provider.defaultModel } : { ...blank });
    setModelText(provider?.models.join("\n") ?? "");
  }
  async function save() {
    if (!editing) return;
    const settings = { ...editing, models: [...new Set(modelText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))] };
    if (!settings.models.includes(settings.defaultModel ?? "")) settings.defaultModel = settings.models[0] ?? null;
    if (await act(() => bridge.call("ai.saveProvider", settings), "Provider configuration saved. Check connection to verify the model list.")) setEditing(null);
  }
  async function key(provider: AIProviderInfo) {
    setSecureSheet(provider.id);
    if (!await act(() => bridge.call("ai.requestCredential", { providerId: provider.id }))) setSecureSheet(null);
  }
  const original = editing && c.providers.find((provider) => provider.id === editing.id);
  return <Modal title="AI providers" subtitle="ASTRA / SETTINGS" close={close}>
    <div className="ui-dialog-body"><p className="help">Choose where Astra thinks. Settings and service requests are managed on your Mac. Only the OpenAI-compatible adapter is currently implemented.</p>
      {bridge.transportKind === "mock" && <p className="data-label">Browser mock · connection and credential states are simulated</p>}
      {failure && <p className="inline-error" role="alert">{failure}</p>}{notice && <p className="inline-notice" role="status">{notice}</p>}
      {confirm ? <section className="provider-confirm"><h3>{confirm.kind === "key" ? "Remove the saved API key?" : `Remove ${confirm.provider.displayName}?`}</h3><p>{confirm.kind === "key" ? "The native service will delete this provider’s key from Keychain. Hosted requests will need a new key." : "The configuration and its Keychain key will be removed. Conversations bound to this provider cannot continue."}</p><div className="button-row"><button className="ui-button" disabled={pending} onClick={() => setConfirm(null)}>Keep {confirm.kind === "key" ? "key" : "provider"}</button><button className="ui-button danger" disabled={pending} onClick={() => void act(async () => { if (confirm.kind === "key") await bridge.call("ai.deleteCredential", { providerId: confirm.provider.id }); else await bridge.call("ai.removeProvider", { providerId: confirm.provider.id }); setConfirm(null); }, "Removed by the native service.")}>{pending ? "Removing…" : confirm.kind === "key" ? "Remove key" : "Remove provider"}</button></div></section> : editing ? <form id="provider-form" className="provider-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="section-heading"><h3>{original ? "Edit provider" : "Add OpenAI-compatible provider"}</h3><button type="button" disabled={pending} onClick={() => setEditing(null)}>Cancel editing</button></div>
        <label className="ui-field">Provider ID<input value={editing.id} pattern="[a-z0-9-]{1,32}" required maxLength={32} disabled={!!original || pending} autoComplete="off" onChange={(event) => setEditing({ ...editing, id: event.target.value })} /><small>1–32 lowercase letters, numbers, or dashes</small></label>
        <label className="ui-field">Display name<input value={editing.displayName} required maxLength={80} disabled={pending} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} /></label>
        <label className="ui-field">Endpoint<input type="url" required value={editing.baseUrl} placeholder="http://127.0.0.1:11434/v1" disabled={pending} onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })} /><small>Loopback HTTP(S) for local runtimes; HTTPS for hosted services. No credentials in the URL.</small></label>
        {original?.credential === "stored" && original.baseUrl !== editing.baseUrl && <p className="warning-note">Changing the endpoint can remove the saved key and end conversations using this provider.</p>}
        <label className="ui-field">Model identifiers<textarea required rows={3} disabled={pending} value={modelText} onChange={(event) => setModelText(event.target.value)} /><small>One per line, up to 20. The first model is used by default unless selected below.</small></label>
        <label className="ui-field">Default model<select disabled={pending} value={editing.defaultModel ?? ""} onChange={(event) => setEditing({ ...editing, defaultModel: event.target.value || null })}><option value="">First configured model</option>{[...new Set(modelText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))].map((model) => <option key={model}>{model}</option>)}</select></label>
        <p className="policy-note"><UiIcon name="lock" />API keys are entered in the native secure sheet after saving. They never enter this form.</p>
      </form> : <>
        <div className="provider-list">{c.providers.map((provider) => <section className="provider-card" key={provider.id}><div className="section-heading"><h3>{provider.displayName}</h3><span className="status-badge">{provider.builtIn ? "Offline mock" : provider.kind === "local" ? "Local runtime" : "Cloud provider"}</span></div><p className="provider-endpoint">{provider.baseUrl ?? "Built in · simulated responses"}</p><p className="compact">{provider.models.join(" · ") || "No model configured"}</p><div className="provider-status"><span>{provider.credential === "missing" ? "Key required" : provider.credential === "stored" ? "Key stored in Keychain" : "No key required"}</span><span>{provider.lastCheck ? provider.lastCheck.ok ? "Model-list check passed" : `Check failed (${provider.lastCheck.code ?? "unavailable"})` : "Not checked"}</span></div>
          {provider.lastCheck && <p className="help">{provider.lastCheck.ok ? `${provider.lastCheck.models.length} model identifiers reported. This does not verify inference.` : errorText({ code: provider.lastCheck.code }).text}</p>}
          {!provider.builtIn && <div className="provider-actions"><button className="ui-button" disabled={pending} onClick={() => void act(() => bridge.call("ai.validateProvider", { providerId: provider.id }), "Model-list check completed. No inference request was sent.")}>Check connection</button><button className="ui-button" disabled={pending} onClick={() => edit(provider)}>Edit</button>{provider.kind === "cloud" && <><button className="ui-button" disabled={pending || secureSheet === provider.id} onClick={() => void key(provider)}>{provider.credential === "stored" ? "Replace API key" : "Add API key"}</button>{provider.credential === "stored" && <button className="text-button" disabled={pending} onClick={() => setConfirm({ provider, kind: "key" })}>Remove key</button>}</>}<button className="text-button" disabled={pending} onClick={() => setConfirm({ provider, kind: "provider" })}>Remove provider</button></div>}
          {provider.available && c.prefs?.ai.defaultProviderId !== provider.id && <button className="text-button" disabled={pending} onClick={() => void act(() => bridge.call("prefs.update", { ai: { defaultProviderId: provider.id } }), "Default provider updated. Existing conversations keep their provider.")}>Use by default</button>}
          {c.prefs?.ai.defaultProviderId === provider.id && <small className="default-provider">Default for new conversations</small>}
          {secureSheet === provider.id && <p role="status" className="inline-notice">Secure key sheet requested. Complete or cancel it in the native window.</p>}
        </section>)}</div>
        {!c.providers.length && <p className="help">No providers are configured. Add a supported endpoint to begin.</p>}
        <button className="add-provider" onClick={() => edit()}><UiIcon name="plus" /><span>Add an OpenAI-compatible provider<small>Local runtime or compatible HTTPS service</small></span></button>
      </>}
      <p className="policy-note">Connection checks request the model list only. A passing check does not confirm that the provider can answer.</p>
    </div><footer className="ui-dialog-actions">{editing && <button form="provider-form" className="ui-button primary" disabled={pending}>{pending ? "Saving…" : "Save provider"}</button>}<button className="ui-button" onClick={close}>Done</button></footer>
  </Modal>;
}
