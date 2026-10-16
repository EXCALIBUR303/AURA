import AuraCore
import Foundation
import os

/// Opt-in live check of the GitHub integration (`AURA_DEV_GITHUB_PROBE=1`).
/// Uses the same LiveGitHubService the bridge uses. If no session is stored it
/// starts device authorization and logs the user code to approve at
/// github.com/login/device (development only: the code is useless without the
/// device code, which never leaves memory). Once connected it logs what AURA
/// can actually see: installation permissions, repository counts, pagination,
/// and one repository's detail, branches and commits. Repository names and
/// other GitHub data are logged `.private`; only counts, permission levels and
/// error codes are public. With `AURA_DEV_GITHUB_PROBE_REFRESH=1` it also
/// rotates the access token through the refresh flow.
///   /usr/bin/log show --last 20m --info --predicate 'subsystem == "com.aura.app" AND category == "github-probe"'
@MainActor
enum GitHubProbe {
    private static let log = Logger(subsystem: Log.subsystem, category: "github-probe")

    static var isEnabled: Bool { ProcessInfo.processInfo.environment["AURA_DEV_GITHUB_PROBE"] == "1" }

    static func run(_ service: any GitHubService) async {
        guard let live = service as? LiveGitHubService else { log.error("probe: not the live GitHub service"); return }
        log.notice("probe start state=\(state(live.status), privacy: .public)")

        if !isConnected(live.status) {
            let status = await live.connect()
            if case .authorizing(let code, let uri, let expiresAt) = status {
                log.notice("probe authorize: enter code \(code, privacy: .public) at \(uri, privacy: .public) before \(expiresAt, privacy: .public)")
            } else {
                log.error("probe connect failed: \(describe(status), privacy: .public)")
                return
            }
            let deadline = ContinuousClock.now + .seconds(900)
            while ContinuousClock.now < deadline {
                if case .authorizing = live.status { try? await Task.sleep(for: .seconds(2)); continue }
                break
            }
            guard isConnected(live.status) else { log.error("probe authorization ended: \(describe(live.status), privacy: .public)"); return }
        }

        if case .connected(let account, let installations) = live.status {
            log.notice("probe connected login=\(account.login, privacy: .private) installations=\(installations.count, privacy: .public)")
            for installation in installations {
                let permissions = installation.permissions.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
                log.notice("probe installation id=\(installation.id, privacy: .public) selection=\(installation.repositorySelection.rawValue, privacy: .public) readOnly=\(installation.readOnly, privacy: .public) permissions=\(permissions, privacy: .public)")
            }
        }

        do {
            // Page through everything in small pages to exercise the cursor.
            var cursor: String?
            var repositories: [RepositorySummary] = []
            var pages = 0
            repeat {
                let page = try await live.listRepositories(cursor: cursor, perPage: 5)
                repositories += page.items
                cursor = page.nextCursor
                pages += 1
            } while cursor != nil && pages < 200
            let names = repositories.map(\.fullName)
            log.notice("""
                probe repositories total=\(repositories.count, privacy: .public) pages(5/page)=\(pages, privacy: .public) \
                private=\(repositories.filter(\.isPrivate).count, privacy: .public) public=\(repositories.filter { !$0.isPrivate }.count, privacy: .public) \
                forks=\(repositories.filter(\.isFork).count, privacy: .public) archived=\(repositories.filter(\.isArchived).count, privacy: .public) \
                unique=\(Set(names).count == names.count, privacy: .public) names=\(names.joined(separator: ","), privacy: .private)
                """)

            let target = ProcessInfo.processInfo.environment["AURA_DEV_GITHUB_PROBE_REPO"] ?? repositories.first?.fullName
            if let target {
                let found = names.contains(target)
                let detail = try await live.repository(fullName: target)
                log.notice("probe repo listed=\(found, privacy: .public) private=\(detail.summary.isPrivate, privacy: .public) languages=\(detail.languages.count, privacy: .public) topics=\(detail.summary.topics.count, privacy: .public) defaultBranchSet=\(!detail.summary.defaultBranch.isEmpty, privacy: .public)")
                var branchCursor: String?
                var branches = 0, branchPages = 0, defaults = 0
                repeat {
                    let page = try await live.listBranches(fullName: target, cursor: branchCursor, perPage: 1)
                    branches += page.items.count
                    defaults += page.items.filter(\.isDefault).count
                    branchCursor = page.nextCursor
                    branchPages += 1
                } while branchCursor != nil && branchPages < 20
                log.notice("probe branches=\(branches, privacy: .public) pages(1/page)=\(branchPages, privacy: .public) defaultFound=\(defaults == 1, privacy: .public)")
                let commits = try await live.listCommits(fullName: target, branch: nil, limit: 3)
                log.notice("probe commits=\(commits.count, privacy: .public) withAuthorLogin=\(commits.filter { $0.authorLogin != nil }.count, privacy: .public)")
            }

            let suggestions = ProjectZoneClassifier.suggestions(for: repositories, records: [])
            let byZone = Dictionary(grouping: suggestions, by: \.zone.rawValue).mapValues(\.count).sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
            log.notice("probe suggestions \(suggestions.count, privacy: .public)/\(repositories.count, privacy: .public) \(byZone, privacy: .public)")

            // A repository outside the installation must be refused cleanly.
            let outside = ProcessInfo.processInfo.environment["AURA_DEV_GITHUB_PROBE_OUTSIDE"] ?? "octocat/does-not-exist-aura-probe"
            do {
                _ = try await live.repository(fullName: outside)
                log.notice("probe outside repository readable (public repository)")
            } catch {
                log.notice("probe outside repository refused: \(BridgeError(error).code.rawValue, privacy: .public)")
            }

            if ProcessInfo.processInfo.environment["AURA_DEV_GITHUB_PROBE_REFRESH"] == "1" {
                try await live.forceTokenRefresh()
                let after = await live.refresh()
                log.notice("probe token refresh ok; state=\(state(after), privacy: .public)")
            }
        } catch {
            log.error("probe failed: \(BridgeError(error).code.rawValue, privacy: .public) \(BridgeError(error).message, privacy: .public); state=\(describe(live.status), privacy: .public)")
            return
        }
        log.notice("probe done state=\(state(live.status), privacy: .public)")
    }

    private static func isConnected(_ status: GitHubAuthStatus) -> Bool {
        if case .connected = status { return true }
        return false
    }

    private static func state(_ status: GitHubAuthStatus) -> String {
        switch status {
        case .disconnected: "disconnected"
        case .authorizing: "authorizing"
        case .connected: "connected"
        case .expired(_, let reason): "expired(\(reason.rawValue))"
        case .rateLimited(_, _, let resetAt): "rate_limited(until \(resetAt))"
        case .error(let reason, _, _): "error(\(reason.rawValue))"
        }
    }

    private static func describe(_ status: GitHubAuthStatus) -> String {
        if case .error(_, let message, _) = status { return "\(state(status)): \(message)" }
        return state(status)
    }
}
