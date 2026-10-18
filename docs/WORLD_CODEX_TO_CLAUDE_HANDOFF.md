> M1 update: art direction and scaled floor plan are complete design deliverables.
> Runtime/native functionality remains at M0. Continue M2 asset/blueprint work next;
> the next required manual model change is Sol / Extra High before M3. The M0 audit
> and native coordination requirements below remain applicable.

# Living Universe — Codex to Claude handoff

## Current boundary: Milestone 0 only

Branch: `codex/phase4-living-universe`, based on fetched main
`a67cda15538b16af4182c249bfc212ad39e41f38`. This is the audit/migration checkpoint,
**not Phase 4 integration-ready software**. No world runtime, new asset, dependency,
native contract or service was changed. No push/merge or `/Applications/AURA.app`
replacement. Preserve the user's existing worktrees and the merged main application.

M0 checks passed: TypeScript/build, 20 bridge tests, 19 voice-controller tests,
asset inspection/checksum, nine focused browser checks and two zero-violation axe
scans. Evidence and software-renderer limitations are in the audit, not native
acceptance. Changes are the seven requested documents plus an appended TASKS entry.

The next model is GPT-6 Astra / Extra High for M1 art direction. Do not begin M3
implementation until M1 architectural plans and M2 licensed asset/blueprint gates
are complete. Status and future ideas live in [WORLD_ROADMAP.md](WORLD_ROADMAP.md).
The final M9 handoff must replace this checkpoint's status with actual implemented
features, exact commit, results and unresolved items; do not claim planned features.

## Preserve the current native baseline

- Six native ZoneIds and Cmd+1–6; project-zone assignment and AI context schema.
- GitHub read-only permissions, auth clearing, Keychain/provider sheets, source
  privacy and explicit approvals. Outstanding approval restore still safely uses
  Stop/send again until the existing atomic snapshot request is resolved.
- All **18** main voice methods, six events, pause/resume/replay and measured pace
  0.7–1.3/default 0.85. No browser capture, always-on input or hands-free barge-in.
- Original Astra GLB and visible CC BY 4.0/title/creator/source; one Canvas,
  window throttling/suspension, DPR limit, reduceMotion and existing diagnostics.

## Requested native coordination — no Codex contract edits

1. **P4-N1, optional versioned world preferences.** Exact proposed fields/defaults/
   bounds and patch/migration requirements are in
   [WORLD_ARCHITECTURE.md](WORLD_ARCHITECTURE.md#preferences-and-native-request-p4-n1).
   Use existing prefs methods/events, keep lastZone separate, and preserve old
   preferences. Claude owns TS/Swift/mocks/fixtures/parity/migration tests. Until
   landed, frontend world settings are explicitly session-only.
2. **P4-N2, pointer lock acceptance.** Validate user-gesture request/denial/Esc/focus
   in WKWebView for Debug + loopback and Release + aura://. No current native
   pointer-lock delegate was found. If needed, propose a minimal trusted-origin
   host change before implementation. Map/inspect remain accessible if unsupported.

These are proposals, not approved contracts or claims that Claude implemented them.
No new local-model-management or media/game service is requested this phase.

## Validation responsibilities

M0 cloud results and source-reported Mac evidence are in
[PHASE4_LIVING_UNIVERSE.md](PHASE4_LIVING_UNIVERSE.md#audit-verification).
Do not reuse the older Phase 3C-D frontend's 15-method contract or pre-validation
status as the current baseline; main has newer native validation and real-audio fixes.

At final M9, Codex must provide exact branch/hash, frontend type/build/unit/bridge/
browser/axe results, licensed asset manifest and room screenshots. Include all room
connections/camera modes/input priority/GLB failure/retry/context-loss/reduced-motion/
resource-lifecycle checks and complete existing Astra/GitHub/voice regressions.

Claude's eventual native validation must include:

- Release and Debug builds, Swift contract/security tests, native menus and preserved
  project/context/credential/approval flows in all new physical destinations.
- Pointer lock, WASD, collision clearance, Esc/focus/full-screen and ordinary typing;
  keyboard-only room map and usable controls with WebGL/asset failure.
- Explicit native mic consent, physical input/output and deferred Bluetooth/device
  switching/sleep/lock checks from `PHASE3C_D_REAL_AUDIO.md`; Pause/Resume/Replay and
  no automatic capture after room/game transitions.
- VoiceOver, system Reduce Motion/Transparency, active/inactive/hidden window behavior
  and small/large desktop layouts with dialogs and side panels.
- Active M5 target ≥55 fps (aim 60), DPR and render counters in every room, light mode,
  camera mode, speech startup and room transition; repeated visits and game exits
  for resource growth. Separate load/cinematic timing from steady-state samples.
- Native preference default decoding, bounded patches and layout migration only
  after approved contracts exist; no loss of existing projects/voice/AI settings.

Prior main reports record 60 fps under specified M5 conditions; new Phase 4 rooms
have not been benchmarked. Software-rendered cloud screenshots cannot pass native
performance or hardware voice acceptance. Push, merge and app installation remain
separate owner permissions.
