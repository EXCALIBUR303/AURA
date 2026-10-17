import Foundation

// Swift mirror of shared/contracts/domain.ts and the method/event payloads.
// Field names and string values must match the TypeScript exactly.

public enum ZoneID: String, Codable, CaseIterable, Sendable {
    case studio, hardware, software
    case aiLab = "ai-lab"
    case github, companion
}

// MARK: app

public struct AppInfo: Codable, Equatable, Sendable {
    public enum Host: String, Codable, Sendable { case macos, webDev = "web-dev" }
    public enum Environment: String, Codable, Sendable { case development, production }

    public var appVersion: String
    public var build: String
    public var host: Host
    public var bridgeVersion: Int
    public var environment: Environment

    public init(appVersion: String, build: String, host: Host, bridgeVersion: Int, environment: Environment) {
        self.appVersion = appVersion
        self.build = build
        self.host = host
        self.bridgeVersion = bridgeVersion
        self.environment = environment
    }
}

// MARK: preferences

public struct Preferences: Codable, Equatable, Sendable {
    public struct Voice: Codable, Equatable, Sendable {
        public var enabled: Bool
        public var locale: String
        public var synthesisVoiceId: String?
    }

    public struct AI: Codable, Equatable, Sendable {
        public var defaultProviderId: String?
    }

    public struct Graphics: Codable, Equatable, Sendable {
        public enum Quality: String, Codable, Sendable { case low, medium, high }
        public var quality: Quality
        public var maxPixelRatio: Double
    }

    public var lastZone: ZoneID
    public var reduceMotion: Bool
    public var voice: Voice
    public var ai: AI
    public var graphics: Graphics

    /// Must equal DEFAULT_PREFERENCES in shared/bridge/mock.ts.
    public static let defaults = Preferences(
        lastZone: .studio,
        reduceMotion: false,
        voice: Voice(enabled: true, locale: "en-US", synthesisVoiceId: nil),
        ai: AI(defaultProviderId: nil),
        graphics: Graphics(quality: .high, maxPixelRatio: 2)
    )

    // Optionals must encode as explicit `null` to match the TS types.
    enum VoiceKeys: String, CodingKey { case enabled, locale, synthesisVoiceId }
}

extension Preferences.Voice {
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Preferences.VoiceKeys.self)
        try c.encode(enabled, forKey: .enabled)
        try c.encode(locale, forKey: .locale)
        try c.encode(synthesisVoiceId, forKey: .synthesisVoiceId)
    }
}

extension Preferences.AI {
    enum Keys: String, CodingKey { case defaultProviderId }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(defaultProviderId, forKey: .defaultProviderId)
    }
}

/// Partial update; nested objects merge one level deep (same as the mock).
public struct PreferencesPatch: Codable, Equatable, Sendable {
    public struct Voice: Codable, Equatable, Sendable {
        public var enabled: Bool?
        public var locale: String?
        public var synthesisVoiceId: String??
    }

    public struct AI: Codable, Equatable, Sendable {
        public var defaultProviderId: String??
    }

    public struct Graphics: Codable, Equatable, Sendable {
        public var quality: Preferences.Graphics.Quality?
        public var maxPixelRatio: Double?
    }

    public var lastZone: ZoneID?
    public var reduceMotion: Bool?
    public var voice: Voice?
    public var ai: AI?
    public var graphics: Graphics?

    public init(lastZone: ZoneID? = nil, reduceMotion: Bool? = nil, voice: Voice? = nil, ai: AI? = nil, graphics: Graphics? = nil) {
        self.lastZone = lastZone
        self.reduceMotion = reduceMotion
        self.voice = voice
        self.ai = ai
        self.graphics = graphics
    }

    public func applied(to base: Preferences) -> Preferences {
        var next = base
        if let lastZone { next.lastZone = lastZone }
        if let reduceMotion { next.reduceMotion = reduceMotion }
        if let voice {
            if let enabled = voice.enabled { next.voice.enabled = enabled }
            if let locale = voice.locale { next.voice.locale = locale }
            if let id = voice.synthesisVoiceId { next.voice.synthesisVoiceId = id }
        }
        if let ai, let id = ai.defaultProviderId { next.ai.defaultProviderId = id }
        if let graphics {
            if let quality = graphics.quality { next.graphics.quality = quality }
            if let ratio = graphics.maxPixelRatio { next.graphics.maxPixelRatio = ratio }
        }
        return next
    }
}

// Double-optional decoding: absent key → nil (leave unchanged), explicit null → .some(nil) (clear).
extension PreferencesPatch.Voice {
    enum Keys: String, CodingKey { case enabled, locale, synthesisVoiceId }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled)
        locale = try c.decodeIfPresent(String.self, forKey: .locale)
        synthesisVoiceId = c.contains(.synthesisVoiceId) ? .some(try c.decodeIfPresent(String.self, forKey: .synthesisVoiceId)) : nil
    }
}

extension PreferencesPatch.AI {
    enum Keys: String, CodingKey { case defaultProviderId }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        defaultProviderId = c.contains(.defaultProviderId) ? .some(try c.decodeIfPresent(String.self, forKey: .defaultProviderId)) : nil
    }
}

// MARK: github

public struct GitHubAccount: Codable, Equatable, Sendable {
    public var login: String
    public var name: String?
    public var htmlUrl: String

    public init(login: String, name: String?, htmlUrl: String) {
        self.login = login
        self.name = name
        self.htmlUrl = htmlUrl
    }

    enum Keys: String, CodingKey { case login, name, htmlUrl }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(login, forKey: .login)
        try c.encode(name, forKey: .name)
        try c.encode(htmlUrl, forKey: .htmlUrl)
    }
}

public struct GitHubInstallation: Codable, Equatable, Sendable {
    public enum RepositorySelection: String, Codable, Sendable { case all, selected }

    public var id: Int
    public var accountLogin: String
    public var repositorySelection: RepositorySelection
    public var permissions: [String: String]
    public var readOnly: Bool
    /// Required permissions (GitHubPermissionPolicy.required) that are absent.
    public var missingPermissions: [String]
    /// Read permissions AURA does not use; harmless but removable.
    public var unneededPermissions: [String]
    public var manageUrl: String

    public init(id: Int, accountLogin: String, repositorySelection: RepositorySelection, permissions: [String: String], manageUrl: String) {
        self.id = id
        self.accountLogin = accountLogin
        self.repositorySelection = repositorySelection
        self.permissions = permissions
        self.readOnly = permissions.values.allSatisfy { $0 == "read" }
        let review = GitHubPermissionPolicy.review(permissions)
        self.missingPermissions = review.missing
        self.unneededPermissions = review.unneeded
        self.manageUrl = manageUrl
    }
}

public enum GitHubConnectionErrorReason: String, Codable, Sendable {
    case denied
    case codeExpired = "code_expired"
    case network
    case configuration
    /// An installation grants more than read access; AURA signed out (GitHubPermissionPolicy).
    case excessPermissions = "excess_permissions"
    case `internal`
}

public enum GitHubExpiryReason: String, Codable, Sendable { case expired, revoked }

/// Mirrors GitHubAuthStatus in domain.ts. Never carries tokens or device codes.
public enum GitHubAuthStatus: Codable, Equatable, Sendable {
    case disconnected
    case authorizing(userCode: String, verificationUri: String, expiresAt: String)
    case connected(account: GitHubAccount, installations: [GitHubInstallation])
    case expired(login: String?, reason: GitHubExpiryReason)
    case rateLimited(account: GitHubAccount, installations: [GitHubInstallation], resetAt: String)
    case error(reason: GitHubConnectionErrorReason, message: String, retryable: Bool)

    enum Keys: String, CodingKey {
        case state, userCode, verificationUri, expiresAt, account, installations, login, reason, resetAt, message, retryable
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .state) {
        case "disconnected":
            self = .disconnected
        case "authorizing":
            self = .authorizing(
                userCode: try c.decode(String.self, forKey: .userCode),
                verificationUri: try c.decode(String.self, forKey: .verificationUri),
                expiresAt: try c.decode(String.self, forKey: .expiresAt)
            )
        case "connected":
            self = .connected(account: try c.decode(GitHubAccount.self, forKey: .account), installations: try c.decode([GitHubInstallation].self, forKey: .installations))
        case "expired":
            self = .expired(login: try c.decodeIfPresent(String.self, forKey: .login), reason: try c.decode(GitHubExpiryReason.self, forKey: .reason))
        case "rate_limited":
            self = .rateLimited(
                account: try c.decode(GitHubAccount.self, forKey: .account),
                installations: try c.decode([GitHubInstallation].self, forKey: .installations),
                resetAt: try c.decode(String.self, forKey: .resetAt)
            )
        case "error":
            self = .error(
                reason: try c.decode(GitHubConnectionErrorReason.self, forKey: .reason),
                message: try c.decode(String.self, forKey: .message),
                retryable: try c.decode(Bool.self, forKey: .retryable)
            )
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .state, in: c, debugDescription: "unknown state \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .disconnected:
            try c.encode("disconnected", forKey: .state)
        case .authorizing(let userCode, let verificationUri, let expiresAt):
            try c.encode("authorizing", forKey: .state)
            try c.encode(userCode, forKey: .userCode)
            try c.encode(verificationUri, forKey: .verificationUri)
            try c.encode(expiresAt, forKey: .expiresAt)
        case .connected(let account, let installations):
            try c.encode("connected", forKey: .state)
            try c.encode(account, forKey: .account)
            try c.encode(installations, forKey: .installations)
        case .expired(let login, let reason):
            try c.encode("expired", forKey: .state)
            try c.encode(login, forKey: .login)
            try c.encode(reason, forKey: .reason)
        case .rateLimited(let account, let installations, let resetAt):
            try c.encode("rate_limited", forKey: .state)
            try c.encode(account, forKey: .account)
            try c.encode(installations, forKey: .installations)
            try c.encode(resetAt, forKey: .resetAt)
        case .error(let reason, let message, let retryable):
            try c.encode("error", forKey: .state)
            try c.encode(reason, forKey: .reason)
            try c.encode(message, forKey: .message)
            try c.encode(retryable, forKey: .retryable)
        }
    }
}

public struct Page<Item: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    public var items: [Item]
    public var nextCursor: String?

    public init(items: [Item], nextCursor: String?) {
        self.items = items
        self.nextCursor = nextCursor
    }

    enum Keys: String, CodingKey { case items, nextCursor }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(items, forKey: .items)
        try c.encode(nextCursor, forKey: .nextCursor)
    }
}

public struct RepositorySummary: Codable, Equatable, Sendable {
    public var fullName: String
    public var owner: String
    public var name: String
    public var description: String?
    public var isPrivate: Bool
    public var defaultBranch: String
    public var primaryLanguage: String?
    public var stargazerCount: Int
    public var pushedAt: String?
    public var htmlUrl: String
    public var topics: [String]
    public var isFork: Bool
    public var isArchived: Bool

    public init(
        fullName: String, owner: String, name: String, description: String?, isPrivate: Bool, defaultBranch: String,
        primaryLanguage: String?, stargazerCount: Int, pushedAt: String?, htmlUrl: String,
        topics: [String] = [], isFork: Bool = false, isArchived: Bool = false
    ) {
        self.fullName = fullName
        self.owner = owner
        self.name = name
        self.description = description
        self.isPrivate = isPrivate
        self.defaultBranch = defaultBranch
        self.primaryLanguage = primaryLanguage
        self.stargazerCount = stargazerCount
        self.pushedAt = pushedAt
        self.htmlUrl = htmlUrl
        self.topics = topics
        self.isFork = isFork
        self.isArchived = isArchived
    }

    enum Keys: String, CodingKey {
        case fullName, owner, name, description, isPrivate, defaultBranch, primaryLanguage, stargazerCount, pushedAt, htmlUrl, topics, isFork, isArchived
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try encodeFields(into: &c)
    }

    func encodeFields(into c: inout KeyedEncodingContainer<Keys>) throws {
        try c.encode(fullName, forKey: .fullName)
        try c.encode(owner, forKey: .owner)
        try c.encode(name, forKey: .name)
        try c.encode(description, forKey: .description)
        try c.encode(isPrivate, forKey: .isPrivate)
        try c.encode(defaultBranch, forKey: .defaultBranch)
        try c.encode(primaryLanguage, forKey: .primaryLanguage)
        try c.encode(stargazerCount, forKey: .stargazerCount)
        try c.encode(pushedAt, forKey: .pushedAt)
        try c.encode(htmlUrl, forKey: .htmlUrl)
        try c.encode(topics, forKey: .topics)
        try c.encode(isFork, forKey: .isFork)
        try c.encode(isArchived, forKey: .isArchived)
    }
}

public struct LanguageShare: Codable, Equatable, Sendable {
    public var name: String
    public var bytes: Int
    public init(name: String, bytes: Int) {
        self.name = name
        self.bytes = bytes
    }
}

/// Mirrors RepositoryDetail (RepositorySummary plus extra fields) as one flat object.
public struct RepositoryDetail: Codable, Equatable, Sendable {
    public var summary: RepositorySummary
    public var languages: [LanguageShare]
    public var forksCount: Int
    public var openIssuesCount: Int
    public var license: String?
    public var createdAt: String
    public var updatedAt: String

    public init(summary: RepositorySummary, languages: [LanguageShare], forksCount: Int, openIssuesCount: Int, license: String?, createdAt: String, updatedAt: String) {
        self.summary = summary
        self.languages = languages
        self.forksCount = forksCount
        self.openIssuesCount = openIssuesCount
        self.license = license
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum Keys: String, CodingKey { case languages, forksCount, openIssuesCount, license, createdAt, updatedAt }

    public init(from decoder: Decoder) throws {
        summary = try RepositorySummary(from: decoder)
        let c = try decoder.container(keyedBy: Keys.self)
        languages = try c.decode([LanguageShare].self, forKey: .languages)
        forksCount = try c.decode(Int.self, forKey: .forksCount)
        openIssuesCount = try c.decode(Int.self, forKey: .openIssuesCount)
        license = try c.decodeIfPresent(String.self, forKey: .license)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var base = encoder.container(keyedBy: RepositorySummary.Keys.self)
        try summary.encodeFields(into: &base)
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(languages, forKey: .languages)
        try c.encode(forksCount, forKey: .forksCount)
        try c.encode(openIssuesCount, forKey: .openIssuesCount)
        try c.encode(license, forKey: .license)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct BranchSummary: Codable, Equatable, Sendable {
    public var name: String
    public var sha: String
    public var isProtected: Bool
    public var isDefault: Bool
    public init(name: String, sha: String, isProtected: Bool, isDefault: Bool) {
        self.name = name
        self.sha = sha
        self.isProtected = isProtected
        self.isDefault = isDefault
    }
}

public struct CommitSummary: Codable, Equatable, Sendable {
    public var sha: String
    public var message: String
    public var authorName: String
    public var authorLogin: String?
    public var committedAt: String
    public var htmlUrl: String

    public init(sha: String, message: String, authorName: String, authorLogin: String? = nil, committedAt: String, htmlUrl: String) {
        self.sha = sha
        self.message = message
        self.authorName = authorName
        self.authorLogin = authorLogin
        self.committedAt = committedAt
        self.htmlUrl = htmlUrl
    }

    enum Keys: String, CodingKey { case sha, message, authorName, authorLogin, committedAt, htmlUrl }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(sha, forKey: .sha)
        try c.encode(message, forKey: .message)
        try c.encode(authorName, forKey: .authorName)
        try c.encode(authorLogin, forKey: .authorLogin)
        try c.encode(committedAt, forKey: .committedAt)
        try c.encode(htmlUrl, forKey: .htmlUrl)
    }
}

public struct ListRepositoriesParams: Codable, Sendable {
    public var cursor: String?
    public var perPage: Int?
}

public struct RepositoryRef: Codable, Sendable {
    public var fullName: String
}

public struct ListBranchesParams: Codable, Sendable {
    public var fullName: String
    public var cursor: String?
    public var perPage: Int?
}

public struct ListCommitsParams: Codable, Sendable {
    public var fullName: String
    public var branch: String?
    public var limit: Int?
}

// MARK: projects

public struct ProjectRecord: Codable, Equatable, Sendable {
    public var id: String
    public var zone: ZoneID?
    public var pinned: Bool
    public var notes: String
    public var updatedAt: String

    enum Keys: String, CodingKey { case id, zone, pinned, notes, updatedAt }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(id, forKey: .id)
        try c.encode(zone, forKey: .zone)
        try c.encode(pinned, forKey: .pinned)
        try c.encode(notes, forKey: .notes)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct ProjectPatch: Codable, Equatable, Sendable {
    public var id: String
    /// nil = unchanged, .some(nil) = clear.
    public var zone: ZoneID??
    public var pinned: Bool?
    public var notes: String?

    enum Keys: String, CodingKey { case id, zone, pinned, notes }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        zone = c.contains(.zone) ? .some(try c.decodeIfPresent(ZoneID.self, forKey: .zone)) : nil
        pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
    }

    public init(id: String, zone: ZoneID?? = nil, pinned: Bool? = nil, notes: String? = nil) {
        self.id = id
        self.zone = zone
        self.pinned = pinned
        self.notes = notes
    }
}

public struct ProjectZoneSuggestion: Codable, Equatable, Sendable {
    public enum Zone: String, Codable, Sendable { case hardware, software, aiLab = "ai-lab" }
    public enum Confidence: String, Codable, Sendable { case high, medium, low }

    public var id: String
    public var zone: Zone
    public var reasons: [String]
    public var confidence: Confidence

    public init(id: String, zone: Zone, reasons: [String], confidence: Confidence) {
        self.id = id
        self.zone = zone
        self.reasons = reasons
        self.confidence = confidence
    }
}

// MARK: ai

public struct AIProviderInfo: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case local, cloud }
    public var id: String
    public var displayName: String
    public var kind: Kind
    public var available: Bool
    public var models: [String]
}

public struct ChatMessage: Codable, Equatable, Sendable {
    public enum Role: String, Codable, Sendable { case system, user, assistant }
    public var role: Role
    public var content: String
}

public enum FinishReason: String, Codable, Sendable { case stop, length, cancelled, error }

public struct ChatParams: Codable, Sendable {
    public var messages: [ChatMessage]
    public var providerId: String?
    public var model: String?
}

public struct StreamRef: Codable, Equatable, Sendable {
    public var streamId: String
}

public struct AIChunkPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var delta: String
}

public struct AIDonePayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var finishReason: FinishReason
}

public struct AIErrorPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var error: BridgeError
}

// MARK: voice

public enum PermissionState: String, Codable, Sendable {
    case notDetermined = "not_determined"
    case granted, denied, restricted
}

public struct VoiceStatus: Codable, Equatable, Sendable {
    public var microphone: PermissionState
    public var speechRecognition: PermissionState
    public var listening: Bool
    public var speaking: Bool

    public static let initial = VoiceStatus(microphone: .notDetermined, speechRecognition: .notDetermined, listening: false, speaking: false)
}

public struct SpeakParams: Codable, Sendable {
    public var text: String
    public var interrupt: Bool?
}

// MARK: app events

public enum AppCommand: Codable, Equatable, Sendable {
    case navigate(ZoneID)
    case focusCompanion
    case openCommandPalette

    enum Keys: String, CodingKey { case command, zone }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .command) {
        case "navigate": self = .navigate(try c.decode(ZoneID.self, forKey: .zone))
        case "focusCompanion": self = .focusCompanion
        case "openCommandPalette": self = .openCommandPalette
        case let other: throw DecodingError.dataCorruptedError(forKey: .command, in: c, debugDescription: "unknown command \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .navigate(let zone):
            try c.encode("navigate", forKey: .command)
            try c.encode(zone, forKey: .zone)
        case .focusCompanion: try c.encode("focusCompanion", forKey: .command)
        case .openCommandPalette: try c.encode("openCommandPalette", forKey: .command)
        }
    }
}

public struct WindowState: Codable, Equatable, Sendable {
    /// AURA is the active (frontmost) app.
    public var active: Bool
    /// Part of the window is on screen: not minimized, hidden, fully covered or on another Space.
    public var visible: Bool
    public init(active: Bool, visible: Bool) {
        self.active = active
        self.visible = visible
    }
}

// MARK: logging

public enum WebLogLevel: String, Codable, Sendable { case debug, info, notice, error, fault }

public struct LogWriteParams: Codable, Sendable {
    public var level: WebLogLevel
    public var message: String
    public var context: [String: String]?
}
