import Foundation

// Runs the read-only tools (Phase 3C-B). Every call arrives here already
// validated by AIToolPolicy; this layer adds what needs live state:
//
// 1. Scope: the repository must be one the GitHub installation can access,
//    and content tools only read the conversation's own repository.
// 2. Privacy (AIPrivacyGate): sharing switched off, private repositories and
//    private source going to a cloud provider.
// 3. Bounded results: every tool caps what it returns, and the text is meant
//    to be fenced as untrusted data by the caller.
//
// It only calls GitHubService's GET-backed reads. There is no code path to a
// shell, the file system, or a GitHub write.

public enum AIPrivacyDecision: Equatable, Sendable {
    case allowed
    /// Private source for a cloud provider: the user must approve first.
    case needsConsent
    case denied(String)
}

public enum AIPrivacyGate {
    public static func decide(
        _ data: AIToolData, isPrivate: Bool, preferences: Preferences.AI, providerKind: AIProviderInfo.Kind, consented: Bool
    ) -> AIPrivacyDecision {
        guard preferences.contextSharing else { return .denied("workspace sharing is turned off in AURA's settings") }
        switch data {
        case .none, .workspace, .repositoryList:
            return .allowed // list_repositories filters private repositories itself
        case .repositoryMetadata, .repositorySource:
            guard isPrivate else { return .allowed }
            guard AIContextBuilder.allowsPrivate(preferences.privateRepositoryContext, providerKind) else {
                return .denied("the repository is private, and AURA's privacy settings do not share private repositories with this provider")
            }
            if data == .repositorySource, providerKind == .cloud, !consented { return .needsConsent }
            return .allowed
        }
    }
}

/// What a tool needs to know about the conversation it runs in.
public struct AIToolContext: Sendable {
    public var conversationId: String
    public var repository: AIConversationRepository?
    public var providerName: String
    public var providerKind: AIProviderInfo.Kind
    public var model: String
    public var preferences: Preferences
    public var zone: ZoneID?
    /// Repositories (lowercased owner/name) whose private source the user allowed for this conversation.
    public var sourceGrants: Set<String>
}

/// The result of one tool call. `text` is untrusted data for the model.
public struct AIToolOutcome: Equatable, Sendable {
    public var text: String
    public var summary: String
    public var sources: [AISourceRef]
    public var includesPrivate: Bool
}

@MainActor
public final class AIToolExecutor {
    public struct Budget: Sendable {
        public var fileChars = 16_000
        public var fileLines = 600
        public var listEntries = 300
        public var searchResults = 50
        public var repositories = 50
        public var commitFiles = 50
        public var patchChars = 8000
        public var commitMessageChars = 1000
        /// How long a fetched tree is reused within a conversation.
        public var treeFreshFor: TimeInterval = 300
        public init() {}
    }

    /// Before running: go ahead, ask the user, or refuse.
    public enum Preparation: Equatable, Sendable {
        case run(RepositorySummary?)
        case needsApproval(AIApprovalRequest.Kind, summary: String, repository: RepositorySummary?, paths: [String])
        case denied(String)
    }

    private let github: any GitHubService
    private let budget: Budget
    private let now: @Sendable () -> Date
    /// Trees per conversation, keyed by "owner/name@ref" (lowercased).
    private var trees: [String: [String: (fetchedAt: Date, tree: RepositoryTree)]] = [:]
    /// Carries out an approved navigate_to_zone (wired to app.command).
    public var navigate: (@MainActor (ZoneID) -> Void)?

    public init(github: any GitHubService, budget: Budget = Budget(), now: @escaping @Sendable () -> Date = { .now }) {
        self.github = github
        self.budget = budget
        self.now = now
    }

    /// Forgets cached repository data (repository switch, reset, GitHub change).
    public func forget(conversation id: String) { trees[id] = nil }
    public func forgetAll() { trees.removeAll() }

    // MARK: preparing

    /// Scope, accessibility and privacy for one validated call. Network: at
    /// most the (cached) accessible-repository list.
    public func prepare(_ tool: AIToolDefinition, _ arguments: [String: JSONValue], in context: AIToolContext) async -> Preparation {
        if tool.effect == .appAction {
            guard case .string(let raw)? = arguments["zone"], let zone = ZoneID(rawValue: raw) else { return .denied("unknown zone") }
            return .needsApproval(.appAction, summary: "Open \(AIContextBuilder.zoneName(zone))", repository: nil, paths: [])
        }
        if tool.data == .workspace || tool.data == .repositoryList {
            guard context.preferences.ai.contextSharing else { return .denied("workspace sharing is turned off in AURA's settings") }
            return .run(nil)
        }
        guard case .string(let fullName)? = arguments["fullName"] else { return .denied("\(tool.name) needs fullName") }
        if tool.scope == .conversationRepository {
            guard let bound = context.repository else {
                return .denied("no repository is selected for this conversation; ask the user to select one in AURA")
            }
            guard bound.fullName.lowercased() == fullName.lowercased() else {
                return .denied("this conversation can only read files of its selected repository; ask the user to switch repositories in AURA")
            }
        }
        let repository: RepositorySummary
        do {
            guard let found = try await github.accessibleRepositories().first(where: { $0.fullName.lowercased() == fullName.lowercased() }) else {
                return .denied("\(fullName) is not a repository AURA's GitHub App can access")
            }
            repository = found
        } catch {
            return .denied(Self.failure(error))
        }
        let data: AIToolData = tool.name == "get_commit_details" && arguments["includePatch"] == .bool(true) ? .repositorySource : tool.data
        switch AIPrivacyGate.decide(data, isPrivate: repository.isPrivate, preferences: context.preferences.ai, providerKind: context.providerKind,
                                    consented: context.sourceGrants.contains(repository.fullName.lowercased())) {
        case .allowed: return .run(repository)
        case .denied(let reason): return .denied(reason)
        case .needsConsent:
            let paths = [arguments["path"].flatMap { if case .string(let p) = $0 { p } else { nil } } ?? (data == .repositorySource ? "diff of commit" : "")].filter { !$0.isEmpty }
            return .needsApproval(.sharePrivateSource,
                                  summary: "Send \(paths.first ?? "source") from the private repository \(repository.fullName) to \(context.providerName)",
                                  repository: repository, paths: paths)
        }
    }

    // MARK: running

    /// Runs a call that `prepare` cleared (or the user approved).
    public func execute(_ tool: AIToolDefinition, _ arguments: [String: JSONValue], repository: RepositorySummary?, in context: AIToolContext) async throws -> AIToolOutcome {
        let fullName = repository?.fullName ?? ""
        let isPrivate = repository?.isPrivate ?? false
        switch tool.name {
        case "get_active_workspace":
            return workspace(context)

        case "list_repositories":
            return try await repositories(query: arguments.string("query"), limit: arguments.int("limit") ?? 20, context: context)

        case "get_repository_metadata":
            let detail = try await github.repository(fullName: fullName)
            return AIToolOutcome(text: AIContextBuilder.describe(detail, branch: nil), summary: "Read metadata of \(fullName)",
                                 sources: [AISourceRef(kind: .repository, fullName: fullName, ref: detail.summary.defaultBranch)], includesPrivate: isPrivate)

        case "list_recent_commits":
            let branch = arguments.string("branch") ?? boundBranch(fullName, context)
            let limit = arguments.int("limit") ?? 10
            let commits = try await github.listCommits(fullName: fullName, branch: branch, limit: limit)
            let lines = commits.map { commit in
                let subject = commit.message.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? ""
                return "\(commit.sha.prefix(12)) \(commit.committedAt.prefix(10)) \(commit.authorName.prefix(40)): \(subject.prefix(160))"
            }
            return AIToolOutcome(text: lines.isEmpty ? "No commits." : lines.joined(separator: "\n"),
                                 summary: "Listed \(commits.count) recent commits of \(fullName)\(branch.map { " on \($0)" } ?? "")",
                                 sources: [AISourceRef(kind: .commits, fullName: fullName, ref: branch)], includesPrivate: isPrivate)

        case "get_commit_details":
            return try await commit(fullName, sha: arguments.string("sha") ?? "", patch: arguments["includePatch"] == .bool(true), isPrivate: isPrivate)

        case "list_repository_files":
            return try await files(fullName, under: arguments.string("path"), branch: arguments.string("branch") ?? boundBranch(fullName, context), context: context, isPrivate: isPrivate)

        case "search_repository_paths":
            return try await search(fullName, query: arguments.string("query") ?? "", branch: arguments.string("branch") ?? boundBranch(fullName, context), context: context, isPrivate: isPrivate)

        case "read_repository_file":
            return try await read(fullName, path: arguments.string("path") ?? "", branch: arguments.string("branch") ?? boundBranch(fullName, context),
                                  start: arguments.int("startLine"), end: arguments.int("endLine"), context: context, isPrivate: isPrivate)

        case "navigate_to_zone":
            guard let raw = arguments.string("zone"), let zone = ZoneID(rawValue: raw) else { throw AuraError.invalidRequest("unknown zone") }
            guard let navigate else { throw AuraError.unavailable("navigation is not available") }
            navigate(zone)
            return AIToolOutcome(text: "AURA opened \(AIContextBuilder.zoneName(zone)) after the user approved.", summary: "Opened \(AIContextBuilder.zoneName(zone))",
                                 sources: [], includesPrivate: false)

        default:
            throw AuraError.invalidRequest("tool \(AIToolPolicy.printable(tool.name)) has no executor")
        }
    }

    // MARK: tools

    private func workspace(_ context: AIToolContext) -> AIToolOutcome {
        var lines: [String] = []
        if let zone = context.zone ?? Optional(context.preferences.lastZone) { lines.append("Zone: \(AIContextBuilder.zoneName(zone))") }
        if let repository = context.repository {
            if repository.isPrivate, !AIContextBuilder.allowsPrivate(context.preferences.ai.privateRepositoryContext, context.providerKind) {
                lines.append("Selected repository: a private repository (withheld from this provider by AURA's privacy settings)")
            } else {
                lines.append("Selected repository: \(repository.fullName) (\(repository.isPrivate ? "private" : "public"))\(repository.branch.map { ", branch \($0)" } ?? "")")
            }
        } else {
            lines.append("Selected repository: none")
        }
        lines.append("AI provider: \(context.providerName) (\(context.providerKind == .local ? "runs on this Mac" : "cloud")), model \(context.model)")
        switch github.status {
        case .connected, .rateLimited: lines.append("GitHub: connected")
        default: lines.append("GitHub: not connected")
        }
        let policy: String = switch context.preferences.ai.privateRepositoryContext {
        case .never: "never shared"
        case .localOnly: "shared only with providers on this Mac"
        case .all: "may be shared; private source needs the user's approval for cloud providers"
        }
        lines.append("Private repositories: \(policy)")
        return AIToolOutcome(text: lines.joined(separator: "\n"), summary: "Checked the active workspace", sources: [AISourceRef(kind: .workspace)], includesPrivate: false)
    }

    private func repositories(query: String?, limit: Int, context: AIToolContext) async throws -> AIToolOutcome {
        let all = try await github.accessibleRepositories()
        let showPrivate = AIContextBuilder.allowsPrivate(context.preferences.ai.privateRepositoryContext, context.providerKind)
        let needle = query?.lowercased()
        let matching = all.filter { repo in
            guard let needle else { return true }
            return ([repo.fullName, repo.description ?? "", repo.primaryLanguage ?? ""] + repo.topics).contains { $0.lowercased().contains(needle) }
        }
        let visible = matching.filter { showPrivate || !$0.isPrivate }
        let hidden = matching.count - visible.count
        let shown = visible.prefix(min(limit, budget.repositories))
        var lines = shown.map { repo in
            let description = (repo.description ?? "").prefix(100)
            return "\(repo.fullName) — \(repo.isPrivate ? "private" : "public")\(repo.primaryLanguage.map { ", \($0)" } ?? "")\(repo.pushedAt.map { ", pushed \($0.prefix(10))" } ?? "")\(description.isEmpty ? "" : " — \(description)")"
        }
        if lines.isEmpty { lines.append("No matching repositories.") }
        if visible.count > shown.count { lines.append("… \(visible.count - shown.count) more not shown.") }
        if hidden > 0 { lines.append("\(hidden) private repositories are hidden by AURA's privacy settings.") }
        return AIToolOutcome(text: AIContextBuilder.fenceSafe(AIContextBuilder.sanitized(lines.joined(separator: "\n"))),
                             summary: "Listed accessible repositories\(query.map { " matching “\($0)”" } ?? "")",
                             sources: [], includesPrivate: showPrivate && shown.contains { $0.isPrivate })
    }

    private func commit(_ fullName: String, sha: String, patch: Bool, isPrivate: Bool) async throws -> AIToolOutcome {
        let detail = try await github.commit(fullName: fullName, sha: sha)
        let summary = detail.summary
        var lines = [
            "Commit \(summary.sha)",
            "Author: \(summary.authorName.prefix(80))\(summary.authorLogin.map { " (@\($0))" } ?? ""), \(summary.committedAt)",
            "Changes: +\(detail.additions) −\(detail.deletions) in \(detail.files.count)\(detail.filesTruncated ? "+" : "") files",
            "Message:",
            String(AIContextBuilder.sanitized(summary.message).prefix(budget.commitMessageChars)),
            "Files:",
        ]
        let files = detail.files.prefix(budget.commitFiles)
        lines += files.map { "\($0.status) \($0.path) (+\($0.additions) −\($0.deletions))" }
        if detail.files.count > files.count || detail.filesTruncated { lines.append("… more files not shown.") }
        if patch {
            var remaining = budget.patchChars
            for file in files {
                guard let text = file.patch, remaining > 200 else { continue }
                let part = String(text.prefix(remaining))
                remaining -= part.count
                lines.append("--- diff \(file.path)\(part.count < text.count ? " (cut)" : "")\n\(part)")
            }
        }
        return AIToolOutcome(text: lines.joined(separator: "\n"), summary: "Read commit \(summary.sha.prefix(7)) of \(fullName)\(patch ? ", with diff" : "")",
                             sources: [AISourceRef(kind: .commit, fullName: fullName, ref: summary.sha)], includesPrivate: isPrivate)
    }

    private func files(_ fullName: String, under path: String?, branch: String?, context: AIToolContext, isPrivate: Bool) async throws -> AIToolOutcome {
        let tree = try await cachedTree(fullName, ref: branch, context: context)
        let prefix = path.map { $0.hasSuffix("/") ? $0 : $0 + "/" } ?? ""
        if let path, !tree.entries.contains(where: { $0.path == path && $0.type == .directory }) {
            throw AuraError.notFound("\(path) is not a directory in \(fullName)")
        }
        let under = tree.entries.filter { $0.path.hasPrefix(prefix) }
        var lines: [String]
        if under.count <= budget.listEntries {
            lines = under.map { entry in entry.type == .directory ? entry.path + "/" : entry.path + (entry.size.map { " (\($0) bytes)" } ?? "") }
        } else {
            // Too many: show the direct children, with counts for directories.
            var children: [String: Int] = [:]
            var files: [String] = []
            for entry in under {
                let rest = entry.path.dropFirst(prefix.count)
                if let slash = rest.firstIndex(of: "/") { children[prefix + rest[..<slash], default: 0] += 1 } else if entry.type == .file { files.append(entry.path) } else { children[entry.path, default: 0] += 0 }
            }
            lines = children.keys.sorted().prefix(budget.listEntries).map { "\($0)/ (\(children[$0]!) entries)" } + files.sorted().prefix(budget.listEntries).map { $0 }
            lines = Array(lines.prefix(budget.listEntries))
            lines.append("… \(under.count) entries in total; list a subdirectory for more.")
        }
        if lines.isEmpty { lines.append("No files.") }
        if tree.truncated { lines.append("(GitHub returned a partial listing for this large repository.)") }
        return AIToolOutcome(text: "Files at commit \(tree.commitSha.prefix(12)) (\(tree.ref)):\n" + lines.joined(separator: "\n"),
                             summary: "Listed files\(path.map { " in \($0)" } ?? "") of \(fullName)",
                             sources: [AISourceRef(kind: .directory, fullName: fullName, path: path, ref: tree.commitSha)], includesPrivate: isPrivate)
    }

    private func search(_ fullName: String, query: String, branch: String?, context: AIToolContext, isPrivate: Bool) async throws -> AIToolOutcome {
        let tree = try await cachedTree(fullName, ref: branch, context: context)
        let needle = query.lowercased()
        let matches = tree.entries.filter { $0.type == .file && $0.path.lowercased().contains(needle) }
        var lines = matches.prefix(budget.searchResults).map(\.path)
        if lines.isEmpty { lines.append("No file paths contain “\(query)”.") }
        if matches.count > budget.searchResults { lines.append("… \(matches.count - budget.searchResults) more matches; refine the query.") }
        return AIToolOutcome(text: lines.joined(separator: "\n"), summary: "Searched file paths for “\(query)” in \(fullName)",
                             sources: [AISourceRef(kind: .directory, fullName: fullName, ref: tree.commitSha)], includesPrivate: isPrivate)
    }

    private func read(_ fullName: String, path: String, branch: String?, start: Int?, end: Int?, context: AIToolContext, isPrivate: Bool) async throws -> AIToolOutcome {
        if let start, let end, end < start { throw AuraError.invalidRequest("endLine is before startLine") }
        // Read at the commit the conversation listed, when there is one, so files and listings agree.
        let ref = cachedCommit(fullName, ref: branch, context: context) ?? branch
        let file = try await github.file(fullName: fullName, path: path, ref: ref)
        if file.tooLarge { throw AuraError.invalidRequest("\(path) is larger than 1 MB; AURA does not read it") }
        guard let text = file.text, !file.isBinary else { throw AuraError.invalidRequest("\(path) is a binary file") }
        let excerpt = AIContextBuilder.excerpt(text, start: start, end: end, maxChars: budget.fileChars, maxLines: budget.fileLines)
        let range = excerpt.lines.map { "lines \($0.start)–\($0.end)" } ?? "empty"
        return AIToolOutcome(text: "\(path) at \(file.ref), \(range):\n\(excerpt.text)",
                             summary: "Read \(path)\(excerpt.lines.map { ", lines \($0.start)–\($0.end)" } ?? "")",
                             sources: [AISourceRef(kind: .file, fullName: fullName, path: path, ref: file.ref, lines: excerpt.lines)], includesPrivate: isPrivate)
    }

    // MARK: helpers

    private func boundBranch(_ fullName: String, _ context: AIToolContext) -> String? {
        guard let bound = context.repository, bound.fullName.lowercased() == fullName.lowercased() else { return nil }
        return bound.branch
    }

    private func treeKey(_ fullName: String, _ ref: String?) -> String { "\(fullName.lowercased())@\(ref ?? "")" }

    private func cachedTree(_ fullName: String, ref: String?, context: AIToolContext) async throws -> RepositoryTree {
        let key = treeKey(fullName, ref)
        if let cached = trees[context.conversationId]?[key], now().timeIntervalSince(cached.fetchedAt) < budget.treeFreshFor { return cached.tree }
        let tree = try await github.listTree(fullName: fullName, ref: ref)
        var forConversation = trees[context.conversationId] ?? [:]
        if forConversation.count >= 8, let oldest = forConversation.min(by: { $0.value.fetchedAt < $1.value.fetchedAt })?.key { forConversation[oldest] = nil }
        forConversation[key] = (now(), tree)
        trees[context.conversationId] = forConversation
        return tree
    }

    private func cachedCommit(_ fullName: String, ref: String?, context: AIToolContext) -> String? {
        guard let cached = trees[context.conversationId]?[treeKey(fullName, ref)], now().timeIntervalSince(cached.fetchedAt) < budget.treeFreshFor else { return nil }
        return cached.tree.commitSha
    }

    /// A failure as the model (and the activity line) should read it. Never contains credentials.
    static func failure(_ error: any Error) -> String {
        switch error {
        case AuraError.notAuthenticated: "GitHub is not connected in AURA"
        case AuraError.rateLimited: "GitHub's rate limit is reached; try again later"
        case AuraError.timeout: "the request timed out"
        case AuraError.unavailable(let message), AuraError.notFound(let message), AuraError.permissionDenied(let message),
             AuraError.invalidRequest(let message), AuraError.network(let message):
            message
        default: "the request failed"
        }
    }
}

extension [String: JSONValue] {
    func string(_ key: String) -> String? {
        if case .string(let value)? = self[key] { return value }
        return nil
    }

    func int(_ key: String) -> Int? {
        if case .number(let value)? = self[key] { return Int(exactly: value) }
        return nil
    }
}
