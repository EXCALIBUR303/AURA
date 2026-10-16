import Foundation
import Testing
@testable import AuraCore

// Phase 3A service foundations: AI provider configuration,
// voice session. All fakes; nothing touches the network, Keychain or audio.

// GitHub tests live in GitHubTests.swift (Phase 3B).

// MARK: AI

@Suite struct AIProviderConfigurationTests {
    @Test func endpointsAndIdsAreValidated() {
        func valid(_ endpoint: AIProviderConfiguration.Endpoint, id: String = "p1") -> Bool {
            (try? AIProviderConfiguration(id: id, displayName: "P", endpoint: endpoint, models: []).validate()) != nil
        }
        #expect(valid(.local(URL(string: "http://127.0.0.1:11434")!)))
        #expect(valid(.local(URL(string: "http://localhost:11434")!)))
        #expect(!valid(.local(URL(string: "http://192.168.1.5:11434")!)))
        #expect(valid(.remote(URL(string: "https://api.example.com/v1")!)))
        #expect(!valid(.remote(URL(string: "http://api.example.com/v1")!)))
        #expect(!valid(.local(URL(string: "http://127.0.0.1")!), id: "Bad Id"))
    }

    @Test func remoteProvidersBecomeAvailableOnlyWithAKey() throws {
        let secrets = InMemorySecretStore()
        let credentials = AICredentialStore(secrets: secrets)
        let local = AIProviderConfiguration(id: "ollama", displayName: "Ollama", endpoint: .local(URL(string: "http://127.0.0.1:11434")!), models: ["llama3"])
        let remote = AIProviderConfiguration(id: "cloud", displayName: "Cloud", endpoint: .remote(URL(string: "https://api.example.com")!), models: ["m"])
        let catalog = try AIProviderCatalog(configurations: [local, remote], credentials: credentials)

        #expect(catalog.infos().map(\.available) == [true, false])
        #expect(catalog.infos().map(\.kind) == [.local, .cloud])
        #expect(throws: AuraError.self) { try credentials.saveKey("   ", for: remote) }
        try credentials.saveKey(" sk-test \n", for: remote)
        #expect(try secrets.read(.aiProviderKey("cloud")) == "sk-test")
        #expect(catalog.infos().map(\.available) == [true, true])
        try credentials.deleteKey(for: remote)
        #expect(catalog.infos().map(\.available) == [true, false])

        #expect(throws: AuraError.self) { try AIProviderCatalog(configurations: [local, local], credentials: credentials) }
    }

    struct FailingProvider: AIProvider {
        let info = AIProviderInfo(id: "failing", displayName: "Failing", kind: .local, available: true, models: [])
        func stream(messages: [ChatMessage], model: String?) -> AsyncThrowingStream<String, Error> {
            AsyncThrowingStream { $0.finish(throwing: AuraError.unavailable("runtime not running")) }
        }
    }

    @Test @MainActor func providerFailuresAndCancellationBecomeEvents() async throws {
        let recorder = EventRecorder()
        let events = BridgeEventEmitter(deliver: { recorder.record($0) })
        let service = AIService(providers: [FailingProvider(), MockAIProvider(interval: .milliseconds(50))], defaultProviderId: "failing", events: events)
        let message = [ChatMessage(role: .user, content: "hi")]

        _ = try service.startChat(ChatParams(messages: message, providerId: "failing", model: nil))
        try await Task.sleep(for: .milliseconds(50))
        #expect(recorder.names() == ["ai.error"])
        #expect(recorder.events.last?.payload["error"]?["code"] == .string("unavailable"))

        let ref = try service.startChat(ChatParams(messages: message, providerId: "mock", model: nil))
        service.cancel(ref.streamId)
        try await Task.sleep(for: .milliseconds(100))
        #expect(recorder.names().last == "ai.done")
        #expect(recorder.events.last?.payload["finishReason"] == .string("cancelled"))
        #expect(!recorder.names().contains("ai.chunk"))
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
