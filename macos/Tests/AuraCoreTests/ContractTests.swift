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
             "voice":{"enabled":true,"locale":"en-US","synthesisVoiceId":null,"autoSpeakReplies":false,"speechRate":0.85,"allowServerRecognition":false},
             "ai":{"defaultProviderId":null,"contextSharing":true,"privateRepositoryContext":"never"},
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
                case .githubListRepositories: _ = try params.decode(ListRepositoriesParams.self)
                case .githubGetRepository: _ = try params.decode(RepositoryRef.self)
                case .githubListBranches: _ = try params.decode(ListBranchesParams.self)
                case .aiChat: _ = try params.decode(ChatParams.self)
                case .aiStartConversation: _ = try params.decode(StartConversationParams.self)
                case .aiSendMessage: _ = try params.decode(SendMessageParams.self)
                case .aiRespondToApproval: _ = try params.decode(RespondToApprovalParams.self)
                case .aiSetConversationRepository: _ = try params.decode(SetConversationRepositoryParams.self)
                case .aiGetConversation, .aiResetConversation, .aiEndConversation: _ = try params.decode(ConversationRef.self)
                case .githubListFiles: _ = try params.decode(ListFilesParams.self)
                case .aiSaveProvider: try roundTrips(params, as: AIProviderSettings.self, fixture.name)
                case .voiceSpeak: _ = try params.decode(SpeakParams.self)
                case .voiceStartSession: _ = try params.decode(StartVoiceSessionParams.self)
                case .voiceStartListening: _ = try params.decode(StartListeningParams.self)
                case .voiceSpeakReply: _ = try params.decode(SpeakReplyParams.self)
                case .voiceSetOutputMuted: _ = try params.decode(SetOutputMutedParams.self)
                case .voiceListVoices: _ = try params.decode(ListVoicesParams.self)
                case .voiceOpenSettings: _ = try params.decode(OpenVoiceSettingsParams.self)
                default: _ = try params.decode(Empty.self)
                }
            case .string("response"):
                if fixture.message["ok"] == .bool(false) {
                    _ = try #require(fixture.message["error"]).decode(BridgeError.self)
                } else if fixture.name.hasSuffix("app.getInfo") {
                    _ = try #require(fixture.message["result"]).decode(AppInfo.self)
                } else if fixture.name.hasSuffix("app.getWindowState") {
                    _ = try #require(fixture.message["result"]).decode(WindowState.self)
                } else if fixture.name.contains("github.authStatus") {
                    try roundTrips(try #require(fixture.message["result"]), as: GitHubAuthStatus.self, fixture.name)
                } else if fixture.name.hasSuffix("github.getRepository") {
                    try roundTrips(try #require(fixture.message["result"]), as: RepositoryDetail.self, fixture.name)
                } else if fixture.name.hasSuffix("github.listRepositories") {
                    try roundTrips(try #require(fixture.message["result"]), as: Page<RepositorySummary>.self, fixture.name)
                } else if fixture.name.hasSuffix("github.listBranches") {
                    try roundTrips(try #require(fixture.message["result"]), as: Page<BranchSummary>.self, fixture.name)
                } else if fixture.name.hasSuffix("github.listCommits") {
                    try roundTrips(try #require(fixture.message["result"]), as: [CommitSummary].self, fixture.name)
                } else if fixture.name.hasSuffix("ai.listProviders") {
                    try roundTrips(try #require(fixture.message["result"]), as: [AIProviderInfo].self, fixture.name)
                } else if fixture.name.hasSuffix("ai.previewContext") {
                    try roundTrips(try #require(fixture.message["result"]), as: AIContextSnapshot.self, fixture.name)
                } else if fixture.name.hasSuffix("ai.startConversation") {
                    try roundTrips(try #require(fixture.message["result"]), as: AIConversationInfo.self, fixture.name)
                } else if fixture.name.hasSuffix("ai.getConversation") {
                    try roundTrips(try #require(fixture.message["result"]), as: AIConversationDetail.self, fixture.name)
                } else if fixture.name.hasSuffix("github.listFiles") {
                    try roundTrips(try #require(fixture.message["result"]), as: RepositoryTree.self, fixture.name)
                } else if fixture.name.hasSuffix("voice.getStatus") || fixture.name.hasSuffix("voice.startListening") {
                    try roundTrips(try #require(fixture.message["result"]), as: VoiceStatus.self, fixture.name)
                } else if fixture.name.hasSuffix("voice.getCapabilities") {
                    try roundTrips(try #require(fixture.message["result"]), as: VoiceCapabilities.self, fixture.name)
                } else if fixture.name.hasSuffix("voice.listVoices") {
                    try roundTrips(try #require(fixture.message["result"]), as: [VoiceOption].self, fixture.name)
                } else if fixture.name.hasSuffix("projects.suggestZones") {
                    try roundTrips(try #require(fixture.message["result"]), as: [ProjectZoneSuggestion].self, fixture.name)
                }
            case .string("event"):
                let payload = try #require(fixture.message["payload"])
                switch fixture.message["event"] {
                case .string("app.command"): _ = try payload.decode(AppCommand.self)
                case .string("app.windowStateChanged"): _ = try payload.decode(WindowState.self)
                case .string("ai.chunk"): try roundTrips(payload, as: AIChunkPayload.self, fixture.name)
                case .string("ai.done"): try roundTrips(payload, as: AIDonePayload.self, fixture.name)
                case .string("ai.error"): try roundTrips(payload, as: AIErrorPayload.self, fixture.name)
                case .string("ai.providersChanged"): try roundTrips(payload, as: [AIProviderInfo].self, fixture.name)
                case .string("ai.turnState"): try roundTrips(payload, as: AITurnStatePayload.self, fixture.name)
                case .string("ai.toolActivity"): try roundTrips(payload, as: AIToolActivityPayload.self, fixture.name)
                case .string("ai.approvalRequested"): try roundTrips(payload, as: AIApprovalRequestedPayload.self, fixture.name)
                case .string("ai.conversationChanged"): try roundTrips(payload, as: AIConversationChangedPayload.self, fixture.name)
                case .string("github.authChanged"): try roundTrips(payload, as: GitHubAuthStatus.self, fixture.name)
                case .string("voice.statusChanged"): try roundTrips(payload, as: VoiceStatus.self, fixture.name)
                case .string("voice.capabilitiesChanged"): try roundTrips(payload, as: VoiceCapabilities.self, fixture.name)
                case .string("voice.transcript"): try roundTrips(payload, as: VoiceTranscriptPayload.self, fixture.name)
                case .string("voice.inputLevel"): try roundTrips(payload, as: VoiceInputLevelPayload.self, fixture.name)
                case .string("voice.speechLevel"): try roundTrips(payload, as: VoiceSpeechLevelPayload.self, fixture.name)
                case .string("voice.speechProgress"): try roundTrips(payload, as: VoiceSpeechProgressPayload.self, fixture.name)
                default: Issue.record("unhandled event fixture \(fixture.name)")
                }
            default:
                Issue.record("unknown kind in \(fixture.name)")
            }
        }
    }

    /// Decodes into the Swift type and re-encodes to the identical JSON, so
    /// field names and explicit nulls match the TypeScript shape exactly.
    func roundTrips<T: Codable>(_ value: JSONValue, as type: T.Type, _ name: String) throws {
        let decoded = try value.decode(T.self)
        #expect(try JSONValue(encoding: decoded) == value, "\(name)")
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
