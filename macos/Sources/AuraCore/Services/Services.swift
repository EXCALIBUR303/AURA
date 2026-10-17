import Foundation

// Service boundaries. Phase 1 ships protocol + mock (or explicit
// "unavailable") implementations only; real GitHub, LLM and Speech
// implementations land in later phases behind these same protocols.

// MARK: GitHub

/// Bridge-facing GitHub service. `LiveGitHubService` is the real one; the
/// mock below mirrors shared/bridge/mock.ts for tests.
@MainActor
public protocol GitHubService: AnyObject {
    var status: GitHubAuthStatus { get }
    /// Called on every status change (wired to github.authChanged).
    var onStatusChange: (@MainActor (GitHubAuthStatus) -> Void)? { get set }
    /// At launch: validate a stored session, if any.
    func restore() async
    /// Returns once the launch restore (if started) has finished, so early
    /// bridge calls see the restored session instead of "disconnected".
    func waitUntilRestored() async
    func connect() async -> GitHubAuthStatus
    func disconnect() async -> GitHubAuthStatus
    func refresh() async -> GitHubAuthStatus
    func listRepositories(cursor: String?, perPage: Int) async throws -> Page<RepositorySummary>
    /// Every accessible repository (for zone suggestions).
    func accessibleRepositories() async throws -> [RepositorySummary]
    func repository(fullName: String) async throws -> RepositoryDetail
    func listBranches(fullName: String, cursor: String?, perPage: Int) async throws -> Page<BranchSummary>
    func listCommits(fullName: String, branch: String?, limit: Int) async throws -> [CommitSummary]
    /// Every path at the head of `ref` (default branch when nil), pinned to that commit.
    func listTree(fullName: String, ref: String?) async throws -> RepositoryTree
    /// One file's content at `ref` (a branch or commit SHA; default branch when nil).
    func file(fullName: String, path: String, ref: String?) async throws -> RepositoryFile
    func commit(fullName: String, sha: String) async throws -> CommitDetail
    /// The README GitHub detects for `ref` (default branch when nil).
    func readme(fullName: String, ref: String?) async throws -> RepositoryFile
}

/// Synthetic data identical in shape to shared/bridge/mock.ts. Owner is
/// "mock-user" and URLs use the reserved .invalid TLD so mock data can never
/// be mistaken for a real account. Starts connected, like the browser mock.
@MainActor
public final class MockGitHubService: GitHubService {
    static let account = GitHubAccount(login: "mock-user", name: "Mock User", htmlUrl: "https://github.invalid/mock-user")
    static let installations = [GitHubInstallation(
        id: 1, accountLogin: "mock-user", repositorySelection: .selected,
        permissions: ["contents": "read", "metadata": "read"], manageUrl: "https://github.invalid/settings/installations/1"
    )]
    static let repositories: [RepositorySummary] = [
        ("sample-firmware", "Mock repository for the Hardware Lab", "C", ["firmware", "embedded"]),
        ("sample-web-app", "Mock repository for the Software Studio", "TypeScript", ["web"]),
        ("sample-llm-eval", "Mock repository for the AI / LLM Lab", "Python", ["llm"]),
    ].enumerated().map { index, seed in
        RepositorySummary(
            fullName: "mock-user/\(seed.0)", owner: "mock-user", name: seed.0, description: seed.1,
            isPrivate: index == 0, defaultBranch: "main", primaryLanguage: seed.2, stargazerCount: 0,
            pushedAt: "2026-01-01T00:00:00Z", htmlUrl: "https://github.invalid/mock-user/\(seed.0)",
            topics: seed.3, isFork: false, isArchived: false
        )
    }

    public private(set) var status: GitHubAuthStatus = .connected(account: MockGitHubService.account, installations: MockGitHubService.installations) {
        didSet { if status != oldValue { onStatusChange?(status) } }
    }
    public var onStatusChange: (@MainActor (GitHubAuthStatus) -> Void)?
    private let approvalDelay: Duration
    private var approval: Task<Void, Never>?

    /// `approvalDelay`: how long connect() stays in `authorizing` before the mock "approves".
    public init(approvalDelay: Duration = .milliseconds(1500)) {
        self.approvalDelay = approvalDelay
    }

    public func restore() async {}
    public func waitUntilRestored() async {}

    public func connect() async -> GitHubAuthStatus {
        approval?.cancel()
        status = .authorizing(userCode: "MOCK-0000", verificationUri: "https://github.invalid/login/device", expiresAt: Date.now.addingTimeInterval(900).formatted(.iso8601))
        let delay = approvalDelay
        approval = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            self?.status = .connected(account: Self.account, installations: Self.installations)
        }
        return status
    }

    public func disconnect() async -> GitHubAuthStatus {
        approval?.cancel()
        status = .disconnected
        return status
    }

    public func refresh() async -> GitHubAuthStatus { status }

    /// Waits for a pending mock approval (tests).
    public func waitForApproval() async { await approval?.value }

    private func requireConnected() throws {
        guard case .connected = status else { throw AuraError.notAuthenticated("mock GitHub is disconnected") }
    }

    private func requireRepository(_ fullName: String) throws -> RepositorySummary {
        _ = try validatedFullName(fullName)
        try requireConnected()
        guard let repo = Self.repositories.first(where: { $0.fullName == fullName }) else {
            throw AuraError.notFound("no mock repo \(fullName)")
        }
        return repo
    }

    public func listRepositories(cursor: String?, perPage: Int) async throws -> Page<RepositorySummary> {
        try requireConnected()
        let offset = try LiveGitHubService.offset(from: cursor)
        let end = min(offset + max(0, perPage), Self.repositories.count)
        guard offset <= end else { return Page(items: [], nextCursor: nil) }
        return Page(items: Array(Self.repositories[offset..<end]), nextCursor: end < Self.repositories.count ? "offset:\(end)" : nil)
    }

    public func accessibleRepositories() async throws -> [RepositorySummary] {
        try requireConnected()
        return Self.repositories
    }

    public func repository(fullName: String) async throws -> RepositoryDetail {
        let repo = try requireRepository(fullName)
        return RepositoryDetail(
            summary: repo, languages: repo.primaryLanguage.map { [LanguageShare(name: $0, bytes: 1000)] } ?? [],
            forksCount: 0, openIssuesCount: 0, license: nil, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
        )
    }

    public func listBranches(fullName: String, cursor: String?, perPage: Int) async throws -> Page<BranchSummary> {
        _ = try requireRepository(fullName)
        return Page(items: [BranchSummary(name: "main", sha: String(repeating: "0", count: 40), isProtected: false, isDefault: true)], nextCursor: nil)
    }

    public func listCommits(fullName: String, branch: String?, limit: Int) async throws -> [CommitSummary] {
        let repo = try requireRepository(fullName)
        return (0..<min(limit, 3)).map { i in
            CommitSummary(
                sha: String(repeating: "0", count: 39) + "\(i)",
                message: "Mock commit \(i + 1) in \(repo.name)",
                authorName: "Mock Author",
                authorLogin: nil,
                committedAt: "2026-01-0\(i + 1)T00:00:00Z",
                htmlUrl: "\(repo.htmlUrl)/commit/\(i)"
            )
        }
    }

    // MARK: content (synthetic, labelled mock)

    /// Extra or replaced files per repository, "owner/name" → path → text (tests).
    public var fileOverrides: [String: [String: String]] = [:]
    /// Errors the content reads throw instead of answering, by method: "listTree", "file", "commit" (tests).
    public var contentFailures: [String: AuraError] = [:]
    /// Paths of every file read, in order (tests).
    public private(set) var fileReads: [String] = []

    static let mockSha = String(repeating: "0", count: 39) + "0"

    func files(of repo: RepositorySummary) -> [String: String] {
        let language = repo.primaryLanguage ?? "Text"
        let source: (String, String) = switch language {
        case "C": ("src/main.c", "#include <stdio.h>\n\n// Mock firmware entry point.\nint main(void) {\n    printf(\"mock\\n\");\n    return 0;\n}\n")
        case "Python": ("eval/run.py", "\"\"\"Mock evaluation script.\"\"\"\n\ndef main() -> None:\n    print(\"mock\")\n\nif __name__ == \"__main__\":\n    main()\n")
        default: ("src/index.ts", "// Mock web app entry point.\nexport function main(): string {\n  return \"mock\";\n}\n")
        }
        var files = [
            "README.md": "# \(repo.name)\n\n\(repo.description ?? "Mock repository.")\n\nThis is synthetic mock content.\n",
            "docs/ARCHITECTURE.md": "# Architecture (mock)\n\nOne module: `\(source.0)`.\n",
            source.0: source.1,
        ]
        for (path, text) in fileOverrides[repo.fullName] ?? [:] { files[path] = text }
        return files
    }

    public func listTree(fullName: String, ref: String?) async throws -> RepositoryTree {
        let repo = try requireRepository(fullName)
        if let failure = contentFailures["listTree"] { throw failure }
        let paths = files(of: repo).keys
        var directories = Set<String>()
        for path in paths {
            var parts = path.split(separator: "/").dropLast()
            while !parts.isEmpty { directories.insert(parts.joined(separator: "/")); parts = parts.dropLast() }
        }
        let entries = directories.map { RepositoryTreeEntry(path: $0, type: .directory, size: nil) }
            + files(of: repo).map { RepositoryTreeEntry(path: $0.key, type: .file, size: $0.value.utf8.count) }
        return RepositoryTree(fullName: fullName, ref: ref ?? repo.defaultBranch, commitSha: Self.mockSha, entries: entries.sorted { $0.path < $1.path }, truncated: false)
    }

    public func file(fullName: String, path: String, ref: String?) async throws -> RepositoryFile {
        let repo = try requireRepository(fullName)
        let path = try validatedRepositoryPath(path)
        if let failure = contentFailures["file"] { throw failure }
        guard let text = files(of: repo)[path] else { throw AuraError.notFound("no mock file \(path)") }
        fileReads.append(path)
        return RepositoryFile(fullName: fullName, path: path, ref: ref ?? repo.defaultBranch, sha: Self.mockSha, size: text.utf8.count, text: text)
    }

    public func readme(fullName: String, ref: String?) async throws -> RepositoryFile {
        try await file(fullName: fullName, path: "README.md", ref: ref)
    }

    public func commit(fullName: String, sha: String) async throws -> CommitDetail {
        let repo = try requireRepository(fullName)
        if let failure = contentFailures["commit"] { throw failure }
        guard let summary = try await listCommits(fullName: fullName, branch: nil, limit: 3).first(where: { $0.sha.hasPrefix(sha.lowercased()) }) else {
            throw AuraError.notFound("no mock commit \(sha)")
        }
        let path = files(of: repo).keys.sorted().last ?? "README.md"
        return CommitDetail(summary: summary, additions: 2, deletions: 1, files: [
            CommitFileChange(path: path, status: "modified", additions: 2, deletions: 1, patch: "@@ -1,1 +1,2 @@\n-old mock line\n+new mock line\n+another mock line"),
        ], filesTruncated: false)
    }
}

// MARK: AI

// The AI boundary lives in Services/AI: AIProvider (AIProvider.swift),
// AIProviderRegistry, AIService (streaming) and AIContextBuilder.

// MARK: Voice

public protocol VoiceService: Sendable {
    func status() async -> VoiceStatus
    func capabilities() async -> VoiceCapabilities
    func requestPermissions() async throws -> VoiceStatus
    func startSession(conversationId: String?) async throws -> VoiceStatus
    func endSession() async -> VoiceStatus
    func startListening(mode: VoiceListenMode) async throws -> VoiceStatus
    func stopListening() async -> VoiceStatus
    func cancelListening() async -> VoiceStatus
    func speak(_ text: String, interrupt: Bool) async throws
    func speakReply(conversationId: String, streamId: String) async throws -> VoiceStatus
    func stopSpeaking() async
    func setOutputMuted(_ muted: Bool) async -> VoiceStatus
    func voices(locale: String?) async -> [VoiceOption]
    func openSettings(_ target: OpenVoiceSettingsParams.Target) async throws
    func installRecognitionAssets() async throws
    func handleSystemEvent(_ event: VoiceSystemEvent) async
    func shutdown() async
}

/// Builds without the AURA.app bundle (`swift run`, tests without voice engines)
/// have no microphone or speech usage strings; macOS would terminate the
/// process on first use, so every voice action reports `unavailable`.
public struct UnavailableVoiceService: VoiceService {
    public init() {}
    private static let reason = "voice requires the AURA.app bundle"
    public func status() async -> VoiceStatus { .unavailable }
    public func capabilities() async -> VoiceCapabilities { .unavailable }
    public func requestPermissions() async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func startSession(conversationId: String?) async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func endSession() async -> VoiceStatus { .unavailable }
    public func startListening(mode: VoiceListenMode) async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func stopListening() async -> VoiceStatus { .unavailable }
    public func cancelListening() async -> VoiceStatus { .unavailable }
    public func speak(_ text: String, interrupt: Bool) async throws { throw AuraError.unavailable(Self.reason) }
    public func speakReply(conversationId: String, streamId: String) async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func stopSpeaking() async {}
    public func setOutputMuted(_ muted: Bool) async -> VoiceStatus { .unavailable }
    public func voices(locale: String?) async -> [VoiceOption] { [] }
    public func openSettings(_ target: OpenVoiceSettingsParams.Target) async throws { throw AuraError.unavailable(Self.reason) }
    public func installRecognitionAssets() async throws { throw AuraError.unavailable(Self.reason) }
    public func handleSystemEvent(_ event: VoiceSystemEvent) async {}
    public func shutdown() async {}
}
