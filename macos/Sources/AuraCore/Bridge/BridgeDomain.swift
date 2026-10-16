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

public enum GitHubAuthStatus: Codable, Equatable, Sendable {
    case signedOut
    case signedIn(login: String, scopes: [String])

    enum Keys: String, CodingKey { case state, login, scopes }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .state) {
        case "signed_in": self = .signedIn(login: try c.decode(String.self, forKey: .login), scopes: try c.decode([String].self, forKey: .scopes))
        case "signed_out": self = .signedOut
        case let other: throw DecodingError.dataCorruptedError(forKey: .state, in: c, debugDescription: "unknown state \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .signedOut:
            try c.encode("signed_out", forKey: .state)
        case .signedIn(let login, let scopes):
            try c.encode("signed_in", forKey: .state)
            try c.encode(login, forKey: .login)
            try c.encode(scopes, forKey: .scopes)
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

    enum Keys: String, CodingKey {
        case fullName, owner, name, description, isPrivate, defaultBranch, primaryLanguage, stargazerCount, pushedAt, htmlUrl
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
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
    }
}

public struct CommitSummary: Codable, Equatable, Sendable {
    public var sha: String
    public var message: String
    public var authorName: String
    public var committedAt: String
    public var htmlUrl: String
}

public struct ListRepositoriesParams: Codable, Sendable {
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

public struct ActiveChangedPayload: Codable, Equatable, Sendable {
    public var active: Bool
    public init(active: Bool) { self.active = active }
}

// MARK: logging

public enum WebLogLevel: String, Codable, Sendable { case debug, info, notice, error, fault }

public struct LogWriteParams: Codable, Sendable {
    public var level: WebLogLevel
    public var message: String
    public var context: [String: String]?
}
