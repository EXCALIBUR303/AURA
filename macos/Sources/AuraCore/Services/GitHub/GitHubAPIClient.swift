import Foundation

/// Keychain-backed session storage: one generic-password item holding the
/// JSON-encoded GitHubCredentials (this device only, never synced).
public struct GitHubCredentialStore: Sendable {
    private let secrets: any SecretStore
    public init(secrets: any SecretStore) { self.secrets = secrets }

    public func load() throws -> GitHubCredentials? {
        guard let json = try secrets.read(.githubCredentials) else { return nil }
        do {
            return try JSONDecoder().decode(GitHubCredentials.self, from: Data(json.utf8))
        } catch {
            Log.security.error("stored GitHub credentials unreadable; deleting them")
            try? secrets.delete(.githubCredentials)
            return nil
        }
    }

    public func save(_ credentials: GitHubCredentials) throws {
        try secrets.write(String(decoding: try JSONEncoder().encode(credentials), as: UTF8.self), for: .githubCredentials)
    }

    public func delete() throws { try secrets.delete(.githubCredentials) }
}

/// The stored session ended and was deleted; the user must reconnect.
public struct GitHubSessionEnded: Error, Equatable, Sendable {
    public var reason: GitHubExpiryReason
    public var login: String?
}

/// Authenticated GitHub REST access. Owns the in-memory copy of the
/// credentials, refreshes the access token before it expires (one refresh at
/// a time), retries once after a 401, tracks the primary rate limit, and keeps
/// a small in-memory ETag cache: a 304 does not count against the rate limit.
/// Nothing it fetches is written to disk.
public actor GitHubAPIClient {
    public static let userAgent = "AURA-macOS"
    public static let apiVersion = "2022-11-28"

    struct CachedResponse {
        var etag: String
        var body: Data
        var next: URL?
        var fetchedAt: Date
    }

    public struct Response: Sendable {
        public var body: Data
        public var next: URL?
    }

    private let app: GitHubAppConfiguration
    private let transport: any HTTPTransport
    private let oauth: GitHubDeviceFlowClient
    private let store: GitHubCredentialStore
    private let now: @Sendable () -> Date
    /// Serve a cached response without revalidating for this long.
    private let freshFor: TimeInterval
    private let maxCacheEntries = 256

    private var credentials: GitHubCredentials?
    private var loaded = false
    private var refreshing: Task<GitHubCredentials, any Error>?
    private var cache: [URL: CachedResponse] = [:]
    public private(set) var rateLimit = GitHubRateLimit(remaining: nil, resetAt: nil, retryAfterSeconds: nil)

    public init(
        app: GitHubAppConfiguration,
        transport: any HTTPTransport,
        oauth: GitHubDeviceFlowClient,
        store: GitHubCredentialStore,
        freshFor: TimeInterval = 60,
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.app = app
        self.transport = transport
        self.oauth = oauth
        self.store = store
        self.freshFor = freshFor
        self.now = now
    }

    // MARK: session

    /// The stored credentials, loaded from the Keychain on first use.
    public func storedCredentials() throws -> GitHubCredentials? {
        if !loaded {
            credentials = try store.load()
            loaded = true
        }
        return credentials
    }

    /// Saves new credentials (after authorization, or with an updated account).
    public func install(_ next: GitHubCredentials) throws {
        try store.save(next)
        credentials = next
        loaded = true
    }

    /// Forgets the session: Keychain item, memory and cache.
    public func clear() {
        refreshing?.cancel()
        refreshing = nil
        credentials = nil
        loaded = true
        cache.removeAll()
        rateLimit = GitHubRateLimit(remaining: nil, resetAt: nil, retryAfterSeconds: nil)
        do { try store.delete() } catch { Log.security.error("could not delete GitHub credentials from the Keychain") }
    }

    public func clearCache() { cache.removeAll() }

    /// Refreshes now regardless of expiry (developer smoke test).
    public func forceRefresh() async throws {
        guard let current = try storedCredentials() else { throw AuraError.notAuthenticated("not connected") }
        _ = try await refresh(from: current)
    }

    // MARK: requests

    /// `emptyOn`: statuses that mean "no items" for this endpoint (409 for commits of an empty repository).
    public func get(_ path: String, query: [URLQueryItem] = [], emptyOn: Set<Int> = []) async throws -> Response {
        var components = URLComponents(url: app.apiBase.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw AuraError.invalidRequest("bad GitHub path") }
        return try await get(url, emptyOn: emptyOn)
    }

    /// GETs an absolute API URL (for example a Link `next` URL). Only the configured API host is allowed.
    public func get(_ url: URL, emptyOn: Set<Int> = []) async throws -> Response {
        guard url.scheme == app.apiBase.scheme, url.host == app.apiBase.host else {
            throw AuraError.invalidRequest("refusing a non-GitHub API URL")
        }
        if rateLimit.remaining == 0, let wait = rateLimit.waitSeconds(now: now()) {
            throw AuraError.rateLimited(retryAfterSeconds: wait)
        }
        if let cached = cache[url], now().timeIntervalSince(cached.fetchedAt) < freshFor {
            return Response(body: cached.body, next: cached.next)
        }

        var token = try await validCredentials()
        var response = try await send(url, token: token.accessToken)
        if response.status == 401 {
            // Possibly expired early or revoked: one refresh, then one retry.
            guard token.canRefresh(at: now()) else { throw endSession(.revoked) }
            token = try await refresh(from: token)
            response = try await send(url, token: token.accessToken)
            if response.status == 401 { throw endSession(.revoked) }
        }

        let limit = GitHubRateLimit(headers: response.headers)
        if limit.remaining != nil || limit.retryAfterSeconds != nil { rateLimit = limit }

        if response.status == 304, var cached = cache[url] {
            cached.fetchedAt = now()
            cache[url] = cached
            return Response(body: cached.body, next: cached.next)
        }
        if emptyOn.contains(response.status) { return Response(body: Data("[]".utf8), next: nil) }
        if let error = gitHubError(status: response.status, rateLimit: limit, now: now()) {
            if case .rateLimited = error, limit.retryAfterSeconds != nil {
                // Secondary rate limit: remember it so we stop sending until it passes.
                rateLimit.retryAfterSeconds = nil
                rateLimit.remaining = 0
                rateLimit.resetAt = now().addingTimeInterval(TimeInterval(limit.retryAfterSeconds!))
            }
            throw error
        }

        let next = nextPageURL(linkHeader: response.headers["link"])
        if let etag = response.headers["etag"] {
            if cache.count >= maxCacheEntries, let oldest = cache.min(by: { $0.value.fetchedAt < $1.value.fetchedAt })?.key {
                cache.removeValue(forKey: oldest)
            }
            cache[url] = CachedResponse(etag: etag, body: response.body, next: next, fetchedAt: now())
        }
        return Response(body: response.body, next: next)
    }

    /// Time until the primary rate limit resets, when it is exhausted.
    public func rateLimitResetAt() -> Date? {
        guard rateLimit.remaining == 0, let resetAt = rateLimit.resetAt, resetAt > now() else { return nil }
        return resetAt
    }

    // MARK: private

    private func send(_ url: URL, token: String) async throws -> HTTPResponse {
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue(Self.apiVersion, forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let etag = cache[url]?.etag { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }
        return try await transport.send(request)
    }

    private func validCredentials() async throws -> GitHubCredentials {
        guard let current = try storedCredentials() else { throw AuraError.notAuthenticated("not connected to GitHub") }
        if current.accessTokenUsable(at: now()) { return current }
        guard current.canRefresh(at: now()) else { throw endSession(.expired) }
        return try await refresh(from: current)
    }

    /// One refresh at a time: concurrent callers share the in-flight one.
    private func refresh(from current: GitHubCredentials) async throws -> GitHubCredentials {
        if let refreshing { return try await refreshing.value }
        let oauth = oauth
        let task = Task { try await oauth.refresh(current) }
        refreshing = task
        defer { refreshing = nil }
        do {
            let next = try await task.value
            try install(next)
            return next
        } catch AuraError.notAuthenticated {
            let reason: GitHubExpiryReason = current.refreshTokenExpiresAt.map { $0 <= now() } == true ? .expired : .revoked
            throw endSession(reason)
        }
    }

    private func endSession(_ reason: GitHubExpiryReason) -> GitHubSessionEnded {
        let login = credentials?.account?.login
        Log.github.notice("GitHub session ended (\(reason.rawValue, privacy: .public)); credentials deleted")
        clear()
        return GitHubSessionEnded(reason: reason, login: login)
    }
}
