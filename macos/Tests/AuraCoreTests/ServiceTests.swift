import Foundation
import Testing
@testable import AuraCore

@Suite @MainActor struct ServiceTests {
    @Test func appInfoReportsMacHost() async throws {
        let reply = try await call(try await makeServices(recorder: EventRecorder()), "app.getInfo")
        #expect(reply["ok"] == .bool(true))
        #expect(reply["result"]?["host"] == .string("macos"))
        #expect(reply["result"]?["bridgeVersion"] == .number(1))
    }

    @Test func windowStateIsQueryableAndEmittedOnlyOnChange() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        var reply = try await call(services, "app.getWindowState")
        #expect(reply["result"] == .object(["active": .bool(true), "visible": .bool(true)]))

        services.windowState.update(WindowState(active: true, visible: true))
        #expect(recorder.names().isEmpty)

        // Visible but inactive: the new event, plus the deprecated one because `active` flipped.
        services.windowState.update(WindowState(active: false, visible: true))
        #expect(recorder.names() == ["app.windowStateChanged", "app.activeChanged"])
        #expect(recorder.events[0].payload == .object(["active": .bool(false), "visible": .bool(true)]))

        // Only visibility changes: no deprecated event.
        services.windowState.update(WindowState(active: false, visible: false))
        #expect(recorder.names() == ["app.windowStateChanged", "app.activeChanged", "app.windowStateChanged"])

        reply = try await call(services, "app.getWindowState")
        #expect(reply["result"] == .object(["active": .bool(false), "visible": .bool(false)]))
    }

    @Test func preferencesPersistAndEmitChange() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        let reply = try await call(services, "prefs.update", #"{"lastZone":"ai-lab","graphics":{"quality":"low"},"voice":{"synthesisVoiceId":"com.apple.voice.x"}}"#)
        #expect(reply["result"]?["lastZone"] == .string("ai-lab"))
        #expect(reply["result"]?["graphics"]?["maxPixelRatio"] == .number(2))

        let stored = try await services.store.loadPreferences()
        #expect(stored.lastZone == .aiLab)
        #expect(stored.graphics.quality == .low)
        #expect(stored.voice.synthesisVoiceId == "com.apple.voice.x")
        #expect(recorder.names() == ["prefs.changed"])

        // Explicit null clears; absent key leaves unchanged.
        _ = try await call(services, "prefs.update", #"{"voice":{"synthesisVoiceId":null}}"#)
        #expect(try await services.store.loadPreferences().voice.synthesisVoiceId == nil)
        #expect(try await services.store.loadPreferences().graphics.quality == .low)
    }

    @Test func preferenceChangesReachNativeObserver() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        var seen: [ZoneID] = []
        services.preferencesDidChange = { seen.append($0.lastZone) }
        _ = try await call(services, "prefs.update", #"{"lastZone":"software"}"#)
        _ = try await call(services, "prefs.update", #"{"lastZone":"bogus"}"#)
        #expect(seen == [.software])
    }

    @Test func projectsUpsertAndValidate() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        _ = try await call(services, "projects.update", #"{"id":"mock-user/sample-web-app","zone":"software","pinned":true}"#)
        _ = try await call(services, "projects.update", #"{"id":"mock-user/sample-web-app","notes":"hello"}"#)
        let list = try await services.store.listProjects()
        #expect(list.count == 1)
        #expect(list.first?.zone == .software)
        #expect(list.first?.pinned == true)
        #expect(list.first?.notes == "hello")

        let bad = try await call(services, "projects.update", #"{"id":"not-a-repo-id"}"#)
        #expect(bad["error"]?["code"] == .string("invalid_request"))
    }

    @Test func githubMockErrorsAreTyped() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        let ok = try await call(services, "github.listRepositories", #"{"perPage":2}"#)
        if case .array(let items)? = ok["result"]?["items"] { #expect(items.count == 2) } else { Issue.record("no items") }
        let missing = try await call(services, "github.listCommits", #"{"fullName":"nobody/nothing"}"#)
        #expect(missing["error"]?["code"] == .string("not_found"))
    }

    @Test func aiChatStreamsEvents() async throws {
        let recorder = EventRecorder()
        let services = try await makeServices(recorder: recorder)
        let reply = try await call(services, "ai.chat", #"{"messages":[{"role":"user","content":"ping"}]}"#)
        #expect(reply["result"]?["streamId"] != nil)
        for _ in 0..<200 where !recorder.names().contains("ai.done") {
            try await Task.sleep(for: .milliseconds(5))
        }
        let text = recorder.events.filter { $0.name == "ai.chunk" }.compactMap { event -> String? in
            if case .string(let delta)? = event.payload["delta"] { return delta } else { return nil }
        }.joined()
        #expect(text == "[mock] You said: ping")
        #expect(recorder.events.last?.payload["finishReason"] == .string("stop"))
    }

    @Test func aiChatRejectsEmptyMessages() async throws {
        let reply = try await call(try await makeServices(recorder: EventRecorder()), "ai.chat", #"{"messages":[]}"#)
        #expect(reply["error"]?["code"] == .string("invalid_request"))
    }

    @Test func voiceIsExplicitlyUnavailable() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        let status = try await call(services, "voice.getStatus")
        #expect(status["result"]?["microphone"] == .string("not_determined"))
        let speak = try await call(services, "voice.speak", #"{"text":"hi"}"#)
        #expect(speak["error"]?["code"] == .string("unavailable"))
    }
}

@Suite struct InfrastructureTests {
    @Test func devServerMustBeLoopback() throws {
        #expect(throws: AppConfiguration.ConfigurationError.self) {
            try AppConfiguration.load(environment: ["AURA_DEV_SERVER_URL": "http://example.com:5173"])
        }
        #expect(throws: AppConfiguration.ConfigurationError.self) {
            try AppConfiguration.load(environment: ["AURA_DEV_SERVER_URL": "https://127.0.0.1:5173"])
        }
        let config = try AppConfiguration.load(environment: ["AURA_DEV_SERVER_URL": "http://127.0.0.1:5173", "AURA_DATA_DIR": "/tmp/aura-test"])
        #expect(config.environment == .development)
        #expect(config.dataDirectory.path == "/tmp/aura-test")
    }

    @Test func migrationsAreIdempotent() async throws {
        let database = try Database(path: ":memory:")
        try await database.migrate(AppStore.migrations)
        try await database.migrate(AppStore.migrations)
        #expect(try await database.userVersion() == 1)
    }

    @Test func secretStoreContract() throws {
        let store = InMemorySecretStore()
        #expect(try store.read(.githubToken) == nil)
        try store.write("x", for: .githubToken)
        #expect(try store.read(.githubToken) == "x")
        try store.delete(.githubToken)
        #expect(try store.read(.githubToken) == nil)
    }

    @Test func unexpectedErrorsDoNotLeakDetails() {
        struct Secretive: Error { let token = "ghp_should_not_leak" }
        let mapped = BridgeError(Secretive())
        #expect(mapped.code == .internal)
        #expect(!mapped.message.contains("ghp_"))
    }
}
