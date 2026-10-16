import Foundation

// Mirrors shared/contracts/envelope.ts and errors.ts.

public enum BridgeProtocol {
    public static let version = 1
    /// WKScriptMessageHandler name.
    public static let handlerName = "aura"
    /// Global the web side exposes for event delivery.
    public static let webGlobal = "__AURA_BRIDGE__"
}

public enum BridgeErrorCode: String, Codable, CaseIterable, Sendable {
    case invalidRequest = "invalid_request"
    case unknownMethod = "unknown_method"
    case unsupportedVersion = "unsupported_version"
    case permissionDenied = "permission_denied"
    case notAuthenticated = "not_authenticated"
    case notFound = "not_found"
    case rateLimited = "rate_limited"
    case network
    case timeout
    case cancelled
    case unavailable
    case `internal`
}

public struct BridgeError: Codable, Equatable, Sendable, Error {
    public var code: BridgeErrorCode
    public var message: String
    public var retryable: Bool

    public init(code: BridgeErrorCode, message: String, retryable: Bool = false) {
        self.code = code
        self.message = message
        self.retryable = retryable
    }
}

/// Incoming request with params left untyped until the method is known.
public struct BridgeRequestEnvelope: Codable, Sendable {
    public var kind: String
    public var v: Int
    public var id: String
    public var method: String
    public var params: JSONValue?
}

public struct BridgeResponseEnvelope: Encodable, Sendable {
    public let kind = "response"
    public let v = BridgeProtocol.version
    public var id: String
    public var ok: Bool
    public var result: JSONValue?
    public var error: BridgeError?

    public static func success(id: String, result: JSONValue) -> Self {
        Self(id: id, ok: true, result: result, error: nil)
    }

    public static func failure(id: String, error: BridgeError) -> Self {
        Self(id: id, ok: false, result: nil, error: error)
    }

    enum CodingKeys: String, CodingKey { case kind, v, id, ok, result, error }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(v, forKey: .v)
        try container.encode(id, forKey: .id)
        try container.encode(ok, forKey: .ok)
        if ok {
            try container.encode(result ?? .object([:]), forKey: .result)
        } else {
            try container.encode(error, forKey: .error)
        }
    }
}

public struct BridgeEventEnvelope<Payload: Encodable & Sendable>: Encodable, Sendable {
    public let kind = "event"
    public let v = BridgeProtocol.version
    public var event: String
    public var payload: Payload

    public init(event: BridgeEventName, payload: Payload) {
        self.event = event.rawValue
        self.payload = payload
    }

    enum CodingKeys: String, CodingKey { case kind, v, event, payload }
}

/// Empty `{}` params/result.
public struct Empty: Codable, Equatable, Sendable {
    public init() {}
}
