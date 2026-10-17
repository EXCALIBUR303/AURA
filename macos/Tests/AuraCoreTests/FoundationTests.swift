import Foundation
import Testing
@testable import AuraCore

// Phase 3A service foundations: AI provider configuration,
// voice session. All fakes; nothing touches the network, Keychain or audio.

// GitHub tests live in GitHubTests.swift (Phase 3B).

// MARK: AI

// Phase 3C-A replaced the Phase 3A AI catalog; see AITests.swift.

@Suite struct AIProviderConfigurationTests {
    func settings(_ baseUrl: String, id: String = "p1", models: [String] = ["m"], defaultModel: String? = nil) -> AIProviderSettings {
        AIProviderSettings(id: id, displayName: "P", baseUrl: baseUrl, models: models, defaultModel: defaultModel)
    }

    func valid(_ settings: AIProviderSettings) -> Bool { (try? AIProviderConfiguration(settings)) != nil }

    @Test func endpointsAndIdsAreValidated() throws {
        #expect(try AIProviderConfiguration(settings("http://127.0.0.1:11434/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("http://localhost:1234/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("http://[::1]:8080/v1")).kind == .local)
        #expect(try AIProviderConfiguration(settings("https://api.example.com/v1")).kind == .cloud)
        #expect(!valid(settings("http://192.168.1.5:11434/v1")))     // LAN over http
        #expect(!valid(settings("http://api.example.com/v1")))       // remote over http
        #expect(!valid(settings("https://user:pw@api.example.com/v1")))
        #expect(!valid(settings("https://api.example.com/v1?key=x")))
        #expect(!valid(settings("https://api.example.com/v1#x")))
        #expect(!valid(settings("ftp://api.example.com")))
        #expect(!valid(settings("https://api.example.com/v1", id: "Bad Id")))
        #expect(!valid(settings("https://api.example.com/v1", models: [])))
        #expect(!valid(settings("https://api.example.com/v1", models: ["a b"])))
        #expect(!valid(settings("https://api.example.com/v1", models: ["m"], defaultModel: "other")))
        #expect(valid(settings("https://api.example.com/v1", models: ["openai/gpt-x", "llama3.2:latest"])))
    }

    @Test func keysAreTrimmedAndValidated() throws {
        let secrets = InMemorySecretStore()
        let credentials = AICredentialStore(secrets: secrets)
        let remote = try AIProviderConfiguration(settings("https://api.example.com/v1", id: "cloud"))
        #expect(throws: AuraError.self) { try credentials.saveKey("   ", for: remote) }
        #expect(throws: AuraError.self) { try credentials.saveKey("sk-with space", for: remote) }
        try credentials.saveKey(" sk-test \n", for: remote)
        #expect(try secrets.read(.aiProviderKey("cloud")) == "sk-test")
        #expect(credentials.hasKey(for: remote))
        try credentials.deleteKey(for: remote)
        #expect(!credentials.hasKey(for: remote))
    }
}

// MARK: Voice

final class FakeVoicePermissions: VoicePermissions, @unchecked Sendable {
    var current: VoicePermissionStatus = (.notDetermined, .notDetermined)
    var afterRequest: VoicePermissionStatus = (.granted, .granted)
    func status() -> VoicePermissionStatus { current }
    func request() async -> VoicePermissionStatus { current = afterRequest; return current }
}

/// Hands each started stream's continuation to the test.
final class FakeSpeech: SpeechInput, SpeechOutput, @unchecked Sendable {
    var transcriptContinuation: AsyncThrowingStream<Transcript, Error>.Continuation?
    var levelContinuation: AsyncThrowingStream<Double, Error>.Continuation?
    var spoken: [String] = []

    func transcripts(locale: String) -> AsyncThrowingStream<Transcript, Error> {
        let (stream, continuation) = AsyncThrowingStream<Transcript, Error>.makeStream()
        transcriptContinuation = continuation
        return stream
    }

    func speak(_ text: String, voiceId: String?, locale: String) -> AsyncThrowingStream<Double, Error> {
        spoken.append(text)
        let (stream, continuation) = AsyncThrowingStream<Double, Error>.makeStream()
        levelContinuation = continuation
        return stream
    }
}

@Suite @MainActor struct VoiceSessionTests {
    func make(granted: Bool = true) -> (VoiceSession, FakeSpeech, FakeVoicePermissions) {
        let permissions = FakeVoicePermissions()
        if granted { permissions.current = (.granted, .granted) }
        let speech = FakeSpeech()
        return (VoiceSession(permissions: permissions, input: speech, output: speech, locale: "en-US"), speech, permissions)
    }

    @Test func listeningNeedsBothPermissions() async throws {
        let (session, _, permissions) = make(granted: false)
        #expect(throws: AuraError.permissionDenied("microphone and speech recognition access are required")) { try session.startListening() }
        permissions.afterRequest = (.granted, .denied)
        let status = await session.requestPermissions()
        #expect(status.microphone == .granted && status.speechRecognition == .denied)
        #expect(throws: AuraError.self) { try session.startListening() }
    }

    @Test func transcriptsFlowAndAFinalResultEndsListening() async throws {
        let (session, speech, _) = make()
        var transcripts: [Transcript] = []
        var statuses: [VoiceStatus] = []
        session.onTranscript = { transcripts.append($0) }
        session.onStatus = { statuses.append($0) }
        try session.startListening()
        #expect(session.status.listening)
        speech.transcriptContinuation?.yield(Transcript(text: "hel", isFinal: false))
        speech.transcriptContinuation?.yield(Transcript(text: "hello", isFinal: true))
        speech.transcriptContinuation?.finish()
        await session.settle()
        #expect(transcripts.map(\.text) == ["hel", "hello"])
        #expect(!session.status.listening)
        #expect(statuses.map(\.listening) == [true, false])
    }

    @Test func listeningInterruptsSpeechAndSpeakingStopsListening() async throws {
        let (session, speech, _) = make()
        var levels: [Double] = []
        session.onSpeechLevel = { levels.append($0) }

        try session.speak("Hello there")
        #expect(session.status.speaking)
        try session.startListening() // barge-in
        #expect(!session.status.speaking && session.status.listening)
        #expect(levels.last == 0)

        try session.speak("Answer")
        #expect(session.status.speaking && !session.status.listening)
        #expect(throws: AuraError.invalidRequest("already speaking")) { try session.speak("Again", interrupt: false) }
        #expect(speech.spoken == ["Hello there", "Answer"])

        speech.levelContinuation?.yield(0.4)
        speech.levelContinuation?.finish()
        await session.settle()
        #expect(!session.status.speaking)
        #expect(levels.suffix(2) == [0.4, 0])
    }

    @Test func interruptionsStopEverything() throws {
        let (session, _, _) = make()
        try session.startListening()
        session.handle(.appInactive)
        #expect(!session.status.listening && !session.status.speaking)
        try session.speak("Hi")
        session.handle(.audioRouteChanged)
        #expect(!session.status.speaking)
    }

    @Test func recognitionErrorsAreReportedAndEndListening() async throws {
        let (session, speech, _) = make()
        var errors: [BridgeError] = []
        session.onError = { errors.append($0) }
        try session.startListening()
        speech.transcriptContinuation?.finish(throwing: AuraError.network("speech service unavailable"))
        await session.settle()
        #expect(errors.map(\.code) == [.network])
        #expect(!session.status.listening)
    }
}
