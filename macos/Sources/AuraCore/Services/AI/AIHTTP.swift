import Foundation

/// A response whose body arrives line by line (server-sent events).
public struct AIHTTPStream: Sendable {
    public var status: Int
    /// Header names are lowercased.
    public var headers: [String: String]
    public var lines: AsyncThrowingStream<String, Error>

    public init(status: Int, headers: [String: String] = [:], lines: AsyncThrowingStream<String, Error>) {
        self.status = status
        self.headers = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { $1 })
        self.lines = lines
    }
}

/// HTTP for AI providers, behind a protocol so tests script responses.
/// Implementations throw AuraError (`.network`, `.timeout`, `.unavailable`)
/// or CancellationError, never a raw URLError.
public protocol AIHTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> HTTPResponse
    func stream(_ request: URLRequest) async throws -> AIHTTPStream
}

/// Ephemeral URLSession: no cache (prompts and replies never touch disk), no
/// cookies, no credential storage, redirects only within the request's origin
/// (an API key must not follow a redirect elsewhere).
public struct URLSessionAITransport: AIHTTPTransport {
    private let session: URLSession
    private let redirectGuard = SameOriginRedirectGuard()
    /// Longest silence between bytes (a local runtime may take this long to load a model).
    public static let idleTimeout: TimeInterval = 90
    /// Hard cap for one request, however much it streams.
    public static let resourceTimeout: TimeInterval = 600

    public init() { self.init(protocolClasses: nil) }

    init(protocolClasses: [AnyClass]?) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = Self.idleTimeout
        configuration.timeoutIntervalForResource = Self.resourceTimeout
        if let protocolClasses { configuration.protocolClasses = protocolClasses }
        session = URLSession(configuration: configuration)
    }

    public func send(_ request: URLRequest) async throws -> HTTPResponse {
        do {
            let (data, response) = try await session.data(for: request, delegate: redirectGuard)
            let http = try Self.http(response)
            return HTTPResponse(status: http.statusCode, headers: Self.headers(http), body: data)
        } catch {
            throw Self.mapped(error, request)
        }
    }

    public func stream(_ request: URLRequest) async throws -> AIHTTPStream {
        let bytes: URLSession.AsyncBytes
        let http: HTTPURLResponse
        do {
            let (body, response) = try await session.bytes(for: request, delegate: redirectGuard)
            bytes = body
            http = try Self.http(response)
        } catch {
            throw Self.mapped(error, request)
        }
        let lines = AsyncThrowingStream<String, Error> { continuation in
            let task = Task {
                do {
                    for try await line in bytes.lines { continuation.yield(line) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: Self.mapped(error, request))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return AIHTTPStream(status: http.statusCode, headers: Self.headers(http), lines: lines)
    }

    private static func http(_ response: URLResponse) throws -> HTTPURLResponse {
        guard let http = response as? HTTPURLResponse else { throw AuraError.network("not an HTTP response") }
        return http
    }

    private static func headers(_ http: HTTPURLResponse) -> [String: String] {
        var headers: [String: String] = [:]
        for (key, value) in http.allHeaderFields {
            if let key = key as? String, let value = value as? String { headers[key] = value }
        }
        return headers
    }

    /// Error text names the endpoint's origin (configuration, not secret), never the path or body.
    static func mapped(_ error: any Error, _ request: URLRequest) -> any Error {
        if error is CancellationError || error is AuraError { return error }
        guard let error = error as? URLError else { return AuraError.network("the AI provider could not be reached") }
        let origin = HTTPOrigin(request.url).map { "\($0.host):\($0.port)" } ?? "the provider"
        switch error.code {
        case .cancelled: return CancellationError()
        case .timedOut: return AuraError.timeout
        case .cannotConnectToHost, .cannotFindHost:
            let loopback = request.url?.host.map { AIProviderConfiguration.loopbackHosts.contains($0.lowercased()) } ?? false
            return AuraError.unavailable(loopback
                ? "nothing answered at \(origin); if this is a local runtime, start it"
                : "could not reach \(origin); check the provider's address and your network")
        case .notConnectedToInternet, .networkConnectionLost, .dnsLookupFailed:
            return AuraError.network("network unavailable while reaching \(origin)")
        case .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot, .secureConnectionFailed:
            return AuraError.network("the TLS connection to \(origin) failed")
        default:
            return AuraError.network("could not reach \(origin) (URLError \(error.code.rawValue))")
        }
    }
}
