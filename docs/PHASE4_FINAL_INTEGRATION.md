# Phase 4: final M9 integration and Mac M5 validation

- **Integration branch:** `review/phase4-final-integration`, worktree `~/Developer/AURA-phase4-final`.
- **Final commit:** see the branch tip. This report is in it.
- **Not done:** nothing is pushed or merged, and `/Applications/AURA.app` is untouched.
- **Voice:** frozen. No voice code was changed, no voice suite ran, and there were no microphone or audio tests.

## 1. Import and history

| Item | Result |
|---|---|
| Handoff ZIP | `~/Desktop/AURA-Phase4-M9-Handoff.zip`, extracted to an isolated scratch folder. **All 87 SHA-256 entries verified independently**, and every file in the ZIP is listed. |
| Git bundle | SHA-256 `13f9e4ba…7371e` matches the README. `git bundle verify` is OK. It requires M6 `a22d343`, contains the ref `codex/phase4-living-universe` → `1e7d4a7`, and `fsck --connectivity-only` is clean. |
| Import | Fetched into a new ref, `refs/remotes/codex-handoff/phase4-living-universe` = **`1e7d4a7874d0907c4841b5602d80a6d334c1fe9d`**, with three commits on M6: `35a499d` (M7), `a9fe3e3` (M8), `1e7d4a7` (M9). No existing branch was moved. `origin/codex/phase4-living-universe` is still `a22d343`, and `main` is still `a67cda1`. |
| Codex scope | 33 files: `frontend/**`, docs and `TASKS.md`. **Codex changed no `shared/` or `macos/` file.** |
| Integration | Branch created at `1e7d4a7`. A normal merge (`--no-ff`) of `claude/phase4-native-foundation` (`6947263`) produced **`8e2cdd9`**. There were **no conflicts**: only `TASKS.md` auto-merged, and I reviewed it. Both `1e7d4a7` and `6947263` are ancestors of the tip, with no rewrites, resets or squashes. |
| Contract | One source of truth: Claude's `shared/contracts` (`Preferences.world`, `WORLD_PREFERENCES_VERSION`). The frontend adds no parallel types, casts or storage. |

Commits on this branch after the merge:
1. `5cc233c`: the frontend P4-N1 adapter (§2).
2. The final commit: the world-probe M9 scenarios and this report.

## 2. World preferences (P4-N1 frontend wiring)

The adapter wires Codex's prepared `restoreWorld()` / `subscribeUserChanges()` to the native contract:

- **`frontend/src/world/worldPreferenceSync.ts`:** a framework-free sync class with type-only imports, so it is unit-testable.
- **`frontend/src/world/worldPreferences.ts`:** a React hook. It supplies the bridge, `WORLD_PREFERENCES_VERSION` and the logger, and uses the preferences that `useStudio` already loads, so there is no second launch read.
- **`App.tsx`:** one line wiring the hook.
- **`WorldSettings.tsx`:** the copy now reflects the real state. The four states are loading, saved, unsaved (save failed, retried on the next change) and session-only. "Reset session appearance" became "Reset appearance".

| Behaviour | How it works | Verified |
|---|---|---|
| Saved room restore | Once, when the world is idle after the startup workspace focus. A saved non-Hub room goes through `restoreWorld` (registry and availability checked, Hub fallback). A saved Hub restores settings and camera only, so the `lastZone` pose is kept. | Unit tests, **and in AURA.app** (§4.2) |
| Static / floating / hybrid, float intensity, lighting | Mapped to `world.presentation`, `floatIntensity`, `lightingPreset` | Unit tests, **and in AURA.app** |
| Camera mode | Only an explicit Inspect/Explore choice is written. Cinematic mode is never written. Explore is restored without capture. | Unit tests. In the app, the writes were confirmed. Restoring "explore" after a relaunch was **not** run in the app. |
| Persistence after relaunch | Settings were saved through the real dialog, then the app quit and relaunched. | **In AURA.app** (§4.2) |
| Schema version | `schemaVersion !== 1` or a failed read means session-only and no writes. | Unit tests, plus native tests from the foundation |
| Debounced writes | Float intensity is debounced 300 ms and flushed on `visibilitychange`/`pagehide`. Other fields are written immediately, in order, only the changed field. | Unit tests |
| `prefs.changed` sync | An external change is mirrored into settings with no save, and is ignored while one of our writes is queued or in flight (so a stale echo can't override the user). | Unit tests |
| Failure handling | `invalid_request` re-reads `prefs.get` and reconciles without saving back. Other errors mark the state "unsaved" until the next successful write. | Unit tests |
| No save loop | Restores and syncs run with echo suppression. | Unit tests, **and in the app**: the preferences row's `updated_at` did not change during relaunch and restore. |
| Navigation beats a late restore | A user or native workspace navigation (any `studio.revision`), or a world change before the read, cancels the room restore. Settings still restore unless the user already changed them. | Unit tests |

**Kept session-only, on purpose:**
- **Room options** (lamps, curtains, palette, chair), as documented.
- **The world's "Reduce world motion" switch.** Codex's notes map it to the top-level `Preferences.reduceMotion`, but nothing in the app can turn that preference off again. The world dialog also *disables* its switch while that preference is on, so persisting it would lock users in. A future change needs an explicit control for the top-level preference first (see §7).

## 3. Original assets

All five GLBs were copied from `~/Developer/AURA-phase4`, the worktree validated earlier, using `cp -n`, without regenerating or editing anything.
- **Codex checklist:** `shasum -c frontend/asset-pipeline/PHASE4_SHA256SUMS.txt` passed for all five.
- **Native check:** `tools/check-assets.sh` gave 5/5 ok.
- **Bundle:** each GLB inside the built `AURA.app` was re-hashed and matches.
- **Attribution:** `CREDITS.txt`, `FURNITURE_CREDITS.txt` and Astra's `CREDITS.txt` are unchanged since M6. The footer and the world asset credits are visible.
- **Git:** no binary is tracked.

## 4. Mac M5 validation (actual measurements)

- **Machine and build:** M5 MacBook, macOS 27.2. Sandboxed, ad-hoc signed **Release** `AURA.app` built from this branch and loaded from `aura://` ("started (production)"). It was launched with `open -n --env …` from the worktree's own build folder.
- **Window:** 1280×800 at DPR 2, one canvas, AURA active and frontmost unless noted.
- **App database:** backed up before testing (`~/Developer/AURA-backups/aura-before-p4-m9-20261019-083258.sqlite`) and **restored afterwards**. The preferences row is byte-identical (md5 `a796f3d2…`), and the integrity check passed.
- **Installed app:** quit for the test and reopened afterwards. Its binary is unchanged (md5 `992894b8…`).
- **Probe:** the dev-only `AURA_DEV_WORLD_PROBE` (`WorldProbe.swift`) drives the page's own controls: the World-map dialog and the World settings dialog. It reads `__AURA_DIAGNOSTICS__` and skips the GitHub Keychain restore. Scenarios: `m9`, `relaunch`, `failure`.

### 4.1 Performance by room (first pass, plus 3 repeat cycles of 6 visits each)

| Room / composition | rAF fps | p95 / max frame | App render fps (min) | Draw calls | Triangles | M6 baseline (calls / fps) |
|---|---|---|---|---|---|---|
| Project Hub | 60 | 18–19 / 19 ms | 60 | 57 | 250,440 | 56–60 / 60 |
| Atrium (Hub loaded) | 60 | 18–19 / 23 ms (one) | 60 | **73** | 250,552 | 75 / 60 |
| Living | 60 | 18–19 / 20 ms | 57 | 52 | 114,532 | 52 / 60 (min 57) |
| Atrium (Living loaded) | 60 | 18–19 / 19 ms | 60 | 21 | 11,260 | 19 / 60 |
| Gaming | 60 | 18–19 / 20 ms | 57 | **72** | 84,092 | 72 / 60 (min 57) |
| Atrium (Gaming loaded) | 60 | 18–19 / 19 ms | 60 | 37 | 31,676 | 28 / 60 |
| Gaming alone (direct visit or relaunch) | 60 | 18–19 / 21 ms | 59–60 | 70 | 83,012 | n/a |
| Living alone (direct visit) | 60 | 18–19 / 20 ms | 60 | 48 | 113,428 | n/a |

- **Frames:** 5 s of frames per room on the first pass (about 300 frames) and 1.5 s per repeat visit. Missed frames (>20.9 ms) were 0 in every repeat visit, and at most 1 in any sample.
- **Counts:** `gl.info.render` for the whole composition, shadows included.
- **M6 comparison:** M9 is within ±2 draw calls of M6 in every room, except Atrium-with-Gaming at 37 versus 28. The frame rate is unchanged.
- **Lighting and presentation:** daylight, sunset and night, plus static, floating and hybrid, were measured in every room. All 20 samples ran at 60 fps with p95 ≤19 ms and at most one missed frame. Draw calls and triangles were identical across presets.

**Cold loads (`loadTiming`, time from the travel request):**

| Load | Ready | Settled |
|---|---|---|
| First Living visit, Hub → Atrium → Living (warm-up path) | 77 ms | 1,110 ms (camera travel) |
| Fresh-process Living, Hub → Living direct (after Retry) | 84 ms | 96 ms |
| Relaunch restore into Gaming | 49 ms | 62 ms |

- **M6 baseline:** first Living travel took **5.0 s**, so this is fixed.
- **Remaining cost:** the first second after a cold room still reports a minimum of 46–57 app fps, from GPU upload and shader compile, then 60 fps.

**Resource cleanup.**
- **GPU:** every cycle end was identical (geometries 55, textures 17, programs 30). The DOM stayed at 278 elements, and at most two rooms were loaded at a time.
- **Process memory** (`footprint`, 17 samples over about 4 min):

| Process | Range | Last |
|---|---|---|
| App | 30–31 MB | 31 MB |
| WebContent | 508–598 MB | 575 MB |
| WebKit GPU | 128–204 MB | 173 MB |

There is no upward trend, but this is not a long soak.

**Window lifecycle (real `miniaturize` and `hide`).**
- **Minimize and app hide:** rendering stops (the last frame sample was 4.2–4.5 s old) and resumes after restore.
- **Visible but inactive:** the deliberate throttle to about 28 fps.
- **M6 issue 2 fixed:** a room travel started while inactive (Atrium → Gaming at 28 fps) now **completes in 0.7 s**. In M6 it stalled for more than 45 s.

### 4.2 Preference persistence in AURA.app

1. **First launch:** the installed preferences row (no `world` key) decoded as world v1 defaults, with Ava at 0.85× intact. Through the real dialog the probe set sunset lighting, hybrid presentation and float 0.6, then travelled to Gaming. Stored after a normal quit: `v1 hybrid f=0.6 sunset inspect room=gaming`. `lastZone` stayed `studio`, `reduceMotion` false, voice Ava at 0.85 and AI provider none/never, all unchanged.
2. **Relaunch:** AURA opened **directly in Gaming** (ready 49 ms). Settings `hybrid/0.6/sunset` were applied, the dialog controls showed the same values, and the status read "saved". The row's `updated_at` (08:37:39) did not change during the relaunch or the restore (08:38), so there was no echo write. Gaming ran at 60 fps (min 59).
3. **After the interactive session (§4.3):** the stored row showed `room=project-hub`, written by the real "Return to Project Hub" click.

### 4.3 Native interaction (real mouse and keyboard, active window)

| Interaction | Result |
|---|---|
| Free Explore (drag-to-look, no pointer lock) | Pass. Explore was entered at eye height with the hint "Drag to look · WASD to walk · Arrow keys to look · E opens passage · Esc exits". A real mouse drag turned the view. |
| WASD | Pass. Holding W walked forward and holding D strafed right, at 60 fps. Single taps move a single frame, as expected. |
| Arrow-key look | Pass. Holding ← turned the view. |
| Esc | Pass. Back to Inspect, and the room card reappears. |
| Object selection and inspection | Pass. Clicking the Hub's hardware PC flew the camera to it and opened "Hardware workstation PC", with chassis, board and graphics-card views. |
| Return to room | Pass. The exact previous Hub view came back. |
| Room-to-room navigation | Pass. 26 map visits in `m9`, plus "Return to Project Hub" by hand. |
| E passages | Not tested by hand on the Mac. Covered by the browser suites (customization: "real X-axis corridor opens with E"). |
| Optional "Capture pointer" | Not retested. WKWebView refused pointer lock in the M6 test, and Explore no longer depends on it. |

### 4.4 Recovery

- **Failed model:** one `fetch` of `SheenChair.glb` was made to fail during a cold Living visit.
  - Result: phase `error`, with "Personal Living Space could not load. Your current room and tools are still available." plus **Retry room** and Dismiss. The Hub stayed usable.
  - **Retry room** then loaded Living (ready 84 ms) at 60 fps.
- **WebGL context loss** (`WEBGL_lose_context`, 2 s):
  - Diagnostics reported `context: lost`.
  - After `restoreContext()` the context returned to `ready` and resources were re-created (30/17/18).
  - The scene ran at 60 fps with one 25 ms frame, and travel to Atrium and the Hub worked afterwards.

## 5. Security and compatibility

- **No native security path changed since `main` (`a67cda1`):**
  - `macos/App` (entitlements, `Info.plist`) and the Xcode project;
  - `Security/` (Keychain `SecretStore`) and `Services/GitHub` (read-only policy);
  - `Services/AI` (provider registry, tool policy) and `Services/Voice`;
  - `Networking/`, `AppSchemeHandler.swift` (the `aura://` CSP) and `CredentialPrompt.swift`.
  The only native app-code changes are the P4-N1 persistence, from the foundation branch, and the dev-only probe hook in `StudioWebView`.
- **Frontend additions:**
  - New remote URLs are attribution links only (Creative Commons, Khronos, Sketchfab), opened in the default browser on click.
  - The only new `fetch` loads a bundled relative asset with `credentials: "omit"`.
  - No `localStorage` or other new storage.
- **Assets:** the Astra Lumen II GLB is byte-identical (`e9984ddc…`), with CC BY 4.0 attribution visible. The bundle loads no remote runtime assets. Tracked files contain no GLBs, credentials, logs, ZIPs or databases.
- **Existing app state:** preferences (voice, AI, `lastZone`, graphics) were preserved through migration and restored exactly after testing. The Keychain was not read by the probe.

## 6. Automated results (this branch)

| Suite | Result |
|---|---|
| `npm --prefix frontend run typecheck` | Pass |
| Frontend production build (inside `tools/build-app.sh Release`) | Pass, 1,105 modules |
| `test:world` (world 26 + **new world-preferences 13**) | **39/39** |
| `games.test.ts` | 6/6 |
| `shared/test/bridge.test.ts`, `mock voice` cases skipped | **18/18** (Codex's 16 plus 2 world-contract tests) |
| `tools/swift-test.sh --skip 'Voice\|Speech\|Spoken\|Audio\|InputHealth\|OnDeviceRecognition'` | **157/157**, 30 suites, 0 warnings. Includes WorldPreferences, ContractParity, Fixture, GitHubPermission*, GitHubSecret, AIToolPolicy, AIProviderRegistry and Infrastructure. |
| Phase 4 browser suites (Chromium, mock bridge) | world 12 (+1 microphone case skipped), customization 8, rooms 8, equipment 7, polish 12 = **47 pass**; 21 zero-violation axe scans |
| Codex `run-nonvoice-browsers.py` (reviewed before running) | design 13, GitHub 23, Astra 28 (+1 frozen), Studio 26 (+2 frozen) = **90 pass**; 20 zero-violation axe scans; 0 page errors; 0 external requests |
| `tools/build-app.sh Release` | Pass, no warnings; asset check 5/5 |

- **Voice-specific suites not run:** `test:voice`, `voice.browser`, `voice-design.browser`, the Swift voice suites, plus 4 voice or microphone cases inside other suites.
- **Software rendering:** browser frame rates are SwiftShader numbers (about 7 fps) and are not M5 evidence.
- **Two browser assertions updated:** both asserted "no world writes" (the old session-only behaviour). They now assert the exact allowed writes: room travel writes only `{world:{lastRoomId}}`, and no world write carries another section, `schemaVersion`, room options or cinematic mode.

## 7. Remaining bugs and limitations

1. **Draw-call ceilings.** Atrium + Hub is 73 calls (proposed ceiling 40), Gaming 70–72 (ceiling 70), and Atrium with Gaming loaded 37 (up from 28 in M6). There is no frame-rate cost on the M5. This is budget debt, not a blocker.
2. **First-second hitch after a cold room.** The app's render counter dips to 46–57 fps for about 1 s (GPU upload and shader compile), then holds 60.
3. **The world's "Reduce world motion" switch is not persisted** (§2). To persist it, the app needs a control that can also turn the top-level preference off.
4. **Not run on the Mac:**
   - restoring Explore camera mode after a relaunch;
   - E passages with real keys;
   - VoiceOver and the system Reduce Motion/Transparency settings;
   - display scaling and other window sizes;
   - a long soak (this run was about 4 min);
   - Debug + Vite WKWebView;
   - live GitHub and AI inside the app (code unchanged; the Swift suites pass).
5. **Inactive throttle.** A visible but unfocused AURA renders at about 28 fps, by design.
6. **Voice:** frozen. The Phase 3C-D hardware tests remain open.

## 8. Recommendation

**Ready for owner review and merge into `main`, subject to approval.**

- **Native and contract:** unchanged since the reviewed foundation, and all relevant suites pass.
- **M9 frontend and P4-N1 wiring:** they work on the Mac at 60 fps in every room, mode and lighting preset.
- **Two M6 issues are fixed on the Mac:** the cold Living load and travel while inactive.
- **Persistence:** verified end to end, with no save loop.

**Not release-complete (new installed build):**
- §7 item 4 should be run with the owner present, at least VoiceOver, system Reduce Motion and a 15–30 min soak.
- Voice acceptance remains deferred.
- Installing over `/Applications/AURA.app` needs separate approval, with a backup as before.

**Reproduce the M5 run:**
1. Copy the five GLBs, then run `tools/check-assets.sh`.
2. Run `tools/build-app.sh Release`.
3. Back up the app database and quit any running AURA.
4. Run `open -n --env AURA_DEV_WORLD_PROBE=m9 macos/.build/xcode/Build/Products/Release/AURA.app`. When it quits, run the same with `=relaunch`, then with `=failure`.
5. Read the results with `/usr/bin/log show --last 20m --info --predicate 'subsystem == "com.aura.app" AND category == "world-probe"'`.
6. Restore the database.
