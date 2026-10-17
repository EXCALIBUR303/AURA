import Foundation

// GitHub connection lifecycle: restore at launch, device authorization,
// disconnect, session expiry and rate limits. The page sees only the derived
// GitHubAuthStatus; tokens and the device code stay in this process (and the
// Keychain).

public enum GitHubConnectionState: Equatable, Sendable {
    case disconnected
    case authorizing(DeviceAuthorization)
    case connected(GitHubAccount, [GitHubInstallation])
    case rateLimited(GitHubAccount, [GitHubInstallation], resetAt: Date)
    case expired(login: String?, reason: GitHubExpiryReason)
    case failed(GitHubConnectionErrorReason, message: String, retryable: Bool)

    /// The page-visible projection.
    public var authStatus: GitHubAuthStatus {
        switch self {
        case .disconnected: .disconnected
        case .authorizing(let display):
            .authorizing(userCode: display.userCode, verificationUri: display.verificationURL.absoluteString, expiresAt: display.expiresAt.formatted(.iso8601))
        case .connected(let account, let installations): .connected(account: account, installations: installations)
        case .rateLimited(let account, let installations, let resetAt):
            .rateLimited(account: account, installations: installations, resetAt: resetAt.formatted(.iso8601))
        case .expired(let login, let reason): .expired(login: login, reason: reason)
        case .failed(let reason, let message, let retryable): .error(reason: reason, message: message, retryable: retryable)
        }
    }

    var profile: (GitHubAccount, [GitHubInstallation])? {
        switch self {
        case .connected(let account, let installations), .rateLimited(let account, let installations, _): (account, installations)
        default: nil
        }
    }
}

@MainActor
public final class GitHubConnectionManager {
    public private(set) var state: GitHubConnectionState = .disconnected {
        didSet { if state != oldValue { onChange?(state) } }
    }
    public var onChange: (@MainActor (GitHubConnectionState) -> Void)?

    /// nil when this build has no GitHub App client id.
    private let oauth: GitHubDeviceFlowClient?
    let client: GitHubAPIClient?
    private let now: @Sendable () -> Date
    private var connectTask: Task<Void, Never>?
    private var rateLimitTask: Task<Void, Never>?
    /// Bumped by connect/disconnect so a superseded attempt cannot write state or credentials.
    private var generation = 0

    public init(oauth: GitHubDeviceFlowClient?, client: GitHubAPIClient?, now: @escaping @Sendable () -> Date = { .now }) {
        self.oauth = oauth
        self.client = client
        self.now = now
        if oauth == nil || client == nil { state = Self.notConfigured }
    }

    static let notConfigured = GitHubConnectionState.failed(.configuration, message: "GitHub sign-in is not configured in this build (no GitHub App client ID)", retryable: false)

    /// At launch: validate a stored session, if any. Keeps the session when
    /// GitHub is unreachable; deletes it when GitHub rejects it.
    public func restore() async {
        guard let client else { return }
        let stored: GitHubCredentials?
        do { stored = try await client.storedCredentials() } catch {
            state = .failed(.internal, message: "could not read the Keychain", retryable: true)
            return
        }
        guard stored != nil else { state = .disconnected; return }
        await validate()
    }

    /// Starts device authorization, returning once GitHub has issued a user
    /// code (state `.authorizing`) or failed. The outcome follows via onChange.
    public func connect() async -> GitHubConnectionState {
        guard let oauth, let client else { state = Self.notConfigured; return state }
        connectTask?.cancel()
        generation += 1
        let attempt = generation
        let grant: DeviceAuthorizationGrant
        do {
            grant = try await oauth.startDeviceAuthorization()
        } catch {
            if attempt == generation { state = Self.failure(error) }
            return state
        }
        guard attempt == generation else { return state }
        state = .authorizing(grant.display)
        connectTask = Task { [weak self] in
            do {
                let credentials = try await oauth.pollForToken(grant)
                guard let self, attempt == self.generation else { return }
                try await client.install(credentials)
                // A disconnect that ran while installing must win.
                guard attempt == self.generation else { await client.clear(); return }
                Log.github.notice("GitHub authorization approved")
                await self.validate()
            } catch is CancellationError {
            } catch {
                guard let self, attempt == self.generation else { return }
                self.state = Self.failure(error)
            }
        }
        return state
    }

    /// Cancels any authorization in progress and deletes the stored session.
    /// GitHub keeps the app authorization until the owner revokes it at
    /// github.com/settings/apps/authorizations: revoking from here needs the
    /// client secret, which AURA deliberately does not have.
    public func disconnect() async {
        generation += 1
        connectTask?.cancel()
        connectTask = nil
        rateLimitTask?.cancel()
        await client?.clear()
        state = oauth == nil ? Self.notConfigured : .disconnected
        Log.github.notice("disconnected from GitHub")
    }

    /// Re-validates the stored session with fresh data (Refresh / Retry).
    public func refresh() async {
        guard let client else { return }
        if case .authorizing = state { return }
        await client.clearCache()
        guard (try? await client.storedCredentials()) != nil else {
            if case .failed = state { state = .disconnected }
            return
        }
        await validate()
    }

    /// Waits for the current authorization attempt (tests).
    public func waitForConnect() async { await connectTask?.value }

    // MARK: reports from API calls

    /// An API call found the session gone; the client already deleted it.
    func sessionEnded(_ ended: GitHubSessionEnded) {
        rateLimitTask?.cancel()
        state = .expired(login: ended.login ?? state.profile?.0.login, reason: ended.reason)
    }

    /// An installation grants more than read access: refuse the session and
    /// delete the token, which could write. Reconnecting starts a new device
    /// flow, which validates the permissions again.
    func permissionViolation(_ violation: GitHubPermissionViolation) async {
        generation += 1
        connectTask?.cancel()
        rateLimitTask?.cancel()
        await client?.clear()
        Log.github.error("GitHub App permissions exceed read-only (\(violation.excessive.joined(separator: ","), privacy: .public)) on installation(s) \(violation.installationIds.map(String.init).joined(separator: ","), privacy: .public); session refused, credentials deleted")
        state = .failed(.excessPermissions, message: violation.userMessage, retryable: true)
    }

    /// An API call hit the rate limit. Returns to connected when it resets.
    func rateLimited(retryAfterSeconds: Int?) {
        guard let (account, installations) = state.profile else { return }
        let resetAt = now().addingTimeInterval(TimeInterval(retryAfterSeconds ?? 60))
        state = .rateLimited(account, installations, resetAt: resetAt)
        Log.github.notice("GitHub rate limit reached; resuming in \(retryAfterSeconds ?? 60, privacy: .public)s")
        rateLimitTask?.cancel()
        rateLimitTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(max(1, retryAfterSeconds ?? 60)))
            guard !Task.isCancelled else { return }
            self?.rateLimitCleared()
        }
    }

    func rateLimitCleared() {
        if case .rateLimited(let account, let installations, _) = state { state = .connected(account, installations) }
    }

    // MARK: private

    /// Loads the account and installations with the stored session.
    private func validate() async {
        guard let client else { return }
        let attempt = generation
        do {
            let account = try await Self.account(client)
            let installations = try await Self.installations(client)
            guard attempt == generation else { return }
            if var credentials = try await client.storedCredentials(), credentials.account != account {
                credentials.account = account
                try await client.install(credentials)
            }
            state = .connected(account, installations)
            Log.github.notice("""
                GitHub connected: \(installations.count, privacy: .public) installation(s), \
                permissions \(installations.map { $0.permissions.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",") }.joined(separator: " | "), privacy: .public), \
                selection \(installations.map(\.repositorySelection.rawValue).joined(separator: ","), privacy: .public)
                """)
            for installation in installations {
                let review = GitHubPermissionPolicy.review(installation.permissions)
                if !review.missing.isEmpty || !review.unneeded.isEmpty {
                    Log.github.notice("installation \(installation.id, privacy: .public): missing \(review.missing.joined(separator: ","), privacy: .public); unneeded \(review.unneeded.joined(separator: ","), privacy: .public)")
                }
            }
        } catch let violation as GitHubPermissionViolation {
            guard attempt == generation else { return }
            await permissionViolation(violation)
        } catch let ended as GitHubSessionEnded {
            guard attempt == generation else { return }
            sessionEnded(ended)
        } catch AuraError.rateLimited(let after) {
            guard attempt == generation else { return }
            let account = (try? await client.storedCredentials())?.account
            if let account {
                state = .rateLimited(account, state.profile?.1 ?? [], resetAt: now().addingTimeInterval(TimeInterval(after ?? 60)))
                rateLimited(retryAfterSeconds: after)
            } else {
                state = .failed(.network, message: "GitHub rate limit reached; try again later", retryable: true)
            }
        } catch {
            guard attempt == generation else { return }
            state = Self.failure(error)
        }
    }

    static func account(_ client: GitHubAPIClient) async throws -> GitHubAccount {
        let user = try GitHubJSON.object(try await client.get("user").body)
        guard let login = user["login"] as? String else { throw AuraError.network("unexpected /user response") }
        return GitHubAccount(login: login, name: user["name"] as? String, htmlUrl: user["html_url"] as? String ?? "https://github.com/\(login)")
    }

    static func installations(_ client: GitHubAPIClient) async throws -> [GitHubInstallation] {
        var result: [GitHubInstallation] = []
        var page = try await client.get("user/installations", query: [URLQueryItem(name: "per_page", value: "100")])
        while true {
            let object = try GitHubJSON.object(page.body)
            for item in object["installations"] as? [[String: Any]] ?? [] {
                guard let id = (item["id"] as? NSNumber)?.intValue else { continue }
                let account = (item["account"] as? [String: Any])?["login"] as? String ?? "unknown"
                let selection = GitHubInstallation.RepositorySelection(rawValue: item["repository_selection"] as? String ?? "") ?? .selected
                let permissions = (item["permissions"] as? [String: Any] ?? [:]).compactMapValues { $0 as? String }
                let manageUrl = item["html_url"] as? String ?? "https://github.com/settings/installations/\(id)"
                result.append(GitHubInstallation(id: id, accountLogin: account, repositorySelection: selection, permissions: permissions, manageUrl: manageUrl))
            }
            guard let next = page.next else { break }
            page = try await client.get(next)
        }
        try GitHubPermissionPolicy.enforce(result)
        return result
    }

    static func failure(_ error: any Error) -> GitHubConnectionState {
        switch error {
        case AuraError.permissionDenied: .failed(.denied, message: "The GitHub authorization was declined.", retryable: true)
        case AuraError.timeout: .failed(.codeExpired, message: "The code expired before it was approved.", retryable: true)
        case AuraError.unavailable(let message): .failed(.configuration, message: message, retryable: false)
        case AuraError.network(let message): .failed(.network, message: message, retryable: true)
        case AuraError.rateLimited: .failed(.network, message: "GitHub rate limit reached; try again later", retryable: true)
        default: .failed(.internal, message: BridgeError(error).message, retryable: true)
        }
    }
}

enum GitHubJSON {
    static func object(_ data: Data) throws -> [String: Any] {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AuraError.network("GitHub returned unreadable JSON")
        }
        return object
    }

    static func array(_ data: Data) throws -> [[String: Any]] {
        guard let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw AuraError.network("GitHub returned unreadable JSON")
        }
        return array
    }
}
