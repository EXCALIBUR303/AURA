import Foundation
import Testing
@testable import AuraCore

// Phase 3A service foundations: GitHub connection, AI provider configuration,
// voice session. All fakes; nothing touches the network, Keychain or audio.

// MARK: GitHub

/// Scripted authenticator. `pollGate`, when set, holds pollForToken until opened.
final class FakeGitHubAuthenticator: GitHubAuthenticator, @unchecked Sendable {
    var startError: AuraError?
    var pollError: AuraError?
    var accountResult: Result<GitHubAccount, AuraError> = .success(GitHubAccount(login: "octo", scopes: ["repo"]))
    var pollDelay: Duration = .zero

    func startDeviceAuthorization(scopes: [String]) async throws -> DeviceAuthorizationGrant {
        if let startError { throw startError }
        let display = DeviceAuthorization(userCode: "ABCD-1234", verificationURL: URL(string: "https://github.com/login/device")!, expiresAt: .distantFuture)
        return DeviceAuthorizationGrant(deviceCode: "device-code", display: display, pollInterval: .seconds(5))
    }

    func pollForToken(_ grant: DeviceAuthorizationGrant) async throws -> GitHubToken {
        try await Task.sleep(for: pollDelay)
        if let pollError { throw pollError }
        return GitHubToken("gho_test")
    }

    func account(for token: GitHubToken) async throws -> GitHubAccount { try accountResult.get() }
}

@Suite @MainActor struct GitHubConnectionTests {
    func make(_ auth: FakeGitHubAuthenticator, secrets: InMemorySecretStore = InMemorySecretStore()) -> (GitHubConnectionManager, InMemorySecretStore, () -> [GitHubConnectionState]) {
        let manager = GitHubConnectionManager(authenticator: auth, credentials: GitHubCredentialStore(secrets: secrets), requiredScopes: ["repo"])
        var states: [GitHubConnectionState] = []
        manager.onChange = { states.append($0) }
        return (manager, secrets, { states })
    }

    @Test func connectStoresTokenAndReportsAccount() async throws {
        let (manager, secrets, states) = make(FakeGitHubAuthenticator())
        manager.connect()
        await manager.waitForConnect()
        guard case .authorizing(let display) = states().first else { Issue.record("no authorizing state"); return }
        #expect(display.userCode == "ABCD-1234")
        #expect(manager.state == .connected(GitHubAccount(login: "octo", scopes: ["repo"])))
        #expect(manager.state.authStatus == .signedIn(login: "octo", scopes: ["repo"]))
        #expect(try secrets.read(.githubToken) == "gho_test")
    }

    @Test func declineAndExpiryAreDistinctFailures() async throws {
        let auth = FakeGitHubAuthenticator()
        auth.pollError = .permissionDenied("declined")
        let (manager, secrets, _) = make(auth)
        manager.connect()
        await manager.waitForConnect()
        #expect(manager.state == .failed(.denied))
        #expect(try secrets.read(.githubToken) == nil)

        auth.pollError = .timeout
        manager.connect()
        await manager.waitForConnect()
        #expect(manager.state == .failed(.expired))
    }

    @Test func missingScopesFailWithoutStoringToken() async throws {
        let auth = FakeGitHubAuthenticator()
        auth.accountResult = .success(GitHubAccount(login: "octo", scopes: ["read:user"]))
        let (manager, secrets, _) = make(auth)
        manager.connect()
        await manager.waitForConnect()
        #expect(manager.state == .failed(.insufficientScopes(missing: ["repo"])))
        #expect(manager.state.authStatus == .signedOut)
        #expect(try secrets.read(.githubToken) == nil)
    }

    @Test func disconnectDuringAuthorizationWins() async throws {
        let auth = FakeGitHubAuthenticator()
        auth.pollDelay = .milliseconds(200)
        let (manager, secrets, _) = make(auth)
        manager.connect()
        while true {
            if case .authorizing = manager.state { break }
            await Task.yield()
        }
        manager.disconnect()
        await manager.waitForConnect()
        try await Task.sleep(for: .milliseconds(250))
        #expect(manager.state == .disconnected)
        #expect(try secrets.read(.githubToken) == nil)
    }

    @Test func restoreDeletesRejectedTokenButKeepsItWhenOffline() async throws {
        let auth = FakeGitHubAuthenticator()
        let secrets = InMemorySecretStore([.githubToken: "gho_old"])
        auth.accountResult = .failure(.network("offline"))
        let (manager, _, _) = make(auth, secrets: secrets)
        await manager.restore()
        #expect(manager.state == .failed(.unavailable("offline")))
        #expect(try secrets.read(.githubToken) == "gho_old")

        auth.accountResult = .failure(.notAuthenticated("revoked"))
        await manager.restore()
        #expect(manager.state == .failed(.revoked))
        #expect(try secrets.read(.githubToken) == nil)
    }

    @Test func unconfiguredAuthenticatorReportsUnavailable() async {
        let manager = GitHubConnectionManager(
            authenticator: UnconfiguredGitHubAuthenticator(),
            credentials: GitHubCredentialStore(secrets: InMemorySecretStore()), requiredScopes: []
        )
        manager.connect()
        await manager.waitForConnect()
        guard case .failed(.unavailable) = manager.state else { Issue.record("expected unavailable, got \(manager.state)"); return }
    }

    @Test nonisolated func httpStatusesMapToBridgeErrors() {
        #expect(gitHubError(status: 200, rateLimitRemaining: 10, retryAfterSeconds: nil) == nil)
        #expect(gitHubError(status: 401, rateLimitRemaining: nil, retryAfterSeconds: nil)?.bridgeError.code == .notAuthenticated)
        #expect(gitHubError(status: 403, rateLimitRemaining: 0, retryAfterSeconds: nil) == .rateLimited(retryAfterSeconds: nil))
        #expect(gitHubError(status: 429, rateLimitRemaining: nil, retryAfterSeconds: 30) == .rateLimited(retryAfterSeconds: 30))
        #expect(gitHubError(status: 403, rateLimitRemaining: 4000, retryAfterSeconds: nil)?.bridgeError.code == .permissionDenied)
        #expect(gitHubError(status: 404, rateLimitRemaining: nil, retryAfterSeconds: nil)?.bridgeError.code == .notFound)
        #expect(gitHubError(status: 502, rateLimitRemaining: nil, retryAfterSeconds: nil)?.bridgeError.retryable == true)
    }

    @Test nonisolated func tokenNeverPrintsItsValue() {
        let token = GitHubToken("gho_secret")
        #expect(!String(describing: token).contains("gho_secret"))
        #expect(!"\(token)".contains("gho_secret"))
    }
}

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
