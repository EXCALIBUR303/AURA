import Foundation

// Swift mirror of the Phase 3C-B additions to shared/contracts/domain.ts:
// sources, conversations, tool activity, approvals and repository trees.
// Optionals encode as explicit null, like the rest of the mirror.

public struct AISourceRef: Codable, Equatable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case workspace, repository, commits, commit, notes, directory, file }
    public struct Lines: Codable, Equatable, Hashable, Sendable {
        public var start: Int
        public var end: Int
    }
    public var kind: Kind
    public var fullName: String?
    public var path: String?
    public var ref: String?
    public var lines: Lines?

    public init(kind: Kind, fullName: String? = nil, path: String? = nil, ref: String? = nil, lines: Lines? = nil) {
        self.kind = kind
        self.fullName = fullName
        self.path = path
        self.ref = ref
        self.lines = lines
    }

    enum Keys: String, CodingKey { case kind, fullName, path, ref, lines }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(fullName, forKey: .fullName)
        try c.encode(path, forKey: .path)
        try c.encode(ref, forKey: .ref)
        try c.encode(lines, forKey: .lines)
    }
}

public enum AITurnState: String, Codable, Sendable, CaseIterable {
    case idle
    case preparingContext = "preparing_context"
    case requesting, streaming
    case waitingForTool = "waiting_for_tool"
    case waitingForApproval = "waiting_for_approval"
    case completed, cancelled, error

    public var isTerminal: Bool { self == .completed || self == .cancelled || self == .error }

    /// The state machine every reply follows (see AITurnState in domain.ts).
    public func canMove(to next: AITurnState) -> Bool {
        if next.isTerminal { return self != .idle && !isTerminal }
        switch (self, next) {
        case (.idle, .preparingContext),
             (.preparingContext, .waitingForApproval), (.waitingForApproval, .preparingContext),
             (.preparingContext, .requesting),
             (.requesting, .streaming),
             (.requesting, .waitingForTool), (.streaming, .waitingForTool),
             (.waitingForTool, .waitingForApproval), (.waitingForApproval, .waitingForTool),
             (.waitingForTool, .requesting):
            return true
        default:
            return false
        }
    }
}

public struct AIConversationRepository: Codable, Equatable, Sendable {
    public var fullName: String
    public var branch: String?
    public var isPrivate: Bool

    enum Keys: String, CodingKey { case fullName, branch, isPrivate }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(fullName, forKey: .fullName)
        try c.encode(branch, forKey: .branch)
        try c.encode(isPrivate, forKey: .isPrivate)
    }
}

public struct AIConversationInfo: Codable, Equatable, Sendable {
    public var conversationId: String
    public var providerId: String
    public var providerName: String
    public var providerKind: AIProviderInfo.Kind
    public var model: String
    public var repository: AIConversationRepository?
    public var toolsEnabled: Bool
    public var state: AITurnState
    public var activeStreamId: String?
    public var turnCount: Int
    public var carriesPrivateContext: Bool
    public var sourceSharingAllowed: [String]
    public var createdAt: String

    enum Keys: String, CodingKey {
        case conversationId, providerId, providerName, providerKind, model, repository, toolsEnabled, state
        case activeStreamId, turnCount, carriesPrivateContext, sourceSharingAllowed, createdAt
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(providerId, forKey: .providerId)
        try c.encode(providerName, forKey: .providerName)
        try c.encode(providerKind, forKey: .providerKind)
        try c.encode(model, forKey: .model)
        try c.encode(repository, forKey: .repository)
        try c.encode(toolsEnabled, forKey: .toolsEnabled)
        try c.encode(state, forKey: .state)
        try c.encode(activeStreamId, forKey: .activeStreamId)
        try c.encode(turnCount, forKey: .turnCount)
        try c.encode(carriesPrivateContext, forKey: .carriesPrivateContext)
        try c.encode(sourceSharingAllowed, forKey: .sourceSharingAllowed)
        try c.encode(createdAt, forKey: .createdAt)
    }
}

public struct AIToolActivity: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable {
        case running, succeeded, failed, denied, cancelled
        case awaitingApproval = "awaiting_approval"
    }
    public var callId: String
    public var tool: String
    public var status: Status
    public var summary: String
    public var sources: [AISourceRef]
    public var message: String?

    public init(callId: String, tool: String, status: Status, summary: String, sources: [AISourceRef] = [], message: String? = nil) {
        self.callId = callId
        self.tool = tool
        self.status = status
        self.summary = summary
        self.sources = sources
        self.message = message
    }

    enum Keys: String, CodingKey { case callId, tool, status, summary, sources, message }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(callId, forKey: .callId)
        try c.encode(tool, forKey: .tool)
        try c.encode(status, forKey: .status)
        try c.encode(summary, forKey: .summary)
        try c.encode(sources, forKey: .sources)
        try c.encode(message, forKey: .message)
    }
}

public struct AIConversationTurn: Codable, Equatable, Sendable {
    public var streamId: String
    public var userText: String
    public var replyText: String
    public var finishReason: FinishReason?
    public var state: AITurnState
    public var tools: [AIToolActivity]
    public var sources: [AISourceRef]

    enum Keys: String, CodingKey { case streamId, userText, replyText, finishReason, state, tools, sources }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(streamId, forKey: .streamId)
        try c.encode(userText, forKey: .userText)
        try c.encode(replyText, forKey: .replyText)
        try c.encode(finishReason, forKey: .finishReason)
        try c.encode(state, forKey: .state)
        try c.encode(tools, forKey: .tools)
        try c.encode(sources, forKey: .sources)
    }
}

public struct AIApprovalRequest: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case sharePrivateSource = "share_private_source"
        case appAction = "app_action"
    }
    public var approvalId: String
    public var kind: Kind
    public var callId: String?
    public var tool: String?
    public var summary: String
    public var repository: String?
    public var paths: [String]
    public var providerName: String
    public var providerKind: AIProviderInfo.Kind
    public var expiresInSeconds: Int

    enum Keys: String, CodingKey { case approvalId, kind, callId, tool, summary, repository, paths, providerName, providerKind, expiresInSeconds }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(approvalId, forKey: .approvalId)
        try c.encode(kind, forKey: .kind)
        try c.encode(callId, forKey: .callId)
        try c.encode(tool, forKey: .tool)
        try c.encode(summary, forKey: .summary)
        try c.encode(repository, forKey: .repository)
        try c.encode(paths, forKey: .paths)
        try c.encode(providerName, forKey: .providerName)
        try c.encode(providerKind, forKey: .providerKind)
        try c.encode(expiresInSeconds, forKey: .expiresInSeconds)
    }
}

public enum AIApprovalDecision: String, Codable, Sendable {
    case allowOnce = "allow_once"
    case allowForConversation = "allow_for_conversation"
    case deny
}

public enum AIConversationChangeReason: String, Codable, Sendable {
    case reset, ended, evicted
    case repositoryChanged = "repository_changed"
    case githubAccessChanged = "github_access_changed"
    case providerChanged = "provider_changed"
    case toolsUnavailable = "tools_unavailable"
}

public struct RepositoryTreeEntry: Codable, Equatable, Sendable {
    public enum EntryType: String, Codable, Sendable { case file, directory }
    public var path: String
    public var type: EntryType
    public var size: Int?

    public init(path: String, type: EntryType, size: Int?) {
        self.path = path
        self.type = type
        self.size = size
    }

    enum Keys: String, CodingKey { case path, type, size }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(path, forKey: .path)
        try c.encode(type, forKey: .type)
        try c.encode(size, forKey: .size)
    }
}

public struct RepositoryTree: Codable, Equatable, Sendable {
    public var fullName: String
    public var ref: String
    public var commitSha: String
    public var entries: [RepositoryTreeEntry]
    public var truncated: Bool

    public init(fullName: String, ref: String, commitSha: String, entries: [RepositoryTreeEntry], truncated: Bool) {
        self.fullName = fullName
        self.ref = ref
        self.commitSha = commitSha
        self.entries = entries
        self.truncated = truncated
    }
}

// MARK: params and payloads

public struct ListFilesParams: Codable, Sendable {
    public var fullName: String
    public var branch: String?
    public var path: String?
    public var limit: Int?
}

public struct StartConversationParams: Codable, Sendable {
    public var providerId: String?
    public var model: String?
    public var repository: AIContextRequest.Repository?
    public var tools: Bool?

    public init(providerId: String? = nil, model: String? = nil, repository: AIContextRequest.Repository? = nil, tools: Bool? = nil) {
        self.providerId = providerId
        self.model = model
        self.repository = repository
        self.tools = tools
    }
}

public struct ConversationRef: Codable, Sendable {
    public var conversationId: String
    public init(conversationId: String) { self.conversationId = conversationId }
}

public struct SendMessageParams: Codable, Sendable {
    public var conversationId: String
    public var text: String
    public var context: AIContextRequest?
    public var maxOutputTokens: Int?

    public init(conversationId: String, text: String, context: AIContextRequest? = nil, maxOutputTokens: Int? = nil) {
        self.conversationId = conversationId
        self.text = text
        self.context = context
        self.maxOutputTokens = maxOutputTokens
    }
}

public struct SetConversationRepositoryParams: Codable, Sendable {
    public var conversationId: String
    public var repository: AIContextRequest.Repository?
}

public struct RespondToApprovalParams: Codable, Sendable {
    public var conversationId: String
    public var approvalId: String
    public var decision: AIApprovalDecision
}

public struct AIConversationDetail: Codable, Equatable, Sendable {
    public var conversation: AIConversationInfo
    public var turns: [AIConversationTurn]
}

public struct AITurnStatePayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var conversationId: String
    public var seq: Int
    public var state: AITurnState
}

public struct AIToolActivityPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var conversationId: String
    public var seq: Int
    public var activity: AIToolActivity
}

public struct AIApprovalRequestedPayload: Codable, Equatable, Sendable {
    public var streamId: String
    public var conversationId: String
    public var seq: Int
    public var approval: AIApprovalRequest
}

public struct AIConversationChangedPayload: Codable, Equatable, Sendable {
    public var conversationId: String
    public var reason: AIConversationChangeReason
    public var conversation: AIConversationInfo?

    enum Keys: String, CodingKey { case conversationId, reason, conversation }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(reason, forKey: .reason)
        try c.encode(conversation, forKey: .conversation)
    }
}
