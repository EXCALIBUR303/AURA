import Foundation

/// What the native secure prompt shows: who the key is for and where it will be sent.
public struct AICredentialPromptRequest: Equatable, Sendable {
    public var providerName: String
    /// "host" or "host:port" the key will be sent to.
    public var destination: String
}

/// Asks the user for an API key in native UI (never the web view). Returns
/// nil when the user cancels.
public typealias AICredentialPrompt = @MainActor (AICredentialPromptRequest) async -> String?

/// Owns the configured providers: the built-in mock plus the user's
/// settings (SQLite kv `ai.providers`), their Keychain credential state and
/// the last validation result. The page only ever sees AIProviderInfo.
@MainActor
public final class AIProviderRegistry {
    public static let storeKey = "ai.providers"
    static let maxProviders = 16
    static let mockId = "mock"

    public typealias ProviderFactory = @Sendable (AIProviderConfiguration, _ apiKey: String?) -> any AIProvider

    /// Called after every change with the full list (wired to ai.providersChanged).
    public var onChange: (@MainActor ([AIProviderInfo]) -> Void)?

    private let store: AppStore
    private let credentials: AICredentialStore
    private let mock: any AIProvider
    private let makeProvider: ProviderFactory
    private let now: @Sendable () -> Date
    private var configurations: [String: AIProviderConfiguration] = [:]
    private var checks: [String: AIProviderCheck] = [:]
    private var loaded = false

    public init(
        store: AppStore,
        secrets: any SecretStore,
        mock: any AIProvider = MockAIProvider(),
        makeProvider: ProviderFactory? = nil,
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.store = store
        credentials = AICredentialStore(secrets: secrets)
        self.mock = mock
        let transport = URLSessionAITransport()
        self.makeProvider = makeProvider ?? { configuration, key in
            OpenAICompatibleProvider(baseURL: configuration.baseURL, apiKey: key, transport: transport)
        }
        self.now = now
    }

    /// Model ids as providers spell them: "llama3.2:latest", "openai/gpt-4o-mini".
    public nonisolated static func isValidModelId(_ id: String) -> Bool {
        id.wholeMatch(of: /[A-Za-z0-9][A-Za-z0-9._:\/@+\-]{0,127}/) != nil
    }

    // MARK: reading

    public func infos() async -> [AIProviderInfo] {
        await loadIfNeeded()
        let mockInfo = AIProviderInfo(
            id: Self.mockId, displayName: "Mock provider (offline)", kind: .local, available: true, models: ["mock-echo"],
            api: .mock, defaultModel: "mock-echo", baseUrl: nil, credential: .notRequired, lastCheck: checks[Self.mockId], builtIn: true
        )
        var list = [mockInfo]
        for configuration in configurations.values.sorted(by: { $0.id < $1.id }) { list.append(await info(configuration)) }
        return list
    }

    public func info(_ id: String) async throws -> AIProviderInfo {
        guard let found = await infos().first(where: { $0.id == id }) else { throw AuraError.notFound("no AI provider \(id)") }
        return found
    }

    /// The provider to stream from, with its key read from the Keychain for this request only.
    func provider(_ id: String) async throws -> (provider: any AIProvider, info: AIProviderInfo) {
        let info = try await info(id)
        guard info.available else {
            throw AuraError.unavailable(info.credential == .missing ? "add an API key for \(info.displayName) first" : "\(info.displayName) is not configured")
        }
        guard let configuration = configurations[id] else { return (mock, info) }
        let store = credentials
        let key = configuration.requiresKey ? try await Task.detached { try store.key(for: configuration) }.value : nil
        if configuration.requiresKey, key?.isEmpty ?? true { throw AuraError.unavailable("add an API key for \(info.displayName) first") }
        return (makeProvider(configuration, key), info)
    }

    // MARK: changing

    public func save(_ settings: AIProviderSettings) async throws -> AIProviderInfo {
        await loadIfNeeded()
        guard settings.id != Self.mockId else { throw AuraError.invalidRequest("\(Self.mockId) is a built-in provider") }
        let configuration = try AIProviderConfiguration(settings)
        if let previous = configurations[settings.id] {
            // A stored key belongs to the origin it was entered for. If the
            // endpoint moves (or stops needing a key), the key is deleted, so
            // changing settings can never redirect a key to a new host.
            if previous.origin != configuration.origin || !configuration.requiresKey {
                try credentials.deleteKey(for: previous)
            }
            if previous.origin != configuration.origin { checks[settings.id] = nil }
        } else {
            guard configurations.count < Self.maxProviders else { throw AuraError.invalidRequest("at most \(Self.maxProviders) providers") }
            // Clear any orphaned key left under this id.
            try credentials.deleteKey(for: configuration)
        }
        configurations[settings.id] = configuration
        try await persist()
        Log.ai.notice("saved AI provider \(settings.id, privacy: .public) (\(configuration.kind.rawValue, privacy: .public), \(configuration.origin.host, privacy: .private))")
        await changed()
        return await info(configuration)
    }

    public func remove(_ id: String) async throws {
        await loadIfNeeded()
        guard id != Self.mockId else { throw AuraError.invalidRequest("\(Self.mockId) is a built-in provider") }
        guard let configuration = configurations.removeValue(forKey: id) else { throw AuraError.notFound("no AI provider \(id)") }
        checks[id] = nil
        try credentials.deleteKey(for: configuration)
        try await persist()
        Log.ai.notice("removed AI provider \(id, privacy: .public) and its key")
        await changed()
    }

    /// Runs the native prompt and stores the key. Emits a change either way,
    /// so the page can stop waiting.
    public func requestKey(_ id: String, prompt: AICredentialPrompt) async throws {
        let configuration = try await keyedConfiguration(id)
        let destination = configuration.origin.port == 443 ? configuration.origin.host : "\(configuration.origin.host):\(configuration.origin.port)"
        // Whatever happens, tell the page the prompt is over, so it stops waiting.
        do {
            if let key = await prompt(AICredentialPromptRequest(providerName: configuration.settings.displayName, destination: destination)) {
                // The settings may have changed while the prompt was open.
                guard configurations[id]?.origin == configuration.origin else { throw AuraError.invalidRequest("the provider changed while the key was being entered") }
                try credentials.saveKey(key, for: configuration)
                checks[id] = nil
                Log.ai.notice("stored an API key for AI provider \(id, privacy: .public)")
            }
        } catch {
            await changed()
            throw error
        }
        await changed()
    }

    /// Checks, before a key prompt opens, that the provider exists and takes a key.
    public func prepareKeyEntry(_ id: String) async throws {
        _ = try await keyedConfiguration(id)
    }

    /// Stores a key directly (tests, and future native settings UI). Never exposed to the bridge.
    public func storeKey(_ key: String, for id: String) async throws {
        let configuration = try await keyedConfiguration(id)
        try credentials.saveKey(key, for: configuration)
        checks[id] = nil
        await changed()
    }

    public func deleteKey(_ id: String) async throws -> AIProviderInfo {
        await loadIfNeeded()
        guard let configuration = configurations[id] else { return try await info(id) }
        try credentials.deleteKey(for: configuration)
        checks[id] = nil
        await changed()
        return await info(configuration)
    }

    /// A free model-list request: checks reachability and the key.
    public func validate(_ id: String) async throws -> AIProviderInfo {
        await loadIfNeeded()
        let started = try await info(id)
        do {
            let (provider, _) = try await provider(id)
            let models = try await provider.listModels()
            checks[id] = AIProviderCheck(ok: true, checkedAt: now().formatted(.iso8601), code: nil, message: nil, models: models)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            let bridgeError = BridgeError(error)
            checks[id] = AIProviderCheck(ok: false, checkedAt: now().formatted(.iso8601), code: bridgeError.code.rawValue, message: bridgeError.message, models: [])
        }
        Log.ai.notice("validated AI provider \(id, privacy: .public): \(self.checks[id]?.ok == true ? "ok" : (self.checks[id]?.code ?? "?"), privacy: .public)")
        // The provider may have been removed meanwhile.
        guard configurations[id] != nil || id == Self.mockId else { return started }
        await changed()
        return try await info(id)
    }

    // MARK: private

    private func keyedConfiguration(_ id: String) async throws -> AIProviderConfiguration {
        await loadIfNeeded()
        guard let configuration = configurations[id] else {
            throw id == Self.mockId ? AuraError.invalidRequest("the mock provider takes no key") : AuraError.notFound("no AI provider \(id)")
        }
        guard configuration.requiresKey else { throw AuraError.invalidRequest("local providers take no key") }
        return configuration
    }

    /// Keychain reads run off the main actor: macOS may show an access prompt
    /// (for example after a rebuild with ad-hoc signing) and a read waits for
    /// the answer, which must not freeze the window.
    private func info(_ configuration: AIProviderConfiguration) async -> AIProviderInfo {
        let store = credentials
        let hasKey = configuration.requiresKey ? await Task.detached { store.hasKey(for: configuration) }.value : false
        let credential: AICredentialState = configuration.requiresKey ? (hasKey ? .stored : .missing) : .notRequired
        return AIProviderInfo(
            id: configuration.id, displayName: configuration.settings.displayName, kind: configuration.kind,
            available: credential != .missing, models: configuration.settings.models, api: configuration.settings.api,
            defaultModel: configuration.resolvedDefaultModel, baseUrl: configuration.baseURL.absoluteString,
            credential: credential, lastCheck: checks[configuration.id], builtIn: false
        )
    }

    private func loadIfNeeded() async {
        guard !loaded else { return }
        loaded = true
        let stored = (try? await store.loadValue([AIProviderSettings].self, key: Self.storeKey)) ?? nil
        for settings in stored ?? [] {
            do { configurations[settings.id] = try AIProviderConfiguration(settings) } catch {
                Log.ai.error("ignoring an invalid stored AI provider \(settings.id, privacy: .public)")
            }
        }
    }

    private func persist() async throws {
        try await store.saveValue(configurations.values.sorted { $0.id < $1.id }.map(\.settings), key: Self.storeKey)
    }

    private func changed() async {
        let list = await infos()
        onChange?(list)
    }
}
