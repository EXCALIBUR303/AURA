import Foundation
import Testing
@testable import AuraCore

/// Keeps the Swift mirror and the TypeScript source of truth in lockstep.
@Suite struct ContractParityTests {
    /// Extracts `"x.y": {` / `"x.y":` keys from an interface body in a .ts file.
    private func keys(in file: String, interface: String) throws -> Set<String> {
        let source = try Repo.text(file)
        let start = try #require(source.range(of: "export interface \(interface) {"))
        let rest = source[start.upperBound...]
        let block = String(rest[..<(rest.range(of: "\n}")?.lowerBound ?? rest.endIndex)])
        let regex = /\n\s*"([a-z]+\.[A-Za-z]+)":/
        return Set(block.matches(of: regex).map { String($0.1) })
    }

    @Test func methodNamesMatchTypeScript() throws {
        let ts = try keys(in: "shared/contracts/methods.ts", interface: "BridgeMethods")
        #expect(!ts.isEmpty)
        #expect(Set(BridgeMethod.allCases.map(\.rawValue)) == ts)
    }

    @Test func eventNamesMatchTypeScript() throws {
        let ts = try keys(in: "shared/contracts/events.ts", interface: "BridgeEvents")
        #expect(!ts.isEmpty)
        #expect(Set(BridgeEventName.allCases.map(\.rawValue)) == ts)
    }

    @Test func errorCodesMatchTypeScript() throws {
        let source = try Repo.text("shared/contracts/errors.ts")
        let ts = Set(source.matches(of: /^\s*"([a-z_]+)",/.anchorsMatchLineEndings()).map { String($0.1) })
        #expect(Set(BridgeErrorCode.allCases.map(\.rawValue)) == ts)
    }

    @Test func zoneIdsMatchTypeScript() throws {
        let source = try Repo.text("shared/contracts/domain.ts")
        let block = try #require(source.firstMatch(of: /ZONE_IDS = \[([^\]]*)\]/)).1
        let ts = block.matches(of: /"([a-z-]+)"/).map { String($0.1) }
        #expect(ZoneID.allCases.map(\.rawValue) == ts)
    }

    @Test @MainActor func everyMethodHasAHandler() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        #expect(services.router.registeredMethods == Set(BridgeMethod.allCases))
    }

    @Test func defaultPreferencesEncodeLikeTheMock() throws {
        let encoded = try JSONValue(encoding: Preferences.defaults)
        let expected = try JSONDecoder().decode(JSONValue.self, from: Data(#"""
            {"lastZone":"studio","reduceMotion":false,
             "voice":{"enabled":true,"locale":"en-US","synthesisVoiceId":null},
             "ai":{"defaultProviderId":null},
             "graphics":{"quality":"high","maxPixelRatio":2}}
            """#.utf8))
        #expect(encoded == expected)
    }
}

@Suite struct FixtureTests {
    @Test func validFixturesDecodeIntoTypedSwift() throws {
        let fixtures = try Fixtures.load()
        #expect(fixtures.valid.count >= 10)
        for fixture in fixtures.valid {
            let data = try BridgeCoding.encoder.encode(fixture.message)
            switch fixture.message["kind"] {
            case .string("request"):
                let request = try BridgeCoding.decoder.decode(BridgeRequestEnvelope.self, from: data)
                let method = try #require(BridgeMethod(rawValue: request.method), "\(fixture.name)")
                let params = request.params ?? .object([:])
                switch method {
                case .prefsUpdate: _ = try params.decode(PreferencesPatch.self)
                case .githubListCommits: _ = try params.decode(ListCommitsParams.self)
                case .aiChat: _ = try params.decode(ChatParams.self)
                case .voiceSpeak: _ = try params.decode(SpeakParams.self)
                default: _ = try params.decode(Empty.self)
                }
            case .string("response"):
                if fixture.message["ok"] == .bool(false) {
                    _ = try #require(fixture.message["error"]).decode(BridgeError.self)
                } else if fixture.name.hasSuffix("app.getInfo") {
                    _ = try #require(fixture.message["result"]).decode(AppInfo.self)
                }
            case .string("event"):
                let payload = try #require(fixture.message["payload"])
                switch fixture.message["event"] {
                case .string("app.command"): _ = try payload.decode(AppCommand.self)
                case .string("ai.chunk"): _ = try payload.decode(AIChunkPayload.self)
                case .string("voice.statusChanged"): _ = try payload.decode(VoiceStatus.self)
                default: Issue.record("unhandled event fixture \(fixture.name)")
                }
            default:
                Issue.record("unknown kind in \(fixture.name)")
            }
        }
    }

    @Test @MainActor func invalidRequestsMapToExpectedCodes() async throws {
        let services = try await makeServices(recorder: EventRecorder())
        for fixture in try Fixtures.load().invalidRequests {
            let reply = try JSONDecoder().decode(JSONValue.self, from: Data(await services.router.handle(fixture.json).utf8))
            #expect(reply["ok"] == .bool(false), "\(fixture.name)")
            #expect(reply["error"]?["code"] == .string(fixture.expectedCode), "\(fixture.name)")
        }
    }
}
