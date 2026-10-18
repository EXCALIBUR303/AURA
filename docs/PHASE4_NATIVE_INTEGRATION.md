# Phase 4: native foundation and integration

- **Branch:** `claude/phase4-native-foundation`, worktree `~/Developer/AURA-phase4`.
- **Base:** Codex `codex/phase4-living-universe` at `a22d343ff757b9b59057db4525669ccb098648eb` (M3–M6), verified against `origin` before branching. `origin/main` (`a67cda1`) is an ancestor.
- **Implementation commit:** `94ae238`. This report and the `TASKS.md` update are in the next commit.
- **Not done:** nothing is pushed or merged, and `/Applications/AURA.app` is untouched. Voice work is frozen: no voice code, commands or hardware tests in this phase.
- **Status:** implementation is complete. **M5 in-app validation is pending** (§6): it needs the four world GLBs, which are not on this Mac.

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

### Pending: M5 in-app validation (nothing below is claimed yet)

It needs the four world GLBs with matching digests (§4):

- launch;
- four-room navigation;
- bridge compatibility in WKWebView (`prefs.get` with `world`, and persistence across relaunch);
- asset loading;
- resource cleanup on repeated visits;
- portal-view performance;
- hide, minimize and restore;
- pointer lock (P4-N2) on `http://127.0.0.1` (Debug + Vite) and `aura://` (Release);
- the GitHub/AI/Keychain re-check.

No voice or microphone tests. It will run in a separate development build, backing up the app database first, because a development build shares the `com.aura.app` container. **Real M5 numbers will be reported separately from Codex's software-rendered browser numbers.**

## 7. Security and compatibility

- **No changes** to entitlements, `Info.plist`, CSP, navigation policy, `Security/`, `Services/GitHub/`, `Services/AI/`, `Services/Voice/` or Keychain code. The GitHub read-only permission policy is unchanged.
- **Preferences:** world preferences hold no personal or remote data. Room ids are format-bounded. Nothing new is logged.
- **Astra Lumen II:** the GLB is byte-identical (digest `e9984ddc…`). Its `CREDITS.txt` and the visible CC BY credit are unchanged.
- **World asset licences** are documented by Codex in `FURNITURE_CREDITS.txt`, `CREDITS.txt` and `docs/WORLD_ASSET_INVENTORY.md`. Release builds now enforce their pinned digests.
- **No remote runtime assets:** all world URLs are relative to the bundle.

## 8. Remaining gaps

- **Asset files:** the four world GLBs must be provided before M5 validation and before any Release build.
- **Frontend wiring:** §5, owned by Codex.
- **P4-N2:** pointer-lock behaviour in WKWebView is not yet tested.
- **Draw calls:** Codex's known over-budget cases (Atrium+Hub 75 calls, Gaming+Atrium 72 calls) need native M5 profiling.
- **Voice:** frozen. The Phase 3C-D deferred hardware tests remain open (`PHASE3C_D_REAL_AUDIO.md` §6b).
