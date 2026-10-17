import Foundation

// Provider-neutral AI boundary (Phase 3C-A). A provider turns one assembled
// request into a stream of text deltas and a finish reason; everything else
// (which provider, which model, context, limits, retries, coalescing, bridge
// events) is AIService's job. Adding a provider means one type conforming to
// AIProvider plus a case in AIProviderAPI and AIProviderRegistry.makeProvider.

/// One message as a provider receives it. Unlike the bridge's ChatMessage it
/// can carry the tool-call exchange: an assistant message proposing calls and
/// one `tool` message with each call's (fenced) result.
public struct AIMessage: Equatable, Sendable {
    public enum Role: String, Sendable { case system, user, assistant, tool }
    public var role: Role
    public var content: String
    /// Assistant only: the calls it proposed.
    public var toolCalls: [AIToolCall]
    /// Tool only: the call this result answers.
    public var toolCallId: String?

    public init(role: Role, content: String, toolCalls: [AIToolCall] = [], toolCallId: String? = nil) {
        self.role = role
        self.content = content
        self.toolCalls = toolCalls
        self.toolCallId = toolCallId
    }

    public init(_ message: ChatMessage) {
        self.init(role: Role(rawValue: message.role.rawValue) ?? .user, content: message.content)
    }
}

/// One completion request as the provider receives it: the host's system
/// message (with any workspace context) first, then the turns.
public struct AIRequest: Equatable, Sendable {
    public enum ToolChoice: String, Sendable { case auto, none }
    public var messages: [AIMessage]
    public var model: String
    public var maxOutputTokens: Int?
    /// Tools the model may call. Empty: none offered.
    public var tools: [AIToolDefinition]
    /// `.none` keeps the definitions (the history may contain tool calls) but asks for a text answer.
    public var toolChoice: ToolChoice

    public init(messages: [AIMessage], model: String, maxOutputTokens: Int? = nil, tools: [AIToolDefinition] = [], toolChoice: ToolChoice = .auto) {
        self.messages = messages
        self.model = model
        self.maxOutputTokens = maxOutputTokens
        self.tools = tools
        self.toolChoice = toolChoice
    }

    public init(messages: [ChatMessage], model: String, maxOutputTokens: Int? = nil) {
        self.init(messages: messages.map(AIMessage.init), model: model, maxOutputTokens: maxOutputTokens)
    }
}

public enum AIStreamEvent: Equatable, Sendable {
    case delta(String)
    /// Complete tool calls the model proposed in this response (untrusted).
    case toolCalls([AIToolCall])
    /// The provider's last word. A stream that ends without one was cut short.
    case finished(FinishReason)
}

public protocol AIProvider: Sendable {
    /// Streams the reply. Fails with AuraError. Must stop promptly when the
    /// consuming task is cancelled (the stream's onTermination fires).
    func stream(_ request: AIRequest) -> AsyncThrowingStream<AIStreamEvent, Error>
    /// A free check of reachability and credentials: the model ids the
    /// provider reports. Never runs inference.
    func listModels() async throws -> [String]
}

/// Offline provider for development and tests. Echoes the last user message
/// word by word, or plays a script.
public struct MockAIProvider: AIProvider {
    public enum Step: Sendable, Equatable {
        case delta(String)
        /// Proposes tool calls: (id, name, raw JSON arguments).
        case toolCalls([AIToolCall])
        case finish(FinishReason)
        case fail(AuraError)
        case pause(Duration)
    }

    private let interval: Duration
    private let script: [[Step]]
    private let attempts = AttemptCounter()

    /// `script[n]` is played on the n-th call to `stream` (the last one repeats);
    /// empty: echo mode.
    public init(interval: Duration = .milliseconds(40), script: [[Step]] = []) {
        self.interval = interval
        self.script = script
    }

    /// How many times `stream` was called (retries included).
    public var streamCalls: Int { attempts.value }
    /// Every request received, in order (tests).
    public var requests: [AIRequest] { attempts.requests }

    public func stream(_ request: AIRequest) -> AsyncThrowingStream<AIStreamEvent, Error> {
        let attempt = attempts.next(request)
        let steps: [Step] = script.isEmpty ? Self.echo(request) : script[min(attempt, script.count - 1)]
        let interval = interval
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for step in steps {
                        switch step {
                        case .delta(let text):
                            try await Task.sleep(for: interval)
                            continuation.yield(.delta(text))
                        case .toolCalls(let calls): continuation.yield(.toolCalls(calls))
                        case .finish(let reason): continuation.yield(.finished(reason))
                        case .fail(let error): throw error
                        case .pause(let duration): try await Task.sleep(for: duration)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func listModels() async throws -> [String] { ["mock-echo"] }

    static func echo(_ request: AIRequest) -> [Step] {
        let last = request.messages.last(where: { $0.role == .user })?.content ?? ""
        let words = "[mock] You said: \(last)".split(separator: " ", omittingEmptySubsequences: false)
        return words.enumerated().map { .delta($0.offset == 0 ? String($0.element) : " " + $0.element) } + [.finish(.stop)]
    }

    final class AttemptCounter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        private var received: [AIRequest] = []
        func next(_ request: AIRequest) -> Int {
            lock.withLock {
                defer { count += 1 }
                if received.count < 100 { received.append(request) }
                return count
            }
        }
        var value: Int { lock.withLock { count } }
        var requests: [AIRequest] { lock.withLock { received } }
    }
}
