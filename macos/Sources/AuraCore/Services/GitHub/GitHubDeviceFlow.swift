import Foundation

// GitHub App user authorization via the OAuth device flow (RFC 8628).
// AURA shows a short user code, the owner approves it on github.com, and
// AURA polls for a user access token. No client secret is involved: GitHub
// does not require one for the device flow, nor for refreshing tokens that
// the device flow issued. GitHub Apps take no OAuth scopes; what a token can
// do is the intersection of the app's permissions (set when registering it:
// Metadata and Contents, read-only) and the user's own access.

/// The GitHub App's public identifier. Not a secret.
public struct GitHubAppConfiguration: Sendable, Equatable {
    public var clientID: String
    public var webBase: URL
    public var apiBase: URL

    public init(clientID: String, webBase: URL = URL(string: "https://github.com")!, apiBase: URL = URL(string: "https://api.github.com")!) {
        self.clientID = clientID
        self.webBase = webBase
        self.apiBase = apiBase
    }

    public static func isPlausibleClientID(_ value: String) -> Bool {
        value.wholeMatch(of: /[A-Za-z0-9._-]{8,64}/) != nil
    }
}

/// Everything AURA keeps about a session, stored as one Keychain item.
/// Its description is redacted so it can never leak into logs.
public struct GitHubCredentials: Codable, Equatable, Sendable, CustomStringConvertible {
    public var accessToken: String
    /// nil when the app does not issue expiring tokens.
    public var accessTokenExpiresAt: Date?
    public var refreshToken: String?
    public var refreshTokenExpiresAt: Date?
    /// The account the token belongs to, once known (for "Reconnect as …").
    public var account: GitHubAccount?

    public init(accessToken: String, accessTokenExpiresAt: Date? = nil, refreshToken: String? = nil, refreshTokenExpiresAt: Date? = nil, account: GitHubAccount? = nil) {
        self.accessToken = accessToken
        self.accessTokenExpiresAt = accessTokenExpiresAt
        self.refreshToken = refreshToken
        self.refreshTokenExpiresAt = refreshTokenExpiresAt
        self.account = account
    }

    public var description: String { "GitHubCredentials(redacted)" }

    /// True while the access token is valid for at least `leeway` more.
    public func accessTokenUsable(at now: Date, leeway: TimeInterval = 300) -> Bool {
        accessTokenExpiresAt.map { $0.timeIntervalSince(now) > leeway } ?? true
    }

    public func canRefresh(at now: Date) -> Bool {
        guard refreshToken != nil else { return false }
        return refreshTokenExpiresAt.map { $0 > now } ?? true
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

/// A started device authorization. `deviceCode` is a credential: memory only, never logged.
public struct DeviceAuthorizationGrant: Sendable, CustomStringConvertible {
    public var deviceCode: String
    public var display: DeviceAuthorization
    public var pollInterval: Duration
    public init(deviceCode: String, display: DeviceAuthorization, pollInterval: Duration) {
        self.deviceCode = deviceCode
        self.display = display
        self.pollInterval = pollInterval
    }
    public var description: String { "DeviceAuthorizationGrant(redacted)" }
}

/// github.com's OAuth endpoints. Errors are AuraError:
/// `.permissionDenied` the user declined, `.timeout` the code expired,
/// `.unavailable` the app is misconfigured (device flow disabled, bad client
/// id), `.notAuthenticated` a refresh token GitHub rejects.
public struct GitHubDeviceFlowClient: Sendable {
    public typealias Sleep = @Sendable (Duration) async throws -> Void

    private let app: GitHubAppConfiguration
    private let transport: any HTTPTransport
    private let sleep: Sleep
    private let now: @Sendable () -> Date

    public init(
        app: GitHubAppConfiguration,
        transport: any HTTPTransport,
        sleep: @escaping Sleep = { try await Task.sleep(for: $0) },
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.app = app
        self.transport = transport
        self.sleep = sleep
        self.now = now
    }

    public func startDeviceAuthorization() async throws -> DeviceAuthorizationGrant {
        let json = try await post("login/device/code", ["client_id": app.clientID])
        if let error = json["error"] as? String { throw Self.failure(error) }
        guard let deviceCode = json["device_code"] as? String,
              let userCode = json["user_code"] as? String,
              let uri = (json["verification_uri"] as? String).flatMap(URL.init(string:)),
              uri.scheme == "https", uri.host == app.webBase.host
        else { throw AuraError.network("unexpected device authorization response") }
        let expiresIn = Self.number(json["expires_in"]) ?? 900
        let interval = max(Self.number(json["interval"]) ?? 5, 1)
        Log.github.notice("device authorization started (expires in \(Int(expiresIn), privacy: .public)s, interval \(Int(interval), privacy: .public)s)")
        return DeviceAuthorizationGrant(
            deviceCode: deviceCode,
            display: DeviceAuthorization(userCode: userCode, verificationURL: uri, expiresAt: now().addingTimeInterval(expiresIn)),
            pollInterval: .seconds(interval)
        )
    }

    /// Polls until the user approves, declines or the code expires. Honours
    /// cancellation, `interval` and `slow_down`. Brief network failures are
    /// retried until the code expires.
    public func pollForToken(_ grant: DeviceAuthorizationGrant) async throws -> GitHubCredentials {
        var interval = grant.pollInterval
        while true {
            try await sleep(interval)
            try Task.checkCancellation()
            guard now() < grant.display.expiresAt else { throw AuraError.timeout }
            let json: [String: Any]
            do {
                json = try await post("login/oauth/access_token", [
                    "client_id": app.clientID,
                    "device_code": grant.deviceCode,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                ])
            } catch AuraError.network, AuraError.timeout {
                Log.github.error("device authorization poll failed to reach GitHub; retrying")
                continue
            }
            switch json["error"] as? String {
            case nil:
                return try credentials(from: json)
            case "authorization_pending":
                continue
            case "slow_down":
                // GitHub adds 5 s and reports the new interval.
                let suggested = Self.number(json["interval"]).map { Duration.seconds($0) } ?? interval + .seconds(5)
                interval = max(suggested, interval + .seconds(5))
                Log.github.notice("device authorization asked to slow down")
            case let error?:
                throw Self.failure(error)
            }
        }
    }

    /// Exchanges a refresh token for a new access + refresh token pair. The
    /// old pair stops working once this succeeds.
    public func refresh(_ credentials: GitHubCredentials) async throws -> GitHubCredentials {
        guard let refreshToken = credentials.refreshToken else { throw AuraError.notAuthenticated("no refresh token") }
        let json = try await post("login/oauth/access_token", [
            "client_id": app.clientID,
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
        ])
        if let error = json["error"] as? String {
            // This client ID already issued the session, so any OAuth rejection
            // here means the grant is gone. Revoking AURA on github.com yields
            // incorrect_client_credentials rather than bad_refresh_token
            // (observed live, 2026-10-17). End the session instead of reporting
            // a configuration error that would strand the user.
            Log.github.error("GitHub refused the token refresh (\(error, privacy: .public))")
            throw AuraError.notAuthenticated("GitHub rejected the refresh token")
        }
        var next = try self.credentials(from: json)
        next.account = credentials.account
        Log.github.notice("refreshed GitHub user access token")
        return next
    }

    // MARK: private

    private func credentials(from json: [String: Any]) throws -> GitHubCredentials {
        guard let token = json["access_token"] as? String, !token.isEmpty else {
            throw AuraError.network("unexpected token response")
        }
        let issued = now()
        return GitHubCredentials(
            accessToken: token,
            accessTokenExpiresAt: Self.number(json["expires_in"]).map { issued.addingTimeInterval($0) },
            refreshToken: json["refresh_token"] as? String,
            refreshTokenExpiresAt: Self.number(json["refresh_token_expires_in"]).map { issued.addingTimeInterval($0) }
        )
    }

    private func post(_ path: String, _ form: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: app.webBase.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue(GitHubAPIClient.userAgent, forHTTPHeaderField: "User-Agent")
        var components = URLComponents()
        components.queryItems = form.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = Data((components.percentEncodedQuery ?? "").utf8)

        let response = try await transport.send(request)
        if response.status == 429 || (response.status == 403 && GitHubRateLimit(headers: response.headers).isExhausted) {
            throw AuraError.rateLimited(retryAfterSeconds: GitHubRateLimit(headers: response.headers).waitSeconds(now: now()))
        }
        guard let object = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] else {
            throw AuraError.network("GitHub returned an unreadable response (\(response.status))")
        }
        // Errors arrive as 200 or 4xx with an `error` field; anything else non-2xx is GitHub being unavailable.
        guard (200..<300).contains(response.status) || object["error"] != nil else {
            throw AuraError.network("GitHub returned \(response.status)")
        }
        return object
    }

    private static func number(_ value: Any?) -> TimeInterval? {
        (value as? NSNumber)?.doubleValue ?? (value as? String).flatMap(TimeInterval.init)
    }

    private static func failure(_ code: String) -> AuraError {
        Log.github.error("GitHub OAuth error \(code, privacy: .public)")
        switch code {
        case "access_denied": return .permissionDenied("the GitHub authorization was declined")
        case "expired_token": return .timeout
        case "device_flow_disabled": return .unavailable("device flow is disabled in the GitHub App settings")
        case "incorrect_client_credentials", "unsupported_grant_type", "incorrect_device_code":
            return .unavailable("GitHub rejected AURA's GitHub App configuration (\(code))")
        default: return .network("GitHub OAuth error \(code)")
        }
    }
}
