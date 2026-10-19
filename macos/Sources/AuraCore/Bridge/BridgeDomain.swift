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
        public var autoSpeakReplies: Bool
        /// Pace relative to the voice's natural pace (see SpeechPace); 0.7–1.3.
        public var speechRate: Double
        public var allowServerRecognition: Bool

        public static let defaultSpeechRate = 0.85
        public static let speechRateRange = 0.7...1.3

        public init(enabled: Bool, locale: String, synthesisVoiceId: String?, autoSpeakReplies: Bool = false, speechRate: Double = Voice.defaultSpeechRate, allowServerRecognition: Bool = false) {
            self.enabled = enabled
            self.locale = locale
            self.synthesisVoiceId = synthesisVoiceId
            self.autoSpeakReplies = autoSpeakReplies
            self.speechRate = speechRate
            self.allowServerRecognition = allowServerRecognition
        }
    }

    public struct AI: Codable, Equatable, Sendable {
        public enum PrivateRepositoryContext: String, Codable, Sendable {
            case never
            case localOnly = "local_only"
            case all
        }
        public var defaultProviderId: String?
        public var contextSharing: Bool
        public var privateRepositoryContext: PrivateRepositoryContext

        public init(defaultProviderId: String?, contextSharing: Bool = true, privateRepositoryContext: PrivateRepositoryContext = .never) {
            self.defaultProviderId = defaultProviderId
            self.contextSharing = contextSharing
            self.privateRepositoryContext = privateRepositoryContext
        }
    }

    public struct Graphics: Codable, Equatable, Sendable {
        public enum Quality: String, Codable, Sendable { case low, medium, high }
        public var quality: Quality
        public var maxPixelRatio: Double
    }

    /// Phase 4 world preferences (P4-N1). See `Preferences.World`.
    public struct World: Codable, Equatable, Sendable {
        public enum Presentation: String, Codable, CaseIterable, Sendable { case `static`, floating, hybrid }
        public enum LightingPreset: String, Codable, CaseIterable, Sendable { case daylight, sunset, night }
        /// Persisted modes only; the frontend's transient "cinematic" travel mode is never stored.
        public enum CameraMode: String, Codable, CaseIterable, Sendable { case inspect, explore }

        /// Must equal WORLD_PREFERENCES_VERSION in shared/contracts/domain.ts.
        public static let supportedVersion = 1
        public static let defaultFloatIntensity = 0.35
        public static let defaultLastRoomId = "project-hub"

        /// `supportedVersion`, or the larger version a newer AURA stored (then the other fields are defaults).
        public var schemaVersion: Int
        public var presentation: Presentation
        /// 0–1.
        public var floatIntensity: Double
        public var lightingPreset: LightingPreset
        public var cameraMode: CameraMode
        /// Frontend room registry id (format-checked only, never a ZoneID).
        public var lastRoomId: String

        public init(schemaVersion: Int = World.supportedVersion, presentation: Presentation = .static, floatIntensity: Double = World.defaultFloatIntensity,
                    lightingPreset: LightingPreset = .daylight, cameraMode: CameraMode = .inspect, lastRoomId: String = World.defaultLastRoomId) {
            self.schemaVersion = schemaVersion
            self.presentation = presentation
            self.floatIntensity = floatIntensity
            self.lightingPreset = lightingPreset
            self.cameraMode = cameraMode
            self.lastRoomId = lastRoomId
        }

        public static let defaults = World()

        /// False when a newer AURA wrote the stored world values; they are then kept and not patched.
        public var isSupported: Bool { schemaVersion == Self.supportedVersion }

        /// `^[a-z][a-z0-9-]{0,47}$`, matching WORLD_ROOM_ID_PATTERN.
        public static func isValidRoomId(_ id: String) -> Bool {
            let scalars = Array(id.unicodeScalars)
            guard let first = scalars.first, scalars.count <= 48, ("a"..."z").contains(first) else { return false }
            return scalars.dropFirst().allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" }
        }

        static func clampedIntensity(_ value: Double) -> Double {
            value.isFinite ? min(max(value, 0), 1) : defaultFloatIntensity
        }
    }

    public var lastZone: ZoneID
    public var reduceMotion: Bool
    public var voice: Voice
    public var ai: AI
    public var graphics: Graphics
    public var world: World = .defaults

    /// Must equal DEFAULT_PREFERENCES in shared/bridge/mock.ts.
    public static let defaults = Preferences(
        lastZone: .studio,
        reduceMotion: false,
        voice: Voice(enabled: true, locale: "en-US", synthesisVoiceId: nil),
        ai: AI(defaultProviderId: nil),
        graphics: Graphics(quality: .high, maxPixelRatio: 2)
    )

    // Optionals must encode as explicit `null` to match the TS types.
    enum VoiceKeys: String, CodingKey { case enabled, locale, synthesisVoiceId, autoSpeakReplies, speechRate, allowServerRecognition }
}

extension Preferences.Voice {
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Preferences.VoiceKeys.self)
        try c.encode(enabled, forKey: .enabled)
        try c.encode(locale, forKey: .locale)
        try c.encode(synthesisVoiceId, forKey: .synthesisVoiceId)
        try c.encode(autoSpeakReplies, forKey: .autoSpeakReplies)
        try c.encode(speechRate, forKey: .speechRate)
        try c.encode(allowServerRecognition, forKey: .allowServerRecognition)
    }

    /// Preferences stored before Phase 3C-D lack the speech fields; they get the defaults.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Preferences.VoiceKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        locale = try c.decode(String.self, forKey: .locale)
        synthesisVoiceId = try c.decodeIfPresent(String.self, forKey: .synthesisVoiceId)
        autoSpeakReplies = try c.decodeIfPresent(Bool.self, forKey: .autoSpeakReplies) ?? false
        speechRate = Self.clampedRate(try c.decodeIfPresent(Double.self, forKey: .speechRate) ?? Self.defaultSpeechRate)
        allowServerRecognition = try c.decodeIfPresent(Bool.self, forKey: .allowServerRecognition) ?? false
    }

    static func clampedRate(_ rate: Double) -> Double {
        rate.isFinite ? min(max(rate, speechRateRange.lowerBound), speechRateRange.upperBound) : defaultSpeechRate
    }
}

extension Preferences {
    /// Rows stored before Phase 4 have no `world`; they get the defaults (static presentation).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lastZone = try c.decode(ZoneID.self, forKey: .lastZone)
        reduceMotion = try c.decode(Bool.self, forKey: .reduceMotion)
        voice = try c.decode(Voice.self, forKey: .voice)
        ai = try c.decode(AI.self, forKey: .ai)
        graphics = try c.decode(Graphics.self, forKey: .graphics)
        world = try c.decodeIfPresent(World.self, forKey: .world) ?? .defaults
    }
}

extension Preferences.World {
    enum Keys: String, CodingKey { case schemaVersion, presentation, floatIntensity, lightingPreset, cameraMode, lastRoomId }

    /// Lenient on purpose: a damaged or unknown world value falls back to its default field by
    /// field, so it can never make the whole preferences row unreadable (and so reset voice/AI).
    /// A newer schema keeps only its version number here; AppStore keeps the stored values.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let version = (try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)) ?? nil
        self.init()
        if let version, version > Self.supportedVersion {
            schemaVersion = version
            return
        }
        if let value = (try? c.decodeIfPresent(Presentation.self, forKey: .presentation)) ?? nil { presentation = value }
        if let value = (try? c.decodeIfPresent(Double.self, forKey: .floatIntensity)) ?? nil { floatIntensity = Self.clampedIntensity(value) }
        if let value = (try? c.decodeIfPresent(LightingPreset.self, forKey: .lightingPreset)) ?? nil { lightingPreset = value }
        if let value = (try? c.decodeIfPresent(CameraMode.self, forKey: .cameraMode)) ?? nil { cameraMode = value }
        if let value = (try? c.decodeIfPresent(String.self, forKey: .lastRoomId)) ?? nil, Self.isValidRoomId(value) { lastRoomId = value }
    }
}

extension Preferences.AI {
    enum Keys: String, CodingKey { case defaultProviderId, contextSharing, privateRepositoryContext }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(defaultProviderId, forKey: .defaultProviderId)
        try c.encode(contextSharing, forKey: .contextSharing)
        try c.encode(privateRepositoryContext, forKey: .privateRepositoryContext)
    }

    /// Preferences stored before Phase 3C-A lack the context fields; they get the defaults.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        defaultProviderId = try c.decodeIfPresent(String.self, forKey: .defaultProviderId)
        contextSharing = try c.decodeIfPresent(Bool.self, forKey: .contextSharing) ?? true
        privateRepositoryContext = try c.decodeIfPresent(PrivateRepositoryContext.self, forKey: .privateRepositoryContext) ?? .never
    }
}

/// Partial update; nested objects merge one level deep (same as the mock).
public struct PreferencesPatch: Codable, Equatable, Sendable {
    public struct Voice: Codable, Equatable, Sendable {
        public var enabled: Bool?
        public var locale: String?
        public var synthesisVoiceId: String??
        public var autoSpeakReplies: Bool?
        public var speechRate: Double?
        public var allowServerRecognition: Bool?
    }

    public struct AI: Codable, Equatable, Sendable {
        public var defaultProviderId: String??
        public var contextSharing: Bool?
        public var privateRepositoryContext: Preferences.AI.PrivateRepositoryContext?
    }

    public struct Graphics: Codable, Equatable, Sendable {
        public var quality: Preferences.Graphics.Quality?
        public var maxPixelRatio: Double?
    }

    /// Invalid enums or room ids fail decoding, so the router rejects the whole patch (invalid_request).
    public struct World: Codable, Equatable, Sendable {
        public var presentation: Preferences.World.Presentation?
        public var floatIntensity: Double?
        public var lightingPreset: Preferences.World.LightingPreset?
        public var cameraMode: Preferences.World.CameraMode?
        public var lastRoomId: String?

        public init(presentation: Preferences.World.Presentation? = nil, floatIntensity: Double? = nil, lightingPreset: Preferences.World.LightingPreset? = nil,
                    cameraMode: Preferences.World.CameraMode? = nil, lastRoomId: String? = nil) {
            self.presentation = presentation
            self.floatIntensity = floatIntensity
            self.lightingPreset = lightingPreset
            self.cameraMode = cameraMode
            self.lastRoomId = lastRoomId
        }
    }

    public var lastZone: ZoneID?
    public var reduceMotion: Bool?
    public var voice: Voice?
    public var ai: AI?
    public var graphics: Graphics?
    public var world: World?

    public init(lastZone: ZoneID? = nil, reduceMotion: Bool? = nil, voice: Voice? = nil, ai: AI? = nil, graphics: Graphics? = nil, world: World? = nil) {
        self.lastZone = lastZone
        self.reduceMotion = reduceMotion
        self.voice = voice
        self.ai = ai
        self.graphics = graphics
        self.world = world
    }

    /// Like `applied(to:)`, but refuses a world patch when a newer AURA owns the stored world values.
    public func validatedApplied(to base: Preferences) throws -> Preferences {
        if world != nil, !base.world.isSupported {
            throw AuraError.invalidRequest("world preferences were saved by a newer AURA; they were not changed")
        }
        return applied(to: base)
    }

    public func applied(to base: Preferences) -> Preferences {
        var next = base
        if let lastZone { next.lastZone = lastZone }
        if let reduceMotion { next.reduceMotion = reduceMotion }
        if let voice {
            if let enabled = voice.enabled { next.voice.enabled = enabled }
            if let locale = voice.locale { next.voice.locale = locale }
            if let id = voice.synthesisVoiceId { next.voice.synthesisVoiceId = id }
            if let auto = voice.autoSpeakReplies { next.voice.autoSpeakReplies = auto }
            if let rate = voice.speechRate { next.voice.speechRate = Preferences.Voice.clampedRate(rate) }
            if let server = voice.allowServerRecognition { next.voice.allowServerRecognition = server }
        }
        if let ai {
            if let id = ai.defaultProviderId { next.ai.defaultProviderId = id }
            if let sharing = ai.contextSharing { next.ai.contextSharing = sharing }
            if let policy = ai.privateRepositoryContext { next.ai.privateRepositoryContext = policy }
        }
        if let graphics {
            if let quality = graphics.quality { next.graphics.quality = quality }
            if let ratio = graphics.maxPixelRatio { next.graphics.maxPixelRatio = ratio }
        }
        if let world, base.world.isSupported {
            if let value = world.presentation { next.world.presentation = value }
            if let value = world.floatIntensity { next.world.floatIntensity = Preferences.World.clampedIntensity(value) }
            if let value = world.lightingPreset { next.world.lightingPreset = value }
            if let value = world.cameraMode { next.world.cameraMode = value }
            if let value = world.lastRoomId { next.world.lastRoomId = value }
        }
        return next
    }
}

// Double-optional decoding: absent key → nil (leave unchanged), explicit null → .some(nil) (clear).
extension PreferencesPatch.Voice {
    enum Keys: String, CodingKey { case enabled, locale, synthesisVoiceId, autoSpeakReplies, speechRate, allowServerRecognition }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled)
        locale = try c.decodeIfPresent(String.self, forKey: .locale)
        synthesisVoiceId = c.contains(.synthesisVoiceId) ? .some(try c.decodeIfPresent(String.self, forKey: .synthesisVoiceId)) : nil
        autoSpeakReplies = try c.decodeIfPresent(Bool.self, forKey: .autoSpeakReplies)
        speechRate = try c.decodeIfPresent(Double.self, forKey: .speechRate)
        allowServerRecognition = try c.decodeIfPresent(Bool.self, forKey: .allowServerRecognition)
    }
}

extension PreferencesPatch.World {
    enum Keys: String, CodingKey { case presentation, floatIntensity, lightingPreset, cameraMode, lastRoomId }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        presentation = try c.decodeIfPresent(Preferences.World.Presentation.self, forKey: .presentation)
        floatIntensity = try c.decodeIfPresent(Double.self, forKey: .floatIntensity)
        lightingPreset = try c.decodeIfPresent(Preferences.World.LightingPreset.self, forKey: .lightingPreset)
        cameraMode = try c.decodeIfPresent(Preferences.World.CameraMode.self, forKey: .cameraMode)
        lastRoomId = try c.decodeIfPresent(String.self, forKey: .lastRoomId)
        if let lastRoomId, !Preferences.World.isValidRoomId(lastRoomId) {
            throw DecodingError.dataCorruptedError(forKey: .lastRoomId, in: c, debugDescription: "lastRoomId must match ^[a-z][a-z0-9-]{0,47}$")
        }
    }
}

extension PreferencesPatch.AI {
    enum Keys: String, CodingKey { case defaultProviderId, contextSharing, privateRepositoryContext }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        defaultProviderId = c.contains(.defaultProviderId) ? .some(try c.decodeIfPresent(String.self, forKey: .defaultProviderId)) : nil
        contextSharing = try c.decodeIfPresent(Bool.self, forKey: .contextSharing)
        privateRepositoryContext = try c.decodeIfPresent(Preferences.AI.PrivateRepositoryContext.self, forKey: .privateRepositoryContext)
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

public enum AIProviderAPI: String, Codable, Sendable {
    case openAICompatible = "openai_compatible"
    case mock
}

public enum AICredentialState: String, Codable, Sendable {
    case notRequired = "not_required"
    case missing, stored
}

public struct AIProviderCheck: Codable, Equatable, Sendable {
    public var ok: Bool
    public var checkedAt: String
    public var code: String?
    public var message: String?
    public var models: [String]

    public init(ok: Bool, checkedAt: String, code: String?, message: String?, models: [String]) {
        self.ok = ok
        self.checkedAt = checkedAt
        self.code = code
        self.message = message
        self.models = models
    }

    enum Keys: String, CodingKey { case ok, checkedAt, code, message, models }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(ok, forKey: .ok)
        try c.encode(checkedAt, forKey: .checkedAt)
        try c.encode(code, forKey: .code)
        try c.encode(message, forKey: .message)
        try c.encode(models, forKey: .models)
    }
}

public struct AIProviderInfo: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case local, cloud }
    public var id: String
    public var displayName: String
    public var kind: Kind
    public var available: Bool
    public var models: [String]
    public var api: AIProviderAPI
    public var defaultModel: String?
    public var baseUrl: String?
    public var credential: AICredentialState
    public var lastCheck: AIProviderCheck?
    public var builtIn: Bool

    public init(
        id: String, displayName: String, kind: Kind, available: Bool, models: [String], api: AIProviderAPI,
        defaultModel: String?, baseUrl: String?, credential: AICredentialState, lastCheck: AIProviderCheck?, builtIn: Bool
    ) {
        self.id = id
        self.displayName = displayName
        self.kind = kind
        self.available = available
        self.models = models
        self.api = api
        self.defaultModel = defaultModel
        self.baseUrl = baseUrl
        self.credential = credential
        self.lastCheck = lastCheck
        self.builtIn = builtIn
    }

    enum Keys: String, CodingKey { case id, displayName, kind, available, models, api, defaultModel, baseUrl, credential, lastCheck, builtIn }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(id, forKey: .id)
        try c.encode(displayName, forKey: .displayName)
        try c.encode(kind, forKey: .kind)
        try c.encode(available, forKey: .available)
        try c.encode(models, forKey: .models)
        try c.encode(api, forKey: .api)
        try c.encode(defaultModel, forKey: .defaultModel)
        try c.encode(baseUrl, forKey: .baseUrl)
        try c.encode(credential, forKey: .credential)
        try c.encode(lastCheck, forKey: .lastCheck)
        try c.encode(builtIn, forKey: .builtIn)
    }
}

/// Params of ai.saveProvider. Also the persisted form (SQLite kv "ai.providers").
public struct AIProviderSettings: Codable, Equatable, Sendable {
    public var id: String
    public var displayName: String
    public var api: AIProviderAPI
    public var baseUrl: String
    public var models: [String]
    public var defaultModel: String?

    public init(id: String, displayName: String, api: AIProviderAPI = .openAICompatible, baseUrl: String, models: [String], defaultModel: String?) {
        self.id = id
        self.displayName = displayName
        self.api = api
        self.baseUrl = baseUrl
        self.models = models
        self.defaultModel = defaultModel
    }

    enum Keys: String, CodingKey { case id, displayName, api, baseUrl, models, defaultModel }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(id, forKey: .id)
        try c.encode(displayName, forKey: .displayName)
        try c.encode(api, forKey: .api)
        try c.encode(baseUrl, forKey: .baseUrl)
        try c.encode(models, forKey: .models)
        try c.encode(defaultModel, forKey: .defaultModel)
    }
}

public struct ProviderRef: Codable, Equatable, Sendable {
    public var providerId: String
    public init(providerId: String) { self.providerId = providerId }
}

public struct ChatMessage: Codable, Equatable, Sendable {
    public enum Role: String, Codable, Sendable { case system, user, assistant }
    public var role: Role
    public var content: String
    public init(role: Role, content: String) {
        self.role = role
        self.content = content
    }
}

public enum FinishReason: String, Codable, Sendable { case stop, length, cancelled, error }

public struct AIContextRequest: Codable, Equatable, Sendable {
    public struct Repository: Codable, Equatable, Sendable {
        public var fullName: String
        public var branch: String?
        public init(fullName: String, branch: String? = nil) {
            self.fullName = fullName
            self.branch = branch
        }
    }
    public struct Include: Codable, Equatable, Sendable {
        public var repository: Bool?
        public var commits: Bool?
        public var notes: Bool?
        public var readme: Bool?
        public init(repository: Bool? = nil, commits: Bool? = nil, notes: Bool? = nil, readme: Bool? = nil) {
            self.repository = repository
            self.commits = commits
            self.notes = notes
            self.readme = readme
        }
    }
    public struct FileSelection: Codable, Equatable, Sendable {
        public var path: String
        public var startLine: Int?
        public var endLine: Int?
        public init(path: String, startLine: Int? = nil, endLine: Int? = nil) {
            self.path = path
            self.startLine = startLine
            self.endLine = endLine
        }
    }
    public var zone: ZoneID?
    public var repository: Repository?
    public var include: Include?
    public var files: [FileSelection]?

    public init(zone: ZoneID? = nil, repository: Repository? = nil, include: Include? = nil, files: [FileSelection]? = nil) {
        self.zone = zone
        self.repository = repository
        self.include = include
        self.files = files
    }
}

public enum AIContextSectionID: String, Codable, Sendable, CaseIterable { case workspace, repository, commits, notes, readme, file }

public struct AIContextSection: Codable, Equatable, Sendable {
    public enum Trust: String, Codable, Sendable { case app, untrusted }
    public var id: AIContextSectionID
    public var title: String
    public var trust: Trust
    public var text: String
    public var truncated: Bool
    public var source: AISourceRef? = nil

    enum Keys: String, CodingKey { case id, title, trust, text, truncated, source }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(trust, forKey: .trust)
        try c.encode(text, forKey: .text)
        try c.encode(truncated, forKey: .truncated)
        try c.encode(source, forKey: .source)
    }
}

public enum AIContextOmissionReason: String, Codable, Sendable {
    case sharingDisabled = "sharing_disabled"
    case privateRepository = "private_repository"
    case notConnected = "not_connected"
    case notFound = "not_found"
    case consentRequired = "consent_required"
    case tooLarge = "too_large"
    case unavailable, budget, binary
}

public struct AIContextSnapshot: Codable, Equatable, Sendable {
    public struct Omission: Codable, Equatable, Sendable {
        public var section: AIContextSectionID
        public var reason: AIContextOmissionReason
        public var path: String? = nil

        enum Keys: String, CodingKey { case section, reason, path }
        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(section, forKey: .section)
            try c.encode(reason, forKey: .reason)
            try c.encode(path, forKey: .path)
        }
    }
    public var sections: [AIContextSection]
    public var omitted: [Omission]
    public var totalChars: Int
}

public struct PreviewContextParams: Codable, Sendable {
    public var context: AIContextRequest
    public var providerId: String?
    public var conversationId: String?
}

public struct ChatParams: Codable, Sendable {
    public var messages: [ChatMessage]
    public var providerId: String?
    public var model: String?
    public var context: AIContextRequest?
    public var conversationId: String?
    public var maxOutputTokens: Int?

    public init(messages: [ChatMessage], providerId: String? = nil, model: String? = nil, context: AIContextRequest? = nil, conversationId: String? = nil, maxOutputTokens: Int? = nil) {
        self.messages = messages
        self.providerId = providerId
        self.model = model
        self.context = context
        self.conversationId = conversationId
        self.maxOutputTokens = maxOutputTokens
    }
}

public struct StreamRef: Codable, Equatable, Sendable {
    public var streamId: String
}

public struct AIChunkPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var seq: Int
    public var delta: String
}

public struct AIDonePayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var seq: Int
    public var finishReason: FinishReason
}

public struct AIErrorPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var seq: Int
    public var error: BridgeError
}

// MARK: voice

// Voice types live in BridgeDomainVoice.swift.

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
