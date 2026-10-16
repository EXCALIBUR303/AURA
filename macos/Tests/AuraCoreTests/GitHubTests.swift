import Foundation
import Testing
@testable import AuraCore

// Phase 3B GitHub integration against a scripted fake GitHub: device flow,
// Keychain credentials, refresh, revocation, rate limits, pagination, caching
// and zone suggestions. Nothing here touches the network or the real Keychain.

// MARK: fakes

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current = Date(timeIntervalSince1970: 1_800_000_000)
    var now: Date { lock.withLock { current } }
    func advance(_ seconds: TimeInterval) { lock.withLock { current = current.addingTimeInterval(seconds) } }
}

/// Answers requests from a route table. Unknown routes are a test failure (404).
final class FakeGitHub: HTTPTransport, @unchecked Sendable {
    typealias Route = (URLRequest) -> HTTPResponse
    private let lock = NSLock()
    private var routes: [String: Route] = [:]
    private var log: [URLRequest] = []

    /// Key: "POST /login/oauth/access_token" or "GET /user/installations" (path only, no query).
    func on(_ key: String, _ route: @escaping Route) { lock.withLock { routes[key] = route } }

    var requests: [URLRequest] { lock.withLock { log } }
    func count(_ key: String) -> Int { requests.filter { Self.key($0) == key }.count }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        let route = lock.withLock { () -> Route? in
            log.append(request)
            return routes[Self.key(request)]
        }
        guard let route else {
            Issue.record("unexpected request \(Self.key(request))")
            return HTTPResponse(status: 404)
        }
        return route(request)
    }

    /// A query parameter. (A static helper, so no closure nested in a
    /// main-actor test's route inherits that isolation and traps off-actor.)
    static func query(_ request: URLRequest, _ name: String) -> String? {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == name }?.value
    }

    static func queryItems(_ request: URLRequest) -> [URLQueryItem] {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
    }

    static func key(_ request: URLRequest) -> String { "\(request.httpMethod ?? "GET") \(request.url?.path ?? "")" }

    static func form(_ request: URLRequest) -> [String: String] {
        var components = URLComponents()
        components.percentEncodedQuery = String(decoding: request.httpBody ?? Data(), as: UTF8.self)
        return Dictionary((components.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { $1 })
    }

    static func json(_ object: Any, status: Int = 200, headers: [String: String] = [:]) -> HTTPResponse {
        HTTPResponse(status: status, headers: headers.merging(["X-RateLimit-Remaining": "4999"]) { a, _ in a }, body: try! JSONSerialization.data(withJSONObject: object))
    }

    /// A connected account with one installation and the given repositories.
    func serveAccount(repositories: [[String: Any]] = []) {
        on("GET /user") { _ in Self.json(["login": "octo", "name": "Octo Cat", "html_url": "https://github.com/octo"]) }
        on("GET /user/installations") { _ in
            Self.json(["total_count": 1, "installations": [[
                "id": 7, "account": ["login": "octo"], "repository_selection": "selected",
                "permissions": ["contents": "read", "metadata": "read"], "html_url": "https://github.com/settings/installations/7",
            ]]])
        }
        on("GET /user/installations/7/repositories") { _ in Self.json(["total_count": repositories.count, "repositories": repositories]) }
    }
}

func repoJSON(_ name: String, pushedAt: String?, language: String? = "Swift", topics: [String] = [], isPrivate: Bool = false) -> [String: Any] {
    [
        "full_name": "octo/\(name)", "name": name, "owner": ["login": "octo"], "description": NSNull(),
        "private": isPrivate, "default_branch": "main", "language": language ?? NSNull(), "stargazers_count": 1,
        "pushed_at": pushedAt ?? NSNull(), "html_url": "https://github.com/octo/\(name)", "topics": topics,
        "fork": false, "archived": false,
    ]
}

@MainActor
struct GitHubHarness {
    let github = FakeGitHub()
    let clock = TestClock()
    let secrets = InMemorySecretStore()
    let sleeps = SleepLog()
    let service: LiveGitHubService
    var manager: GitHubConnectionManager { service.connection }
    var client: GitHubAPIClient { service.connection.client! }

    final class SleepLog: @unchecked Sendable {
        private let lock = NSLock()
        private var values: [Duration] = []
        func record(_ value: Duration) { lock.withLock { values.append(value) } }
        var all: [Duration] { lock.withLock { values } }
    }

    init(freshFor: TimeInterval = 60) {
        let app = GitHubAppConfiguration(clientID: "Iv-test-client")
        let clock = clock, sleeps = sleeps
        let oauth = GitHubDeviceFlowClient(app: app, transport: github, sleep: { sleeps.record($0) }, now: { clock.now })
        let client = GitHubAPIClient(app: app, transport: github, oauth: oauth, store: GitHubCredentialStore(secrets: secrets), freshFor: freshFor, now: { clock.now })
        service = LiveGitHubService(connection: GitHubConnectionManager(oauth: oauth, client: client, now: { clock.now }), now: { clock.now })
    }

    func storedCredentials() throws -> GitHubCredentials? { try GitHubCredentialStore(secrets: secrets).load() }

    func store(_ credentials: GitHubCredentials) throws { try GitHubCredentialStore(secrets: secrets).save(credentials) }

    func serveDeviceCode() {
        github.on("POST /login/device/code") { _ in
            FakeGitHub.json(["device_code": "dev-123", "user_code": "WDJB-MJHT", "verification_uri": "https://github.com/login/device", "expires_in": 900, "interval": 5])
        }
    }

    func serveTokenAfterPending(_ pending: Int, slowDownAt: Int? = nil) {
        let counter = Counter()
        github.on("POST /login/oauth/access_token") { request in
            let n = counter.next()
            if n == slowDownAt { return FakeGitHub.json(["error": "slow_down", "interval": 10]) }
            if n <= pending { return FakeGitHub.json(["error": "authorization_pending"]) }
            #expect(FakeGitHub.form(request)["grant_type"] == "urn:ietf:params:oauth:grant-type:device_code")
            return FakeGitHub.json(["access_token": "ghu_access1", "expires_in": 28800, "refresh_token": "ghr_refresh1", "refresh_token_expires_in": 15897600, "token_type": "bearer", "scope": ""])
        }
    }

    final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func next() -> Int { lock.withLock { value += 1; return value } }
    }
}

// MARK: device flow

@Suite @MainActor struct GitHubDeviceFlowTests {
    @Test func connectWalksAuthorizingToConnectedAndStoresCredentials() async throws {
        let h = GitHubHarness()
        h.serveDeviceCode()
        h.serveTokenAfterPending(2, slowDownAt: 2)
        h.github.serveAccount()
        var statuses: [GitHubAuthStatus] = []
        h.service.onStatusChange = { statuses.append($0) }

        let first = await h.service.connect()
        guard case .authorizing(let code, let uri, _) = first else { Issue.record("expected authorizing, got \(first)"); return }
        #expect(code == "WDJB-MJHT")
        #expect(uri == "https://github.com/login/device")
        await h.manager.waitForConnect()

        guard case .connected(let account, let installations) = h.service.status else { Issue.record("expected connected, got \(h.service.status)"); return }
        #expect(account.login == "octo")
        #expect(installations.map(\.id) == [7])
        #expect(installations[0].readOnly)
        #expect(installations[0].permissions == ["contents": "read", "metadata": "read"])
        #expect(statuses.count == 2)

        // interval 5 s; slow_down raised it to 10 s (GitHub's value, at least +5 s).
        #expect(h.sleeps.all == [.seconds(5), .seconds(5), .seconds(10)])
        let stored = try #require(try h.storedCredentials())
        #expect(stored.accessToken == "ghu_access1")
        #expect(stored.refreshToken == "ghr_refresh1")
        #expect(stored.accessTokenExpiresAt == h.clock.now.addingTimeInterval(28800))
        #expect(stored.account?.login == "octo")

        // No client secret is ever sent, and nothing secret reaches the page.
        for request in h.github.requests {
            #expect(FakeGitHub.form(request)["client_secret"] == nil)
        }
        let wire = String(decoding: try BridgeCoding.encoder.encode(statuses), as: UTF8.self)
        #expect(!wire.contains("ghu_") && !wire.contains("ghr_") && !wire.contains("dev-123"))
    }

    @Test func declinedExpiredAndMisconfiguredAreDistinctErrors() async throws {
        for (error, reason, retryable) in [
            ("access_denied", GitHubConnectionErrorReason.denied, true),
            ("expired_token", .codeExpired, true),
            ("device_flow_disabled", .configuration, false),
            ("incorrect_client_credentials", .configuration, false),
        ] {
            let h = GitHubHarness()
            h.serveDeviceCode()
            h.github.on("POST /login/oauth/access_token") { _ in FakeGitHub.json(["error": error]) }
            _ = await h.service.connect()
            await h.manager.waitForConnect()
            guard case .error(let got, _, let gotRetryable) = h.service.status else { Issue.record("\(error): \(h.service.status)"); continue }
            #expect(got == reason, "\(error)")
            #expect(gotRetryable == retryable, "\(error)")
            #expect(try h.storedCredentials() == nil)
        }
    }

    @Test func deviceFlowDisabledAtStartIsAConfigurationError() async {
        let h = GitHubHarness()
        h.github.on("POST /login/device/code") { _ in FakeGitHub.json(["error": "device_flow_disabled"], status: 400) }
        let status = await h.service.connect()
        guard case .error(.configuration, _, false) = status else { Issue.record("got \(status)"); return }
    }

    @Test func codeExpiresAtTheDeadlineEvenWhilePending() async {
        let h = GitHubHarness()
        h.serveDeviceCode()
        let clock = h.clock
        h.github.on("POST /login/oauth/access_token") { _ in
            clock.advance(400)
            return FakeGitHub.json(["error": "authorization_pending"])
        }
        _ = await h.service.connect()
        await h.manager.waitForConnect()
        guard case .error(.codeExpired, _, true) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(h.github.count("POST /login/oauth/access_token") == 3)
    }

    @Test func disconnectDuringAuthorizationCancelsAndStoresNothing() async throws {
        let h = GitHubHarness()
        h.serveDeviceCode()
        h.github.on("POST /login/oauth/access_token") { _ in FakeGitHub.json(["error": "authorization_pending"]) }
        _ = await h.service.connect()
        let status = await h.service.disconnect()
        await h.manager.waitForConnect()
        #expect(status == .disconnected)
        #expect(try h.storedCredentials() == nil)
    }

    @Test func notConfiguredReportsConfigurationError() async {
        let service = LiveGitHubService(clientID: nil, secrets: InMemorySecretStore(), transport: FakeGitHub())
        guard case .error(.configuration, _, false) = service.status else { Issue.record("got \(service.status)"); return }
        guard case .error(.configuration, _, false) = await service.connect() else { Issue.record("connect"); return }
        await #expect(throws: AuraError.self) { try await service.listRepositories(cursor: nil, perPage: 10) }
    }
}

// MARK: session lifecycle

@Suite @MainActor struct GitHubSessionTests {
    func validCredentials(_ clock: TestClock, accessIn: TimeInterval = 3600, refreshIn: TimeInterval = 86400) -> GitHubCredentials {
        GitHubCredentials(
            accessToken: "ghu_old", accessTokenExpiresAt: clock.now.addingTimeInterval(accessIn),
            refreshToken: "ghr_old", refreshTokenExpiresAt: clock.now.addingTimeInterval(refreshIn),
            account: GitHubAccount(login: "octo", name: nil, htmlUrl: "https://github.com/octo")
        )
    }

    @Test func restoreWithoutStoredSessionIsDisconnected() async {
        let h = GitHubHarness()
        await h.service.restore()
        #expect(h.service.status == .disconnected)
        #expect(h.github.requests.isEmpty)
    }

    @Test func restoreValidatesTheStoredSession() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock))
        h.github.serveAccount()
        await h.service.restore()
        guard case .connected(let account, _) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(account.name == "Octo Cat")
        let auth = h.github.requests.first?.value(forHTTPHeaderField: "Authorization")
        #expect(auth == "Bearer ghu_old")
        #expect(h.github.requests.first?.value(forHTTPHeaderField: "X-GitHub-Api-Version") == "2022-11-28")
    }

    @Test func callsDuringLaunchRestoreWaitForIt() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock))
        h.github.serveAccount(repositories: [repoJSON("a", pushedAt: nil)])
        let service = h.service
        // The page asks for repositories while the launch restore is still running.
        service.beginRestore()
        #expect(service.status == .disconnected)
        #expect(try await service.listRepositories(cursor: nil, perPage: 10).items.map(\.name) == ["a"])
        guard case .connected = service.status else { Issue.record("got \(service.status)"); return }
    }

    @Test func expiringAccessTokenIsRefreshedWithoutASecret() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock, accessIn: 60))
        h.github.serveAccount()
        h.github.on("POST /login/oauth/access_token") { request in
            let form = FakeGitHub.form(request)
            #expect(form["grant_type"] == "refresh_token")
            #expect(form["refresh_token"] == "ghr_old")
            #expect(form["client_id"] == "Iv-test-client")
            #expect(form["client_secret"] == nil)
            return FakeGitHub.json(["access_token": "ghu_new", "expires_in": 28800, "refresh_token": "ghr_new", "refresh_token_expires_in": 15897600])
        }
        await h.service.restore()
        guard case .connected = h.service.status else { Issue.record("got \(h.service.status)"); return }
        let stored = try #require(try h.storedCredentials())
        #expect(stored.accessToken == "ghu_new")
        #expect(stored.refreshToken == "ghr_new")
        #expect(stored.account?.login == "octo")
        #expect(h.github.requests.last?.value(forHTTPHeaderField: "Authorization") == "Bearer ghu_new")
    }

    @Test func concurrentRequestsShareOneRefresh() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock, accessIn: 10))
        h.github.serveAccount()
        h.github.on("POST /login/oauth/access_token") { _ in
            FakeGitHub.json(["access_token": "ghu_new", "expires_in": 28800, "refresh_token": "ghr_new", "refresh_token_expires_in": 15897600])
        }
        let client = h.client
        async let a = client.get("user")
        async let b = client.get("user/installations")
        _ = try await (a, b)
        #expect(h.github.count("POST /login/oauth/access_token") == 1)
    }

    @Test func rejectedRefreshEndsTheSessionAsRevoked() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock, accessIn: 10))
        h.github.on("POST /login/oauth/access_token") { _ in FakeGitHub.json(["error": "bad_refresh_token"]) }
        await h.service.restore()
        #expect(h.service.status == .expired(login: "octo", reason: .revoked))
        #expect(try h.storedCredentials() == nil)
    }

    @Test func expiredRefreshTokenEndsTheSessionWithoutANetworkCall() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock, accessIn: -10, refreshIn: -10))
        await h.service.restore()
        #expect(h.service.status == .expired(login: "octo", reason: .expired))
        #expect(h.github.requests.isEmpty)
        #expect(try h.storedCredentials() == nil)
    }

    @Test func revokedTokenRefreshesOnceThenEndsTheSession() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock))
        h.github.serveAccount()
        await h.service.restore()
        // The owner revokes AURA on github.com: every token now gets 401, and the refresh token is rejected.
        h.github.on("GET /user/installations/7/repositories") { _ in HTTPResponse(status: 401) }
        h.github.on("GET /user/installations") { _ in HTTPResponse(status: 401) }
        h.github.on("POST /login/oauth/access_token") { _ in FakeGitHub.json(["error": "bad_refresh_token"]) }
        await #expect(throws: AuraError.notAuthenticated("GitHub rejected the session; reconnect")) {
            try await h.service.listRepositories(cursor: nil, perPage: 10)
        }
        #expect(h.service.status == .expired(login: "octo", reason: .revoked))
        #expect(try h.storedCredentials() == nil)
        await #expect(throws: AuraError.self) { try await h.service.listRepositories(cursor: nil, perPage: 10) }
    }

    @Test func offlineAtLaunchKeepsTheSession() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock))
        h.github.on("GET /user") { _ in HTTPResponse(status: 503) }
        await h.service.restore()
        guard case .error(.network, _, true) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(try h.storedCredentials() != nil)

        h.github.serveAccount()
        guard case .connected = await h.service.refresh() else { Issue.record("refresh did not reconnect"); return }
    }

    @Test func disconnectDeletesCredentialsAndForgetsData() async throws {
        let h = GitHubHarness()
        try h.store(validCredentials(h.clock))
        h.github.serveAccount(repositories: [repoJSON("a", pushedAt: "2026-01-01T00:00:00Z")])
        await h.service.restore()
        _ = try await h.service.listRepositories(cursor: nil, perPage: 10)
        #expect(await h.service.disconnect() == .disconnected)
        #expect(try h.storedCredentials() == nil)
        await #expect(throws: AuraError.notAuthenticated("not connected to GitHub")) {
            try await h.service.listRepositories(cursor: nil, perPage: 10)
        }
    }
}

// MARK: data

@Suite @MainActor struct GitHubDataTests {
    func connected(_ h: GitHubHarness, repositories: [[String: Any]] = []) async throws {
        try h.store(GitHubCredentials(accessToken: "ghu_ok"))
        h.github.serveAccount(repositories: repositories)
        await h.service.restore()
    }

    @Test func repositoriesArePagedAcrossUpstreamPagesDeduplicatedAndSorted() async throws {
        let h = GitHubHarness()
        try await connected(h)
        h.github.on("GET /user/installations/7/repositories") { request in
            let page = FakeGitHub.query(request, "page")
            if page == "2" {
                return FakeGitHub.json(["repositories": [repoJSON("old", pushedAt: "2025-01-01T00:00:00Z"), repoJSON("new", pushedAt: "2026-05-01T00:00:00Z")]])
            }
            return FakeGitHub.json(
                ["repositories": [repoJSON("mid", pushedAt: "2026-02-01T00:00:00Z", isPrivate: true), repoJSON("never", pushedAt: nil), repoJSON("new", pushedAt: "2026-05-01T00:00:00Z")]],
                headers: ["Link": #"<https://api.github.com/user/installations/7/repositories?per_page=100&page=2>; rel="next", <https://api.github.com/user/installations/7/repositories?per_page=100&page=2>; rel="last""#]
            )
        }
        let first = try await h.service.listRepositories(cursor: nil, perPage: 2)
        #expect(first.items.map(\.name) == ["new", "mid"])
        #expect(first.items[1].isPrivate)
        #expect(first.nextCursor == "offset:2")
        let second = try await h.service.listRepositories(cursor: first.nextCursor, perPage: 2)
        #expect(second.items.map(\.name) == ["old", "never"])
        #expect(second.nextCursor == nil)
        // The second page came from the in-memory list, not new requests.
        #expect(h.github.count("GET /user/installations/7/repositories") == 2)
        await #expect(throws: AuraError.invalidRequest("invalid cursor")) { try await h.service.listRepositories(cursor: "page:2", perPage: 2) }
    }

    @Test func noInstallationsMeansNoRepositoriesNotAnError() async throws {
        let h = GitHubHarness()
        try h.store(GitHubCredentials(accessToken: "ghu_ok"))
        h.github.serveAccount()
        h.github.on("GET /user/installations") { _ in FakeGitHub.json(["total_count": 0, "installations": []]) }
        await h.service.restore()
        guard case .connected(_, let installations) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(installations.isEmpty)
        #expect(try await h.service.listRepositories(cursor: nil, perPage: 10).items.isEmpty)
    }

    @Test func writeLevelPermissionsAreFlagged() {
        let installation = GitHubInstallation(id: 1, accountLogin: "o", repositorySelection: .all, permissions: ["contents": "write", "metadata": "read"], manageUrl: "")
        #expect(!installation.readOnly)
    }

    @Test func repositoryDetailBranchesAndCommits() async throws {
        let h = GitHubHarness()
        try await connected(h)
        var repo = repoJSON("app", pushedAt: "2026-01-01T00:00:00Z")
        repo["forks_count"] = 2
        repo["open_issues_count"] = 3
        repo["license"] = ["spdx_id": "NOASSERTION"]
        repo["created_at"] = "2025-01-01T00:00:00Z"
        repo["updated_at"] = "2026-01-02T00:00:00Z"
        h.github.on("GET /repos/octo/app") { _ in FakeGitHub.json(repo) }
        h.github.on("GET /repos/octo/app/languages") { _ in FakeGitHub.json(["TypeScript": 900, "Swift": 4000, "CSS": 900]) }
        h.github.on("GET /repos/octo/app/branches") { request in
            let page = FakeGitHub.query(request, "page")
            return FakeGitHub.json(
                page == "1" ? [["name": "main", "commit": ["sha": "a1"], "protected": true], ["name": "dev", "commit": ["sha": "b2"], "protected": false]] : [["name": "z", "commit": ["sha": "c3"]]],
                headers: page == "1" ? ["Link": #"<https://api.github.com/repos/octo/app/branches?page=2>; rel="next""#] : [:]
            )
        }
        h.github.on("GET /repos/octo/app/commits") { request in
            let query = FakeGitHub.queryItems(request)
            #expect(query.contains(URLQueryItem(name: "sha", value: "dev")))
            #expect(query.contains(URLQueryItem(name: "per_page", value: "2")))
            return FakeGitHub.json([[
                "sha": "b2", "html_url": "https://github.com/octo/app/commit/b2", "author": ["login": "octo"],
                "commit": ["message": "Fix <script>", "author": ["name": "Octo", "date": "2026-01-01T00:00:00Z"], "committer": ["date": "2026-01-02T00:00:00Z"]],
            ]])
        }

        let detail = try await h.service.repository(fullName: "octo/app")
        #expect(detail.languages.map(\.name) == ["Swift", "CSS", "TypeScript"])
        #expect(detail.license == nil)
        #expect(detail.forksCount == 2 && detail.openIssuesCount == 3)

        let branches = try await h.service.listBranches(fullName: "octo/app", cursor: nil, perPage: 2)
        #expect(branches.items.map(\.name) == ["main", "dev"])
        #expect(branches.items.map(\.isDefault) == [true, false])
        #expect(branches.items[0].isProtected)
        #expect(branches.nextCursor == "page:2")
        #expect(try await h.service.listBranches(fullName: "octo/app", cursor: "page:2", perPage: 2).nextCursor == nil)

        let commits = try await h.service.listCommits(fullName: "octo/app", branch: "dev", limit: 2)
        #expect(commits == [CommitSummary(sha: "b2", message: "Fix <script>", authorName: "Octo", authorLogin: "octo", committedAt: "2026-01-02T00:00:00Z", htmlUrl: "https://github.com/octo/app/commit/b2")])
    }

    @Test func emptyRepositoryHasNoCommitsAndMissingRepositoryIsNotFound() async throws {
        let h = GitHubHarness()
        try await connected(h)
        h.github.on("GET /repos/octo/empty/commits") { _ in FakeGitHub.json(["message": "Git Repository is empty."], status: 409) }
        h.github.on("GET /repos/octo/secret") { _ in FakeGitHub.json(["message": "Not Found"], status: 404) }
        h.github.on("GET /repos/octo/locked/commits") { _ in FakeGitHub.json(["message": "Resource not accessible by integration"], status: 403) }
        #expect(try await h.service.listCommits(fullName: "octo/empty", branch: nil, limit: 5).isEmpty)
        await #expect(throws: AuraError.self) { try await h.service.repository(fullName: "octo/secret") }
        do {
            _ = try await h.service.listCommits(fullName: "octo/locked", branch: nil, limit: 5)
            Issue.record("expected permission error")
        } catch let error as AuraError {
            #expect(error.bridgeError.code == .permissionDenied)
        }
        guard case .connected = h.service.status else { Issue.record("a 403/404 must not change the connection: \(h.service.status)"); return }
    }

    @Test func invalidRepositoryNamesNeverReachTheNetwork() async throws {
        let h = GitHubHarness()
        try await connected(h)
        let before = h.github.requests.count
        for bad in ["../x", "a/b/c", "octo/..", "octo", "-bad/x", "octo/a b", "octo/%2e%2e"] {
            await #expect(throws: AuraError.invalidRequest("fullName must be owner/name"), "\(bad)") {
                try await h.service.listCommits(fullName: bad, branch: nil, limit: 1)
            }
        }
        #expect(h.github.requests.count == before)
    }

    @Test func rateLimitIsReportedHonouredAndRecovered() async throws {
        let h = GitHubHarness()
        try await connected(h)
        let reset = h.clock.now.addingTimeInterval(120)
        h.github.on("GET /repos/octo/app/commits") { _ in
            FakeGitHub.json(["message": "API rate limit exceeded"], status: 403, headers: ["X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Int(reset.timeIntervalSince1970))])
        }
        await #expect(throws: AuraError.rateLimited(retryAfterSeconds: 120)) { try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1) }
        guard case .rateLimited(let account, _, let resetAt) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(account.login == "octo")
        #expect(resetAt == reset.formatted(.iso8601))

        // While limited, calls fail fast without touching GitHub.
        let sent = h.github.requests.count
        await #expect(throws: AuraError.self) { try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1) }
        #expect(h.github.requests.count == sent)

        // After the reset, requests flow again and the state returns to connected.
        h.clock.advance(121)
        h.github.on("GET /repos/octo/app/commits") { _ in FakeGitHub.json([]) }
        #expect(try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1).isEmpty)
        guard case .connected = h.service.status else { Issue.record("got \(h.service.status)"); return }
    }

    @Test func secondaryRateLimitUsesRetryAfter() {
        let limit = GitHubRateLimit(headers: ["retry-after": "30", "x-ratelimit-remaining": "100"])
        #expect(gitHubError(status: 403, rateLimit: limit) == .rateLimited(retryAfterSeconds: 30))
        #expect(gitHubError(status: 429, rateLimit: GitHubRateLimit(headers: [:])) == .rateLimited(retryAfterSeconds: nil))
        #expect(gitHubError(status: 403, rateLimit: GitHubRateLimit(headers: ["x-ratelimit-remaining": "4000"]))?.bridgeError.code == .permissionDenied)
        #expect(gitHubError(status: 401, rateLimit: limit)?.bridgeError.code == .notAuthenticated)
        #expect(gitHubError(status: 502, rateLimit: limit)?.bridgeError.retryable == true)
    }

    @Test func etagRevalidationServesCachedDataOn304() async throws {
        let h = GitHubHarness(freshFor: 30)
        try await connected(h)
        let calls = GitHubHarness.Counter()
        h.github.on("GET /repos/octo/app/commits") { request in
            if calls.next() == 1 { return FakeGitHub.json([["sha": "s1", "commit": ["message": "m", "author": ["name": "n"]]]], headers: ["ETag": #"W/"abc""#]) }
            #expect(request.value(forHTTPHeaderField: "If-None-Match") == #"W/"abc""#)
            return HTTPResponse(status: 304, headers: ["X-RateLimit-Remaining": "4999"])
        }
        let first = try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1)
        _ = try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1) // fresh: no request
        #expect(h.github.count("GET /repos/octo/app/commits") == 1)
        h.clock.advance(31)
        let third = try await h.service.listCommits(fullName: "octo/app", branch: nil, limit: 1)
        #expect(h.github.count("GET /repos/octo/app/commits") == 2)
        #expect(third == first)
    }

    @Test func linkHeaderParsing() {
        #expect(nextPageURL(linkHeader: #"<https://api.github.com/x?page=3>; rel="next", <https://api.github.com/x?page=9>; rel="last""#)?.absoluteString == "https://api.github.com/x?page=3")
        #expect(nextPageURL(linkHeader: #"<https://api.github.com/x?page=1>; rel="prev""#) == nil)
        #expect(nextPageURL(linkHeader: nil) == nil)
    }

    @Test func clientRefusesNonAPIURLs() async throws {
        let h = GitHubHarness()
        try await connected(h)
        await #expect(throws: AuraError.invalidRequest("refusing a non-GitHub API URL")) {
            _ = try await h.client.get(URL(string: "https://evil.example/user")!)
        }
    }
}

// MARK: secrets

@Suite struct GitHubSecretTests {
    @Test func credentialsNeverPrintTheirTokens() {
        let credentials = GitHubCredentials(accessToken: "ghu_secret", refreshToken: "ghr_secret")
        #expect(!"\(credentials)".contains("secret"))
        #expect(!String(describing: credentials).contains("secret"))
        let grant = DeviceAuthorizationGrant(deviceCode: "dev-secret", display: DeviceAuthorization(userCode: "A", verificationURL: URL(string: "https://github.com/login/device")!, expiresAt: .now), pollInterval: .seconds(5))
        #expect(!"\(grant)".contains("dev-secret"))
    }

    @Test func unreadableStoredCredentialsAreDeleted() throws {
        let secrets = InMemorySecretStore([.githubCredentials: "not json"])
        #expect(try GitHubCredentialStore(secrets: secrets).load() == nil)
        #expect(try secrets.read(.githubCredentials) == nil)
    }

    @Test func clientIDValidation() {
        #expect(GitHubAppConfiguration.isPlausibleClientID("Iv23liQPMjrFatEpesLu"))
        #expect(!GitHubAppConfiguration.isPlausibleClientID("short"))
        #expect(!GitHubAppConfiguration.isPlausibleClientID("has space in it"))
    }
}

// MARK: zone suggestions

@Suite struct ProjectZoneClassifierTests {
    func repo(_ name: String, _ description: String? = nil, language: String? = nil, topics: [String] = []) -> RepositorySummary {
        RepositorySummary(fullName: "o/\(name)", owner: "o", name: name, description: description, isPrivate: false, defaultBranch: "main",
                          primaryLanguage: language, stargazerCount: 0, pushedAt: nil, htmlUrl: "", topics: topics)
    }

    @Test func clearSignalsSuggestAZoneWithReasons() {
        let firmware = ProjectZoneClassifier.suggest(repo("esp32-weather", "ESP32 sensor node", language: "C++", topics: ["iot"]))
        #expect(firmware?.zone == .hardware)
        #expect(firmware?.confidence == .high)
        #expect(firmware?.reasons.contains("topic: iot") == true)

        let llm = ProjectZoneClassifier.suggest(repo("ragBot", "Local LLM assistant", language: "Python", topics: ["machine-learning"]))
        #expect(llm?.zone == .aiLab)
        #expect(llm?.reasons.contains("topic: machine-learning") == true)

        let web = ProjectZoneClassifier.suggest(repo("portfolio-site", language: "TypeScript", topics: ["nextjs"]))
        #expect(web?.zone == .software)

        #expect(ProjectZoneClassifier.suggest(repo("AURA", "Native macOS app with an AI companion", language: "TypeScript"))?.zone != nil)
    }

    @Test func ambiguousOrSignallessRepositoriesGetNoSuggestion() {
        #expect(ProjectZoneClassifier.suggest(repo("notes", language: "Python")) == nil)
        #expect(ProjectZoneClassifier.suggest(repo("misc")) == nil)
        // One AI keyword vs one software keyword: a tie is not guessed.
        #expect(ProjectZoneClassifier.suggest(repo("llm-web")) == nil)
    }

    @Test func manuallyAssignedRepositoriesAreNeverResuggested() {
        let repos = [repo("firmware-a", topics: ["firmware"]), repo("firmware-b", topics: ["firmware"])]
        let records = [ProjectRecord(id: "o/firmware-a", zone: .software, pinned: false, notes: "", updatedAt: "")]
        #expect(ProjectZoneClassifier.suggestions(for: repos, records: records).map(\.id) == ["o/firmware-b"])
    }
}
