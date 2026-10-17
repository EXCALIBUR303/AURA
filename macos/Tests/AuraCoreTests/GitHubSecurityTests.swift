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
