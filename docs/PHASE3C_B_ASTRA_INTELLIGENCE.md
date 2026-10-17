# Phase 3C-B: Astra intelligence (conversations, project context, read-only tools)

Branch `claude/phase3c-b-astra-intelligence`, from `main` at `d4c3f6b`. Claude Code (native, contracts, platform). No frontend redesign; Codex builds the UI in Phase 3C-C.

## 1. Summary

Astra can now hold real conversations through the native service. A conversation is owned by the host. The model can ask for read-only GitHub tools, and AURA validates every request, checks it against the privacy settings and, where needed, the user's approval, then runs it with strict limits. Replies stream with one ordered event sequence, can be cancelled at any point, and keep a bounded in-memory history.

What is verified, and how:

| Capability | Verified with |
|---|---|
| Conversation engine, states, streaming, cancel, history | Scripted provider, 39 new Swift tests |
| Tools, privacy gate, approvals, prompt-injection fencing | Scripted provider plus mock GitHub, with attack fixtures |
| OpenAI-compatible tool calling (request and streamed `tool_calls`) | Fake HTTP transport tests, **and live against local Ollama `llama3.2:3b`** (free, on this Mac) |
| Hosted (paid) inference | **Not tested.** It needs a key and your approval for any cost |

## 2. Architecture

```
page ── ai.startConversation / ai.sendMessage / ai.respondToApproval / ai.cancel ──▶ AIService (MainActor)
                                                                                      │ conversationTable (≤16, memory only)
 ◀── ai.turnState · ai.chunk · ai.toolActivity · ai.approvalRequested · ai.done|error ─┤ one seq per reply
                                                                                      ▼
                     AIContextBuilder (attached context) ──▶ AIPromptComposer (rules + fenced data)
                                                                                      ▼
                     AIProvider.stream(AIRequest{messages, tools, toolChoice}) ── OpenAICompatibleProvider / Mock
                                                                                      │ .toolCalls
                     AIToolPolicy (allowlist, arguments) ─▶ AIToolExecutor.prepare (scope, access, AIPrivacyGate)
                        └─▶ approval (only via ai.respondToApproval) ─▶ execute (timeout, budgets) ─▶ GitHubService (GET only)
```

- **Files.** New:
  - `Services/AI/AIConversation.swift`: the engine.
  - `Services/AI/AIToolExecutor.swift`: the executor and `AIPrivacyGate`.
  - `Services/GitHub/GitHubRepositoryContent.swift`: tree, file, README and commit reads.
  - `Bridge/BridgeDomainConversation.swift`: the Swift copies of the new contract types.
  - `shared/bridge/conversation.ts`: the reply-event folding helper.

  Changed: `AIService` (shared stream machinery, now multi-round), `AIProvider` (`AIMessage`, tools, `.toolCalls`), `OpenAICompatibleProvider` (tool calling), `AITools` (the allowlist for this phase), `AIContext` (README, files, boundary fences), `Services.swift` (GitHubService content methods, mock content), `AppServices` (wiring).
- **`ai.chat` is unchanged.** It stays stateless for Codex's existing companion and never offers tools.

## 3. Conversation engine

- **Binding.** `ai.startConversation` fixes the provider, by a fingerprint of its id, kind and endpoint. It also fixes the model, and at most one repository, which must be one the installation can access.
  - Changing the repository is an explicit `ai.setConversationRepository`. That drops cached trees, attached context and source approvals.
  - If the provider is removed or its endpoint changes, the conversation is finished (`provider_changed`).
- **One reply at a time** per conversation; at most 3 streams in total. A second send is refused (`invalid_request`), so a reply is never duplicated.
- **State machine** (`AITurnState.canMove`): idle → preparing_context → requesting → streaming ⇄ waiting_for_tool ⇄ waiting_for_approval → completed | cancelled | error.
  - Any other move is refused and logged as a fault.
  - States arrive as `ai.turnState` and share the reply's `seq` with chunks, tool activity, approvals and the single terminal event.
- **Rounds.** model → tools → model, at most 4 tool rounds and 8 calls per reply.
  - The last round asks for text (`tool_choice: "none"`).
  - A model that still calls tools ends with `finishReason: "length"` instead of looping.
  - Identical calls within one reply are answered from the first result.
- **Retries** follow the 3C-A rule: only before any text of that response. A provider that rejects tool definitions is retried once without them, and the page is told (`tools_unavailable`).
- **Cancel.**
  - `ai.cancel` sends exactly one `ai.done(cancelled)`, declines any pending approval and cancels in-flight GitHub requests. Later events are dropped.
  - A page reload or crash ends replies without sending events.
  - The history keeps exactly the text the user saw, marked `[reply interrupted]`.

## 4. Project context

- `AIContextRequest` gains `include.readme` and `files` (at most 5, optional 1-based line ranges).
- In a conversation the request must not name a repository: the conversation's own is used.
- Files and the README are sent with line numbers (`N| text`) inside a **per-conversation random boundary fence**, without changing any characters, because code needs `<` and `>`. The boundary is removed from content first, so a file can never close its own fence. Metadata keeps the 3C-A `<untrusted-data>` fence.
- **Budgets:**
  - 6,000 characters for metadata, plus 14,000 for source: README 3,000, the rest split across files.
  - Tool results: 16,000 characters or 600 lines per file, and 48,000 characters per reply.
  - Files over 1 MB and binary files are refused.
- Sources (repository, path, ref, lines) are recorded per reply (`AIConversationTurn.sources`) and per tool call, so the UI can cite them.
- `ai.previewContext` with `conversationId` shows exactly what would be sent, including `consent_required` omissions. Nothing is fetched for private source until it is approved.

## 5. Read-only tools

| Tool | Reads | Scope |
|---|---|---|
| `get_active_workspace` | Zone, selected repository, provider, GitHub state, privacy policy | AURA only |
| `list_repositories` | Accessible repositories (filtered by query; private ones hidden unless policy allows) | Any accessible |
| `get_repository_metadata` | Description, visibility, languages, topics, default branch, licence | Any accessible |
| `list_recent_commits` | ≤20 commits: SHA, date, author, subject | Any accessible |
| `get_commit_details` | Changed files with counts; diff only with `includePatch` (treated as source) | Conversation repository |
| `list_repository_files` | Paths at one pinned commit; large trees are summarised by directory | Conversation repository |
| `search_repository_paths` | ≤50 file paths containing the query (names, not contents) | Conversation repository |
| `read_repository_file` | One text file or line range, read at the listed commit | Conversation repository |
| `navigate_to_zone` | Nothing; asks the user, then sends `app.command navigate` | Needs approval |

- **Content search** (`search_repository_content`) is not built. GitHub's code-search API is limited to 10 requests per minute, indexes only the default branch, and was not verified with the App's user token. Path search covers finding files.
- **Rules.**
  - The allowlist and argument validation come first. Small models' habits are accepted where it's safe: an empty string or 0 for an optional 1-based number means "not given", and digit-only strings count as integers.
  - Then the repository must be one the installation can access, and file tools work only on the conversation's repository.
  - Then the privacy gate, then any approval, then the run, with a 20 s timeout and the size limits above.
- **Never possible.** Shell, file system, GitHub writes, branch, commit or PR creation, URL fetches. No code path exists for any of them.
- **Results the model can't use.** Every denial or failure tells the model that no data was returned and that it must not guess. That rule was added after the live test, where a small model made up a README following a denial.
- **Audit.** Each call logs tool name, outcome, conversation, reply and size, with no paths or content (`com.aura.app`, category `ai`). The per-reply `tools` list is the trail the user sees.

## 6. Privacy and approvals

| Data | Public repository | Private, local provider | Private, cloud provider |
|---|---|---|---|
| Metadata (description, commits, paths) | Shared if context sharing is on | `local_only` or `all` | `all` |
| Source (files, README, diffs) | Shared | `local_only` or `all` | `all` **and** the user's approval |

- **Approvals** arrive as `ai.approvalRequested` with a summary written by AURA, the repository, the paths and the provider.
  - Answers: `allow_once`, `allow_for_conversation` (that repository, this conversation only), or `deny`.
  - Expiry after 300 s, cancellation, or the end of the reply all count as `deny`.
  - Only the page can approve. Nothing a model or repository says counts as approval: the injection test shows an injected "pre-approved" README still produces an approval request, and nothing runs.
- **Context sharing off:** no tools are offered, and the system message says so.
- **Settings tightened later:** a conversation that already holds private content is refused until it is reset.
- **GitHub disconnect, expiry or account change:** cached trees and all approvals are dropped. Conversations holding private content are cancelled and cleared, and their private repository binding is removed (`github_access_changed`).
- **Secrets:**
  - Provider keys stay in the Keychain and are read per request.
  - GitHub tokens never reach tools, prompts, events or logs; the bridge test checks event payloads for key and token patterns.

## 7. Memory and retention

- Conversations are held **in memory only**: at most 16 (the least recently used idle one is evicted, `evicted`), 40 turns each, and about 100,000 characters of earlier turns per request (oldest dropped first).
- The tool exchange is replayed only for the latest completed turn. Older turns keep only the user text and the reply.
- Quitting AURA forgets everything.
- **No durable chat history was added.** Persisting private conversations needs a retention design first: what is stored, where, encryption, user controls to view and delete, and handling of private content.

## 8. Bridge contracts (additive, protocol v1)

**Methods:**
- `ai.startConversation`, `ai.listConversations`, `ai.getConversation`, `ai.sendMessage`, `ai.setConversationRepository`, `ai.resetConversation`, `ai.endConversation`, `ai.respondToApproval`.
- `github.listFiles` returns paths only, never contents.
- `ai.previewContext` gains `conversationId`.

**Events:** `ai.turnState`, `ai.toolActivity`, `ai.approvalRequested`, `ai.conversationChanged`.

**Types:**
- New: `AIConversationInfo`, `AIConversationTurn`, `AITurnState`, `AIToolActivity`, `AIApprovalRequest`, `AIApprovalDecision`, `AIConversationChangeReason`, `AISourceRef`, `AIFileSelection`, `RepositoryTree`.
- Changed:
  - `AIContextRequest` gains `include.readme` and `files`.
  - `AIContextSection` gains `source`.
  - Omissions gain `path`, and the new reasons `consent_required`, `binary` and `too_large`.

**Also added:**
- The Swift copy of these types, the browser mock (simulated tool call, same privacy and approval rules) and 15 fixtures (12 valid, 3 invalid).
- `applyReplyEvent`/`newReply` in `shared/bridge`, and the `useReply(streamId)` hook in `frontend/src/platform/bridge.ts`.

## 9. Results

| Check | Result |
|---|---|
| Swift tests | 166/166 (was 127; +39, mostly the new `AIConversationTests.swift`: conversations, tools, approvals, context, parsing, wire format, bridge) |
| Bridge (TypeScript) tests | 16/16 (+3) |
| TypeScript typecheck, production build | pass, pass |
| Live local tools, Ollama `llama3.2:3b`, final code | 3 runs: 2 called `read_repository_file`, AURA read README.md and the answer matched it (≈3 s); 1 wrote the call as plain text instead of calling the tool (model behaviour; nothing ran). Earlier runs found two compatibility defects, now fixed: `""` and `0` for optional arguments |
| Live local, `qwen2.5-coder:7b` | Ollama returned the call as text, not `tool_calls`: no tool use with that model and template |
| Live local streaming and cancel (3C-A test) | Pass: first chunk after 1.2 s, one `done(cancelled)` |
| Hosted inference | Not run (no approval for cost) |

Xcode Debug and Release builds, the browser regression suites with axe, and the 3D performance check are **Checkpoint G** (recommended on Sonnet 5.5) and were not run in this checkpoint. `swift build` (which also builds the app's sources) passes with no warnings. The Ollama server was started for the live tests and stopped afterwards. Run the live test with:

```bash
AURA_LIVE_LOCAL_AI=llama3.2:3b tools/swift-test.sh --filter LiveLocalAI
```

## 10. Known limitations

- **Hosted providers are untested live.** Only the OpenAI-compatible adapter exists. Tool calling is verified against fake HTTP and local Ollama only.
- **Small local models are unreliable with tools.** They sometimes print the call as text, and after a refusal they may still invent content despite the rules. Larger or hosted models should do better, but this has not been measured.
- **No code-content search** (see §5). Commit diffs are capped at 8,000 characters per reply.
- **Approvals are in-app only** (`ai.respondToApproval` from AURA's own page). No native confirmation sheet has been added. The consent dialog is Codex's (3C-C).
- **Conversations do not survive a quit** (§7). `ai.getConversation` restores the view after a page reload.
- **Prompt-injection fencing is a mitigation, not a guarantee.** The hard guarantees come from the host: the allowlist, scope, privacy gate and approvals don't depend on the model obeying the rules.
- **Voice is still contracts only.**

## 11. Phase 3C-C handoff (Codex)

1. **Conversation panel.**
   - `ai.startConversation` with the selected repository (and branch). Keep `conversationId` for the panel's lifetime.
   - On load, call `ai.listConversations` and `ai.getConversation` to restore.
   - Send with `ai.sendMessage`. Show the reply with `useReply(streamId)`.
   - When `gap` is true, reload with `ai.getConversation`.
2. **States.** Map `AITurnState` to Astra's companion states: preparing_context/requesting = thinking, streaming = speaking, waiting_for_tool = working, waiting_for_approval = needs you. Keep text updates out of the 3D tree; chunks arrive at most about 30 per second.
3. **Tool activity.** List `view.tools` (`summary`, `status`, `message`, `sources`) as plain text. Link sources as `path:start–end`.
4. **Approvals.** On `view.approval`, show a dialog with `summary`, `paths`, `providerName` and whether it's a cloud provider. Offer:
   - Allow once / Allow for this conversation / Deny for `share_private_source`.
   - Allow / Deny for `app_action`.

   Answer with `ai.respondToApproval`. Count down `expiresInSeconds`.
5. **Context picker.** Use `github.listFiles` for paths (it never returns contents). Selected files go in `context.files` with optional line ranges. Preview with `ai.previewContext {context, conversationId}`; show `omitted[].reason`, including `consent_required`.
6. **Repository switch.** Use an explicit control that calls `ai.setConversationRepository`; never switch implicitly. Handle `ai.conversationChanged`:
   - `reset`, `repository_changed`, `tools_unavailable`: refresh.
   - `github_access_changed`: the conversation was cleared; say so.
   - `provider_changed`: offer to start a new conversation.
   - `evicted`, `ended`: drop it.
7. **Errors by code:**
   - `invalid_request` (for example, a reply is already in progress).
   - `permission_denied` (provider changed, or privacy settings no longer allow this conversation): offer a reset.
   - `not_found`, `unavailable`, `rate_limited`, `network`, `timeout`.
   - `finishReason: "length"` means a limit was reached; say so.
8. **Rendering.** Render model text as plain text or sanitised markdown, with no remote images or links that load automatically. The production CSP already blocks remote images; the dev server doesn't have that CSP.

## 12. Phase 3C-D (voice) prerequisites

- **Transcript handling.**
  - Final transcripts (`voice.transcript` `isFinal`) feed `ai.sendMessage` on the same conversation.
  - Partial transcripts are never sent.
  - Barge-in (the user speaks while Astra talks) calls `ai.cancel` and `voice.stopSpeaking`.
- **Speaking.**
  - Speak only completed text, sentence by sentence from `ai.chunk`.
  - Never speak tool results or approval summaries automatically.
  - Approvals always need an on-screen answer, never a spoken "yes".
- **Native parts.** `SFSpeechRecognizer` (on device where available), `AVSpeechSynthesizer` with `voice.speechLevel` metering, the CoreAudio route monitor (contracts from 3C-A), and microphone and speech permission strings in Info.plist.
- **Safeguards.** A voice session must respect the same per-conversation provider binding and privacy rules. Spoken input carries no extra authority.

## 13. Next

Checkpoint G (QA) is recommended on **Claude Sonnet 5.5, Medium effort**:
- Xcode Debug and Release builds.
- `test:browser` and `test:github` with axe.
- The live app check that the GitHub explorer and the 3D studio are unchanged.
- A probe run of a conversation inside AURA.app.

Use Opus 5.5 at High effort again for any security escalation or the voice work.
