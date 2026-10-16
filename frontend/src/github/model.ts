import { BridgeCallError } from "@aura/bridge";
import type { BridgeErrorCode, RepositoryDetail, RepositorySummary } from "@aura/contracts";
import { log } from "../platform/log.ts";

export type GitHubIssue = { code: BridgeErrorCode; text: string };
export function issueFor(error: unknown): GitHubIssue {
  const code = error instanceof BridgeCallError ? error.code : "internal";
  if (code === "invalid_request") log.error("invalid GitHub bridge request");
  const messages: Partial<Record<BridgeErrorCode, string>> = {
    not_authenticated: "Sign in to GitHub to continue.",
    rate_limited: "GitHub limit reached. Loaded repositories remain available; refresh after the limit resets.",
    not_found: "AURA can’t access this repository. Check its installation access.",
    permission_denied: "AURA can’t access this repository. Check its installation access.",
    network: "GitHub could not be reached. Check your connection and retry.",
    timeout: "GitHub took too long to respond. Please retry.",
    unavailable: "GitHub is unavailable in this build.",
    invalid_request: "This GitHub request could not be processed.",
  };
  return { code, text: messages[code] ?? "GitHub data could not be loaded. Please retry." };
}
export function githubURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["github.com", "github.invalid"].includes(url.hostname) && !url.username && !url.password) return url.href;
  } catch { /* Missing or malformed source URL: render plain text. */ }
  return undefined;
}
export function dateLabel(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export type RepositorySort = "activity" | "name" | "updated";
export function filterRepositories(repos: RepositorySummary[], query: string, language: string, sort: RepositorySort, metadata: Record<string, RepositoryDetail>): RepositorySummary[] {
  const search = query.trim().toLocaleLowerCase();
  return repos.filter((repo) => (!language || repo.primaryLanguage === language) &&
    (!search || [repo.fullName, repo.description ?? "", ...repo.topics].some((value) => value.toLocaleLowerCase().includes(search))))
    .sort((a, b) => {
      if (sort !== "name") {
        const stamp = (repo: RepositorySummary) => Date.parse((sort === "updated" ? metadata[repo.fullName]?.updatedAt : repo.pushedAt) ?? "") || 0;
        const delta = stamp(b) - stamp(a);
        if (delta) return delta;
      }
      return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" });
    });
}
