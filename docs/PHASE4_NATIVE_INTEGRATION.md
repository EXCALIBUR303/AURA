# Phase 4: native foundation and integration

> **Superseded for the final state:** the M9 import, P4-N1 frontend wiring and the final Mac M5 validation are in [PHASE4_FINAL_INTEGRATION.md](PHASE4_FINAL_INTEGRATION.md). This report remains the M3–M6 native baseline.

- **Branch:** `claude/phase4-native-foundation`, worktree `~/Developer/AURA-phase4`.
- **Base:** Codex `codex/phase4-living-universe` at `a22d343ff757b9b59057db4525669ccb098648eb` (M3–M6), verified against `origin` before branching. `origin/main` (`a67cda1`) is an ancestor.
- **Commits:** `94ae238` (preferences), `c527d1e` (first report); the probe and this validation report are in the latest commit (see the branch tip).
- **Not done:** nothing is pushed or merged, and `/Applications/AURA.app` is untouched. Voice work is frozen: no voice code, commands or hardware tests in this phase.
- **Status:** implementation and the M5 in-app validation are complete (§6). The four world GLBs came from the Codex ZIP (verified) and are **not committed**.

## 1. Workspace audit

| Item | Finding |
|---|---|
| Codex commit | Present on `origin` and locally; branch tip equals `a22d343`. |
| Codex changes vs main | 74 files, all under `frontend/**` (except `frontend/src/platform`) or `docs/` and `TASKS.md`. Codex changed no native, shared, platform, contract, permission, entitlement or dependency files (`package.json` adds scripts only, and `package-lock.json` is unchanged). |
| Worktrees | No Codex worktree on this Mac (Codex worked in a cloud workspace). The existing Claude and review worktrees were not touched. |
| Gitignored assets | The Astra original was copied in, with its digest matching the inventory. **The four world GLBs** (`workstation.glb`, `room-kit.glb`, `GlamVelvetSofa.glb`, `SheenChair.glb`) **do not exist anywhere on this Mac.** |

## 2. Native integration audit

| Area | Finding | Action |
|---|---|---|
| World preferences | Session-only in the frontend (`world/settings.ts`). `Preferences` had no world field. | **Implemented (§3).** |
| Bridge compatibility | The world uses only existing methods. RoomIds never enter `ZoneID`, and ⌘1–6 / `lastZone` are unchanged. | Contract extended additively; protocol version stays 1. |
| Window lifecycle | The Studio canvas already follows `app.windowStateChanged` and `visibilitychange` (frameloop `never`/`demand`). World navigation releases keys and pointer lock on `blur` and `visibilitychange`. | Verify in-app (§6). No native change needed. |
| Pointer lock (P4-N2) | The host has no pointer-lock code, and the WKUIDelegate does not handle it. Public WebKit API has no pointer-lock delegate. The frontend already handles `pointerlockerror` and keeps the map and Inspect usable. | Test with a real click in Debug and Release (§6). **Proposal:** if WKWebView refuses it, keep Explore without capture (drag-to-look). Do **not** use private WebKit SPI. No host change is made. |
| Asset loading | `aura://` serves `.glb` as `model/gltf-binary` with `nosniff` and path-traversal protection. The world GLBs total about 9 MB on top of Astra's 18 MB and are read synchronously like Astra; fine at this size. | Added `tools/check-assets.sh` (§4). |
| External links | Credit links in `AssetCredits.tsx` use `target="_blank"`. The existing `createWebViewWith` opens http(s) in the default browser and never in a second web view. | None. |
| CSP / runtime network | CSP is `default-src 'self'`, and every world asset URL is relative. The credit links are user-clicked navigation only. | None. |
| GitHub / AI / Keychain | Not touched by Codex or by this branch. | Re-check in-app (§6). |

## 3. Persistent world settings (P4-N1)

### Contract (`shared/contracts/domain.ts`, mirrored in `BridgeDomain.swift`)

```ts
Preferences.world: {
  schemaVersion: number;            // 1 (WORLD_PREFERENCES_VERSION); larger = written by a newer AURA
  presentation: "static" | "floating" | "hybrid";      // default "static"
  floatIntensity: number;           // 0–1, default 0.35, clamped by the host
  lightingPreset: "daylight" | "sunset" | "night";     // default "daylight"
  cameraMode: "inspect" | "explore";                   // default "inspect"; "cinematic" is never stored
  lastRoomId: string;               // ^[a-z][a-z0-9-]{0,47}$, default "project-hub"; never a ZoneId
}
PreferencesPatch.world?: Partial<Omit<WorldPreferences, "schemaVersion">>
```

The world settings use the existing `prefs.get` / `prefs.update` / `prefs.changed`. No new method, event, service or privilege is added.

### Storage and migration

The world settings live in the same SQLite row as the other preferences (`kv` key `preferences`) inside the app container, with no new table or file.

- **Old rows:** a row saved before Phase 4 has no `world` key and decodes with the defaults (static, conservative). Voice, AI, graphics, `lastZone` and `reduceMotion` are unchanged. This is tested against the exact shape of the installed Phase 3C-D row, including Ava and 0.85×.
- **Damaged values:** stored world values are decoded field by field. An invalid value falls back to that field's default. This matters because an unreadable row makes `loadPreferences` return all defaults, and the next save would then reset voice and AI settings.
- **Newer schema:** if a newer AURA saved `world.schemaVersion > 1`:
  - `prefs.get` reports that version with this build's defaults.
  - Every save writes the stored `world` object back verbatim.
  - Any `world` patch fails with `invalid_request`.
  - Other changes, such as voice or `lastZone`, still save.
- **Patches:**
  - Merged one level deep, like the other sections.
  - Invalid enums, `cameraMode: "cinematic"` and malformed `lastRoomId` values make the router reject the **whole** patch with `invalid_request`. Nothing is written and no `prefs.changed` is emitted.
  - `floatIntensity` is clamped to 0–1.
  - The mock applies the same rules.
- **Not persisted, on purpose:**
  - Room options (Living and Gaming lights, curtains, palette, chair position). Per-room overrides are a future versioned schema (WORLD_ARCHITECTURE "Preferences and native request P4-N1"). Restoring `chairSlot` also needs a collision-safe restore rule.
  - The world's `reduceMotion`, which is the existing `Preferences.reduceMotion`.
  - Game saves and object layouts.

### Files

- `shared/contracts/domain.ts`: the types, `WORLD_PREFERENCES_VERSION` and `WORLD_ROOM_ID_PATTERN`.
- `shared/bridge/mock.ts`: the defaults and the validating merge.
- `shared/fixtures/bridge-messages.json`: three valid and three invalid entries.
- `shared/test/bridge.test.ts`.
- `macos/Sources/AuraCore/Bridge/BridgeDomain.swift`: `Preferences.World`, `PreferencesPatch.World` and `validatedApplied(to:)`.
- `AppServices.swift`.
- `Persistence/AppStore.swift`: newer-schema preservation.
- `macos/Tests/AuraCoreTests/WorldPreferencesTests.swift` (new) and `ContractTests.swift`.

## 4. Asset check (`tools/check-assets.sh`)

The script checks the gitignored runtime GLBs against their recorded SHA-256 digests:

- Astra (inventory digest).
- GlamVelvetSofa and SheenChair (pinned digests from `FURNITURE_CREDITS.txt`).
- `workstation.glb` and `room-kit.glb` (digests from their committed manifests).

`tools/build-app.sh` runs it strictly for **Release**, so a Release build stops if any GLB is missing or altered. **Debug** builds only warn. The script reads files and never downloads or modifies them.

## 5. Required frontend wiring (for Codex, M7/M8)

The work belongs to Codex. I changed none of its visual components or `world/*` files.

1. **Load:**
   - After the bridge is ready, call `prefs.get`.
   - If `world.schemaVersion === WORLD_PREFERENCES_VERSION`, seed `WorldController` settings (`presentation`, `floatIntensity`, `lightingPreset`), the initial camera mode and the initial room.
   - Otherwise stay session-only and keep the "not saved" copy. This covers a failed call, `unavailable`, or a newer schema.
2. **Initial room:**
   - Accept `lastRoomId` only if `ROOMS[lastRoomId]` exists and is `"available"`. Otherwise use `"project-hub"`.
   - ⌘1–6 / `lastZone` keep their current behaviour. A workspace focus still lands in the Hub.
3. **Save:**
   - Call `prefs.update({ world: { … } })` only on explicit user changes.
   - Commit the Float intensity slider on `change`/`pointerup`, or debounce it (about 300 ms). Do not write SQLite on every `input` event.
   - On `invalid_request`, re-read `prefs.get` and show the stored values.
4. **lastRoomId:**
   - Write it after `arrive()` settles in an available room (phase `idle`), and after a door passage when `enter()` changes the room.
   - Never write it during travel, for planned rooms or in the cinematic mode.
5. **Camera mode:**
   - Persist only `inspect`/`explore` from the user's own toggle.
   - Restoring `explore` at launch must **not** call `requestPointerLock()`, which needs a user gesture. Show Explore as selected and capture on the next click.
6. **Sync:**
   - Subscribe to `prefs.changed` with `useBridgeEvent` and apply `world` when it differs. Prefs are shared with native menus and any future window.
7. **Copy:**
   - When persistence is active, replace "Session only. These options are not saved…" in `WorldSettings.tsx` with saved-state copy.
   - The room-options copy in `RoomPanel.tsx` stays session-only (see §3).
8. **No other storage:** no `localStorage`, files or cloud. Keep `reduceMotion` on the existing top-level preference.
9. **Tests:**
   - Extend `test/world.test.ts` and `test/customization.browser.mjs` to cover load, invalid-room fallback, newer-schema session mode and debounced saves, against the mock in `shared/bridge/mock.ts`.

## 6. Test results and pending validation

### Done (this branch)

| Check | Result |
|---|---|
| `tools/swift-test.sh` | **242/242** (7 new), 0 warnings. 3 pre-existing opt-in live local-AI tests skipped as usual. |
| `npm --prefix frontend run typecheck` | Passed |
| `npm --prefix frontend test` (bridge + mock) | **22/22** (2 new) |
| `test:world` / `test:games` / `test:voice` (unit, unchanged code) | 22/22, 6/6, 19/19 |
| `swift build --package-path macos` | Clean |
| `tools/build-app.sh Debug` | Built; asset check warned about the 4 missing world GLBs |

### M5 validation (measured on this Mac)

- **Machine and build:** M5 MacBook, macOS 27.2. Sandboxed, ad-hoc signed **Release** `AURA.app` built from this worktree at the Phase 4 base plus `94ae238` and the probe commit. It loads `aura://app/index.html` ("started (production)") and was launched through LaunchServices from the worktree's own build folder.
- **Window:** 1280×800 at DPR 2, one canvas, AURA active and frontmost for every sample.
- **Not touched:** `/Applications/AURA.app` stays byte-identical (md5 `992894b8…`).
- **Quit and reopened:** I quit your running installed AURA during the test (the two builds share one database and GPU) and reopened it afterwards.
- **Database:** backed up first. The preferences row is byte-identical after the run.
- **Probe:** the dev-only `AURA_DEV_WORLD_PROBE=1` (`WorldProbe.swift`) opens the page's own World-map dialog and clicks **Visit**, like a person. It then reads the app's `__AURA_DIAGNOSTICS__`. It writes no preferences and makes no voice, AI or GitHub calls, and it skips the GitHub Keychain restore.
- **Assets:** `tools/check-assets.sh` passed for all five GLBs before the build, and all five are bundled. The four world GLBs came from the Codex ZIP: all 13 listed SHA-256 sums verified, and the manifests and credit files were byte-identical to the committed ones.
- **GLB structure:** no external URIs, no broken buffer or texture references, and no missing images. The two AURA kits have no textures at all. The only required extension is `KHR_texture_transform`, which three.js supports.

| Room (visit) | Cold travel | rAF fps / p95 / missed | App render fps (min / median) | Draw calls | Rendered triangles | GPU geometries / textures / programs |
|---|---|---|---|---|---|---|
| Project Hub (start) | n/a | 60 / 18 ms / 0 | 60 / 60 | 56–60 | 249,352–249,390 | 40–50 / 12–14 / 17–20 |
| Atrium (from Hub, Hub still loaded) | 1.5 s | 60 / 18 ms / 0 | 60 / 60 | **75** | 250,556 | 57–59 / 15–17 / 22–30 |
| Living (first visit) | **5.0 s** | 60 / 17 ms / 0 | 60 / 60 | 52 | 114,532 | 40 / 22 / 40 |
| Atrium (Living still loaded) | 1.7 s | 60 / 17 ms / 0 | 60 / 60 | 19 | 11,256 | 41 / 23 / 40 |
| Gaming (first visit) | 1.9 s | 60 / 18 ms / 0 | 60 / 60 | **72** | 84,092 | 56 / 19 / 39 |
| Atrium (Gaming still loaded) | 1.7 s | 60 / 17 ms / 0 | 60 / 60 | 28 | 21,792 | 56 / 19 / 39 |
| Project Hub (return) | 1.7 s | 60 / 18 ms / 0 | 60 / 60 | 58 | 250,432 | 59 / 17 / 30 |

- The table is the first pass (5 s of frames per room, about 300 frames each). All four rooms ran at about 60 fps with p95 at most 19 ms.
- Repeat visits: 4 further cycles over all rooms (24 visits at 1.5 s each) gave 57–60 fps, with at most one missed frame (a 22 ms frame in Gaming). The minimum app-reported fps was 57, in Living and Gaming.
- Counts are `gl.info.render` for the whole composition, shadows included.
- "rAF" is the page's `requestAnimationFrame` interval. "App render fps" is the app's own once-per-second render counter. Both are shown because the rAF rate alone does not prove frames are drawn.

**Resource cleanup.** After the first full pass, GPU resources were constant through all four repeat cycles: geometries 59, textures 17, programs 30 at every cycle end, the DOM stayed at 278 elements, and at most two rooms were loaded at a time. Process memory sampled every 15 s (`footprint`):

| Process | First | Min | Max | Last |
|---|---|---|---|---|
| App (native) | 30 MB | 30 MB | 46 MB | 30 MB |
| WebContent | 533 MB | 498 MB | 592 MB | 499 MB |
| WebKit GPU | 173 MB | 150 MB | 182 MB | 150 MB |

This is eight samples over about 2 minutes. It shows no growth over the repeat cycles, but it is not a long soak.

**Window lifecycle (real `miniaturize` and `hide`).**
- *Minimized for 4 s:* the page reported hidden, and the render counter stopped updating (last sample 4.5 s old). After restore it resumed at 60 fps.
- *App hidden for 4 s:* the same stop. After `unhide` the window was visible but **not active**, and the render rate dropped to the deliberate inactive rate (28 fps). The requestAnimationFrame rate stayed 60. That is the existing throttle (see issue 2), not a leak.
- *Context:* it stayed `ready` throughout.

**Stored preferences in the real build.** The installed row from the old build (no `world` key; Ava at 0.85×) decodes as `world v1 static intensity=0.35 daylight inspect room=project-hub`, with voice settings intact.

**Pointer lock (P4-N2).** A real mouse click on **Free Explore** in the Release `aura://` build, with the window active and frontmost, was refused twice. The page showed "Mouse capture was not granted. Room map and Inspect remain available." and stayed in Inspect mode. Dismiss cleared the notice, and a second click produced it again. The frontend degrades correctly. **Not tested:** Debug + Vite (same WKWebView, so the same refusal is expected, but it was not run), Esc/focus behaviour under a granted lock, and WASD (a lock cannot be granted here).

**Recommendation for P4-N2.** Do not add a host hook. WebKit has no public API for pointer lock, and the alternatives would mean private SPI or a weaker policy. Codex should make **drag-to-look Explore** (keyboard WASD plus mouse-drag look, no capture) the primary mode in WKWebView, and keep pointer lock as an optional enhancement for browsers.

### Issues found

1. **Draw-call ceilings.** Atrium + Hub is 75 calls (proposed ceiling 40), and Gaming + Atrium is 72 (ceiling 70). Triangles are within budget, and there is no frame-rate cost on the M5 (60 fps, 0 missed frames). Treat this as budget debt for M8, not a blocker.
2. **Inactive window.** When AURA is visible but not frontmost, the page renders at about 28 fps and a camera travel does not finish while that lasts. In my first run, with the window behind other apps, a visit to Living was still `travelling` after 45 s and the probe gave up. The throttle is intentional, but a travel started while inactive effectively stalls. Codex should let an in-flight travel finish or snap to its destination when the window is inactive, and the HUD could say that travel is paused.
3. **Cold Living load: 5.0 s** (travel 1.5 s on later visits). GLB parse and upload happen on the first visit. Consider preloading the Living/Gaming assets after the Atrium settles, or showing a progress state.
4. **Not tested:** WebGL context loss, a failed or missing GLB in the app (the retry path), a long soak, VoiceOver, system Reduce Motion/Transparency, and small or large windows with dialogs and side panels.
5. **GitHub and AI in the app: not exercised.** The probe skips the Keychain restore, and GitHub/AI code is untouched by Codex and by this branch (§7). The Swift GitHub, AI and security suites pass (242/242).

## 7. Security and compatibility

- **No changes** to entitlements, `Info.plist`, CSP, navigation policy, `Security/`, `Services/GitHub/`, `Services/AI/`, `Services/Voice/` or Keychain code. The GitHub read-only permission policy is unchanged.
- **Preferences:** world preferences hold no personal or remote data. Room ids are format-bounded. Nothing new is logged.
- **Astra Lumen II:** the GLB is byte-identical (digest `e9984ddc…`). Its `CREDITS.txt` and the visible CC BY credit are unchanged.
- **World asset licences** are documented by Codex in `FURNITURE_CREDITS.txt`, `CREDITS.txt` and `docs/WORLD_ASSET_INVENTORY.md`. Release builds now enforce their pinned digests.
- **No remote runtime assets:** all world URLs are relative to the bundle.

## 8. Remaining gaps and instructions for Codex M7/M8

**Open items**
- **Frontend wiring (§5):** world preferences are stored natively but the frontend does not yet read or write them.
- **Draw-call debt:** Atrium + Hub 75 and Gaming + Atrium 72 calls. Profile portal culling, LOD and shadow casters in M8 (60 fps holds today).
- **Pointer lock:** refused in WKWebView. Make drag-to-look the primary Explore mode (§6).
- **Inactive-window travel:** see issue 2.
- **Cold Living load:** 5.0 s, see issue 3.
- **Not yet validated in the app:** the items in issue 4 and the GitHub/AI flows.
- **Voice:** frozen. The Phase 3C-D deferred hardware tests remain open (`PHASE3C_D_REAL_AUDIO.md` §6b).

**For Codex M7 (visual polish)**
- Keep the resource-lifetime fix and the 60 fps result: re-run the probe after visual changes. The harness is `AURA_DEV_WORLD_PROBE=1` on a Release build launched with `open -n --env`.
- Do not raise draw calls or triangles: Atrium + Hub and Gaming + Atrium are already over their ceilings.
- Wire P4-N1 (§5) before the polish pass, so settings survive relaunch.

**For Codex M8 (QA)**
- Test the Explore mode without pointer lock, and keep the room map and Inspect fully usable.
- Cover the inactive-window travel case, a failed GLB (retry in the app), and context loss.
- Run VoiceOver, Reduce Motion/Transparency and the small and large window layouts.
- Report fps and draw calls from the native probe separately from browser numbers.

**Reproduce the M5 run**
1. Extract the Codex ZIP to a temporary folder, run `shasum -a 256 -c SHA256SUMS.txt`, then copy only the four GLBs into `frontend/public/world/`. Run `tools/check-assets.sh`.
2. Back up the app database, then run `tools/build-app.sh Release`.
3. Quit any running AURA, then run `open -n --env AURA_DEV_WORLD_PROBE=1 macos/.build/xcode/Build/Products/Release/AURA.app` and keep the window in front.
4. Read the results with `/usr/bin/log show --last 10m --info --predicate 'subsystem == "com.aura.app" AND category == "world-probe"'`.
