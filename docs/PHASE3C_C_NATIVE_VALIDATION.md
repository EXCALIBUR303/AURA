# Phase 3C-C — native Mac validation

Claude Code's native validation of Codex's Astra experience in the real `AURA.app` on the owner's Mac. Codex's frontend handoff is [PHASE3C_C_ASTRA_EXPERIENCE.md](PHASE3C_C_ASTRA_EXPERIENCE.md). This report covers what ran on the Mac. Codex's cloud evidence is not repeated here.

**Status: complete, awaiting the owner's review.** Checkpoint 1 (Opus 5.5 High) did the native integration, security review and fixes. Checkpoint 2 (Sonnet 5.5 Medium) did the final regression, scans, screenshots and this report. Nothing is pushed or merged.

## 1. What was validated

| Item | Value |
|---|---|
| Source | `codex/phase3c-c-astra-experience` at `db5bb301e19815fdebb54ff3036448e70b994e57` (contains 3C-B native base `8519fde`) |
| Review branch | `review/phase3c-c-validation`, worktree `~/Developer/AURA-phase3c` (main checkout untouched) |
| Machine | Apple M5, Metal 4, built-in Retina display 1710×1112 points (2560×1664 framebuffer), macOS 27.2, Xcode 27.1, Node 26.11.1 |
| Avatar | Original GLB, SHA-256 `e9984ddc…eb76c1` in the source tree and in the built `AURA.app`. 72 joints, `Idle02_F`. `CREDITS.txt` unchanged; the full credit is visible in the app footer. |
| Builds | Xcode Debug and Release succeed. `swift build`: 0 warnings. The Release bundle contains the GLB and all three lazy chunks (Markdown, ContextDialog, ProviderSettings). |

Everything in §3–§6 was done in the **packaged Release `AURA.app`** under `aura://app/`, through the real native bridge, Keychain, GitHub service and providers. It was driven by hand with mouse and keyboard, with the window frontmost, plus the native probes in `DevProbe` and `AIProbe`. The unbundled dev executable (`swift run AuraApp` against Vite) was **not** exercised in this checkpoint.

## 2. Automated results (this Mac)

| Check | Result |
|---|---|
| `tools/swift-test.sh` | **167/167** (166 + 1 new) |
| `npm --prefix frontend run typecheck` / `test` / `build` | pass / **16/16** / pass, no chunk warning |
| `test:astra` (axe enabled via `AURA_AXE_MODULE`) | **29/29** (Codex's 28 + 1 new regression check); 7 axe scans, 0 violations |
| `test:browser` (studio, axe) | **28/28**, 0 skipped; axe scans 0 violations |
| `test:github` (axe) | **23/23**; 7 axe scans, 0 violations |

The browser suites run Chromium against the shared mock, not WKWebView. They were rerun after the fixes in §7.

## 3. Native functional checklist (Release app, real bridge)

| Area | Result | Evidence |
|---|---|---|
| Conversation initialisation | Pass | Starts on the configured provider; history restore lists both conversations of the session |
| Streaming through native services | Pass | Mock: progressive Markdown (bold rendered). Ollama `qwen3:8b`: real streamed replies |
| Stop / cancellation | Pass | Stop mid-stream → "Reply stopped", partial text kept, "Reply stopped by the host" note |
| Partial responses and recovery | Pass | Partial text preserved; Send again starts a new native turn |
| Keep / Reset / End | Pass | Keep leaves history; Reset clears it ("Conversation reset by the host"); End removes it from the session list |
| Draft preservation | Pass | Unsent draft survives compact → focus → previous view → compact, and a provider switch |
| Enter / Shift+Enter | Pass | Shift+Enter inserts a newline; Enter sends |
| Project context selection | Pass | Explicit repository/branch binding; real tree loaded through `github.listFiles` (184 entries); exact-text preview |
| Privacy enforcement (preview) | Pass | Policy "Never": preview attaches 0 characters and lists both omissions. "Local providers only": 2,985 characters of real metadata/README |
| Privacy tightening mid-session | Pass | After private tool output, switching back to "Never" makes the host refuse the next send; draft kept |
| GitHub explorer / inspector | Pass | Live account, 9 repositories, details, "Use project in conversation" |
| Native read-only tool execution | Pass after fix | Ollama `qwen3:8b` called `list_repository_files` on the private AURA repository; the listed `docs/` files match `origin/main` exactly. First attempt exposed defect D1 |
| Consent: deny | Pass | Host-issued dialog, Deny has initial focus; Deny → "Denied", zone unchanged, model told no data was returned |
| Consent: allow | Pass | Allow → host navigated to Hardware Lab; card "Completed" |
| Provider settings | Pass | Add local provider (no key), model-list check "8 model identifiers reported. This does not verify inference." |
| Native Keychain key sheet | Pass | Sheet names the destination host and says the web interface never sees the key. Cancel leaves "Key required"; a generated fake test key → "Key stored in Keychain" (page shows state only) |
| Provider errors / retry | Pass | Unreachable `.invalid` host: check "unavailable"; send → typed error with Refresh / Start a new conversation |
| Provider removal | Pass after fix | Confirmed removal deletes the provider and its key; defect D2 left the view stuck before the fix |
| Compact / expanded / focus | Pass | Focus captures the camera; "Previous view" restores the earlier zone exactly |
| Six zones, ⌘1–⌘6 menu shortcuts | Pass | All zones load and settle |
| Title-bar dragging | Pass | Dragging empty app-bar space moved the window (100,40 → 199,89) |
| Full-screen | Pass | Green button and View ▸ Enter Full Screen (Globe+F, the macOS 27 default) |
| Model output links | Pass (code review) | Only credential-free http(s) links render; they open in the default browser, never in the web view |

## 4. Window sizes

The SwiftUI minimum is 1100×700 of content, which the full-size web view reports as a **1100×732** viewport. 1728×1117 is larger than this display (1710×1112 points), so the largest sizes measured are **1710×988** (largest window with menu bar and Dock) and **1710×1112 full screen**.

| Size | Result |
|---|---|
| 1100×732 | Compact dock, expanded conversation and inspector fit. The inspector's lower controls scroll within its column. The expanded transcript is short (about 250 px) because the controls take the remaining height. |
| 1280×800 | Pass after fix D3 (heading legibility) |
| 1440×900 | Pass after fix D3 |
| 1710×988 / 1710×1112 full screen | Pass |

## 5. M5 performance (Release, real Apple GPU, window frontmost)

Six-zone probe (`AURA_DEV_PROBE=1`, 5 s per zone) plus the new conversation pass (`AURA_DEV_PROBE_CONVERSATION=1`). Renderer "Apple GPU", WebGL2, DPR 2 throughout: adaptive DPR never reduced it in these samples.

| Viewport | Sample | fps | p50 / p95 / p99 / max ms | Frames over 20.9 ms | Draw calls / triangles |
|---|---|---|---|---|---|
| 1100×732 | each of the 6 zones | 60 | 17 / 18 / 18 / 18–19 | 0 | 14 / 79,802 |
| 1100×732 | streaming a 5,352-char Markdown + 60-line code reply | 60 | 17 / 18 / 21 / 23 | 5 of 300 | 14 / 79,802 |
| 1100×732 | compact ↔ expanded ↔ focus every 700 ms (7 switches) | 60 | 17 / 17 / 22 / 24 | 3 of 300 | 14 / 79,802 |
| 1710×988 | each of the 6 zones | 60 | 17 / 17–18 / 18 / 18–24 | 0 (1 in AI Lab) | 14 / 79,802 |
| 1710×988 | streaming the same reply | 60 | 17 / 18 / 21 / 29 | 3 of 300 | 14 / 79,802 |
| 1710×988 | layout switching | 60 | 17 / 18 / 25 / 26 | 9 of 300 | 14 / 79,802 |

No long tasks were reported in any sample. Acceptance (≥55 fps, target 60) is met. No regression from the Phase 3C-B baseline (60 fps, 14 draw calls, 79,802 triangles).

**Window policy** (CPU from `top`): frontmost, WebContent ~16% and GPU process ~13.5%. Inactive but visible: GPU process 3.0% (the page reported 28–29 fps, the 30 fps policy). Hidden: AURA, WebContent and GPU process **0.0%** (suspended).

**Memory** (`footprint`; WebKit helpers identified as the processes launched with AURA):

| Moment | AURA | WebContent | GPU | Networking |
|---|---|---|---|---|
| After six zones + conversation pass, 1100×732 | 47 MB | 393 MB | 96 MB | 5 MB |
| After the same at 1710×988 | 37 MB | 466 MB | 116 MB | — |
| After a 3-minute soak (6-zone pass, 8 mock turns, inactive/hidden cycles) | 33 MB | 338 MB | 100 MB | 6 MB |

No growth across the soak. GPU-time counters were not captured: neither WebKit nor these probes expose per-frame GPU time, so only frame intervals and process CPU are reported.

## 6. Security verification

| Requirement | Result |
|---|---|
| Native permission enforcement cannot be bypassed | Consent decisions come only from the page's `ai.respondToApproval`; navigation needed approval even when requested explicitly; privacy policy is enforced in the host (preview omissions, refused send after tightening) |
| GitHub tokens never reach JavaScript | Contracts carry only connection/credential *state*; no token field exists in any bridge type |
| Provider credentials stay in Keychain | Keys enter only the native sheet; the page shows `credential` state; removing a provider deleted its key |
| Private repository content needs authorisation | "Never" blocks private metadata/README/source; local-only allowed it for the local provider only |
| Tools stay read-only | Only the allowlisted read tools and the approval-gated navigation ran; D1's fix still denies `..` traversal (new test) |
| Malicious repository text cannot override policy | Covered by the 3C-B tests (fenced data, approval required regardless of repository text); not re-attacked live |
| No credentials or private data in logs/artifacts | To be re-scanned in the final checkpoint (§9) |

## 7. Defects found and fixed

| # | Severity | Owner area | Defect | Fix |
|---|---|---|---|---|
| D1 | Major (native) | `AITools.swift` (Claude) | Models write directory paths as `docs/`, `./docs` or `/README.md`; `list_repository_files` rejected `docs/` as "not a directory", so the first live tool call failed | The policy strips leading `./` and `/` and trailing `/` from `path`; `/` and `.` mean the root. New test `repositoryPathsLoseSurroundingSlashes` (traversal still denied, required path still required). Verified live with Ollama. |
| D2 | Major (frontend) | `useConversation.ts` (Codex) | After removing the provider of the open conversation, the provider select kept the removed id. "Start a new conversation" then failed with `not_found` and the footer said "Add a provider…" although two existed: no recovery path | On `ai.providersChanged`, a removed selection falls back to the default, else an available, provider. New Astra check fails without the fix and passes with it. |
| D3 | Accessibility (frontend) | `experience.css` (Codex) | Above 1250 px the zone heading had no backing, so the muted caption and the "Drag to orbit" hint sat directly on 3D surfaces (monitor, blinds) with zone-dependent, low contrast | The existing ≤1250 px card treatment (opaque paper, rule border) now applies at every width |
| D4 | Copy (frontend) | `ProviderSettings.tsx` (Codex) | The shipped app said "Live hosted inference has not been verified in this cloud environment" | Replaced with a product statement about what a connection check does and does not confirm |
| D5 | Probe (native) | `DevProbe.swift` (Claude) | The optional soak used `HTMLInputElement` on the textarea and old `.reply` selectors (Codex's request) | Uses the textarea setter, counts `.conversation-turn` / `.assistant-markdown`, logs whether each send happened. **Validated**: 3-minute soak, 8 cycles, every send completed. Added `AURA_DEV_PROBE_CONVERSATION=1` (streaming and layout-switching samples) |

D2–D4 are in Codex-owned files. The changes are minimal and recorded here for Codex's review.

## 8. Not verified (pending)

- **VoiceOver, Reduce Motion, Reduce Transparency at system level.** Turning these on changes system settings, which this session does not do. The accessibility tree WebKit exposes was inspected: zone buttons, header actions, provider/model pop-ups and headings are named. The CSS media handling is covered by the browser suites. Needs the owner to toggle each setting while Claude observes.
- **Hosted inference** (billable; no approval) and therefore private-source consent to a cloud provider.
- **Dev configuration** (`swift run AuraApp` against Vite) in this checkpoint.
- **Small local models remain inconsistent with tools.** `qwen3:8b` once declined to call navigation again after a denial until asked explicitly. This is model behaviour, not a host defect.
- Pending approval restoration after reload (Codex's open `TASKS.md` request; unchanged).

## 9. Final regression and scans (checkpoint 2)

Code did not change after the checks in §2, which already ran on the fixed code, so they were not repeated. Added in this checkpoint:

| Check | Result |
|---|---|
| Xcode Debug build of the final commit | Succeeded |
| Secret patterns (GitHub tokens, `sk-` keys, Bearer, private keys, the fake test key) in the branch diff against `main`, tracked files, 2 hours of `com.aura.app` unified log, all test artifacts | 0 matches |
| Binaries or key files in the diff (`.glb`, images, `.pem`, `.env`) | 0 |
| Keychain items left by the test providers (`ai.cloud-test.apiKey` and others) | none |
| Test processes | Vite and Ollama stopped; `AURA` quit |

Screenshots (1440×900, Release app, outside Git, not committed): Studio, Software and Companion zones, delivered with this report. The conversation, consent, provider and key-sheet states were observed live; the browser suites hold Codex's captures of those.

## 10. Merge recommendation

**Recommend merging `review/phase3c-c-validation` into `main` after the owner's review**, with these conditions:

1. Ask Codex to glance at D2–D4 (three small edits in its files, §7).
2. Accept the unverified items in §8, or do the system accessibility pass (VoiceOver, Reduce Motion, Reduce Transparency) with Claude first. Those settings need the owner at the keyboard.
3. Hosted inference remains unverified. Nothing in this phase makes it worse, but a billable run with an approved provider is the first thing to do before relying on cloud models.

Reasons: no security or architecture defect was found; the two real defects (D1 native, D2 frontend) were found by live use, fixed, covered by tests, and re-verified in the app; performance holds 60 fps on the Apple GPU under streaming and layout changes; memory is steady.

## 11. Commits on the review branch

`db5bb30` (Codex, 3C-C) → `f8da96d` (fixes: D1–D5) → `fd26b6c` (docs, stack table, tasks) → this report. Phase 3C-D (voice) has not started.
