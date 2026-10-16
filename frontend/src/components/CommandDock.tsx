import { useState } from "react";
import { motion } from "motion/react";
import { bridge } from "../platform/bridge.ts";
import type { useCompanion } from "./useCompanion.ts";
import { ArrowIcon } from "./Icon.tsx";
import { ZoneIcon } from "./ZoneIcon.tsx";

export function CommandDock({ companion, reducedMotion }: { companion: ReturnType<typeof useCompanion>; reducedMotion: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const c = companion;
  const quickPrompts = ["Explore this workspace", "Review my projects", "Plan the next step"];
  return <motion.section className="command-dock glass" data-companion-state={c.state} data-expanded={expanded} aria-label="Astra command dock"
    initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.3 }}>
    <div className="dock-header">
      <button className={`talk-button ${c.voice?.listening ? "listening" : ""}`} disabled={c.voiceBusy || c.voiceUnavailable}
        aria-pressed={Boolean(c.voice?.listening)} onClick={() => void c.voiceAction("listen")}>
        <span className="talk-symbol"><ZoneIcon zone="companion" size={23} /></span><span>{c.voice?.listening ? "Stop listening" : "Talk with Astra"}<small>{c.voiceUnavailable ? "Voice available in Phase 3" : bridge.transportKind === "mock" ? "Mock voice · no microphone captured" : "Voice companion"}</small></span>
      </button>
      <span className="companion-state"><i className={`state-dot ${c.state}`} />{c.state}</span>
      <button className="icon-button" aria-expanded={expanded} aria-controls="reply-panel" aria-label={expanded ? "Collapse reply" : "Expand reply"} onClick={() => setExpanded(!expanded)}>{expanded ? "⌄" : "⌃"}</button>
    </div>
    <form className="prompt-form" onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) { void c.ask(prompt); setExpanded(true); } }}>
      <label className="sr-only" htmlFor="companion-prompt">Message Astra</label>
      <input id="companion-prompt" autoComplete="off" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Bring an idea to your workspace…" />
      {c.busy ? <button type="button" aria-label="Stop reply" onClick={() => void c.cancel()}>Stop</button> : <button className="send-button" disabled={!prompt.trim() || !c.provider} aria-label="Send message"><ArrowIcon /></button>}
    </form>
    <div className="quick-prompts" role="group" aria-label="Quick prompts">{quickPrompts.map((text) => <button key={text} disabled={c.busy || !c.provider}
      onClick={() => { setPrompt(text); setExpanded(true); void c.ask(text); }}>{text}<ArrowIcon /></button>)}</div>
    {c.notice && <p role="status" className="dock-notice">{c.notice}</p>}
    {c.transcript && <p className="transcript">Transcript: {c.transcript}</p>}
    {expanded && <motion.div id="reply-panel" className="reply-panel" initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
      <div className="section-heading"><span className="eyebrow">{c.provider?.displayName ?? "No AI provider available"}</span>
        {c.reply && !c.busy && <button disabled={c.voiceUnavailable || c.voiceBusy} onClick={() => void c.voiceAction("speak")}>{c.voice?.speaking ? "Stop speaking" : bridge.transportKind === "mock" ? "Animate mock speech" : "Read reply"}</button>}</div>
      <p role="log" aria-live="polite" aria-relevant="text">{c.reply || (c.busy ? "Astra is thinking…" : "Choose a prompt or write a message.")}</p>
    </motion.div>}
  </motion.section>;
}
