import { isValidElement, memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import swift from "highlight.js/lib/languages/swift";
import cpp from "highlight.js/lib/languages/cpp";
import bash from "highlight.js/lib/languages/bash";
import { UiIcon } from "../components/ui.tsx";

const highlighter = createLowlight({ javascript, typescript, json, python, swift, cpp, bash });
highlighter.registerAlias({ javascript: ["js", "jsx"], typescript: ["ts", "tsx"], python: ["py"], cpp: ["c", "c++"], bash: ["sh", "shell"] });
type HighlightNode = ReturnType<typeof highlighter.highlight>["children"][number];
function highlighted(node: HighlightNode, index: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type === "element") return <span key={index} className={Array.isArray(node.properties.className) ? node.properties.className.join(" ") : undefined}>{node.children.map(highlighted)}</span>;
  return null;
}
function CodeBlock({ text, language }: { text: string; language: string }) {
  const [wrap, setWrap] = useState(false), [copied, setCopied] = useState("");
  const code = useMemo(() => {
    // Bounded synchronous work while streaming. Long or unknown blocks stay plain.
    if (text.length > 30000 || !highlighter.registered(language)) return text;
    try { return highlighter.highlight(language, text).children.map(highlighted); } catch { return text; }
  }, [text, language]);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied("Copied"); } catch { setCopied("Select the code to copy it"); } }
  return <section className="code-block" aria-label={`${language || "Plain text"} code block`}><header><span>{language || "Plain text"}</span><div><button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>Wrap</button><button type="button" onClick={() => void copy()}><UiIcon name="copy" />Copy code</button></div></header><pre tabIndex={0} className={wrap ? "wrap" : undefined}><code>{code}</code></pre>{copied && <p className="copy-status" role="status">{copied}</p>}</section>;
}
function safeLink(href: string | undefined) { try { const url = new URL(href ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } }
// Stable renderer identities preserve code wrap/copy/scroll state during streaming.
const components: Components = {
    pre: ({ children }) => {
      if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return <pre>{children}</pre>;
      return <CodeBlock text={String(children.props.children ?? "").replace(/\n$/, "")} language={/language-([\w+-]+)/.exec(children.props.className ?? "")?.[1] ?? ""} />;
    },
    a: ({ href, children }) => { const safe = safeLink(href); return safe ? <a href={safe} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>; },
    img: ({ alt }) => <span className="omitted-image">[Image omitted{alt ? `: ${alt}` : ""}]</span>,
    table: ({ children }) => <div className="markdown-table" tabIndex={0}><table>{children}</table></div>,
    input: ({ checked }) => <span aria-label={checked ? "Checked" : "Unchecked"}>{checked ? "☑" : "☐"}</span>,
};
const plugins = [remarkGfm];
const RenderedMarkdown = memo(function RenderedMarkdown({ text }: { text: string }) {
  return <div className="assistant-markdown"><ReactMarkdown remarkPlugins={plugins} skipHtml components={components}>{text}</ReactMarkdown></div>;
});

/** Keep partial text responsive without reparsing a large AST for every token.
 * Completed replies flush immediately; hidden panes do no periodic work. */
export const Markdown = memo(function Markdown({ text, streaming = false, paused = false }: { text: string; streaming?: boolean; paused?: boolean }) {
  const latest = useRef(text); latest.current = text;
  const [rendered, setRendered] = useState(text);
  useEffect(() => {
    if (paused || !streaming) return;
    const timer = setInterval(() => setRendered(latest.current), 100);
    return () => clearInterval(timer);
  }, [streaming, paused]);
  useEffect(() => { if (!paused && !streaming) setRendered(text); }, [text, streaming, paused]);
  return <RenderedMarkdown text={rendered} />;
});
