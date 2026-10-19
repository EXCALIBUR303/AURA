# World preferences integration after the native branch is approved

M7 deliberately does not merge or copy Claude's shared contracts. The fetched source
of truth is `claude/phase4-native-foundation` at
`694726313c85e48cfea26c693944c14edc67b768`, particularly
`docs/PHASE4_NATIVE_INTEGRATION.md` §3 and §5. That branch descends from the M6
baseline `a22d343ff757b9b59057db4525669ccb098648eb`.

**Current behavior remains session-only.** No `world` payload is sent through the
older Codex-branch bridge. No new native types, casts around bridge typing, storage,
methods or permissions were introduced. Room options stay session-only even after
P4-N1 integration. No voice work is part of this integration.

## Prepared frontend boundary

`WorldController.restoreWorld(settings, room, mode)` accepts the existing frontend
`WorldSettings`, a registry room string and `inspect`/`explore`. It rejects an
unsupported settings version, falls back to Project Hub for an unknown/unavailable
room, loads before placing the camera, restores Explore without capture, and emits
no user-change intent. The native adapter must check the host schema version before
calling it. It must not replace an explicit user navigation with a late launch read.

`subscribeUserChanges(listener)` emits these existing frontend values:

- `settings`: an actual user settings change, not a no-op or a restore. The adapter
  maps presentation, intensity and lighting to the host-owned type; it maps motion
  reduction to the existing top-level preference, never `world.reduceMotion`.
- `camera`: only an explicit `inspect`/`explore` choice. Travel and passive
  deactivation do not save cinematic mode or overwrite the user's camera choice.
- `room`: after a successful arrival changes the room, or after a loaded door is
  crossed. No room intent during preparation, cancellation, error or restore.

These are frontend events, not a second wire contract. Existing unit tests cover
schema fallback, no echo on restore, explicit intent boundaries and settled arrival.

## Wiring still required on the integrated branch

1. Use Claude's actual exported `WorldPreferences` / `WORLD_PREFERENCES_VERSION` and
   `PreferencesPatch` after owner-approved integration. Read through the existing
   typed bridge and subscribe with `useBridgeEvent("prefs.changed", ...)`.
2. Coordinate initial loading with `useStudio`'s existing preferences request and
   App's workspace focus effect. Restore the saved room only once, and only if no
   user/native workspace navigation has superseded that read. Keep `lastZone` and
   Cmd+1–6 behavior independent; an explicit workspace command returns to the Hub.
3. Check `world.schemaVersion` before mapping to the frontend settings. Failed read,
   missing support or a newer schema keeps session-only copy and sends no world
   writes. For settings-only external changes, apply without a new travel or save
   echo; for a different room, restore through the checked controller path.
4. Queue typed `prefs.update` calls, debounce float changes about 300 ms, and write
   only changed fields. Do not send `schemaVersion`, room options, or cinematic mode.
   On `invalid_request`, re-read `prefs.get`, reconcile to the authoritative values
   without saving them back, and handle a newer schema as session-only.
5. Mark settings as saved only while the bridge persistence path is functioning.
   Keep room-options copy explicitly session-only. Do not use localStorage.
6. Add integrated mock and native tests for relaunch, invalid room, newer schema,
   save failure, debounce, concurrent `prefs.changed`, slow launch vs navigation,
   and top-level Reduce Motion. Re-run Claude's migration/parity/security suites.

The M7 frontend hooks are preparation, not proof that persistent settings are wired
or tested in AURA.app. The user explicitly deferred merging/cherry-picking Claude's
changes during M7.
