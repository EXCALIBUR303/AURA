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
    func connect() async -> GitHubAuthStatus
    func disconnect() async -> GitHubAuthStatus
    func refresh() async -> GitHubAuthStatus
    func listRepositories(cursor: String?, perPage: Int) async throws -> Page<RepositorySummary>
    /// Every accessible repository (for zone suggestions).
    func accessibleRepositories() async throws -> [RepositorySummary]
    func repository(fullName: String) async throws -> RepositoryDetail
    func listBranches(fullName: String, cursor: String?, perPage: Int) async throws -> Page<BranchSummary>
    func listCommits(fullName: String, branch: String?, limit: Int) async throws -> [CommitSummary]
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
}

// MARK: AI

public protocol AIProvider: Sendable {
    var info: AIProviderInfo { get }
    /// Yields text deltas. Must honour task cancellation promptly.
    func stream(messages: [ChatMessage], model: String?) -> AsyncThrowingStream<String, Error>
}

public struct MockAIProvider: AIProvider {
    public let info = AIProviderInfo(id: "mock", displayName: "Mock provider (offline)", kind: .local, available: true, models: ["mock-echo"])
    private let interval: Duration

    public init(interval: Duration = .milliseconds(40)) {
        self.interval = interval
    }

    public func stream(messages: [ChatMessage], model: String?) -> AsyncThrowingStream<String, Error> {
        let text = "[mock] You said: \(messages.last?.content ?? "")"
        let interval = interval
        return AsyncThrowingStream { continuation in
            let task = Task {
                for word in text.split(separator: " ", omittingEmptySubsequences: false).enumerated().map({ $0.offset == 0 ? String($0.element) : " " + $0.element }) {
                    try await Task.sleep(for: interval)
                    continuation.yield(word)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Owns in-flight streams and turns them into ai.* events.
@MainActor
public final class AIService {
    private let providers: [String: any AIProvider]
    private let defaultProviderId: String
    private let events: BridgeEventEmitter
    private var streams: [String: Task<Void, Never>] = [:]
    private var counter = 0

    public init(providers: [any AIProvider], defaultProviderId: String, events: BridgeEventEmitter) {
        self.providers = Dictionary(uniqueKeysWithValues: providers.map { ($0.info.id, $0) })
        self.defaultProviderId = defaultProviderId
        self.events = events
    }

    public var providerInfos: [AIProviderInfo] {
        providers.values.map(\.info).sorted { $0.id < $1.id }
    }

    public func startChat(_ params: ChatParams) throws -> StreamRef {
        let providerId = params.providerId ?? defaultProviderId
        guard let provider = providers[providerId] else { throw AuraError.notFound("provider \(providerId)") }
        guard provider.info.available else { throw AuraError.unavailable("provider \(providerId) is not configured") }
        guard !params.messages.isEmpty else { throw AuraError.invalidRequest("messages must not be empty") }

        counter += 1
        let streamId = "native-stream-\(counter)"
        let events = events
        streams[streamId] = Task { [weak self] in
            do {
                for try await delta in provider.stream(messages: params.messages, model: params.model) {
                    events.emit(.aiChunk, AIChunkPayload(streamId: streamId, delta: delta))
                }
                events.emit(.aiDone, AIDonePayload(streamId: streamId, finishReason: Task.isCancelled ? .cancelled : .stop))
            } catch is CancellationError {
                events.emit(.aiDone, AIDonePayload(streamId: streamId, finishReason: .cancelled))
            } catch {
                events.emit(.aiError, AIErrorPayload(streamId: streamId, error: BridgeError(error)))
            }
            self?.streams[streamId] = nil
        }
        return StreamRef(streamId: streamId)
    }

    public func cancel(_ streamId: String) {
        streams.removeValue(forKey: streamId)?.cancel()
    }
}

// MARK: Voice

public protocol VoiceService: Sendable {
    func status() async -> VoiceStatus
    func requestPermissions() async throws -> VoiceStatus
    func startListening() async throws -> VoiceStatus
    func stopListening() async throws -> VoiceStatus
    func speak(_ text: String, interrupt: Bool) async throws
    func stopSpeaking() async throws
}

/// Speech recognition and microphone access require the signed .app bundle
/// (Info.plist usage descriptions); without them macOS terminates the process
/// on first use. Until Phase 3 every action reports `unavailable`.
public struct UnavailableVoiceService: VoiceService {
    public init() {}
    private static let reason = "voice requires the signed AURA.app bundle (Phase 3)"
    public func status() async -> VoiceStatus { .initial }
    public func requestPermissions() async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func startListening() async throws -> VoiceStatus { throw AuraError.unavailable(Self.reason) }
    public func stopListening() async throws -> VoiceStatus { .initial }
    public func speak(_ text: String, interrupt: Bool) async throws { throw AuraError.unavailable(Self.reason) }
    public func stopSpeaking() async throws {}
}
