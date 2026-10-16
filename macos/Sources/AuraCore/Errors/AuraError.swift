import Foundation

/// Internal error type for native services. Every service throws AuraError
/// (or a BridgeError); the router maps anything else to `.internal`.
/// Messages must never contain tokens, keys, or personal data.
public enum AuraError: Error, Equatable, Sendable {
    case invalidRequest(String)
    case permissionDenied(String)
    case notAuthenticated(String)
    case notFound(String)
    case rateLimited(retryAfterSeconds: Int?)
    case network(String)
    case timeout
    case cancelled
    /// Feature not built yet, or a dependency (model runtime, network) is offline.
    case unavailable(String)
    case `internal`(String)

    public var bridgeError: BridgeError {
        switch self {
        case .invalidRequest(let m): BridgeError(code: .invalidRequest, message: m)
        case .permissionDenied(let m): BridgeError(code: .permissionDenied, message: m)
        case .notAuthenticated(let m): BridgeError(code: .notAuthenticated, message: m)
        case .notFound(let m): BridgeError(code: .notFound, message: m)
        case .rateLimited(let after):
            BridgeError(code: .rateLimited, message: after.map { "retry after \($0)s" } ?? "rate limited", retryable: true)
        case .network(let m): BridgeError(code: .network, message: m, retryable: true)
        case .timeout: BridgeError(code: .timeout, message: "timed out", retryable: true)
        case .cancelled: BridgeError(code: .cancelled, message: "cancelled")
        case .unavailable(let m): BridgeError(code: .unavailable, message: m)
        case .internal(let m): BridgeError(code: .internal, message: m)
        }
    }
}

extension BridgeError {
    /// Maps any thrown error onto the wire vocabulary.
    public init(_ error: any Error) {
        switch error {
        case let error as BridgeError: self = error
        case let error as AuraError: self = error.bridgeError
        case is CancellationError: self = AuraError.cancelled.bridgeError
        case is DecodingError: self = BridgeError(code: .internal, message: "decoding failed")
        default: self = BridgeError(code: .internal, message: String(describing: type(of: error)))
        }
    }
}
