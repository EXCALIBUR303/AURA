import Foundation

/// Dispatches serialised bridge requests to typed handlers and always
/// produces a serialised response — it never throws or crashes on bad input.
/// Treat everything arriving here as untrusted: the web view renders
/// third-party content (READMEs, model output) even if the app's own JS is ours.
@MainActor
public final class BridgeRouter {
    public typealias Handler = @MainActor (JSONValue?) async throws -> JSONValue

    private var handlers: [BridgeMethod: Handler] = [:]

    public init() {}

    public var registeredMethods: Set<BridgeMethod> { Set(handlers.keys) }

    /// Registers a handler. Param decoding failures become `invalid_request`.
    public func register<Params: Decodable, Result: Encodable>(
        _ method: BridgeMethod,
        _ paramsType: Params.Type = Params.self,
        handler: @escaping @MainActor (Params) async throws -> Result
    ) {
        handlers[method] = { raw in
            let params: Params
            do {
                params = try (raw ?? .object([:])).decode(Params.self)
            } catch {
                throw AuraError.invalidRequest("invalid params for \(method.rawValue)")
            }
            return try JSONValue(encoding: try await handler(params))
        }
    }

    public func handle(_ requestJSON: String) async -> String {
        let started = ContinuousClock.now
        guard let data = requestJSON.data(using: .utf8),
              let request = try? BridgeCoding.decoder.decode(BridgeRequestEnvelope.self, from: data),
              request.kind == "request"
        else {
            Log.bridge.error("rejected malformed request envelope")
            return Self.serialise(.failure(id: "", error: BridgeError(code: .invalidRequest, message: "malformed request envelope")))
        }

        guard request.v == BridgeProtocol.version else {
            return Self.serialise(.failure(id: request.id, error: BridgeError(
                code: .unsupportedVersion,
                message: "host speaks protocol v\(BridgeProtocol.version), request was v\(request.v)"
            )))
        }

        guard let method = BridgeMethod(rawValue: request.method), let handler = handlers[method] else {
            Log.bridge.error("unknown method \(request.method, privacy: .public)")
            return Self.serialise(.failure(id: request.id, error: BridgeError(code: .unknownMethod, message: request.method)))
        }

        do {
            let result = try await handler(request.params)
            Log.bridge.debug("\(method.rawValue, privacy: .public) ok in \(started.duration(to: .now), privacy: .public)")
            return Self.serialise(.success(id: request.id, result: result))
        } catch {
            let bridgeError = BridgeError(error)
            Log.bridge.error("\(method.rawValue, privacy: .public) failed: \(bridgeError.code.rawValue, privacy: .public)")
            return Self.serialise(.failure(id: request.id, error: bridgeError))
        }
    }

    private static func serialise(_ response: BridgeResponseEnvelope) -> String {
        do {
            return String(decoding: try BridgeCoding.encoder.encode(response), as: UTF8.self)
        } catch {
            // Only reachable if a handler result contains non-finite numbers.
            let fallback = BridgeResponseEnvelope.failure(id: response.id, error: BridgeError(code: .internal, message: "unencodable result"))
            return String(decoding: (try? BridgeCoding.encoder.encode(fallback)) ?? Data(), as: UTF8.self)
        }
    }
}

extension JSONValue {
    /// Converts any Encodable value into a JSON tree.
    public init<T: Encodable>(encoding value: T) throws {
        self = try BridgeCoding.decoder.decode(JSONValue.self, from: BridgeCoding.encoder.encode(value))
    }
}

/// Serialises native → web events and hands them to whatever delivers them
/// (the WKWebView in the app, a recorder in tests).
@MainActor
public final class BridgeEventEmitter {
    private let deliver: @MainActor (String) -> Void

    public init(deliver: @escaping @MainActor (String) -> Void) {
        self.deliver = deliver
    }

    public func emit<Payload: Encodable & Sendable>(_ event: BridgeEventName, _ payload: Payload) {
        do {
            let data = try BridgeCoding.encoder.encode(BridgeEventEnvelope(event: event, payload: payload))
            deliver(String(decoding: data, as: UTF8.self))
        } catch {
            Log.bridge.fault("could not encode event \(event.rawValue, privacy: .public)")
        }
    }
}
