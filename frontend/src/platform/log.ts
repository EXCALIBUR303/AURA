// Frontend logging. Always logs to the console; inside the macOS app,
// info and above are also forwarded to unified logging (subsystem
// com.aura.app, category "web") so one `log stream` shows both sides.
// Never log tokens, prompts containing secrets, or personal data.

import type { LogLevel } from "@aura/contracts";
import { bridge } from "./bridge.ts";

const consoleFor: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  notice: console.info,
  error: console.error,
  fault: console.error,
};

function write(level: LogLevel, message: string, context?: Record<string, string>): void {
  consoleFor[level](`[aura] ${message}`, context ?? "");
  if (bridge.transportKind !== "native" || level === "debug") return;
  // Forwarding failures must never recurse into the logger.
  bridge.call("log.write", { level, message, ...(context ? { context } : {}) }).catch(() => {});
}

export const log = {
  debug: (message: string, context?: Record<string, string>) => write("debug", message, context),
  info: (message: string, context?: Record<string, string>) => write("info", message, context),
  /** Persisted by unified logging (info/debug are memory-only); use sparingly. */
  notice: (message: string, context?: Record<string, string>) => write("notice", message, context),
  error: (message: string, context?: Record<string, string>) => write("error", message, context),
};
