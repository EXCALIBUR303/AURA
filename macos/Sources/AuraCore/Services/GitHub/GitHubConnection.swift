import Foundation

// GitHub connection foundation (Phase 3A). Shaped for GitHub's OAuth device
// flow, which suits a desktop app because it needs no client secret: AURA
// shows a short user code, the user approves it on github.com, and AURA polls
// for the token. The token goes straight into the Keychain and never crosses
// the bridge; the page sees only GitHubAuthStatus. The real HTTP
// authenticator lands in Phase 3B, once the owner has chosen the auth method
// and scopes (TASKS.md › Open decisions 4).

/// An access token. Its description is redacted so it cannot leak into logs.
public struct GitHubToken: Sendable, Equatable, CustomStringConvertible {
    public let value: String
    public init(_ value: String) { self.value = value }
    public var description: String { "GitHubToken(redacted)" }
}

public struct GitHubAccount: Equatable, Sendable {
    public var login: String
    public var scopes: [String]
    public init(login: String, scopes: [String]) {
        self.login = login
        self.scopes = scopes
    }
}

/// What the user needs to approve a device authorization.
public struct DeviceAuthorization: Equatable, Sendable {
    public var userCode: String
    public var verificationURL: URL
    public var expiresAt: Date
    public init(userCode: String, verificationURL: URL, expiresAt: Date) {
        self.userCode = userCode
        self.verificationURL = verificationURL
        self.expiresAt = expiresAt
    }
}

/// A started device authorization. `deviceCode` is a credential: keep it in memory only.
public struct DeviceAuthorizationGrant: Sendable {
    public var deviceCode: String
    public var display: DeviceAuthorization
    public var pollInterval: Duration
    public init(deviceCode: String, display: DeviceAuthorization, pollInterval: Duration) {
        self.deviceCode = deviceCode
        self.display = display
        self.pollInterval = pollInterval
    }
}

public enum GitHubConnectionFailure: Equatable, Sendable {
    /// The user declined on github.com.
    case denied
    /// The user code expired before approval.
    case expired
    /// A stored token no longer works (revoked or expired); it has been deleted.
    case revoked
    /// The token lacks scopes AURA needs.
    case insufficientScopes(missing: [String])
    /// Not configured (no OAuth client), offline, or GitHub unavailable.
    case unavailable(String)
}

public enum GitHubConnectionState: Equatable, Sendable {
    case disconnected
    case authorizing(DeviceAuthorization)
    case connected(GitHubAccount)
    case failed(GitHubConnectionFailure)

    /// The page-visible projection: never includes tokens or device codes.
    public var authStatus: GitHubAuthStatus {
        if case .connected(let account) = self { .signedIn(login: account.login, scopes: account.scopes) } else { .signedOut }
    }
}

/// Talks to GitHub's OAuth endpoints. Implementations throw AuraError:
/// `.permissionDenied` when the user declines, `.timeout` when the code
/// expires, `.notAuthenticated` for a token GitHub rejects.
public protocol GitHubAuthenticator: Sendable {
    func startDeviceAuthorization(scopes: [String]) async throws -> DeviceAuthorizationGrant
    /// Polls until the user approves, declines or the code expires. Honours task cancellation.
    func pollForToken(_ grant: DeviceAuthorizationGrant) async throws -> GitHubToken
    /// Validates a token and reports the account and the scopes it actually has.
    func account(for token: GitHubToken) async throws -> GitHubAccount
}

/// Until an OAuth client is configured, every attempt reports `unavailable`.
public struct UnconfiguredGitHubAuthenticator: GitHubAuthenticator {
    public init() {}
    private static let reason = "GitHub sign-in is not configured yet (Phase 3B)"
    public func startDeviceAuthorization(scopes: [String]) async throws -> DeviceAuthorizationGrant { throw AuraError.unavailable(Self.reason) }
    public func pollForToken(_ grant: DeviceAuthorizationGrant) async throws -> GitHubToken { throw AuraError.unavailable(Self.reason) }
    public func account(for token: GitHubToken) async throws -> GitHubAccount { throw AuraError.unavailable(Self.reason) }
}

/// Keychain-backed token storage (generic password, this device only).
public struct GitHubCredentialStore: Sendable {
    private let secrets: any SecretStore
    public init(secrets: any SecretStore) { self.secrets = secrets }

    public func token() throws -> GitHubToken? { try secrets.read(.githubToken).map(GitHubToken.init) }
    public func save(_ token: GitHubToken) throws { try secrets.write(token.value, for: .githubToken) }
    public func delete() throws { try secrets.delete(.githubToken) }
}

/// Owns the connection lifecycle: restore at launch, connect, disconnect.
/// Reports every state change through `onChange` (wired to github.authChanged in 3B).
@MainActor
public final class GitHubConnectionManager {
    public private(set) var state: GitHubConnectionState = .disconnected {
        didSet { if state != oldValue { onChange?(state) } }
    }
    public var onChange: (@MainActor (GitHubConnectionState) -> Void)?

    private let authenticator: any GitHubAuthenticator
    private let credentials: GitHubCredentialStore
    private let requiredScopes: [String]
    private var connectTask: Task<Void, Never>?

    public init(authenticator: any GitHubAuthenticator, credentials: GitHubCredentialStore, requiredScopes: [String]) {
        self.authenticator = authenticator
        self.credentials = credentials
        self.requiredScopes = requiredScopes
    }

    /// At launch: validate a stored token, if any. A rejected token is deleted.
    public func restore() async {
        guard let token = try? credentials.token() else { state = .disconnected; return }
        do {
            state = try evaluate(try await authenticator.account(for: token))
        } catch AuraError.notAuthenticated {
            try? credentials.delete()
            state = .failed(.revoked)
        } catch {
            // Offline at launch: keep the token, report why GitHub is not usable right now.
            state = .failed(.unavailable(BridgeError(error).message))
        }
    }

    /// Starts device authorization; state moves to `.authorizing`, then
    /// `.connected` or `.failed`. Calling it again restarts the attempt.
    public func connect() {
        connectTask?.cancel()
        connectTask = Task { [weak self] in await self?.runConnect() }
    }

    /// Cancels any attempt in progress and forgets the stored token.
    public func disconnect() {
        connectTask?.cancel()
        connectTask = nil
        try? credentials.delete()
        state = .disconnected
    }

    /// Waits for the current connect attempt (tests, and callers that need the outcome).
    public func waitForConnect() async { await connectTask?.value }

    private func runConnect() async {
        var outcome: GitHubConnectionState
        do {
            let grant = try await authenticator.startDeviceAuthorization(scopes: requiredScopes)
            guard !Task.isCancelled else { return }
            state = .authorizing(grant.display)
            let token = try await authenticator.pollForToken(grant)
            outcome = try evaluate(try await authenticator.account(for: token))
            // disconnect() or a newer connect() owns the state (and the Keychain) once cancelled.
            guard !Task.isCancelled else { return }
            if case .connected = outcome { try credentials.save(token) }
        } catch AuraError.permissionDenied {
            outcome = .failed(.denied)
        } catch AuraError.timeout {
            outcome = .failed(.expired)
        } catch {
            outcome = .failed(.unavailable(BridgeError(error).message))
        }
        if !Task.isCancelled { state = outcome }
    }

    private func evaluate(_ account: GitHubAccount) throws -> GitHubConnectionState {
        let missing = requiredScopes.filter { !account.scopes.contains($0) }
        return missing.isEmpty ? .connected(account) : .failed(.insufficientScopes(missing: missing))
    }
}

/// Maps a GitHub REST response status onto AuraError, for the Phase 3B client.
/// `rateLimitRemaining`/`retryAfter` come from the x-ratelimit-remaining and
/// retry-after headers.
public func gitHubError(status: Int, rateLimitRemaining: Int?, retryAfterSeconds: Int?) -> AuraError? {
    switch status {
    case 200..<300: nil
    case 401: .notAuthenticated("GitHub rejected the token")
    case 403 where rateLimitRemaining == 0 || retryAfterSeconds != nil, 429: .rateLimited(retryAfterSeconds: retryAfterSeconds)
    case 403: .permissionDenied("GitHub denied access")
    case 404: .notFound("not found on GitHub (or no access)")
    case 500..<600: .network("GitHub is unavailable (\(status))")
    default: .network("unexpected GitHub response (\(status))")
    }
}
