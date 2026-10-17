import Foundation
import Testing
@testable import AuraCore

// Phase 3C-A GitHub hardening: credentialed requests never follow a redirect
// off their origin, and the installation's permissions are checked against
// AURA's read-only allowlist.

// MARK: redirects

/// Stubs the network *below* URLSession, so URLSession's own redirect
/// handling (and AURA's redirect delegate) runs for real.
final class RedirectStubProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var redirects: [String: String] = [:]
    nonisolated(unsafe) private static var log: [URLRequest] = []

    static func redirect(_ from: String, to: String) { lock.withLock { redirects[from] = to } }
    static func requests(host: String) -> [URLRequest] { lock.withLock { log.filter { $0.url?.host == host } } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let target = Self.lock.withLock { () -> String? in
            Self.log.append(request)
            return Self.redirects[url.absoluteString]
        }
        if let target {
            let response = HTTPURLResponse(url: url, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: ["Location": target])!
            var next = URLRequest(url: URL(string: target)!)
            next.allHTTPHeaderFields = request.allHTTPHeaderFields
            client?.urlProtocol(self, wasRedirectedTo: next, redirectResponse: response)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@Suite struct GitHubRedirectTests {
    @Test func policyAllowsOnlyTheExactOrigin() {
        let api = URL(string: "https://api.github.com/user")
        #expect(RedirectPolicy.allows(from: api, to: URL(string: "https://api.github.com/repositories/1")))
        #expect(RedirectPolicy.allows(from: api, to: URL(string: "https://API.GitHub.com:443/x")))
        // Lookalikes and prefix tricks
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://api.github.com.evil.invalid/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://evil.invalid/api.github.com/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://api.github.com@evil.invalid/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://github.com/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://objects.githubusercontent.com/x")))
        // Downgrade, other port, missing pieces
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "http://api.github.com/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "https://api.github.com:8443/x")))
        #expect(!RedirectPolicy.allows(from: api, to: URL(string: "/relative")))
        #expect(!RedirectPolicy.allows(from: nil, to: api))
    }

    @Test func crossOriginRedirectIsNotFollowedAndCredentialsStayHome() async throws {
        let transport = URLSessionTransport(protocolClasses: [RedirectStubProtocol.self])
        RedirectStubProtocol.redirect("https://cross-a.test/user", to: "https://cross-b.test/steal")
        var request = URLRequest(url: URL(string: "https://cross-a.test/user")!)
        request.setValue("Bearer ghu_secret", forHTTPHeaderField: "Authorization")

        let response = try await transport.send(request)

        #expect(response.status == 302)
        #expect(RedirectStubProtocol.requests(host: "cross-b.test").isEmpty)
        #expect(gitHubError(status: response.status, rateLimit: GitHubRateLimit(headers: [:])) == .network("GitHub redirected the request to another origin; AURA did not follow it"))
    }

    @Test func downgradeRedirectIsNotFollowed() async throws {
        let transport = URLSessionTransport(protocolClasses: [RedirectStubProtocol.self])
        RedirectStubProtocol.redirect("https://downgrade.test/user", to: "http://downgrade.test/user")
        var request = URLRequest(url: URL(string: "https://downgrade.test/user")!)
        request.setValue("Bearer ghu_secret", forHTTPHeaderField: "Authorization")

        let response = try await transport.send(request)

        #expect(response.status == 302)
        #expect(RedirectStubProtocol.requests(host: "downgrade.test").count == 1)
    }

    @Test func sameOriginRedirectIsStillFollowed() async throws {
        // GitHub answers a renamed repository with a 301 to /repositories/{id} on the same host.
        let transport = URLSessionTransport(protocolClasses: [RedirectStubProtocol.self])
        RedirectStubProtocol.redirect("https://same.test/repos/octo/old", to: "https://same.test/repositories/42")
        var request = URLRequest(url: URL(string: "https://same.test/repos/octo/old")!)
        request.setValue("Bearer ghu_secret", forHTTPHeaderField: "Authorization")

        let response = try await transport.send(request)

        #expect(response.status == 200)
        let followed = RedirectStubProtocol.requests(host: "same.test").filter { $0.url?.path == "/repositories/42" }
        #expect(followed.count == 1)
    }

    @Test @MainActor func apiClientTreatsARefusedRedirectAsAnErrorAndSendsNothingElse() async throws {
        let h = GitHubHarness()
        try h.store(GitHubCredentials(accessToken: "ghu_a"))
        h.github.on("GET /user") { _ in HTTPResponse(status: 302, headers: ["Location": "https://evil.invalid/user"]) }

        await #expect(throws: AuraError.network("GitHub redirected the request to another origin; AURA did not follow it")) {
            _ = try await h.client.get("user")
        }
        #expect(h.github.requests.count == 1)
        #expect(h.github.requests.allSatisfy { $0.url?.host == "api.github.com" })
    }
}

// MARK: permissions

@Suite struct GitHubPermissionPolicyTests {
    @Test func readOnlyRequiredPermissionsAreClean() {
        let review = GitHubPermissionPolicy.review(["metadata": "read", "contents": "read"])
        #expect(review == .init(missing: [], unneeded: [], excessive: []))
        #expect(review.isAcceptable)
    }

    @Test func extraReadPermissionsAreUnneededButAcceptable() {
        let review = GitHubPermissionPolicy.review(["metadata": "read", "contents": "read", "issues": "read", "actions": "read"])
        #expect(review.unneeded == ["actions", "issues"])
        #expect(review.isAcceptable)
    }

    @Test func missingContentsIsReportedNotRefused() {
        let review = GitHubPermissionPolicy.review(["metadata": "read"])
        #expect(review.missing == ["contents"])
        #expect(review.isAcceptable)
    }

    @Test func anythingAboveReadIsExcessive() {
        let review = GitHubPermissionPolicy.review(["metadata": "read", "contents": "write", "administration": "admin", "workflows": "maintain"])
        #expect(review.excessive == ["administration=admin", "contents=write", "workflows=maintain"])
        #expect(!review.isAcceptable)
    }

    @Test func installationCarriesTheReview() {
        let installation = GitHubInstallation(id: 1, accountLogin: "octo", repositorySelection: .selected, permissions: ["metadata": "read", "issues": "read"], manageUrl: "https://github.com/settings/installations/1")
        #expect(installation.readOnly)
        #expect(installation.missingPermissions == ["contents"])
        #expect(installation.unneededPermissions == ["issues"])
    }
}

@Suite @MainActor struct GitHubPermissionEnforcementTests {
    static let credentials = GitHubCredentials(accessToken: "ghu_old", account: GitHubAccount(login: "octo", name: nil, htmlUrl: "https://github.com/octo"))

    func serve(_ h: GitHubHarness, permissions: [String: String]) {
        h.github.on("GET /user") { _ in FakeGitHub.json(["login": "octo", "name": "Octo Cat", "html_url": "https://github.com/octo"]) }
        h.github.on("GET /user/installations") { _ in
            FakeGitHub.json(["total_count": 1, "installations": [[
                "id": 7, "account": ["login": "octo"], "repository_selection": "selected",
                "permissions": permissions, "html_url": "https://github.com/settings/installations/7",
            ]]])
        }
        h.github.on("GET /user/installations/7/repositories") { _ in FakeGitHub.json(["total_count": 1, "repositories": [repoJSON("a", pushedAt: nil, isPrivate: true)]]) }
    }

    @Test func restoreRefusesAWriteCapableSessionAndDeletesTheToken() async throws {
        let h = GitHubHarness()
        try h.store(Self.credentials)
        serve(h, permissions: ["metadata": "read", "contents": "write"])

        await h.service.restore()

        guard case .error(.excessPermissions, let message, true) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(message.contains("contents=write"))
        #expect(message.contains("https://github.com/settings/installations/7"))
        #expect(!message.contains("ghu_"))
        #expect(try h.storedCredentials() == nil)
        await #expect(throws: AuraError.notAuthenticated("not connected to GitHub")) {
            _ = try await h.service.listRepositories(cursor: nil, perPage: 30)
        }
        // Nothing after the installation check: no repository data was fetched.
        #expect(h.github.count("GET /user/installations/7/repositories") == 0)
    }

    @Test func permissionsRaisedMidSessionEndTheSessionOnTheNextFetch() async throws {
        let h = GitHubHarness()
        try h.store(Self.credentials)
        serve(h, permissions: ["metadata": "read", "contents": "read"])
        await h.service.restore()
        guard case .connected = h.service.status else { Issue.record("got \(h.service.status)"); return }

        // The owner accepts new permissions for the app on github.com.
        serve(h, permissions: ["metadata": "read", "contents": "read", "pull_requests": "write"])
        await h.client.clearCache()

        await #expect(throws: AuraError.self) {
            _ = try await h.service.listRepositories(cursor: nil, perPage: 30)
        }
        guard case .error(.excessPermissions, _, _) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(try h.storedCredentials() == nil)
    }

    @Test func unneededReadPermissionsKeepTheSessionAndAreReported() async throws {
        let h = GitHubHarness()
        try h.store(Self.credentials)
        serve(h, permissions: ["metadata": "read", "contents": "read", "issues": "read"])

        await h.service.restore()

        guard case .connected(_, let installations) = h.service.status else { Issue.record("got \(h.service.status)"); return }
        #expect(installations.first?.unneededPermissions == ["issues"])
        #expect(try h.storedCredentials() != nil)
        #expect(try await h.service.listRepositories(cursor: nil, perPage: 30).items.count == 1)
    }

    @Test func networkFailureDuringAFetchKeepsTheSession() async throws {
        let h = GitHubHarness()
        try h.store(Self.credentials)
        serve(h, permissions: ["metadata": "read", "contents": "read"])
        await h.service.restore()
        h.github.on("GET /user/installations") { _ in HTTPResponse(status: 502) }
        await h.client.clearCache()

        await #expect(throws: AuraError.network("GitHub is unavailable (502)")) {
            _ = try await h.service.listRepositories(cursor: nil, perPage: 30)
        }
        #expect(try h.storedCredentials() != nil)
        guard case .connected = h.service.status else { Issue.record("got \(h.service.status)"); return }
    }
}

// MARK: end to end through the bridge

/// The production stack (AppServices, router, LiveGitHubService, Keychain
/// store interface) against a scripted GitHub whose installation has just
/// been given write access: what the page sees, and what is left behind.
@Suite @MainActor struct GitHubExcessPermissionBridgeTests {
    @Test func writeAccessEndsTheSessionAndEveryPageCallFails() async throws {
        let fake = FakeGitHub()
        fake.on("GET /user") { _ in FakeGitHub.json(["login": "octo", "name": "Octo Cat", "html_url": "https://github.com/octo"]) }
        fake.on("GET /user/installations") { _ in
            FakeGitHub.json(["total_count": 1, "installations": [[
                "id": 7, "account": ["login": "octo"], "repository_selection": "all",
                "permissions": ["metadata": "read", "contents": "write", "administration": "read"],
                "html_url": "https://github.com/settings/installations/7",
            ]]])
        }
        fake.on("GET /user/installations/7/repositories") { _ in FakeGitHub.json(["total_count": 0, "repositories": []]) }

        let secrets = InMemorySecretStore()
        try GitHubCredentialStore(secrets: secrets).save(GitHubCredentials(accessToken: "ghu_live_looking_token", account: GitHubAccount(login: "octo", name: nil, htmlUrl: "https://github.com/octo")))
        let github = LiveGitHubService(clientID: "Iv-test-client", secrets: secrets, transport: fake)
        let recorder = EventRecorder()
        let services = AppServices(
            configuration: AppConfiguration(environment: .development, devServerURL: nil, webRoot: nil, dataDirectory: URL(fileURLWithPath: "/dev/null"), appVersion: "0.1.0", build: "test"),
            store: try await AppStore(database: Database(path: ":memory:")),
            secrets: secrets, github: github, deliverEvent: { recorder.record($0) }
        )

        await github.restore()

        // The page is told, with where to fix it and no secrets.
        let status = try await call(services, "github.getAuthStatus")
        #expect(status["result"]?["state"] == .string("error"))
        #expect(status["result"]?["reason"] == .string("excess_permissions"))
        #expect(status["result"]?["retryable"] == .bool(true))
        guard case .string(let message)? = status["result"]?["message"] else { Issue.record("no message"); return }
        #expect(message.contains("contents=write"))
        #expect(!message.contains("administration")) // read-level extras are not "excess"
        #expect(message.contains("https://github.com/settings/installations/7"))
        #expect(recorder.raw.contains { $0.contains("excess_permissions") })
        #expect(!recorder.raw.contains { $0.contains("ghu_live_looking_token") })

        // The token is gone, and every data method refuses.
        #expect(try GitHubCredentialStore(secrets: secrets).load() == nil)
        for method in ["github.listRepositories", "github.getRepository", "github.listBranches", "github.listCommits"] {
            let params = method == "github.listRepositories" ? "{}" : #"{"fullName":"octo/aura"}"#
            let reply = try await call(services, method, params)
            #expect(reply["ok"] == .bool(false), "\(method)")
            #expect(reply["error"]?["code"] == .string("not_authenticated"), "\(method)")
        }
        #expect(!fake.requests.contains { $0.url?.path.contains("/repositories") == true || $0.url?.path.contains("/repos/") == true })
        // Nothing but GETs ever left AURA.
        #expect(fake.requests.allSatisfy { $0.httpMethod == "GET" })
    }
}

@Suite @MainActor struct AIKeyEntryTests {
    @Test func localAndUnknownProvidersAreRejectedBeforeAnySheetOpens() async throws {
        let h = try await AIHarness()
        try await h.saveLocal()
        await #expect(throws: AuraError.invalidRequest("local providers take no key")) { try await h.registry.prepareKeyEntry("local") }
        await #expect(throws: AuraError.notFound("no AI provider nope")) { try await h.registry.prepareKeyEntry("nope") }
        await #expect(throws: AuraError.invalidRequest("the mock provider takes no key")) { try await h.registry.prepareKeyEntry("mock") }
        try await h.saveCloud()
        try await h.registry.prepareKeyEntry("cloud")
    }

    @Test func aRejectedKeyStillTellsThePageThePromptIsOver() async throws {
        let h = try await AIHarness()
        try await h.saveCloud()
        try await h.registry.storeKey("sk-original", for: "cloud")
        let before = h.recorder.names().count
        await #expect(throws: AuraError.self) { try await h.registry.requestKey("cloud") { _ in "bad key with spaces" } }
        #expect(h.recorder.names().count == before + 1)
        #expect(h.recorder.names().last == "ai.providersChanged")
        #expect(try h.secrets.read(.aiProviderKey("cloud")) == "sk-original") // the old key survives
    }

    @Test func keyShapeIsCheckedByTheSheetFirst() throws {
        #expect(try AICredentialStore.normalized("  sk-abc123 \n") == "sk-abc123")
        for bad in ["", "   ", "has space", "tab\there", String(repeating: "k", count: 513)] {
            #expect(throws: AuraError.self) { try AICredentialStore.normalized(bad) }
        }
    }

    @Test func unreachableHostsAreDescribedForTheirKind() {
        let remote = URLRequest(url: URL(string: "https://api.example.invalid/v1/models")!)
        let local = URLRequest(url: URL(string: "http://127.0.0.1:11434/v1/models")!)
        #expect(URLSessionAITransport.mapped(URLError(.cannotFindHost), remote) as? AuraError
            == .unavailable("could not reach api.example.invalid:443; check the provider's address and your network"))
        #expect((URLSessionAITransport.mapped(URLError(.cannotConnectToHost), local) as? AuraError).map { "\($0)" }?.contains("start it") == true)
    }
}
