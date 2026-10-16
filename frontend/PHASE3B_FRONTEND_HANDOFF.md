# Phase 3B frontend — GitHub project explorer

Date: 2026-10-17. Local review branch: `codex/phase3b-github-explorer`.
Base: `claude/phase3b-github` at **`5a8cb56b95248af73fcb08e32bd87b65e3da2939`**, verified against GitHub before branching. No push or merge is authorized by this task. No Phase 3C work is included.

## Implementation

- One `useGitHubWorkspace` instance owns the native auth status, paged catalog, local project assignments, suggestions, selection, metadata cache and per-repository drafts. It reads `github.getAuthStatus` after launch restore and follows `github.authChanged`. Older replies cannot override newer events. No frontend timer or local flag fabricates a connected state.
- Device authorization shows the native user code, copy feedback/fallback, a validated external authorization link, a countdown and Cancel. The countdown is not repeatedly announced to assistive technology. Expired/revoked, denied, code-expired, offline, misconfigured and API-error states have appropriate recovery. Disconnect uses a keyboard-accessible confirmation dialog and explains that unsaved drafts are discarded and full revocation is separate.
- Connected views show account identity, installation selection/read-only status and management links. No remote avatar assets are downloaded. Credentials, polling and token refresh remain native. Rate limits retain loaded data, show the native reset time when provided, and pause new GitHub reads.
- The Project Explorer uses real bridge repository records, cards, search (name/description/topics), primary-language filtering, name/recent-push/last-updated sorting, privacy/fork/archive/topic indicators, refresh and explicit pagination. Counts and the Load more hint explain that filtering/sorting covers **loaded pages**.
- Last updated sorting fetches actual `RepositoryDetail.updatedAt` values on demand with three workers and a shared in-memory detail cache; it does not relabel push dates or invent activity scores. Name and recent-push sorting need no extra metadata requests. Suggestions run after the native repository catalog is warm, avoiding concurrent initial catalog traversals.
- The inspector loads metadata, language proportions from source byte counts, license, issue/fork/star counts, dates, branches/default/protected indicators, paged branches and branch-specific recent commits. Partial failures stay local to the relevant detail panel; auth/rate-limit failures update the shared connection experience. Content is plain React text, not HTML.
- Repository selection is shared by cards and the inspector. Selecting a repository with a saved zone visits that workstation; selecting a workstation chooses an available project assigned there. If no assigned project is loaded, the current selection is retained and its other workspace is stated explicitly. Unassigned repositories are not classified automatically. Main Studio includes a pinned-project filter across loaded zones.
- Manual zone assignment, notes and pinning persist only through `projects.update`. Per-project drafts survive repository/workstation changes. Suggestions show native confidence/reasons and require Accept or Dismiss; Accept updates only the zone, preserving other unsaved fields. The editor waits for local project records before allowing edits, and refresh is disabled during a project write.
- The explorer leaves the 3D canvas mounted. An observer fits the sheet above Astra’s actual dock bounds, including reply expansion and window resizing. Collapsed explorer-mode chat hides quick prompts until expanded; the prompt and voice controls remain available. Existing local SVGs, light surfaces, typography, focus rings and reduced-motion rules are retained. Opaque explorer surfaces do not incur an unnecessary backdrop blur.

## Files and ownership

| File | Change |
| --- | --- |
| `src/github/useGitHubWorkspace.ts` | Shared typed connection/catalog/project state and stale-response guards |
| `src/github/model.ts` | Error-code presentation, safe GitHub links, date labels and source-based filtering/sorting |
| `src/github/GitHubConnection.tsx` | Connection lifecycle, authorization and confirmation UI |
| `src/github/RepositoryExplorer.tsx` | Searchable/paged project collection and dock-aware layout |
| `src/github/RepositoryDetails.tsx` | Repository metadata, paged branches and commit history |
| `src/github/github.css` | Desktop layout and visual states |
| `src/components/Inspector.tsx` | Shared selection, local project editor, suggestions and pinned/workstation scope |
| `src/components/CommandDock.tsx` | Exposes existing expansion state as a DOM attribute for layout |
| `src/App.tsx` | Creates the shared model and mounts the explorer in Projects |
| `test/github.browser.mjs`, `package.json` | Native-boundary UI tests and `test:github` command |
| `PHASE3B_FRONTEND_RESULTS.json`, this file | Review evidence and native validation handoff |

**Unchanged from the verified native base:** `macos/**`, `shared/**` (contracts, bridge, mocks, fixtures, tests), `frontend/src/platform/**`, every `frontend/src/studio/**` file, Astra animation/loading code, original assets and credits, design tokens, root documents, and the dependency lockfile. No dependencies were added and no contract change is required.

The Phase 2.5 GPU-string cache and Phase 3A `14dec86` window-state implementation remain intact. The latter was reviewed: it uses `app.getWindowState` and `app.windowStateChanged`, renders at full rate while active, drives demand frames at 30 FPS while only visible, stops hidden rendering, and excludes deliberately throttled frames from adaptive DPR/per-zone sampling. This is a source review, not a new Mac performance measurement.

## Tests and evidence

Linux cloud, Node 24.19.0 / npm 11.9.0, Chromium 154 with SwiftShader. No Swift, sandboxed app or live GitHub validation was performed here. Claude’s live Release-app verification in `../docs/PHASE3B_GITHUB.md` applies to the native base, not to this new frontend.

| Check | Result |
| --- | --- |
| `npm --prefix frontend run typecheck` | Pass, both TypeScript projects |
| `npm --prefix frontend test` | `tests 10`, `pass 10`, `fail 0` |
| `npm --prefix frontend run build` | Pass, Safari 18 production target |
| `npm --prefix frontend run test:browser` | 27 existing studio checks passed |
| `npm --prefix frontend run test:github` | 23 GitHub UI checks passed |
| Production bundle smoke | All six zones, original GLB and three shared mock repositories load; zero errors/external runtime requests |
| Dock resize check | Explorer retains a ≥16 px gap above collapsed and expanded replies at 1100×700 |
| Accessibility | Zero violations in all eight scans: two studio scans plus disconnected, authorizing, connected, rate-limited, disconnect dialog and minimum-window GitHub scans |

GitHub tests use the existing shared mock records and canonical branch fixture through a simulated typed native transport. They intentionally report the native window as hidden to isolate UI/state testing from software GPU speed; they do **not** establish native rendering or live authentication. The existing studio suite separately exercises actual WebGL, the real supplied GLB, rig/idle/look-at/jaw, six cameras, mouse and keyboard navigation, notes/pinning/assignment, loading, missing-asset retry, WebGL loss/recovery, native command simulation and errors.

GitHub coverage includes device authorization/copy/link, connected account and permissions, search/filters/all sorts, explicit suggestions, manual assignment and selection synchronization, loaded-data rate limits, network/access/authentication failures and retries, paged repositories/branches, empty repositories/installations/history, delayed launch-status and commit replies, disconnect during an in-flight load, modal keyboard behavior, focus and layout. Normal audits recorded zero uncaught errors and zero automatic external runtime requests.

Detailed current-run JSON and labelled mock screenshots are outside Git under `/workspace/aura-phase3b/`. `github-final/` contains the GitHub audit and screenshots, `regression-final/` the studio audit. `screenshots/` contains the ordinary mock browser with the actual studio behind the explorer. No screenshots or GLB binaries are committed.

The source and built GLB remain 18,054,896 bytes with SHA-256:

```
e9984ddc7e04a1b39d72f5ab5e1ba9fe459fc42e773f851bf52068b357eb76c1
```

The existing asset symlink, XRProfXR author link, original Sketchfab source and visible **CC BY 4.0** attribution are preserved. No geometry or render-loop changes were made; no new M5 FPS claim is made.

## Native integration and Mac review

Use the exact native base above plus this frontend commit. The feature branch remains local pending approval to push; a source-only `aura-phase3b-frontend.patch` is supplied as a task artifact for transfer if desired. Preserve the owner’s checkout and original GLB when creating a clean Mac review worktree. Apply the patch on the verified base, not on an unrelated main branch. The older Phase 2.6 patch is not part of this handoff.

No bridge API or native implementation changes are needed. The Release Xcode app already contains the public `AURAGitHubClientID`. For an unbundled development executable, configure the existing public `AURA_GITHUB_CLIENT_ID` as documented in `.env.example`; never enter access/refresh tokens in frontend configuration. The page uses `frontend/src/platform/bridge.ts` exclusively for host calls and events. Ordinary external `<a>` links rely on the native external-browser policy; clipboard failures offer manual copying.

On the Mac, from the review worktree:

```bash
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run inspect:avatar
tools/swift-test.sh
tools/build-app.sh
open macos/.build/xcode/Build/Products/Release/AURA.app
```

Keep the original GLB in `assets/avatar/community/astra-lumen/` (gitignored) so the existing frontend public symlink resolves. The Release build embeds frontend assets and supplies GitHub configuration. The native validation report explains `AURA_DEV_GITHUB_PROBE` for an opt-in live diagnostic; do not automate owner authorization or collect tokens in the web page.

**Pending real Mac acceptance:**

1. In the actual signed/sandboxed `AURA.app`, verify disconnected → device authorization in the default browser → connected repositories using owner-approved access. Check copy fallback, Cancel, code expiration/reconnect, Keychain restore across relaunch, Refresh and disconnect confirmation. Disconnect is local; revoke on GitHub separately when testing revocation.
2. Confirm that real repository descriptions, privacy, topics, metadata, language counts, branches and commits match GitHub. Exercise installation access changes and multiple installations where available. Natural expiry and exhausted rate limits were not newly tested live; cloud tests cover typed error behavior.
3. Assign projects to Hardware, Software, AI/LLM and Main Studio; check SQLite persistence, pinned scope, selecting a saved project, changing workstations, preserving drafts, explicit suggestions and notes/pinning. Confirm no GitHub write operations occur.
4. Verify dev-server and production `aura://` loading, external authorization/installation/repository links, clipboard behavior and Safari Web Inspector console/network. Credentials must remain native/Keychain-only.
5. Recheck actual M5 browser/WKWebView ≥55 FPS at DPR 2 with the explorer, scrolling, expanded replies and 3D transitions; verify visible/inactive/hidden behavior and memory over a longer session. Cloud SwiftShader is not target-hardware performance evidence.
6. Review VoiceOver, physical menu shortcuts, full-screen focus (existing R12), Reduce Motion and Reduce Transparency at 1100×700 and a desktop window. Automated axe scans leave manual-review items; zero violations is not full native accessibility acceptance.

## Known limits

- Search, language filters, pinned/workstation lists and sorting include loaded pages. Load more explicitly to include further repositories. Last-updated sorting incurs metadata reads on first use; native and frontend caches reduce repeat work.
- The inspector scrolls for complete repository details, commits and the local project editor. The explorer scrolls independently and shrinks above an expanded Astra reply.
- Drafts are in memory until Save; disconnect/session invalidation clears them. Saved local records remain in SQLite. Browser mock project records are session-only.
- R3F’s upstream `THREE.Clock` warning and native-base ad-hoc-signing Keychain prompts remain outside this frontend change.
- No live GitHub, native macOS, Mac FPS or Phase 3C completion claim is made. Stop for frontend review; do not push or merge without owner approval.
