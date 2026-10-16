# Phase 3B: GitHub integration

Branch `claude/phase3b-github`, cut from the Phase 3A tip (`0042ac3`) because `main` (`79b8181`) does not contain Phase 3A yet. Not pushed, not merged. Everything on this page was run on the owner's M5 Mac on 2026-10-17.

## Summary

AURA signs in to GitHub as the **AURA Developer Companion** GitHub App (client ID `Iv23liQPMjrFatEpesLu`) using the OAuth device flow. No client secret or private key exists anywhere in the app, and none is needed: GitHub requires neither for the device flow or for refreshing tokens issued through it.

Tokens live in one Keychain item. The page only ever sees derived connection states. The native service reads repositories, metadata, languages, branches and recent commits. It handles pagination, the rate limit, an in-memory ETag cache, token refresh and revocation, and it only ever sends `GET` requests to the REST API.

Repositories can be assigned to studio zones by hand, as before. `projects.suggestZones` adds explainable suggestions, and a suggestion is never applied without the owner.

The sandboxed Release `AURA.app` was verified live against GitHub, with the owner approving the device code.

## Audit before implementation

| Check | Result |
|---|---|
| `main` | `79b8181` (Phase 2.7). Phase 3A is only on `claude/phase3a-native-foundation`, so Phase 3B branches from there to keep it. |
| Client ID and device flow | A `POST github.com/login/device/code` with the client ID returned a user code, a `verification_uri` and `interval` 5. So the ID is valid and device flow is enabled. The code was never used. |
| App metadata | `GET api.github.com/apps/<slug>` returns 404 without authentication, as expected for an app installable only on its owner's account. Permissions were therefore verified after sign-in, from the installation itself (below). |
| Frontend consumers | Only `Inspector.tsx` uses `github.listRepositories`, `github.listCommits` and `projects.*`. Nothing uses `github.getAuthStatus` or `app.activeChanged`, so both could change safely. |

## Live verification (Release `AURA.app`, sandboxed, ad-hoc signed)

The run used `AURA_DEV_GITHUB_PROBE=1`, `AURA_DEV_GITHUB_PROBE_REPO=EXCALIBUR303/AURA` and `AURA_DEV_GITHUB_PROBE_REFRESH=1`. Below is the log, with the values shown exactly as logged; repository names are logged `.private`.

```
probe start state=disconnected
device authorization started (expires in 899s, interval 5s)
probe authorize: enter code ####-#### at https://github.com/login/device …        (owner approved it)
stored secret github.credentials
GitHub authorization approved
probe installation id=172188091 selection=selected readOnly=true permissions=contents=read,metadata=read
listed 9 accessible repositories
probe repositories total=9 pages(5/page)=2 private=6 public=3 forks=0 archived=0 unique=true
probe repo listed=true private=true languages=6 topics=0 defaultBranchSet=true      (EXCALIBUR303/AURA)
probe branches=6 pages(1/page)=6 defaultFound=true
probe commits=3 withAuthorLogin=2
probe suggestions 5/9 hardware=1,software=4
probe outside repository refused: not_found
refreshed GitHub user access token
probe token refresh ok; state=connected
```

**Effective permissions.** These are GitHub's own installation record, not our configuration: `contents=read, metadata=read`, `repository_selection=selected`. No write permission exists, and AURA additionally never sends anything but `GET` to the API.

**Relaunch.** The session was restored from the Keychain without a new device code (`probe start state=connected`). After that relaunch, the Inspector's first `github.listRepositories` failed with `not_authenticated`: it raced the launch restore. This was fixed in `09deb3e`, and after the fix a relaunch shows `GitHub connected … listed 9 accessible repositories` with no failed bridge call.

**Not exercised live:**
- Revocation (it needs the owner to revoke and re-authorize).
- Natural token expiry (8 h).
- An exhausted rate limit (5,000 requests/h).

All three are covered by the scripted-GitHub tests below.

## Design

```
page ──bridge──▶ AppServices ──▶ LiveGitHubService (MainActor)
                                   ├ GitHubConnectionManager: state machine, restore, connect, disconnect
                                   │    └ GitHubDeviceFlowClient: device code, polling, refresh (github.com)
                                   └ GitHubAPIClient (actor): credentials, refresh, rate limit, ETag cache (api.github.com)
                                         └ GitHubCredentialStore ─▶ Keychain "github.credentials"
```

**Connection states** (`GitHubAuthStatus`, also sent as `github.authChanged`):

| State | Meaning | Offer in the UI |
|---|---|---|
| `disconnected` | No session | Connect |
| `authorizing` | `userCode`, `verificationUri`, `expiresAt` | Show the code; link to the URI; Cancel (`github.disconnect`) |
| `connected` | `account`, `installations[]` (permissions, `readOnly`, `repositorySelection`, `manageUrl`) | Data; Refresh; Disconnect |
| `rate_limited` | As connected, plus `resetAt` | Cached or empty data; "resumes at …" |
| `expired` | `login`, `reason`: `expired` (refresh token ran out) or `revoked` (GitHub rejected it). The session has already been deleted. | Reconnect |
| `error` | `reason`: `denied`, `code_expired`, `network`, `configuration` or `internal`, plus `message` and `retryable` | Retry (`github.connect`, or `github.refresh` for `network`) |

**Security boundaries:**
- Tokens and the device code never cross the bridge, never appear in logs (`description` is redacted), and are never written anywhere but the Keychain item (`AfterFirstUnlockThisDeviceOnly`, not synced).
- `URLSession` is ephemeral, with no disk cache, cookies or credential storage.
- The API client refuses any host but `api.github.com`.
- Repository names are validated before they enter a URL path (`../`, extra slashes and percent-escapes are rejected), on both the native side and the mocks.
- Commit messages and descriptions are untrusted text.

**Session behaviour:**
- **Refresh:** a token within 5 minutes of expiry is refreshed first. Concurrent requests share one refresh.
- **401:** triggers one refresh and one retry. A second 401 or `bad_refresh_token` ends the session as `revoked`. A refresh token past its expiry ends it as `expired`, with no network call.
- **Offline at launch:** the session is kept and the state is `error(network, retryable)`. `github.refresh` recovers it.
- **Disconnect:** deletes the Keychain item and drops all cached data. Revoking the app authorization on GitHub's side needs the client secret, which AURA deliberately does not have. The owner revokes it at <https://github.com/settings/apps/authorizations> (the UI should link there).

**Rate limits:**
- Primary limit: a 403 or 429 with `x-ratelimit-remaining: 0` sets `rate_limited` until `x-ratelimit-reset`.
- Secondary limit: `retry-after`.
- While limited, calls fail fast with `rate_limited` and make no request.
- The state returns to `connected` after the reset, or on the next successful call.
- ETag revalidation (a 304 does not count against the limit) and a 60 s freshness window keep usage low.

**Repositories:**
- Listed from `/user/installations/{id}/repositories` (100 per page, following the Link header), deduplicated across installations, and sorted by `pushedAt`.
- The full list is held in memory for 120 s so cursors (`offset:N`) are stable.
- Branch cursors are `page:N`.
- An empty repository returns `[]` commits (GitHub answers 409).
- A repository outside the installation returns `not_found` (404) or `permission_denied` (403). Neither changes the connection state.

**Zones:**
- `ProjectRecord.zone` stays the single source of truth. The schema is unchanged and existing project rows are untouched.
- `projects.suggestZones` scores topics (3), name and description keywords (2), and language (1–3) for `hardware`, `software` and `ai-lab`. It returns the matched reasons.
- It returns nothing for a repository with no signal or a tie, and skips repositories that already have a zone.
- Applying a suggestion is an ordinary `projects.update`.
- On the owner's account it suggested zones for 5 of 9 repositories (hardware 1, software 4); the other 4 need manual assignment.

## Contract changes (one commit, `28f27ff`)

| | Change |
|---|---|
| `GitHubAuthStatus` | Replaced `signed_out` / `signed_in{scopes}` with the six states above. New types: `GitHubAccount`, `GitHubInstallation`, `GitHubConnectionErrorReason`. |
| Methods | New: `github.connect`, `github.disconnect`, `github.refresh`, `github.getRepository` (`RepositoryDetail`: summary plus `languages[]`, `forksCount`, `openIssuesCount`, `license`, `createdAt`, `updatedAt`), `github.listBranches` (`Page<BranchSummary>`), `projects.suggestZones` (`ProjectZoneSuggestion[]`). |
| Fields | `RepositorySummary` gains `topics`, `isFork`, `isArchived`. `CommitSummary` gains `authorLogin`. |
| Events | `github.authChanged` is now emitted on every state change. `app.activeChanged` is **removed** (deprecated in 3A, no listeners). |
| Mock and fixtures | The browser mock starts `connected` as `mock-user`. `github.connect` shows `MOCK-0000` and approves after 1.5 s (`githubApprovalMs`). The fixtures add 16 valid messages and 2 invalid requests. Swift round-trips every GitHub fixture to byte-identical JSON. |

## Test results

| Command | Result |
|---|---|
| `tools/swift-test.sh` | `✔ Test run with 65 tests in 11 suites passed` (ran 3× to check determinism) |
| `swift test` (plain) | `✔ Test run with 65 tests in 11 suites passed` |
| `npm --prefix frontend test` | `pass 10, fail 0` |
| `npm --prefix frontend run typecheck` | 0 errors |
| `npm --prefix frontend run build` | `✓ built` |
| `npm --prefix frontend audit` | `found 0 vulnerabilities` |
| Browser suite with axe (`test:browser`) | `27 integration checks passed`, `errors` 0, `external` 0 |
| `xcodebuild` Debug and Release | Succeeded, 0 warnings, 0 errors |
| Live sign-in, restore, refresh (above) | Pass |

**New Swift tests** (`GitHubTests.swift`) run against a scripted fake GitHub and fake clock, with no network or real Keychain:
- **Device flow:** pending, then slow_down, then success; denied; expired; disabled; wrong client ID; the deadline passing while still pending; disconnect during authorization; not configured.
- **Credentials:** no `client_secret` is ever sent; no token reaches the page.
- **Restore:** valid; refreshed; refresh rejected (`revoked`); refresh token expired (`expired`, no request); offline (session kept, then recovered); calls during the restore wait for it.
- **Refresh:** a single refresh under concurrency; a 401 refreshes once, then ends the session.
- **Data:** pagination across Link pages with dedupe and sort; cursors; no installations; write permissions flagged; detail, languages, license, branches (default, protected, paging) and commits (branch, author login); empty repository; 404 and 403 leave the state unchanged; invalid names never reach the network.
- **Rate limit and cache:** rate limit with fail-fast and recovery; secondary limit; ETag 304; Link parsing; a non-API host is refused.
- **Classifier:** signals; ties; assigned projects skipped.

`ServiceTests` covers the bridge connection lifecycle and events, zone suggestions, and client ID configuration. `ContractTests` covers fixture round-trips and invalid-request codes.

## Files

**Created:**
- `macos/Sources/AuraCore/Services/GitHub/`: `GitHubHTTP.swift`, `GitHubDeviceFlow.swift`, `GitHubAPIClient.swift`, `LiveGitHubService.swift`, `ProjectZoneClassifier.swift`
- `macos/Sources/AuraApp/GitHubProbe.swift`
- `macos/Tests/AuraCoreTests/GitHubTests.swift`
- `docs/PHASE3B_GITHUB.md`

**Modified:**
- `shared/contracts/{domain,methods,events}.ts`, `shared/bridge/mock.ts`, `shared/fixtures/bridge-messages.json`, `shared/test/bridge.test.ts`
- `macos/Sources/AuraCore/`: `AppServices.swift`, `Bridge/{BridgeDomain,BridgeMethod}.swift`, `Config/AppConfiguration.swift`, `Security/SecretStore.swift`, `Services/Services.swift`, `Services/GitHub/GitHubConnection.swift` (rewritten), `Lifecycle/WindowStateStore.swift`
- `macos/Sources/AuraApp/AppModel.swift`, `macos/App/Info.plist` (`AURAGitHubClientID`)
- `macos/Tests/AuraCoreTests/{ContractTests,ServiceTests,FoundationTests}.swift`
- `ARCHITECTURE.md`, `TASKS.md`, `README.md`, `CLAUDE.md`, `.env.example`

No new dependencies. No frontend (Codex-owned) files were changed.

## Remaining issues and limitations

1. **The frontend has no GitHub connect UI yet.** In `AURA.app` the Inspector now shows the owner's real repositories (the native app no longer serves mock data). When disconnected it shows the generic "Workstation data is unavailable". Handoff below.
2. **Keychain prompt after every rebuild.** With ad-hoc signing the app's identity changes on every build, so macOS may ask to allow Keychain access to the stored session after a rebuild. The 11 s gap before the restore in the relaunch log is consistent with that. Developer ID or Apple Development signing (Phase 5) removes it. It does not affect a single installed build.
3. **Disconnect is local.** Server-side revocation is the owner's click at github.com/settings/apps/authorizations (no client secret by design).
4. **Not exercised live:** revocation, natural expiry, an exhausted rate limit (see Live verification). The owner can check revocation: revoke at the URL above, relaunch AURA, and expect `expired(revoked)`; then reconnect.
5. **The repository list is fetched up front:** at most 50 upstream pages × 100 per installation, then held for 120 s. That is fine for a personal account; a very large organization installation would need incremental paging.
6. **Cache and suggestions.** The ETag cache is memory-only and capped at 256 responses. Suggestions are heuristic, so ambiguous repositories get none.
7. **Carried over from 3A:** the `14dec86` Studio.tsx review (Codex); VoiceOver, Reduce Motion and Reduce Transparency checks, and R12 (owner).

## Codex: GitHub frontend

All of it goes through `bridge.call`/`useBridgeEvent`; branch on `error.code`, never on messages. Contract: `shared/contracts/{domain,methods,events}.ts`. The mock supports every state for `npm run dev`: `github.connect` → `MOCK-0000` → connected after 1.5 s; `github.disconnect`; `transport.failNext(...)` for errors.

1. **Connection state, once.** A `useGitHubStatus()` hook in your code: call `github.getAuthStatus` on mount (it waits for the launch restore), then follow `github.authChanged`. Every GitHub view keys off it.
2. **Connect flow (GitHub Project Explorer zone, and wherever "Connect GitHub" appears).**
   - `disconnected` or `expired`: a Connect button. For `expired`, say "Reconnect as {login}"; if `reason` is `revoked`, say access was revoked.
   - `authorizing`: show `userCode` large and monospaced, with a copy button (`navigator.clipboard`). Add a link to `verificationUri`; plain `<a href>` links open in the default browser in the app. Count down to `expiresAt` and offer Cancel (`github.disconnect`). Announce the code with `aria-live`.
   - `connected`: account login and name; for each installation, "Read-only" when `readOnly`, plus "All repositories" or "Selected repositories". Link "Change repository access" to `manageUrl`. Offer Disconnect, and after it a note: "To revoke completely, visit github.com/settings/apps/authorizations".
   - `rate_limited`: keep showing what is loaded, plus "GitHub limit reached; resumes at {resetAt}".
   - `error`: show `message` (developer text, so keep it secondary) with Retry. Use `github.refresh` when `reason` is `network`, otherwise `github.connect`. When `retryable` is false (`configuration`), show "GitHub sign-in is misconfigured" instead of Retry.
3. **Repository lists.**
   - Page with `nextCursor`: "Load more", or infinite scroll. `perPage` is at most 100.
   - A Refresh control calls `github.refresh`, then reloads.
   - Empty with zero installations: "Install AURA Developer Companion on GitHub" and link the owner to their GitHub settings.
   - Empty with installations: "No repositories are shared with AURA. Change repository access" (link `manageUrl`).
   - Show `isPrivate`, `isArchived`, `isFork` and `topics`.
4. **Repository detail.**
   - `github.getRepository`: a language bar from `languages` (bytes), license, forks, open issues, created and updated dates.
   - `github.listBranches`: default and protected badges, paged by `nextCursor`.
   - `github.listCommits`: pass `branch` when one is selected; show `authorLogin` when present.
   - Render commit messages and descriptions as plain text, never HTML.
5. **Zones (Hardware Lab, Software Studio, AI / LLM Lab, Main 3D Studio, GitHub Project Explorer).**
   - Keep `projects.update` and manual assignment as they are.
   - Add "Suggested" chips from `projects.suggestZones`, showing `reasons` and `confidence`, with Accept (`projects.update {id, zone}`) and Dismiss (local only).
   - Never auto-accept.
   - The Main 3D Studio can surface pinned projects across zones. The GitHub Project Explorer shows all repositories with their zone.
6. **Errors by code.**
   - `not_authenticated`: show the connect state.
   - `rate_limited`: show the banner; data calls fail fast until `resetAt`.
   - `not_found` and `permission_denied`: "AURA can't access this repository" (link `manageUrl`).
   - `network`: Retry.
   - `invalid_request`: a bug, so log it.
7. **Tests.** Extend the browser suite: connect, then authorizing (code visible, link, countdown), then connected; disconnect; each error state through `failNext`; paging; a suggestion accepted. Mock data is labelled; never show real data in tests.
8. **Still open from 3A:** review `14dec86` (Studio.tsx background rate).

## Phase 3C readiness (voice)

- **Ready:**
  - `VoiceSession` (barge-in, interruptions, generation counters) with tests.
  - `SystemVoicePermissions`.
  - Info.plist microphone and speech usage strings.
  - The `device.audio-input` entitlement.
  - The `voice.*` bridge contract, mocked in the browser.
- **To build:**
  - `SFSpeechRecognizer` (on-device where available) behind `SpeechInput`.
  - `AVSpeechSynthesizer` with output metering behind `SpeechOutput`.
  - Wiring `VoiceSession` to the bridge in place of `UnavailableVoiceService`, with interruptions on app inactive or hidden (from `WindowStateObserver`) and on audio route changes.
- **Owner decisions:**
  - On-device only, or allow server-side recognition when on-device is unavailable.
  - Default voice.
  - Push-to-talk (⌃⌥Space) versus continuous listening.
- **Model:** no model switch was made in Phase 3B (Claude Opus 5.5, high effort throughout). Phase 3C involves concurrency and audio session work, so Opus is advisable there too.
