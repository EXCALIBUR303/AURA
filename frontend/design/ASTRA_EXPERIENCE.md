# AURA — Astra experience design checkpoint

Phase 3C-C, Phases 1–2. Base: `8519fdefac1da9ff9b4987503ac66a228e157136`.
This document specifies the implementation to follow. The isolated prototype at
`frontend/astra-design.html` is a layout and interaction study, not a native AI client.

## 1. Direction: a room for thought

AURA is an architectural studio with a working desk beside it. The room establishes
place; the desk holds the work. Astra occupies the room and participates through the
desk. Both remain legible as activity increases.

Preserve the six destinations, the real room, Astra's original model, the small dark
companion accent, the restrained workstation colours, and the native system fonts.
Evolve the current warm-white identity with porcelain panels, deep evergreen ink,
fine structural rules, and one deliberate teal action colour. Cobalt remains the
keyboard focus colour. Violet describes AI work only when a text label accompanies it.

The existing Stitch prose is the material and density reference. Its static scene,
fabricated metrics, CDN assets, traffic-light buttons, and oversized blur are not
implementation sources. The Phase 0 screenshots are the actual product baseline.

### Inspection → design decision

| Finding in the current application | Decision |
| --- | --- |
| Six zones, real picking, and stable camera destinations already work | Keep their navigation model; improve framing and visible feedback incrementally |
| The large scene heading, status pill, hotspots, inspector, and dock compete | Put the title and context in one horizontal strip; reserve scene overlays for spatial actions |
| The conversation is a 140 px reply well | Introduce a proper conversation pane with its own scroll area and anchored composer |
| Companion view still has the repository inspector | Make the right pane purpose-specific: project details or conversation, with a deliberate switch |
| Projects at 1100×700 show only the tops of cards above the dock | Give Projects the full available height; compact Astra becomes a toolbar action there |
| A long reply can cover Astra | Expanded mode reallocates columns; it does not overlay the character |
| Typography mixes useful native text with display-style headings | Keep one small editorial welcome heading; task views use a restrained native type scale |
| Generic current busy state hides context/tool work | Use host turn states with short, specific labels and persistent recovery actions |
| Current provider choice is implicit and settings are absent | Keep provider/model identity next to the composer, with an explicit settings entry |
| CSS colours and control states vary between areas | Adopt semantic tokens and a shared component state inventory |

## 2. Composition and dimensions

All sizes below are CSS pixels. Design for 1100×700 through 1728×1117; the native
minimum remains 1100×700. Avoid a new mobile layout.

- **Chrome:** 56 px title bar, 80 px reserved for native traffic lights, a quiet AURA
  wordmark, six named destinations, and an AI settings action. Empty title-bar
  regions use the existing native drag marker. Never imitate window controls.
- **Context strip:** 44 px under chrome. Current destination at left; current
  repository/branch and reversible view actions at right. Hide optional helper
  copy before hiding actions. No scrolling marquee or truncated action labels.
- **Footer:** 28 px for attribution and actual connection state. Prototype review
  controls live in a separate review strip and must never ship in the product.
- **Compact:** the scene occupies the working area. A bounded 480 px dock sits in
  its bottom safe area. The optional project inspector is 300–340 px; opening
  conversation replaces it. The dock contains a draft, provider identity, context
  control, and expand action. It does not show a second transcript.
- **Expanded:** scene + 440–500 px conversation pane, with a 1 px separator. At
  1100 px, reserve at least 620 px for the scene and 440 px for conversation.
  The composer belongs to the pane. No floating dock over the room.
- **Focus:** scene takes 32% (minimum 320 px, maximum 480 px), reading pane takes
  the remainder. Text max-width 720 px; code can use the full pane. Move the camera
  to the companion pose and maintain a clear Astra silhouette. No duplicate canvas.
- **Projects:** use a full-height repository work area. At ≥1280 px show a 300 px
  details pane; at 1100 px details become a reversible subview. Search and filters
  remain above the scrolling collection. Opening Astra gives conversation the same
  right-pane slot rather than stacking a third panel.
- **Settings/context:** use a bounded modal or anchored popover over the current
  layout; return to the exact prior layout and focus on close.

| Window | Expanded conversation | Focus reading area | Projects |
| --- | --- | --- | --- |
| 1100×700 | 440 px pane; 620+ px room | 320 px room; remainder for text | Full-height collection; details subview |
| 1280×800 | 460 px pane | 360–410 px room | Collection + optional details |
| 1440×900 | 480 px pane | 440–460 px room | Collection + 300 px details |
| 1728×1117 | 500 px pane | 480 px room; centred reading measure | Collection + 320 px details |

A splitter in the implementation uses pointer capture and an accessible separator
with ArrowLeft/Right (16 px), Home/End (bounds), and a visible reset action. Resizing
never changes conversation identity or remounts Canvas. Clamp widths on window resize.

## 3. Information and state model

Three different selections remain explicit:

1. **Workspace:** the zone the user is looking at.
2. **Project selection:** the repository shown in the explorer/inspector.
3. **Conversation context:** the repository and branch bound by the native host.

Selecting a project never silently changes an active conversation. Offer **Use in
conversation**. On confirmation call `ai.setConversationRepository`, clear the UI's
file selection/preview, and refresh authoritative conversation state. Show the new
binding only after success. While a reply is active, require Stop before switching.
Cancellation is a user action, not an automatic side effect of browsing another repo.

Provider/model are fixed for a conversation. A different choice starts a new one;
retain the old in-memory conversation in the session list. Label history **This
session** and explain that quitting AURA clears it. Do not persist message text.

### Conversation layouts

`compact ⇄ expanded ⇄ focus` changes presentation only. Preserve draft, cursor,
scroll offset, attached context choices, and active stream. Entering focus stores
the previous camera position/target; returning restores it. Reset overview is a
separate explicit action. Navigating a different zone exits companion focus to
expanded mode while retaining the conversation.

The history view subscribes to `useReply(streamId)`, outside the scene tree. The
scene receives a small presentation state only when that state changes. Restore
with `ai.listConversations` + `ai.getConversation`; reconcile gaps and terminal
events with the host. Do not create a parallel conversation engine.

| Native state | Visible label | Scene cue | Available action |
| --- | --- | --- | --- |
| idle/completed | Ready / Reply complete | Existing calm idle | Send, New, context |
| preparing_context | Preparing context | Slight head attention, steady indicator | Stop |
| requesting | Thinking | Small violet status indicator | Stop |
| streaming | Responding | Restrained attentive pose; no invented speech | Stop; scroll freely |
| waiting_for_tool | Reading project context | Teal status + tool row | Stop; inspect tool |
| waiting_for_approval | Your approval is needed | Still pose, amber label | Review, Deny, Stop |
| cancelled | Reply stopped | Return to idle | Continue with a new message |
| error | Could not complete reply | Quiet error label | Code-specific recovery |

**Ready for input is not Listening.** Until native capture exists, show text input
and a truthful Voice unavailable explanation, without a microphone activation
button or waveform. Text streaming does not drive the jaw or imply spoken audio.

### Streaming, errors, and recovery

- Follow the tail only while the reader is within 48 px of the bottom. Scrolling
  upward suspends it; show **Jump to latest** with unseen-content indication.
- Keep code fences stable while incomplete. Do not animate individual tokens or
  announce every chunk. A polite status region announces lifecycle changes;
  transcript text remains navigable without live-region flooding.
- Stop immediately changes the control to **Stopping…**, then reconciles the one
  native terminal event. A failed cancellation must say it is unconfirmed and
  retain a retry action. Ignore prior conversation/stream events.
- On `length`, keep the partial reply and explain the limit. On `rate_limited`,
  show the host's available recovery information; do not invent retry countdowns.
- Retry is an explicit new send and can duplicate a user turn; no native replace-
  turn endpoint exists. Label **Send again**, retain the original outcome, and
  never auto-retry paid inference from UI effects.
- `provider_changed` offers a new conversation; `github_access_changed` removes
  private cached UI data and explains the cleared conversation. `evicted`/`ended`
  remove it from the session list. Privacy tightening offers Reset.

## 4. Context, tools, and consent

Context popover shows the authoritative repository + branch, section checkboxes
(workspace, repository, commits, notes, README), and explicit file paths, limited
to five with optional 1-based line ranges. Load paths with `github.listFiles`.
**Preview context** calls `ai.previewContext`; display exact text as plain text
and omissions with human-readable explanations. Preview sends no inference request.

**No project context** clears the conversation repository and source choices.
It does not promise to disable every tool. Global context sharing and tool
availability remain host-controlled and must be separately described.

Tool cards are compact disclosure rows, not large decorative activity dashboards.
Collapsed: icon, host-written summary, status. Expanded: message and source refs.
Display `running`, `succeeded`, `failed`, `denied`, `awaiting_approval`, `cancelled`
exactly from native events. An initial turn preparation indicator is not a fake
pending tool. Use native sources for links; never invent a URL from model output.

Consent is an accessible modal with: host summary, provider and local/cloud kind,
repository, paths, scope, and remaining lifetime. Private-source choices are
**Deny**, **Allow once**, **Allow for this conversation**. App navigation requests
offer **Deny** and **Allow** only. Focus starts on Deny. Escape means Deny (and sends
that decision); no backdrop click-to-approve. Disable duplicate submissions. A
successful bridge response permits **Decision received**; tool execution success
still depends on subsequent native activity. Timeout/Stop dismisses safely.

**Restore limitation:** `ai.getConversation` contains no pending approval payload or
event sequence watermark. A reload during consent cannot safely reconstruct that
request. Until Claude adds a snapshot field, show **Approval could not be restored**
and offer Stop and send again. Never guess an approval id or re-use an expired one.
The Phase 3 implementation must test subscribe/start races and active-stream gaps.

## 5. Provider settings

Use one settings dialog with provider list, non-secret endpoint/model form, and
derived credential/check state. The only configurable adapter today is
OpenAI-compatible; the built-in mock is labelled Offline mock and read-only.
Local runtimes are loopback endpoints; hosted compatible endpoints are HTTPS.

Distinguish **Configured**, **Key required**, **Not checked**, **Check passed**,
and **Check failed**. Availability is not proof of successful inference. **Check
connection** invokes `ai.validateProvider` (model list only). **Add/replace API key**
invokes `ai.requestCredential`; wait for `ai.providersChanged`, since the method
returns before the native sheet completes. Never put a key field in HTML.
Removing a provider or key requires a clearly scoped confirmation. Endpoint
changes can invalidate credentials and conversations; explain before saving.

## 6. Reusable component specification

Semantic tokens are additive in `designs/design-system/tokens.css`. The current
production app keeps its existing tokens until the implementation checkpoint.

| Component | Interaction states and keyboard behaviour |
| --- | --- |
| Button / icon button | Default, hover, pressed, focus-visible, disabled, pending; 32 px minimum target; icon buttons have names and tooltips; pending retains label width |
| Input / search / textarea | Label, help, filled, focus, invalid, read-only, disabled; Escape clears only an explicit search; composer Enter sends, Shift+Enter newline, IME-safe |
| Select / dropdown | Native select for finite values; custom list only if needed, with arrows/Home/End/typeahead/Escape and focus return |
| Tooltip | Hover + focus, 400 ms delay, Escape closes, no required information solely inside it |
| Popover | Labelled, bounded to window, first usable control focused, Escape/close restores opener; draft changes have Apply/Cancel |
| Tabs | Arrow navigation, Home/End, roving tabIndex, active tab associated with one panel |
| Zone navigation | Six labelled buttons, aria-current, existing native shortcuts; no global shortcut capture in editable text |
| Dialog / consent | Native dialog semantics, modal focus containment, named heading, initial safe action, focus return, meaningful Escape handling |
| Toast / inline notice | Polite status; errors remain inline until resolved; ephemeral copy confirmations never carry important recovery steps |
| Activity / progress | Specific text; no invented percent; no indefinite pulse in reduced motion |
| Repository card / row | Hover does not select; selection has border + check/text; Enter/Space selects; explicit context and assignment actions |
| Context menu / command menu | Every contextual action also has a visible menu trigger; arrows, Escape, focus return; only implemented actions listed |
| Skeleton | Stable reserved geometry, aria-hidden, container aria-busy + textual loading label; no compulsory shimmer |
| Expandable section / tool card | Native details/summary where possible; Enter/Space; no focus loss when status changes |
| Code block | Local syntax grammar only; horizontal scroll, copy feedback, optional wrap; no remote images, HTML, script, or automatic link loading |
| Badge / status | Text + icon or shape, never colour only; separate privacy, provider, and execution meaning |
| Resize separator | Accessible orientation/value, keyboard resizing, clamped bounds, reset; do not persist conversation content |

Type: 28/34 welcome, 20/28 pane title, 14/20 section, 14/24 conversation, 15/26
focus reading, 12/20 code, 12/18 controls/metadata, 11/16 help. Uppercase labels may
use 10/14 only. System UI and system monospace; no new font download.

## 7. Motion and spatial engineering brief

| Interaction | Motion budget | Reduce Motion |
| --- | --- | --- |
| Button hover/press | 120 ms colour/border; no jumping scale | Immediate |
| Popover/dialog | 160 ms opacity + ≤4 px translation | Immediate |
| Panel mode | 200 ms opacity/edge movement; text does not scale | Immediate |
| Selection | 120 ms border/fill | Immediate |
| Camera | Existing damped easing, interruptible by new navigation | Snap |
| Astra idle | Existing `Idle02_F`, bounded head/eye layer | Freeze idle and tracking |
| Reply/tool state | Discrete pose/status change, not per-token motion | Text/status only |

Use existing Motion, CSS transitions, and R3F. No extra animation library. Use solid
text-bearing panes; at most one subtle floating glass layer. Reduce Transparency
switches that layer to opaque. No backdrop blur on large scrolling surfaces.

Phase 4 should lower overlay density, preserve distinct hardware/software/AI
materials, and improve the companion's composition without adding geometry first.
Test hover/picking on existing hit proxies, safe camera framing, and previous-pose
restoration. One canvas, one avatar, existing shadow budget and cached GPU strings.
Preserve full/30 fps/hidden window policy and exclude throttled frames from samples.
Mac acceptance remains ≥55 fps under comparable active-window measurements.

The original GLB has 72 joints, one idle clip, head/eyes/jaw, and no facial morph
targets or finger joints. No facial expression, viseme, or hand gesture claim is
supported. Preserve GLB bytes, textures, clip, source, and visible CC BY attribution.

## 8. Phase 3 implementation order and evidence

1. Build shared controls and the layout shell; preserve all six destinations and
   GitHub state handling. Adopt tokens without editing platform/native/shared.
2. Add a frontend conversation coordinator using the existing host methods and
   `useReply`, with restoration, stale guards, cancellation and provider changes.
3. Add context picker/preview, actual tool cards, and native-confirmed consent.
4. Add provider settings and native key-sheet trigger; never a frontend secret field.
5. Add safe Markdown/code rendering. Select a maintained AST-based React renderer
   and small local syntax grammar set; record dependency justification and request
   Claude's root architecture stack update. Do not hand-roll Markdown sanitisation.
6. Integrate layouts, previous-camera restoration, interaction feedback, and state-
   only scene updates. Use bounded histories (host limit 40 turns) and paged repos;
   introduce virtualization only if profiling justifies it.
7. Run required checks and add meaningful browser scenarios for race/cancel/consent,
   long code/history, four window sizes, keyboard, and accessibility.

The prototype validates composition and local interactions only. It reads existing
mock repositories/providers for labelled sample data and sends no AI, credential,
consent, or GitHub mutation calls. Its authored conversation specimen is explicitly
labelled; it is not evidence of a generated answer or live integration.

Native/hardware follow-up: WKWebView focus/drag/keyboard, credential sheet, real
streaming and tools, human approval flow, local model compatibility, accessibility,
and Mac M5 performance. Hosted inference remains unverified without approved live
testing. Phase 3C-D voice remains outside this work.
