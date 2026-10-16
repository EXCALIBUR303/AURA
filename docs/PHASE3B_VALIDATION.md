# Phase 3B validation: GitHub integration on the Mac M5

On 2026-10-17 the integrated Phase 3B (Codex's frontend plus Claude Code's native layer) was validated in the sandboxed Release `AURA.app` on the owner's Mac. The app ran against live GitHub, and the owner approved the device codes.

The validation found two native defects and fixed both in this branch. With those fixes, the recommendation is to merge after review (see the end).

## Branch and commits

| | |
|---|---|
| Codex branch validated | `codex/phase3b-github-explorer` @ `0c48338ccab75bcf6c4e9e8283a3cdbdf7bf43d2` (verified by fetch). It contains the native base `5a8cb56`. |
| Validation branch | `review/phase3b-validation`, a worktree at `~/Developer/AURA-phase3b` |
| Fixes added | `c08f9b8` revoked session (native), `60157c4` ⌃⌥Space in text fields (native), plus this report |
| `main` | Unchanged at `79b8181`. Nothing pushed or merged. |

Codex's commit changes only `frontend/**`; `macos/**`, `shared/**` and `frontend/src/platform/**` are identical to `5a8cb56`. The other worktrees and the main checkout were left untouched; the original GLB (SHA-256 `e9984ddc…76c1`) was copied into the worktree.

## Environment

- MacBook (M5), Built-in Retina Display, 1710×1112 pt at 2× (window visible area up to 1710×988).
- Xcode Release build, ad-hoc signed, App Sandbox, served from `aura://app`.
- GitHub App "AURA Developer Companion", installation `172188091`, repository selection *selected*.

## Live GitHub integration (real `AURA.app`)

| Check | Result |
|---|---|
| Effective permissions | `contents=read, metadata=read`, `readOnly=true`, from GitHub's own installation record |
| Device flow | `github.connect` showed the code. **Copy code** put exactly the displayed code on the clipboard, and the UI said "Code copied." **Open GitHub authorization** opened `github.com/login/device` in Safari (external-link policy). The 15-minute countdown was shown. The owner approved and AURA connected in about 22 s. |
| Cancel authorization | Returns to `disconnected` (logged `disconnected from GitHub`) |
| Keychain and restore | The `github.credentials` item is present while connected. After ⌘Q and relaunch, AURA was `connected` with no new code. |
| Repositories | 9 of 9: 6 private, 3 public. For public repositories, names, privacy, languages, push dates and descriptions were cross-checked against `api.github.com` and matched. |
| Repository detail (`aeris`) | Created 25 Sep 2026, Python 99.9% / Makefile 0.1% (1,192,984 / 978 bytes), 1 branch (`main`, default), 0 issues, 0 stars and 0 forks, no license, and the 3 latest commits (`b55ca2f`, `be2c4db`, `a1514c1`). All identical to the GitHub API. |
| Search | "robot" gave 1 result (parkscan-swarm, matched by description); "drone" gave 1 (aeris); clearing gave 9 of 9 |
| Language filter | Python showed 6 of 9 |
| Sorting | Name: alphabetical. Recent push: newest first. Last updated: fetched real `updatedAt` values; `rul-predictive-maintenance` (04:23:37Z) is correctly placed before `aeris` (04:23:03Z), matching GitHub. |
| Pagination | Native: 5 per page across 2 pages and branches at 1 per page (Phase 3B probe). UI "Load more" was **not reachable live**, because the account has 9 repositories and the page size is 30; it is covered by Codex's suite. |
| Disconnect | The dialog opens with focus on **Keep connected**, Escape cancels it, and **Disconnect** deletes the Keychain item. Local project records are kept, and the UI links to GitHub app authorizations. |
| Revoked token | The owner revoked AURA on github.com. **Found a defect** (fixed in `c08f9b8`, details below). After the fix: "GitHub access was revoked · Reconnect as EXCALIBUR303", with the Keychain item deleted. Reconnect, then approval, then connected. |
| Rate limit | **Not exhausted live** (5,000 requests per hour). Covered by native tests (fail-fast and recovery) and Codex's UI suite. |
| Credentials in logs and screenshots | None. Logs contain no tokens or device codes, and repository names are `<private>`. The screenshot of the authorizing state is not included in the artifacts. |

## 3D workspace integration (real key and mouse events)

The input was posted at the HID level only while AURA was frontmost and only inside its window. The guard refused once, when the owner switched to another app.

| Check | Result |
|---|---|
| Accepting a suggestion | aeris "Hardware Lab · medium confidence · keyword: drone": Accept wrote `aeris → hardware` to SQLite and moved the studio to Hardware Lab |
| Manual assignment | private-local-ai set to AI / LLM Lab, with a note and a pin, then Save. SQLite: `ai-lab \| pinned=1 \| note`. "Saved to the project store." |
| Assigning from a workstation | In Software Studio, "Assign to Software Studio" on AURA, then Save: `AURA → software` |
| Selection follows the workstation | ⌘4 selected private-local-ai, ⌘2 aeris, ⌘3 AURA ("This workstation 1" in each). Main Studio's **Pinned** filter showed private-local-ai. |
| Persistence | After relaunch, the cards showed Software Studio, Hardware Lab and AI / LLM Lab. No GitHub write requests: AURA's client only issues `GET`. |
| GitHub Project Explorer | Real cards: privacy badges, descriptions, languages, push dates, assigned workspace and GitHub links |

The test assignments were removed afterwards: the owner's `aura.sqlite` was restored from a backup taken before validation (it had 0 project rows). The GitHub session was left connected.

## Native and visual

| Check | Result |
|---|---|
| Window sizes | 1100×700 (minimum; content fits, the explorer shows about one row of cards and scrolls), 1440×900, 1710×988 (3-column grid). Screenshots below. |
| Shortcuts | ⌘1–⌘6 navigate, including from text fields. ⌘K focuses "Message Astra". ⌘Q quits. ⌃⌥Space goes to Companion and focuses the prompt from the studio, and **now also from text fields** (`60157c4`). |
| Tab order | Search → language → sort → Refresh → each card → its GitHub link. A visible focus ring is shown. |
| Text editing | Typing with spaces works. ⌃A still moves the caret in a field (the fix does not steal text bindings). |
| Astra and scene | Idle clip `Idle02_F` playing; height normalised to 1.75 m. Camera transitions settle in every zone (probe). Rendering continues behind the explorer. |
| States seen live | Loading, connected, authorizing, disconnected, disconnect dialog, revoked/expired, error (before the fix) |
| States not reached live | Empty, rate-limited, network error and code expiry. These are covered by Codex's mock-native UI suite (23 checks). |

## Performance (measured on this Mac; Release build)

**Active, `AURA_DEV_PROBE` zone pass at 1710×988, DPR 2:**

| Zone | fps | p99 ms | max ms | Draw calls | Triangles |
|---|---|---|---|---|---|
| studio | 60 | 19 | 21 | 14 | 79,802 |
| hardware | 60 | 18 | 19 | 14 | 79,802 |
| software | 60 | 18 | 19 | 14 | 79,802 |
| ai-lab | 60 | 18 | 19 | 14 | 79,802 |
| github (explorer open) | 60 | 18 | 25 | 14 | 79,802 |
| companion | 60 | 18 | 18 | 14 | 79,802 |

The active target of ≥55 fps is met in every zone.

**Window states.** Mean CPU over 5 s; the diagnostics read-out was captured through accessibility.

| State | Render rate | AURA | WebContent | GPU process |
|---|---|---|---|---|
| Active (Projects explorer) | 60 fps | 4.9% | 20.5% | 24.7% |
| Visible, inactive | 28 fps (30 fps policy) | 4.5% | 18.9% | 3.9% |
| Minimized | none | 0.0% | 0.1% | 0.0% |
| Restored | 60 fps | | | |

**Load time.** Model ready in 414 / 379 / 407 ms over three launches (baseline 423–1,093 ms). One earlier launch reported 19,403 ms. That launch came right after a rebuild and a Keychain prompt, and the long load did not recur; it is recorded as unexplained.

**Memory: 10-minute soak.** `AURA_DEV_SOAK_MINUTES=10`, 26 cycles of zones and window states, `footprint` sampled each minute:

| Process | Start | Range | End | After `org.WebKit.lowMemory` |
|---|---|---|---|---|
| WebContent total | 478 MB | 471–781 MB | 543 MB | **445 MB** |
| WebKit Malloc | 76 MB | rising steadily | 151 MB | **47 MB** |
| Graphics (WebContent) | 347 MB | 329–574 MB | 329 MB | 345 MB |
| GPU process | 121 MB | 83–128 MB | 108 MB | 119 MB |
| AURA | 34 MB | flat | 34 MB | 33 MB |

DOM nodes (338), draw calls (14) and triangles stayed constant at 60 fps.

As in Phase 3A, heap growth is reclaimable under memory pressure, so this is caching, not a leak. Graphics peaks were higher than Phase 3A's (574 vs 374 MB) but transient. The soak's chat counter read 0, because its selector no longer matches the new DOM, so chat traffic during the soak is not confirmed. The soak did not drive explorer interactions beyond opening the zone.

## Regression tests (worktree)

| Command | Result |
|---|---|
| `tools/swift-test.sh` / `swift test` | 65/65 at `0c48338`; **66/66** with the fixes |
| `xcodebuild` Debug / Release | 0 warnings, 0 errors (rebuilt after each fix) |
| `npm run typecheck` | Pass |
| `npm test` (bridge) | 10/10 |
| `npm run build` | Pass |
| `npm audit` | 0 vulnerabilities |
| `npm run inspect:avatar` | 72 joints, `Idle02_F` 31.8 s |
| `test:browser` (studio, with axe) | 27/27, errors 0, external requests 0, WCAG A/AA violations 0 |
| `test:github` (Codex, with axe) | 23/23, errors 0, external requests 0; six GitHub scans with 0 violations |

## Defects found and fixed here (native, Claude Code)

1. **Revoked access stranded the user** (`c08f9b8`). Revoking the app on github.com makes the token refresh fail with `incorrect_client_credentials`, not `bad_refresh_token`. AURA treated that as a configuration error: the UI showed "GitHub sign-in is misconfigured" with no action, and the revoked credentials stayed in the Keychain. Any OAuth refusal of a refresh now ends the session as `expired(revoked)`. Verified live, and a test was added.
2. **⌃⌥Space ignored while typing** (`60157c4`). This predates Phase 3B: the shortcut has existed since 3A. With the Astra prompt or the search field focused, the text system consumed Control combinations before the menu saw them. AuraWebView now gives the main menu the first chance at Control, non-Command key-downs. Verified 3/3 from the prompt and 1/1 from search; ⌘ shortcuts and text bindings are unchanged.

## Known bugs and limitations (not fixed)

**Frontend (Codex):**

1. The 3D canvas fallback "WebGL2 is unavailable…" is exposed to VoiceOver even though WebGL works (`Studio.tsx`, since Phase 2). Hide it from assistive technology unless WebGL actually fails.
2. The inspector renders full multi-paragraph commit messages, so the Local project editor sits far below. Show the first line, with an expander.
3. The `error(configuration)` state offers no Disconnect action. After fix 1 this state no longer comes from revocation, but a Disconnect button would still let the owner clear stored credentials.
4. At 1100×700 the explorer shows about one row of cards. It is usable by scrolling but tight.

**Native and environment:**

5. Ad-hoc signing means a Keychain prompt after every rebuild (seen as SecurityAgent). Proper signing is Phase 5.
6. Disconnect is local. Full revocation happens on github.com, by design (no client secret).

**Not verified live:**

7. An exhausted rate limit, natural 8-hour expiry, code expiry, multiple installations, UI "Load more" (fewer than 30 repositories), and the network-error and empty states.
8. Manual owner checks: VoiceOver, Reduce Motion and Reduce Transparency, and R12 (full screen then ⌘4).

## Screenshots

Stored in `~/Developer/AURA-phase3b-artifacts/` (outside git, because they show private repository names):

- **Explorer:** `02-projects.png` (explorer, 1100 wide), `12-projects-1100x700.png`, `13-projects-1440x900.png`, `14-projects-1710x1074.png`
- **Workstations:** `03-hardware-after-accept.png` (suggestion accepted, Hardware Lab), `05-studio-pinned.png`
- **Connection states:** `06-disconnect-dialog.png`, `07-disconnected.png`, `10-revoked.png`, `11-reconnected.png`
- **Keyboard:** `16-after-ctrl-opt-space.png` (prompt focus ring)

## Recommendation

**Ready to merge after your review**, as `review/phase3b-validation`: Codex's `0c48338`, plus the two native fixes and this report. It contains Phase 3A and the native Phase 3B, and `main` (`79b8181`) is its ancestor, so a fast-forward is possible.

Frontend items 1–4 are non-blocking follow-ups for Codex. The manual accessibility checks (item 8) remain with the owner.

Phase 3C was not started.
