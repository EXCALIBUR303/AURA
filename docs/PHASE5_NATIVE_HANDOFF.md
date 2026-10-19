# Phase 5 visual foundation — Claude Opus 5.5 handoff

Continue from the completed visual foundation on `codex/phase5-spatial-os`, based on verified Phase 4 integration `29cb3a39dc0a03932eb30fa50b2eb2c27150367f`. Do not restart the design or reapply Phase 4 integration. The final exact tip is recorded in the delivery ZIP's `METADATA.json` and final handoff message.

Read `AGENTS.md`, `ARCHITECTURE.md`, `docs/PHASE4_FINAL_INTEGRATION.md`, then [the implementation report](PHASE5_SPATIAL_OS.md) and [design system](PHASE5_DESIGN_SYSTEM.md). Model requested by the owner for continuation: **Claude Opus 5.5**. Review and validation are the next task; a full next implementation phase is not automatically authorized.

## State and contract boundaries

- `App` owns session-only console minimized/edge state and coordination with equipment/room panels. Existing zone, project, camera and preference controllers retain ownership.
- `CompanionWorkspace` stays mounted. Its content is hidden while minimized, preserving the exact textarea, draft, selected conversation and active stream. Restoring un-hides the content, restores focus and clears unread state. Transcript scroll follows only when visible; new text while minimized updates the beacon without cancelling the request.
- Approval, context, provider and existing voice dialogs sit outside the hidden content wrapper. Keep native privacy approval visible; do not auto-approve or reinterpret provider/repository permissions. Live approval handling has not been validated by this cloud checkpoint.
- Existing `worldPreferenceSync` / `worldPreferences` remain the only persisted-world integration. Room IDs, native workspace IDs, `ConversationLayout`, methods/events and permission policy are unchanged. Minimized/edge state introduces no bridge field or durable data format.
- Astra remains the original single Project Hub avatar. Only its surrounding platform and welcome composition changed. `Astra.tsx`, the GLB, rig, idle clip and original CC BY 4.0 attribution are unchanged.
- Native sources, platform bridge, shared contracts/mock, AI controller, GitHub services, voice sources, credentials and entitlements were not modified. Voice hook arguments, transcript handlers and composer controls retain their original implementation. **Do not develop or test voice, microphone, speech, TTS, Bluetooth or audio.**

The manual world-preference-saving discrepancy remains **unresolved and postponed**, despite prior native reports and passing automated tests. Record observations; do not rewrite persistence or claim the discrepancy is fixed. Console presentation is deliberately session-only.

## Bring the unpushed work onto the Mac

The branch has not been pushed. The download includes an incremental `AURA-Phase5-Spatial-Foundation.bundle`, requiring base `29cb3a3`. Extract the ZIP into `~/Downloads/AURA-Phase5-Spatial-Foundation` (adjust this path if the browser chooses another location). From the existing Mac AURA clone:

```bash
cd ~/Developer/AURA
git status --short
git cat-file -e 29cb3a39dc0a03932eb30fa50b2eb2c27150367f^{commit}
git bundle verify ~/Downloads/AURA-Phase5-Spatial-Foundation/AURA-Phase5-Spatial-Foundation.bundle
git fetch ~/Downloads/AURA-Phase5-Spatial-Foundation/AURA-Phase5-Spatial-Foundation.bundle refs/heads/codex/phase5-spatial-os:refs/remotes/aura-review/phase5-spatial-os
git worktree add -b claude/phase5-spatial-review ../AURA-phase5-review refs/remotes/aura-review/phase5-spatial-os
cd ../AURA-phase5-review
git rev-parse HEAD
git merge-base --is-ancestor 29cb3a39dc0a03932eb30fa50b2eb2c27150367f HEAD
```

Compare HEAD with the full hash in `METADATA.json`. If the review ref/worktree already exists, inspect and reuse it rather than resetting or forcing. If the base is missing, fetch `origin review/phase4-final-integration` and verify the exact base before importing. No Phase 4 merge, force operation or push is necessary.

The ZIP contains no GLBs. Copy the five original ignored files from your already-validated Phase 4 checkout, preserving the relative paths listed in `frontend/asset-pipeline/PHASE4_SHA256SUMS.txt`. Keep the tracked public Astra symlink; do not replace its target or regenerate assets. From the review worktree:

```bash
shasum -a 256 -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt
npm --prefix frontend ci
npm --prefix frontend run build
node --test --test-isolation=none --test-skip-pattern='mock voice' shared/test/bridge.test.ts frontend/test/world.test.ts frontend/test/world-preferences.test.ts frontend/test/games.test.ts
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5175
```

Use Node ≥23.6; the cloud checks used 24.19.0. The build includes both TypeScript checks. A browser at the local server uses mock services and cannot establish native success. Do not run the unfiltered `npm test` or voice suites while frozen. `npm ci` refreshes this review worktree only.

## Focused browser replay

Keep Playwright, axe and Chromium outside the repository, or use the already-installed local browser tools. Set these environment variables for each script (absolute local paths):

```bash
export AURA_BASE_URL=http://127.0.0.1:5175
export AURA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export AURA_AXE_MODULE=/absolute/path/to/@axe-core/playwright/dist/index.mjs
export AURA_CHROMIUM_PATH=/absolute/path/to/Chromium
export AURA_ARTIFACTS=/tmp/aura-phase5-spatial-review
node frontend/test/spatial.browser.mjs
```

Use distinct artifact directories for `frontend/test/github.browser.mjs`, `frontend/test/equipment.browser.mjs` and `frontend/test/polish.browser.mjs`. For the latter select only:

```bash
AURA_TEST_FILTER='Explore starts|Mouse drag|Optional pointer|In-flight|started while hidden|Native deactivation' node frontend/test/polish.browser.mjs
```

Cloud Chromium needed `AURA_SOFTWARE_GPU=1`; do not set it for a real Mac GPU performance measurement. Automated native-shaped mocks exercise routing/error presentation, not authentication, Keychain or a real provider. Older broad Studio/Astra UI scripts may need explicit restore actions for the new minimized default; do not remove state-preservation assertions merely to make old layout assumptions pass.

## Pending Mac validation after owner authorization

Use the isolated review worktree and existing development host. Do not rebuild, replace or modify `/Applications/AURA.app`. An authorized non-voice native smoke run can point the existing native development executable at port 5175:

```bash
AURA_DEV_SERVER_URL=http://127.0.0.1:5175 swift run --package-path macos AuraApp
```

This unbundled run is a separate acceptance target from a Release `aura://` build. Record which host/build was used. Do not change permissions, trigger a microphone request, run the complete native voice test suite or install a new app as part of visual review.

1. Compare all four rooms, room cards, compact/expanded/focused Astra and the laptop project inspector against the gallery at 1440×900, 1280×800 and 1100×700. Test native title-bar dragging and ⌘1–6.
2. Type a draft; minimize, select workspaces/rooms, inspect equipment and restore. Confirm draft, context and history survive. With an already-configured text provider, minimize during a reply, restore the response and confirm error recovery. Approval dialogs must remain reachable while the console is minimized. Do not create new credentials or grant permissions to complete this check.
3. Recheck real model selection, keyboard equipment/component navigation, exact camera return, drag-to-look, WASD/arrows, optional pointer denial, Escape and restoration after hide/deactivation. Check both reduced-motion and ordinary presentation.
4. Inspect loading/error recovery, canvas/resource count and local asset requests. Confirm all five SHA-256 hashes and visible XRProfXR/CC BY 4.0 plus furniture credits.
5. Measure active native DPR 2 FPS, calls, triangles, GPU/resource behaviour and long-session room cycling. Target 55–60 FPS; the foundation's cloud result is not evidence this target passes. Compare the +1 call/+208 triangle Hub/Atrium delta with the unchanged Living/Gaming scene counts.
6. Validate VoiceOver focus/labels and system Reduce Motion/Transparency without touching audio controls. Exercise real read-only GitHub UI only under existing authorization, avoiding private screenshots in the handoff.
7. Record the known manual preference discrepancy as pending. Do not close it because a scripted test succeeds. New console layout choices may reset on relaunch by design.

After review, report the exact commit/host, test outcomes, visual changes requested and pending gates. Extending camera design, workstation detail, playable games, native persistence or audio requires a separate approved task. Stop at this visual-foundation handoff.
