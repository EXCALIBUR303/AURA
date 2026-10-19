import Foundation
import Testing
@testable import AuraCore

/// Phase 4 world preferences (P4-N1): defaults for old rows, bounded patches,
/// lenient stored values and a newer schema that is never overwritten.
@Suite @MainActor struct WorldPreferencesTests {
    /// The shape of a real row saved by the installed Phase 3C-D build (no `world` key).
    static let phase3Row = #"""
        {"lastZone":"software","reduceMotion":true,
         "voice":{"enabled":true,"locale":"en-US","synthesisVoiceId":"com.apple.voice.premium.en-US.Ava","autoSpeakReplies":false,"speechRate":0.85,"allowServerRecognition":false},
         "ai":{"defaultProviderId":null,"contextSharing":true,"privateRepositoryContext":"never"},
         "graphics":{"quality":"high","maxPixelRatio":2}}
        """#

    func storeRow(_ services: AppServices, _ json: String) async throws {
        try await services.store.database.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES ('preferences', ?, '2026-10-18T00:00:00Z') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [.text(json)]
        )
    }

    func storedRow(_ services: AppServices) async throws -> JSONValue {
        let json = try #require(try await services.store.database.query("SELECT value FROM kv WHERE key = 'preferences'").first?["value"]?.stringValue)
        return try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
    }

    @Test func preWorldRowGetsDefaultsAndKeepsEverythingElse() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        try await storeRow(services, Self.phase3Row)

        let prefs = try await services.store.loadPreferences()
        #expect(prefs.world == .defaults)
        #expect(prefs.world.presentation == .static, "conservative migration default")
        #expect(prefs.lastZone == .software)
        #expect(prefs.reduceMotion)
        #expect(prefs.voice.synthesisVoiceId == "com.apple.voice.premium.en-US.Ava")
        #expect(prefs.voice.speechRate == 0.85)

        // The first world change keeps every existing section.
        _ = try await call(services, "prefs.update", #"{"world":{"lightingPreset":"night"}}"#)
        let after = try await services.store.loadPreferences()
        #expect(after.world.lightingPreset == .night)
        #expect(after.voice == prefs.voice)
        #expect(after.ai == prefs.ai)
        #expect(after.graphics == prefs.graphics)
        #expect(after.lastZone == .software)
        #expect(after.reduceMotion)
    }

    @Test func worldPatchMergesOneLevelAndClampsIntensity() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        var reply = try await call(services, "prefs.update", #"{"world":{"presentation":"floating","floatIntensity":3,"lastRoomId":"living"}}"#)
        #expect(reply["result"]?["world"]?["presentation"] == .string("floating"))
        #expect(reply["result"]?["world"]?["floatIntensity"] == .number(1))
        #expect(reply["result"]?["world"]?["lightingPreset"] == .string("daylight"), "untouched field kept")
        #expect(reply["result"]?["world"]?["schemaVersion"] == .number(1))

        reply = try await call(services, "prefs.update", #"{"world":{"floatIntensity":-0.5,"cameraMode":"explore"}}"#)
        let world = try await services.store.loadPreferences().world
        #expect(world.floatIntensity == 0)
        #expect(world.cameraMode == .explore)
        #expect(world.presentation == .floating)
        #expect(world.lastRoomId == "living")
        #expect(recorder.names() == ["prefs.changed", "prefs.changed"])
        #expect(recorder.events.last?.payload["world"]?["cameraMode"] == .string("explore"))
    }

    @Test func invalidWorldPatchesAreRejectedWithoutWriting() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        _ = try await call(services, "prefs.update", #"{"world":{"lastRoomId":"gaming"}}"#)
        let tooLong = "a" + String(repeating: "b", count: 48)
        for params in [
            #"{"world":{"presentation":"orbiting"}}"#,
            #"{"world":{"lightingPreset":"noon"}}"#,
            #"{"world":{"cameraMode":"cinematic"}}"#,
            #"{"world":{"floatIntensity":"high"}}"#,
            #"{"world":{"lastRoomId":"Living"}}"#,
            #"{"world":{"lastRoomId":"../studio"}}"#,
            #"{"world":{"lastRoomId":""}}"#,
            #"{"world":{"lastRoomId":"\#(tooLong)"}}"#,
            #"{"lastZone":"github","world":{"lastRoomId":"9lives"}}"#,
        ] {
            let reply = try await call(services, "prefs.update", params)
            #expect(reply["error"]?["code"] == .string("invalid_request"), "\(params)")
        }
        let prefs = try await services.store.loadPreferences()
        #expect(prefs.world.lastRoomId == "gaming")
        #expect(prefs.lastZone == .studio, "a rejected patch writes none of its fields")
        #expect(recorder.names() == ["prefs.changed"])
    }

    @Test func roomIdFormat() {
        for ok in ["atrium", "project-hub", "living", "gaming", "a", "room-2", "a" + String(repeating: "b", count: 47)] {
            #expect(Preferences.World.isValidRoomId(ok), "\(ok)")
        }
        for bad in ["", "Living", "2room", "-hub", "project_hub", "hub.", "ünicode", "a b", "a" + String(repeating: "b", count: 48)] {
            #expect(!Preferences.World.isValidRoomId(bad), "\(bad)")
        }
    }

    @Test func damagedStoredWorldFallsBackFieldByField() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        let row = Self.phase3Row.replacingOccurrences(
            of: #""graphics":{"quality":"high","maxPixelRatio":2}}"#,
            with: #""graphics":{"quality":"high","maxPixelRatio":2},"world":{"presentation":"orbiting","floatIntensity":"x","lightingPreset":"night","cameraMode":7,"lastRoomId":"BAD"}}"#
        )
        try await storeRow(services, row)
        let prefs = try await services.store.loadPreferences()
        #expect(prefs.world == Preferences.World(lightingPreset: .night), "only the valid field survives")
        #expect(prefs.voice.synthesisVoiceId == "com.apple.voice.premium.en-US.Ava", "voice settings are not reset")

        // A row without a version is read as version 1.
        try await storeRow(services, Self.phase3Row.replacingOccurrences(
            of: #""graphics":{"quality":"high","maxPixelRatio":2}}"#,
            with: #""graphics":{"quality":"high","maxPixelRatio":2},"world":{"presentation":"hybrid","floatIntensity":0.5}}"#
        ))
        let unversioned = try await services.store.loadPreferences().world
        #expect(unversioned.schemaVersion == 1)
        #expect(unversioned.presentation == .hybrid)
        #expect(unversioned.floatIntensity == 0.5)
    }

    @Test func newerSchemaIsReportedAndNeverOverwritten() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        let futureWorld = #"{"schemaVersion":2,"presentation":"floating","layouts":{"living":{"chair":[1,0,2]}}}"#
        try await storeRow(services, Self.phase3Row.replacingOccurrences(
            of: #""graphics":{"quality":"high","maxPixelRatio":2}}"#,
            with: #""graphics":{"quality":"high","maxPixelRatio":2},"world":\#(futureWorld)}"#
        ))
        let expectedWorld = try JSONDecoder().decode(JSONValue.self, from: Data(futureWorld.utf8))

        // The page sees the newer version with this build's defaults, so it can stay session-only.
        let got = try await call(services, "prefs.get")
        #expect(got["result"]?["world"]?["schemaVersion"] == .number(2))
        #expect(got["result"]?["world"]?["presentation"] == .string("static"))

        // A world patch is refused...
        let refused = try await call(services, "prefs.update", #"{"world":{"presentation":"hybrid"}}"#)
        #expect(refused["error"]?["code"] == .string("invalid_request"))
        #expect(try await storedRow(services)["world"] == expectedWorld)

        // ...while other changes save normally and leave the newer world values intact.
        let ok = try await call(services, "prefs.update", #"{"lastZone":"github","voice":{"speechRate":0.9}}"#)
        #expect(ok["ok"] == .bool(true))
        let row = try await storedRow(services)
        #expect(row["world"] == expectedWorld)
        #expect(row["lastZone"] == .string("github"))
        #expect(row["voice"]?["speechRate"] == .number(0.9))
        #expect(recorder.names() == ["prefs.changed"])
    }

    @Test func worldPatchDecodesIndependently() throws {
        let patch = try JSONDecoder().decode(PreferencesPatch.self, from: Data(#"{"world":{"presentation":"hybrid"}}"#.utf8))
        #expect(patch.world == PreferencesPatch.World(presentation: .hybrid))
        #expect(patch.voice == nil)
        let next = patch.applied(to: .defaults)
        #expect(next.world.presentation == .hybrid)
        #expect(next.world.floatIntensity == Preferences.World.defaultFloatIntensity)
        #expect(next.voice == Preferences.defaults.voice)
    }
}
