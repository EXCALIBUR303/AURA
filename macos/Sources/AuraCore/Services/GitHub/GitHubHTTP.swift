import Foundation

// HTTP plumbing shared by the device-flow client and the REST client. Kept
// behind a protocol so tests script GitHub's responses without the network.

public struct HTTPResponse: Sendable {
    public var status: Int
    /// Header names are lowercased.
    public var headers: [String: String]
    public var body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { $1 })
        self.body = body
    }
}

public protocol HTTPTransport: Sendable {
    /// Throws AuraError (`.network`, `.timeout`) or CancellationError; never a raw URLError.
    func send(_ request: URLRequest) async throws -> HTTPResponse
}

/// URLSession with nothing persisted: no disk cache (responses can contain
/// private repository data), no cookies, no credential storage.
public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 30
        session = URLSession(configuration: configuration)
    }

    public func send(_ request: URLRequest) async throws -> HTTPResponse {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw AuraError.network("not an HTTP response") }
            var headers: [String: String] = [:]
            for (key, value) in http.allHeaderFields {
                if let key = key as? String, let value = value as? String { headers[key] = value }
            }
            return HTTPResponse(status: http.statusCode, headers: headers, body: data)
        } catch let error as URLError {
            switch error.code {
            case .cancelled: throw CancellationError()
            case .timedOut: throw AuraError.timeout
            default: throw AuraError.network("could not reach GitHub (URLError \(error.code.rawValue))")
            }
        }
    }
}

/// GitHub's rate-limit headers for one response.
public struct GitHubRateLimit: Equatable, Sendable {
    public var remaining: Int?
    public var resetAt: Date?
    public var retryAfterSeconds: Int?

    public init(remaining: Int?, resetAt: Date?, retryAfterSeconds: Int?) {
        self.remaining = remaining
        self.resetAt = resetAt
        self.retryAfterSeconds = retryAfterSeconds
    }

    public init(headers: [String: String]) {
        remaining = headers["x-ratelimit-remaining"].flatMap { Int($0) }
        resetAt = headers["x-ratelimit-reset"].flatMap { TimeInterval($0) }.map { Date(timeIntervalSince1970: $0) }
        retryAfterSeconds = headers["retry-after"].flatMap { Int($0) }
    }

    /// The response says the limit is used up (primary or secondary).
    public var isExhausted: Bool { remaining == 0 || retryAfterSeconds != nil }

    /// Seconds until requests may resume; nil when there is nothing to wait for.
    public func waitSeconds(now: Date) -> Int? {
        if let retryAfterSeconds { return retryAfterSeconds }
        guard remaining == 0, let resetAt, resetAt > now else { return nil }
        return Int(resetAt.timeIntervalSince(now).rounded(.up))
    }
}

/// The `rel="next"` URL from a Link header, if any.
func nextPageURL(linkHeader: String?) -> URL? {
    guard let linkHeader else { return nil }
    for part in linkHeader.split(separator: ",") {
        let pieces = part.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
        guard pieces.count >= 2, pieces.dropFirst().contains(#"rel="next""#),
              pieces[0].hasPrefix("<"), pieces[0].hasSuffix(">") else { continue }
        return URL(string: String(pieces[0].dropFirst().dropLast()))
    }
    return nil
}

/// Maps a GitHub REST response status onto AuraError. `rateLimit` comes from
/// the response headers; GitHub signals rate limits with 403 or 429.
public func gitHubError(status: Int, rateLimit: GitHubRateLimit, now: Date = .now) -> AuraError? {
    switch status {
    case 200..<300, 304: nil
    case 401: .notAuthenticated("GitHub rejected the credentials")
    case 403 where rateLimit.isExhausted, 429:
        .rateLimited(retryAfterSeconds: rateLimit.waitSeconds(now: now))
    case 403: .permissionDenied("AURA's GitHub App has no access to this (check the installation's repositories and permissions)")
    case 404: .notFound("not found on GitHub, or AURA's GitHub App cannot access it")
    case 500..<600: .network("GitHub is unavailable (\(status))")
    default: .network("unexpected GitHub response (\(status))")
    }
}

/// Validates "owner/name" before it goes into a URL path.
func validatedFullName(_ fullName: String) throws -> String {
    let parts = fullName.split(separator: "/", omittingEmptySubsequences: false)
    let owner = #"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$"#
    let name = #"^[A-Za-z0-9._-]{1,100}$"#
    guard parts.count == 2,
          parts[0].wholeMatch(of: try Regex(owner)) != nil,
          parts[1].wholeMatch(of: try Regex(name)) != nil,
          parts[1] != ".", parts[1] != ".."
    else { throw AuraError.invalidRequest("fullName must be owner/name") }
    return fullName
}
