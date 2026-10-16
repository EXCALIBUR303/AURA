import Foundation

// AI provider foundation (Phase 3A). Providers are configured, not hardcoded:
// a local runtime on this Mac (e.g. Ollama on 127.0.0.1) or a remote API whose
// key lives in the Keychain under SecretKey.aiProviderKey(id). Which providers
// to offer, and any spending, is the owner's decision (TASKS.md › Open
// decisions 5); nothing here contacts a network. Streaming and cancellation
// stay on the existing AIProvider / AIService contract (ai.chunk, ai.done,
// ai.error, ai.cancel).

public struct AIProviderConfiguration: Equatable, Sendable {
    public enum Endpoint: Equatable, Sendable {
        /// A model runtime on this Mac. Loopback http(s) only.
        case local(URL)
        /// A hosted API. https only; the key is read from the Keychain at request time.
        case remote(URL)
    }

    public var id: String
    public var displayName: String
    public var endpoint: Endpoint
    public var models: [String]

    public init(id: String, displayName: String, endpoint: Endpoint, models: [String]) {
        self.id = id
        self.displayName = displayName
        self.endpoint = endpoint
        self.models = models
    }

    public var kind: AIProviderInfo.Kind {
        if case .local = endpoint { .local } else { .cloud }
    }

    public var credentialKey: SecretKey { .aiProviderKey(id) }

    /// Rejects endpoints that could send prompts somewhere unexpected.
    public func validate() throws {
        guard id.range(of: #"^[a-z0-9][a-z0-9-]{0,31}$"#, options: .regularExpression) != nil else {
            throw AuraError.invalidRequest("provider id must be 1-32 lowercase letters, digits or dashes")
        }
        switch endpoint {
        case .local(let url):
            guard ["http", "https"].contains(url.scheme ?? ""), let host = url.host, ["localhost", "127.0.0.1", "::1"].contains(host) else {
                throw AuraError.invalidRequest("a local provider must use a loopback address")
            }
        case .remote(let url):
            guard url.scheme == "https", url.host?.isEmpty == false else {
                throw AuraError.invalidRequest("a remote provider must use https")
            }
        }
    }
}

/// Stores and removes provider API keys. Keys are write-only from the app's
/// point of view: nothing here returns a key to callers other than a provider.
public struct AICredentialStore: Sendable {
    private let secrets: any SecretStore
    public init(secrets: any SecretStore) { self.secrets = secrets }

    public func hasKey(for provider: AIProviderConfiguration) -> Bool {
        ((try? secrets.read(provider.credentialKey)) ?? nil)?.isEmpty == false
    }

    public func saveKey(_ key: String, for provider: AIProviderConfiguration) throws {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AuraError.invalidRequest("API key is empty") }
        try secrets.write(trimmed, for: provider.credentialKey)
    }

    public func deleteKey(for provider: AIProviderConfiguration) throws {
        try secrets.delete(provider.credentialKey)
    }

    /// For a provider implementation making a request; never pass this across the bridge.
    public func key(for provider: AIProviderConfiguration) throws -> String? {
        try secrets.read(provider.credentialKey)
    }
}

/// Builds the page-visible provider list. A remote provider is available only
/// once its key is stored; a local one is reported available and fails with
/// `unavailable` at request time if its runtime is not running.
public struct AIProviderCatalog: Sendable {
    public let configurations: [AIProviderConfiguration]
    private let credentials: AICredentialStore

    public init(configurations: [AIProviderConfiguration], credentials: AICredentialStore) throws {
        try configurations.forEach { try $0.validate() }
        guard Set(configurations.map(\.id)).count == configurations.count else {
            throw AuraError.invalidRequest("duplicate provider id")
        }
        self.configurations = configurations
        self.credentials = credentials
    }

    public func infos() -> [AIProviderInfo] {
        configurations.map { config in
            let available: Bool = switch config.endpoint {
            case .local: true
            case .remote: credentials.hasKey(for: config)
            }
            return AIProviderInfo(id: config.id, displayName: config.displayName, kind: config.kind, available: available, models: config.models)
        }
    }
}
