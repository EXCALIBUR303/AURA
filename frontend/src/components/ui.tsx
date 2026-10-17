import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

type IconName = "arrow" | "expand" | "collapse" | "close" | "plus" | "chevron" | "settings" | "file" | "check" | "lock" | "copy" | "search" | "back" | "stop" | "history";
const paths: Record<IconName, string> = {
  arrow: "M12 19V5m-5 5 5-5 5 5", expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5", close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14", chevron: "m8 10 4 4 4-4", settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8m-8 4h5", check: "m5 12 4 4L19 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3", copy: "M8 8h12v13H8zM4 16H2V2h13v2",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", back: "m10 5-7 7 7 7M3 12h18",
  stop: "M6 6h12v12H6z", history: "M3 11a9 9 0 1 1 3 8M3 5v6h6m3-5v6l4 2",
};
export function UiIcon({ name }: { name: IconName }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function IconButton({ name, label, onClick, disabled = false }: { name: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="ui-icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}><UiIcon name={name} /></button>;
}
export function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("companion-prompt")?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`ui-dialog ${wide ? "wide" : ""}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  }}><header className="ui-dialog-heading"><div>{subtitle && <span className="eyebrow">{subtitle}</span>}<h2 id={titleId}>{title}</h2></div><IconButton name="close" label="Close dialog" onClick={close} /></header>{children}</dialog>;
}

export type UiIssue = { code: string; text: string };
export function errorText(error: unknown): UiIssue {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "internal";
  const text: Record<string, string> = {
    invalid_request: "This action could not be accepted. Check the fields, or stop the current reply first.",
    permission_denied: "The current privacy or provider settings do not allow this action. Reset the conversation or review settings.",
    not_found: "This item is no longer available. Start a new conversation or refresh the view.",
    not_authenticated: "Authorization is required. Check the provider key or reconnect GitHub.",
    rate_limited: "The service is rate limited. Wait before trying again.",
    unavailable: "The service is unavailable or not configured. Review provider settings.",
    network: "The service could not be reached. Check the connection and try again.",
    timeout: "The request timed out. Try again when the service is available.",
    cancelled: "The action was cancelled.",
  };
  return { code, text: text[code] ?? "The action could not be completed. Please try again." };
}
