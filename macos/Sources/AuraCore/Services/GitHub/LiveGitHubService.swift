import Foundation

/// The real GitHubService: the connection manager plus repository, branch
/// and commit reads through GitHubAPIClient. Read-only by construction: it
/// only ever sends GET requests to the REST API.
@MainActor
public final class LiveGitHubService: GitHubService {
    public let connection: GitHubConnectionManager
    public var onStatusChange: (@MainActor (GitHubAuthStatus) -> Void)?

    /// All repositories across installations, deduplicated and sorted, so
    /// paging through them with a cursor is stable.
    private var repositoryList: (fetchedAt: Date, items: [RepositorySummary])?
    private let listFreshFor: TimeInterval
    private let now: @Sendable () -> Date
    /// Upper bound on upstream pages per installation (100 repositories each).
    private let maxPagesPerInstallation = 50

    public init(connection: GitHubConnectionManager, listFreshFor: TimeInterval = 120, now: @escaping @Sendable () -> Date = { .now }) {
        self.connection = connection
        self.listFreshFor = listFreshFor
        self.now = now
        connection.onChange = { [weak self] state in
            if case .connected = state {} else if case .rateLimited = state {} else { self?.repositoryList = nil }
            self?.onStatusChange?(state.authStatus)
        }
    }

    /// Builds the production stack for a GitHub App client id (nil: not configured).
    public convenience init(clientID: String?, secrets: any SecretStore, transport: any HTTPTransport = URLSessionTransport()) {
        guard let clientID else {
            self.init(connection: GitHubConnectionManager(oauth: nil, client: nil))
            return
        }
        let app = GitHubAppConfiguration(clientID: clientID)
        let oauth = GitHubDeviceFlowClient(app: app, transport: transport)
        let client = GitHubAPIClient(app: app, transport: transport, oauth: oauth, store: GitHubCredentialStore(secrets: secrets))
        self.init(connection: GitHubConnectionManager(oauth: oauth, client: client))
    }

    public var status: GitHubAuthStatus { connection.state.authStatus }

    private var restoring: Task<Void, Never>?

    public func restore() async {
        beginRestore()
        await waitUntilRestored()
    }

    /// Starts the launch restore without waiting; calls made meanwhile wait for it.
    public func beginRestore() {
        let connection = connection
        restoring = Task { await connection.restore() }
    }

    public func waitUntilRestored() async { await restoring?.value }

    public func connect() async -> GitHubAuthStatus { await connection.connect().authStatus }

    public func disconnect() async -> GitHubAuthStatus {
        repositoryList = nil
        await connection.disconnect()
        return status
    }

    public func refresh() async -> GitHubAuthStatus {
        repositoryList = nil
        await connection.refresh()
        return status
    }

    // MARK: repositories

    public func listRepositories(cursor: String?, perPage: Int) async throws -> Page<RepositorySummary> {
        let offset = try Self.offset(from: cursor)
        let all = try await accessibleRepositories()
        guard offset <= all.count else { throw AuraError.invalidRequest("cursor is past the end") }
        let end = min(offset + perPage, all.count)
        return Page(items: Array(all[offset..<end]), nextCursor: end < all.count ? "offset:\(end)" : nil)
    }

    public func accessibleRepositories() async throws -> [RepositorySummary] {
        if let list = repositoryList, now().timeIntervalSince(list.fetchedAt) < listFreshFor { return list.items }
        let items = try await perform { client in
            var byName: [String: RepositorySummary] = [:]
            for installation in try await GitHubConnectionManager.installations(client) {
                var page = try await client.get("user/installations/\(installation.id)/repositories", query: [URLQueryItem(name: "per_page", value: "100")])
                var pages = 1
                while true {
                    let object = try GitHubJSON.object(page.body)
                    for json in object["repositories"] as? [[String: Any]] ?? [] {
                        if let repo = Self.repository(json) { byName[repo.fullName] = repo }
                    }
                    guard let next = page.next, pages < self.maxPagesPerInstallation else {
                        if page.next != nil { Log.github.error("stopped listing repositories after \(pages, privacy: .public) pages") }
                        break
                    }
                    page = try await client.get(next)
                    pages += 1
                }
            }
            return byName.values.sorted { lhs, rhs in
                switch (lhs.pushedAt, rhs.pushedAt) {
                case let (l?, r?) where l != r: l > r
                case (_?, nil): true
                case (nil, _?): false
                default: lhs.fullName.lowercased() < rhs.fullName.lowercased()
                }
            }
        }
        repositoryList = (now(), items)
        Log.github.info("listed \(items.count, privacy: .public) accessible repositories")
        return items
    }

    public func repository(fullName: String) async throws -> RepositoryDetail {
        let fullName = try validatedFullName(fullName)
        return try await perform { client in
            let json = try GitHubJSON.object(try await client.get("repos/\(fullName)").body)
            guard let summary = Self.repository(json) else { throw AuraError.network("unexpected repository response") }
            let languages = try GitHubJSON.object(try await client.get("repos/\(fullName)/languages").body)
                .compactMap { name, bytes in (bytes as? NSNumber).map { LanguageShare(name: name, bytes: $0.intValue) } }
                .sorted { $0.bytes != $1.bytes ? $0.bytes > $1.bytes : $0.name < $1.name }
            return RepositoryDetail(
                summary: summary,
                languages: languages,
                forksCount: (json["forks_count"] as? NSNumber)?.intValue ?? 0,
                openIssuesCount: (json["open_issues_count"] as? NSNumber)?.intValue ?? 0,
                license: ((json["license"] as? [String: Any])?["spdx_id"] as? String).flatMap { $0 == "NOASSERTION" ? nil : $0 },
                createdAt: json["created_at"] as? String ?? "",
                updatedAt: json["updated_at"] as? String ?? ""
            )
        }
    }

    public func listBranches(fullName: String, cursor: String?, perPage: Int) async throws -> Page<BranchSummary> {
        let fullName = try validatedFullName(fullName)
        let page = try Self.page(from: cursor)
        let defaultBranch = try await repository(fullName: fullName).summary.defaultBranch
        return try await perform { client in
            let response = try await client.get("repos/\(fullName)/branches", query: [
                URLQueryItem(name: "per_page", value: String(perPage)),
                URLQueryItem(name: "page", value: String(page)),
            ])
            let items = try GitHubJSON.array(response.body).compactMap { json -> BranchSummary? in
                guard let name = json["name"] as? String, let sha = (json["commit"] as? [String: Any])?["sha"] as? String else { return nil }
                return BranchSummary(name: name, sha: sha, isProtected: json["protected"] as? Bool ?? false, isDefault: name == defaultBranch)
            }
            return Page(items: items, nextCursor: response.next != nil ? "page:\(page + 1)" : nil)
        }
    }

    public func listCommits(fullName: String, branch: String?, limit: Int) async throws -> [CommitSummary] {
        let fullName = try validatedFullName(fullName)
        var query = [URLQueryItem(name: "per_page", value: String(limit))]
        if let branch, !branch.isEmpty { query.append(URLQueryItem(name: "sha", value: branch)) }
        return try await perform { client in
            // GitHub answers 409 for an empty repository.
            let body = try await client.get("repos/\(fullName)/commits", query: query, emptyOn: [409]).body
            return try GitHubJSON.array(body).compactMap { json -> CommitSummary? in
                guard let sha = json["sha"] as? String, let commit = json["commit"] as? [String: Any] else { return nil }
                let author = commit["author"] as? [String: Any]
                let committer = commit["committer"] as? [String: Any]
                return CommitSummary(
                    sha: sha,
                    message: commit["message"] as? String ?? "",
                    authorName: author?["name"] as? String ?? "unknown",
                    authorLogin: (json["author"] as? [String: Any])?["login"] as? String,
                    committedAt: committer?["date"] as? String ?? author?["date"] as? String ?? "",
                    htmlUrl: json["html_url"] as? String ?? ""
                )
            }
        }
    }

    /// Developer smoke test: refresh the access token now.
    public func forceTokenRefresh() async throws {
        try await perform { client in try await client.forceRefresh() }
    }

    // MARK: private

    /// Runs API work, reporting session expiry and rate limits to the
    /// connection so its state (and github.authChanged) follows reality.
    private func perform<T>(_ work: (GitHubAPIClient) async throws -> T) async throws -> T {
        guard let client = connection.client else { throw AuraError.unavailable("GitHub sign-in is not configured in this build") }
        await waitUntilRestored()
        switch connection.state {
        case .connected, .rateLimited: break
        case .authorizing, .disconnected, .expired: throw AuraError.notAuthenticated("not connected to GitHub")
        case .failed(let reason, _, _) where reason != .network: throw AuraError.notAuthenticated("not connected to GitHub")
        case .failed: break // offline at launch: try anyway, the session is kept
        }
        do {
            let result = try await work(client)
            connection.rateLimitCleared()
            return result
        } catch let ended as GitHubSessionEnded {
            connection.sessionEnded(ended)
            throw AuraError.notAuthenticated(ended.reason == .expired ? "the GitHub session expired; reconnect" : "GitHub rejected the session; reconnect")
        } catch AuraError.rateLimited(let after) {
            connection.rateLimited(retryAfterSeconds: after)
            throw AuraError.rateLimited(retryAfterSeconds: after)
        }
    }

    static func repository(_ json: [String: Any]) -> RepositorySummary? {
        guard let fullName = json["full_name"] as? String, let name = json["name"] as? String else { return nil }
        return RepositorySummary(
            fullName: fullName,
            owner: (json["owner"] as? [String: Any])?["login"] as? String ?? String(fullName.split(separator: "/").first ?? ""),
            name: name,
            description: json["description"] as? String,
            isPrivate: json["private"] as? Bool ?? false,
            defaultBranch: json["default_branch"] as? String ?? "main",
            primaryLanguage: json["language"] as? String,
            stargazerCount: (json["stargazers_count"] as? NSNumber)?.intValue ?? 0,
            pushedAt: json["pushed_at"] as? String,
            htmlUrl: json["html_url"] as? String ?? "https://github.com/\(fullName)",
            topics: json["topics"] as? [String] ?? [],
            isFork: json["fork"] as? Bool ?? false,
            isArchived: json["archived"] as? Bool ?? false
        )
    }

    static func offset(from cursor: String?) throws -> Int {
        guard let cursor else { return 0 }
        guard cursor.hasPrefix("offset:"), let value = Int(cursor.dropFirst(7)), value >= 0 else {
            throw AuraError.invalidRequest("invalid cursor")
        }
        return value
    }

    static func page(from cursor: String?) throws -> Int {
        guard let cursor else { return 1 }
        guard cursor.hasPrefix("page:"), let value = Int(cursor.dropFirst(5)), value >= 1, value <= 1000 else {
            throw AuraError.invalidRequest("invalid cursor")
        }
        return value
    }
}
