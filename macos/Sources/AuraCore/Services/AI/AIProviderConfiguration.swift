import Foundation

// AI provider configuration (Phase 3A foundation, reworked in Phase 3C-A).
// Providers are configured, not hardcoded: AIProviderSettings (non-secret,
// stored in SQLite) says where a provider is and which models it may use; its
// API key, if any, lives only in the Keychain under SecretKey.aiProviderKey(id).

/// Validated, non-secret settings of one configured provider.
public struct AIProviderConfiguration: Equatable, Sendable {
    public let settings: AIProviderSettings
    public let baseURL: URL
    public let kind: AIProviderInfo.Kind

    public var id: String { settings.id }
    public var credentialKey: SecretKey { .aiProviderKey(settings.id) }
    public var origin: HTTPOrigin { HTTPOrigin(baseURL)! }
    /// Cloud providers need a key; local runtimes on this Mac do not.
    public var requiresKey: Bool { kind == .cloud }
    public var resolvedDefaultModel: String? { settings.defaultModel ?? settings.models.first }

    static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "::1"]
    static let maxModels = 20

    /// Rejects anything that could send prompts or keys somewhere unexpected.
    public init(_ settings: AIProviderSettings) throws {
        guard settings.id.wholeMatch(of: /[a-z0-9][a-z0-9-]{0,31}/) != nil else {
            throw AuraError.invalidRequest("provider id must be 1-32 lowercase letters, digits or dashes")
        }
        let name = settings.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...64).contains(name.count), !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw AuraError.invalidRequest("display name must be 1-64 characters")
        }
        guard settings.api == .openAICompatible else { throw AuraError.invalidRequest("unsupported provider api \(settings.api.rawValue)") }
        guard let components = URLComponents(string: settings.baseUrl), let url = components.url,
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = components.host?.lowercased(), !host.isEmpty,
              components.user == nil, components.password == nil, components.query == nil, components.fragment == nil
        else { throw AuraError.invalidRequest("baseUrl must be an http(s) URL without credentials, query or fragment") }
        let local = Self.loopbackHosts.contains(host.trimmingCharacters(in: CharacterSet(charactersIn: "[]")))
        guard local || scheme == "https" else {
            throw AuraError.invalidRequest("a provider outside this Mac must use https; http is allowed only on a loopback address")
        }
        guard (1...Self.maxModels).contains(settings.models.count), settings.models.allSatisfy(AIProviderRegistry.isValidModelId),
              Set(settings.models).count == settings.models.count
        else { throw AuraError.invalidRequest("models must be 1-\(Self.maxModels) distinct model ids") }
        if let model = settings.defaultModel, !settings.models.contains(model) {
            throw AuraError.invalidRequest("defaultModel must be one of models")
        }
        var normalized = settings
        normalized.displayName = name
        self.settings = normalized
        baseURL = url
        kind = local ? .local : .cloud
    }
}

/// Stores and removes provider API keys. Keys are write-only from the app's
/// point of view: only a provider making a request reads one back.
public struct AICredentialStore: Sendable {
    private let secrets: any SecretStore
    public init(secrets: any SecretStore) { self.secrets = secrets }

    public func hasKey(for provider: AIProviderConfiguration) -> Bool {
        ((try? secrets.read(provider.credentialKey)) ?? nil)?.isEmpty == false
    }

    public func saveKey(_ key: String, for provider: AIProviderConfiguration) throws {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AuraError.invalidRequest("API key is empty") }
        guard trimmed.count <= 512, !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) else {
            throw AuraError.invalidRequest("API key has an unexpected format")
        }
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
