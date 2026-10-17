# Phase 3C-A: AI security and provider foundation

Branch `claude/phase3c-ai-foundation`, based on `main` 9639772. Native services, contracts and tests only. No conversation UI, no tool execution, no microphone.

## 1. GitHub security hardening

| Concern | Fix | Where |
|---|---|---|
| Bearer token following a redirect | URLSession re-sends the original headers on a redirect. `URLSessionTransport` now has a task delegate that follows a redirect only to the **exact same origin** (scheme, host, port; host case-insensitive). Cross-origin and https→http hops come back as the 3xx, mapped to a network error. There is no host-suffix or prefix matching. | `Networking/RedirectPolicy.swift`, `GitHubHTTP.swift` |
| Permissions not enforced | `GitHubPermissionPolicy` checks every installation: `metadata:read` and `contents:read` are required, other **read** permissions are reported as unneeded (session kept), and **anything above read** refuses the session. The token is deleted, the state becomes `error(excess_permissions)` with where to fix it, and no repository data is fetched. The check runs at connect and restore and on every installation fetch, so a permission raised mid-session is caught on the next call. | `GitHubPermissions.swift`, `GitHubConnection.swift`, `LiveGitHubService.swift` |

Tests (`GitHubSecurityTests.swift`, 14): the redirect tests run through URLSession itself with a `URLProtocol` stub, and fail when the guard is disabled (checked by mutation). Permission tests cover missing, unneeded, excessive, mid-session escalation and network failure keeping the session.

Contract (additive): `GitHubInstallation.missingPermissions`, `unneededPermissions`; `GitHubConnectionErrorReason` `"excess_permissions"` (retryable; the existing error panel shows its message and a retry button).

## 2. AI architecture

```
page ──ai.chat──▶ AIService ──▶ AIContextBuilder ──▶ GitHubService / AppStore (native fetch)
                    │  validate · limits · retries · coalesce · seq
                    ▼
              AIProviderRegistry ──▶ AIProvider ──▶ AIHTTPTransport (ephemeral URLSession)
                    │                  ├ OpenAICompatibleProvider (hosted APIs and local runtimes)
                    │                  └ MockAIProvider (offline, scripted)
                    ▼
        SQLite kv "ai.providers" (settings)   Keychain ai.<id>.apiKey (keys)
```

- **Provider abstraction.** `AIProvider.stream(AIRequest)` yields `delta` and `finished(reason)`; `listModels()` is a free reachability and key check. A new provider is one type plus a case in `AIProviderAPI` and the registry factory. Only the OpenAI-compatible wire format ships now: it covers hosted OpenAI-style APIs and local runtimes (Ollama `/v1`, LM Studio, llama.cpp server, vLLM). An Anthropic Messages adapter is the next candidate. Models are per-provider settings, never constants.
- **Local first.** Loopback providers (`127.0.0.1`, `localhost`, `::1`; http allowed) take no key and are `kind: "local"`. Anything else must be https and is `kind: "cloud"` and needs a key.
- **Credentials.** Keys are typed only into a native secure sheet (`CredentialPrompt`) that names the destination host. They go straight to the Keychain (`AfterFirstUnlockThisDeviceOnly`, separate item per provider, separate from GitHub). The page sees `credential: "not_required" | "missing" | "stored"` only. Saving a provider with a **different origin deletes its key**, so editing settings can never redirect a key to a new host. Removing a provider deletes its key. `ai.validateProvider` sends one `GET /models`.
- **Transport.** Ephemeral session (no cache, cookies or credential storage), same-origin redirects only, 90 s idle and 10 min total timeouts. Errors name the endpoint's host and port, never the body; only the provider's error `code`/`type` token is kept from an error body, because free text can echo the prompt.

## 3. Streaming

- `ai.chat` returns `streamId` at once; output follows as `ai.chunk` / `ai.done` / `ai.error`, each with `seq` (1, 2, …). Chunks are coalesced to ≈30/s. Every stream ends with **exactly one** terminal event and nothing after it.
- `ai.cancel` sends `done("cancelled")` immediately and drops anything still in flight; a second cancel is a no-op.
- Retries only **before the first output**: network errors, timeouts, and rate limits asking ≤10 s (500 ms then 2 s backoff). Auth errors and long rate limits are reported. After text has been shown, nothing is retried, so a reply never repeats.
- Limits: 3 concurrent streams, 60 messages, 32k chars per message and 120k in total, 8192 output tokens, 120k output characters (then `finishReason: "length"`). Pages cannot send `system` messages; the host writes the system message.
- Lifecycle: streams are dropped silently when the page navigates or reloads, the web process dies, or the app quits. Minimizing does not stop a stream (the page keeps receiving it); nothing is stored: the page sends the history it wants used.
- Networking runs off the main thread (URLSession async bytes); the main actor only sequences events.

## 4. Context engine

The page names `zone`, `repository` (+ branch) and which sections (`repository`, `commits`, `notes`); the **host fetches** the data, so the page cannot supply "context" text.

- **Trust.** `workspace` (zone name) is app-produced. Repository metadata, commit subjects and project notes are `untrusted`: control characters are removed, `<`/`>` are replaced so text cannot open or close a fence, and each section is wrapped in its own `<untrusted-data>` block. The system message tells the model to treat those blocks as data and never follow instructions inside them. This reduces injection risk; it cannot eliminate it, which is why tools (§5) are validated and approved independently of the model's output.
- **Minimum and budgets.** Nothing is attached unless asked for. 6000 characters in total (repository 1500, commits 1500, notes 2000; 5 commits, 120 characters each), truncated with a flag, ≈1.5k tokens.
- **User control.** `prefs.ai.contextSharing` (master switch, default on) and `privateRepositoryContext` (`never` default, `local_only`, `all`). `ai.previewContext` returns exactly what a provider would receive, with omissions and reasons, and sends nothing.
- **Isolation.** A private repository is withheld by default, and its name does not appear at all. Context is rebuilt per request for that request's provider and is never cached. A conversation that received private context cannot continue with a provider the preference does not allow (`permission_denied`, start a new conversation).
- **Not done.** No file contents, no README bodies, no summarization or ranking (3C-B), no local files.

## 5. Tool boundary (decisions only)

`AIToolPolicy` is the gate future executors must pass through. Allowlist: `search_projects`, `get_repository`, `list_recent_commits` (read-only) and `navigate_to_zone` (app action: suggested, runs only after the user approves that exact call). Arguments are validated against declared parameters (unknown/missing names, types, ranges, identifier patterns, traversal, control characters). `sensitive` effects are never granted; shell, file writes and GitHub writes are not on the list. At most 5 calls per reply. Nothing executes in 3C-A.

## 6. Voice contracts

`VoiceSession` already owned permissions, barge-in and cancellation (3A). Added: `AudioRouteMonitor` (CoreAudio implementation lands in 3C-D), `observeRoutes`, `onInterruption`. A route change or the app going inactive stops listening and speaking, reports the interruption, and never restarts by itself. The microphone is never opened without the user's request and granted permissions; the bridge still serves `UnavailableVoiceService`.

## 7. Bridge changes (all additive, protocol v1)

Methods: `ai.saveProvider`, `ai.removeProvider`, `ai.requestCredential`, `ai.deleteCredential`, `ai.validateProvider`, `ai.previewContext`. `ai.chat` gains `context`, `conversationId`, `maxOutputTokens`. Events: `seq` on `ai.chunk|done|error`; new `ai.providersChanged`. `AIProviderInfo` gains `api`, `defaultModel`, `baseUrl`, `credential`, `lastCheck`, `builtIn`. `Preferences.ai` gains `contextSharing`, `privateRepositoryContext` (stored preferences without them decode with defaults). Mock, fixtures (7 valid, 2 invalid added) and both test suites updated. `ai.requestCredential` returns at once; the result arrives as `ai.providersChanged`.

## 8. Results

| Check | Result |
|---|---|
| Swift tests | 122/122 (was 66; +14 GitHub security, +42 AI, tool and voice) |
| Bridge tests | 13/13 |
| TypeScript typecheck, production build, `npm audit` | pass, pass, 0 vulnerabilities |
| Xcode Debug and Release | succeed, 0 errors, no warnings from AURA code (the AppIntents metadata notice is toolchain output) |
| `test:browser` and `test:github` (axe on) | 27/27 and 23/23, 0 errors, 0 external requests, 0 WCAG A/AA violations |
| Live local streaming (opt-in, free) | Ollama `llama3.2:3b`: model list, streamed reply ("AURA online"), first chunk after 1.7 s (includes model load), mid-stream cancel gave one `done(cancelled)`. Run: `AURA_LIVE_LOCAL_AI=llama3.2:3b tools/swift-test.sh --filter LiveLocalAI` |

No paid inference was sent. The Ollama server was started for the live test and stopped afterwards.

## 9. Known limitations

- Only the OpenAI-compatible adapter exists; nothing was tested against a hosted API (needs a key and your approval for any cost).
- The app does not yet show a provider-settings UI (Codex, 3C-C). The key sheet and provider calls were validated live through a probe (§12); a real hosted provider was not tried.
- `ai.chat` takes no tools yet; `conversationId` private-context tracking is in memory and resets at launch.
- Context is metadata, commit subjects and notes only. Injection fencing is a mitigation, not a guarantee.
- Voice is contracts only; `UnavailableVoiceService` is still wired.
- Provider keys are not cleared by GitHub disconnect (separate by design).

## 10. Handoff to Codex (Phase 3C-C)

Build against `shared/contracts` (mock supports everything below in a browser):

1. **Streaming.** Drop events whose `seq` is not the previous `seq + 1` for that `streamId`; ignore events for unknown streams; show a reply as finished only on `ai.done`/`ai.error`. A `cancelled` done follows `ai.cancel`. Stop sending `system` messages and cap history yourself (the host rejects >60 messages). Pass `conversationId` (new id per conversation) whenever `context` is set.
2. **Context.** Offer a "Share project context" control per message: build an `AIContextRequest` from the selected zone/repository/branch; call `ai.previewContext` to show the exact text and what was withheld (`omitted[].reason`), with trust labels. Render `untrusted` text as plain text, never HTML or markdown with links.
3. **Providers screen.** List via `ai.listProviders` and `ai.providersChanged`; add/edit with `ai.saveProvider` (explain local vs cloud: http only on this Mac); "Add API key" calls `ai.requestCredential` and then waits for `ai.providersChanged` (the native sheet appears; the page never sees the key); "Check connection" = `ai.validateProvider` (show `lastCheck`); show `credential` state and `builtIn`. Surface `kind: "cloud"` clearly ("prompts leave this Mac").
4. **Privacy settings** via `prefs.update`: `ai.contextSharing`, `ai.privateRepositoryContext` (`never`/`local_only`/`all`), with the consequence in plain words.
5. **GitHub.** Show `error(excess_permissions)` with its message and a link to the install settings; show `unneededPermissions`/`missingPermissions` on the installation (informational).
6. **Errors** by `error.code`: `unavailable` (no key/runtime), `not_authenticated` (bad key), `rate_limited` (with `retryable`), `network`, `timeout`, `permission_denied` (private conversation rule).
7. Keep the companion animation off the token path: update the transcript at the coalesced chunk rate and avoid React state updates per chunk in the 3D tree.

## 12. Live validation in AURA.app (Release build, M5) and fixes

`AURA_DEV_AI_PROBE=run|recheck|verify|sheet|cleanup` (env-gated, like `AURA_DEV_GITHUB_PROBE`) calls the bridge from the page world exactly as the frontend does and logs only outcomes (category `ai-probe`). The native sheet was driven with real key events and a fake test value; Keychain items were checked with `security find-generic-password` metadata only (never `-w`). No key value appeared in any log (searched), and all test providers and keys were removed afterwards.

| Check | Result |
|---|---|
| Save, then add key in the native sheet | Keychain item `ai.<id>.apiKey` created; page saw `credential: stored` via `ai.providersChanged` |
| Update key | Item modified (mdat changed), still `stored` |
| Cancel the sheet | Key untouched; the page was still notified |
| Malformed key | **Defect, fixed:** was rejected silently after the sheet closed. Now the sheet stays open and explains; verified |
| Delete key | Item gone, state `missing`, old check cleared |
| Remove provider | Item deleted with it |
| Endpoint moved to another host | Item deleted (no key follows a changed endpoint) |
| Restart | Providers and a stored key persisted; GitHub restored (`@…`, 9 repositories) |
| Validate | Unreachable host and stopped local runtime reported as `unavailable` in `lastCheck` (message wording fixed for non-local hosts) |
| Local provider asked for a key | **Defect, fixed:** returned ok, failed silently. Now `invalid_request` before any sheet |
| Key field | **Defect, fixed:** marked as a password, so macOS offered Passwords autofill inside the sheet. Removed |
| Keychain access prompt after a rebuild | **Defect, fixed:** provider Keychain reads ran on the main actor, so the prompt froze the window and the page's calls timed out ("AI providers could not be loaded"). Reads now run off the main actor |

Excess GitHub permissions: not tested against the live installation (unchanged on purpose). A bridge-level test (`GitHubExcessPermissionBridgeTests`) runs the production `AppServices` stack against a scripted GitHub whose installation grants `contents: write`: the page gets `error(excess_permissions)` with the settings link and no token, the stored token is deleted, all four data methods fail with `not_authenticated`, no repository endpoint is requested, and every request AURA sent was a GET. The live installation (read-only) was re-checked by the GitHub probe: connected, `contents=read, metadata=read`, 9 repositories, branches, commits, outside repository refused.

3D studio, Release build, 1100×732 at pixel ratio 2: all six zones 60 fps, p99 18–19 ms, 12–14 draw calls, ≈79.8k triangles (unchanged from Phase 3B).

## 11. Files

Created: `Networking/RedirectPolicy.swift`, `Services/GitHub/GitHubPermissions.swift`, `Services/AI/{AIProvider,AIHTTP,OpenAICompatibleProvider,AIProviderRegistry,AIContext,AIService,AITools}.swift`, `AuraApp/CredentialPrompt.swift`, tests `GitHubSecurityTests`, `AITests`, `AIToolAndVoiceContractTests`, this document.
Modified: `GitHubHTTP`, `GitHubConnection`, `LiveGitHubService`, `AIProviderConfiguration` (rewritten around validated settings), `Services.swift` (AI types moved to `Services/AI`), `VoiceSession`, `AppServices`, `AppStore` (generic JSON values), `BridgeDomain`, `BridgeMethod`, `AppModel`, `StudioWebView`, `AuraApp`, `shared/contracts`, `shared/bridge/mock.ts`, fixtures, tests, `ARCHITECTURE.md`, `TASKS.md`.
