# Phase 4 Codex → Claude checkpoint

**M0–2 design/research and M3–6 frontend implementation are complete locally.**
Branch `codex/phase4-living-universe`, base main
`a67cda15538b16af4182c249bfc212ad39e41f38`. Milestone commits: M3 `960439b`,
M4 `1d93e8a`, M5 `1470e3b`; use `git log -1` for the M6 tip. No push/merge/install.
This is the required M6 model checkpoint, not final Phase4/native acceptance.

Four physical rooms, preserved native Hub functions, detailed original equipment,
actual-state screens, inspection/return and separate furnished Living/Gaming.
M6 implements bounded static/floating/hybrid displays, intensity, three lighting
presets, native/system motion priority and two collision-safe chair positions.
Settings are explicitly session-only. The library has no installed game; its lazy
input/pause/exit/cleanup interface is tested with separate fixtures only.

A real cross-root disposal defect was reproduced and fixed in M6: navigation intent
now cooperates with reference-count pins inside the actual R3F room root. Retired
GLBs dispose after meshes unlink; old-frame uploads cannot resurrect unowned buffers.
Original repeat-visit limits are unchanged. Instance-owned buffers also release.
Runtime Astra/platform contact is aligned without changing its source/rig/voice.

TypeScript/build pass; bridge20/20, voice controller19/19, world unit22/22,
game lifecycle6/6. M6 customization8/8, rooms8/8, equipment6/6, world13/13 and full Studio28/28 pass:
**63 browser checks**, zero skipped, **15 zero-violation axe scans**, no page
errors/external requests. Final reruns cover the resource-lifetime fix. Evidence:
[PHASE4_LIVING_UNIVERSE.md](PHASE4_LIVING_UNIVERSE.md#milestone-6-bounded-customization-and-motion),
`/workspace/aura-phase4/m6/`. No native/shared/platform/contract/permission/dependency
or original licensed asset changes. No binary/screenshot commit.

**Ignored runtime GLBs must be copied/reproduced on a new checkout.**
Commands, current manifests and rights/provenance: `frontend/asset-pipeline/README.md`.
Current equipment999,936bytes/SHA916fe968d6af527429666f90ee9bd933914d6a1b2b6b816e1cbe2a1f323f90f2;
use the current manifest, not M4's historical digest. Room-kit/sofa/chair and original
Astra hashes/credits are in the inventory. All runtime asset URLs are local.

**Next: manually switch to GPT-6 Astra / Extra High for M7.** Review actual room/
light/motion screenshots, especially dock occlusion, floor grain, framing, scale,
materials and doorway composition. Preserve implemented functions and the lifetime
fix. Then the required M8 Luna/Medium QA and M9 Sol/High engineering checkpoints.
Do not restart audits, rewrite native services or publish without owner approval.

Known review case: Atrium+Hub75calls/250,556triangles exceeds the proposed
Atrium40-call ceiling; Gaming+Atrium72calls/84,092triangles exceeds its standalone
70-call ceiling. Profile portal views/culling/LOD in M8 and on native M5. Software
samples are not ≥55fps validation. Full Astra/GitHub/voice browser matrix, native
pointer lock, hardware voice, VoiceOver/system settings and durable world prefs
remain pending. The final M9 handoff must contain the exact native checkout/build/
validation steps and acceptance results; this checkpoint does not waive them.

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
