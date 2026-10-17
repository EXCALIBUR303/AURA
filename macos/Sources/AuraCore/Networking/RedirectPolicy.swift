import Foundation

// Shared by every credentialed client (GitHub, AI providers).

/// scheme + host + port, compared exactly (host case-insensitively). Used to
/// decide whether a redirect may carry the request's credentials onward.
public struct HTTPOrigin: Equatable, Sendable {
    public let scheme: String
    public let host: String
    public let port: Int

    public init?(_ url: URL?) {
        guard let url, let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(), !host.isEmpty else { return nil }
        let defaultPort: Int? = switch scheme { case "https": 443; case "http": 80; default: nil }
        guard let port = url.port ?? defaultPort else { return nil }
        self.scheme = scheme
        self.host = host
        self.port = port
    }
}

/// Redirect policy for credentialed requests: follow a redirect only within
/// the origin the request was sent to. URLSession re-sends the original
/// headers on a redirect, Authorization included, so a cross-origin hop (or an
/// https→http downgrade) is refused and the 3xx comes back to the caller.
public enum RedirectPolicy {
    public static func allows(from original: URL?, to destination: URL?) -> Bool {
        guard let from = HTTPOrigin(original), let to = HTTPOrigin(destination) else { return false }
        return from == to
    }
}

final class SameOriginRedirectGuard: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        if RedirectPolicy.allows(from: task.originalRequest?.url, to: request.url) { return request }
        Log.security.error("refused a cross-origin redirect (HTTP \(response.statusCode, privacy: .public))")
        return nil
    }
}
