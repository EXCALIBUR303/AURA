import Foundation

// Provider-neutral AI boundary (Phase 3C-A). A provider turns one assembled
// request into a stream of text deltas and a finish reason; everything else
// (which provider, which model, context, limits, retries, coalescing, bridge
// events) is AIService's job. Adding a provider means one type conforming to
// AIProvider plus a case in AIProviderAPI and AIProviderRegistry.makeProvider.

/// One completion request as the provider receives it: the host's system
/// message (with any workspace context) first, then the page's turns.
public struct AIRequest: Equatable, Sendable {
    public var messages: [ChatMessage]
    public var model: String
    public var maxOutputTokens: Int?

    public init(messages: [ChatMessage], model: String, maxOutputTokens: Int? = nil) {
        self.messages = messages
        self.model = model
        self.maxOutputTokens = maxOutputTokens
    }
}

public enum AIStreamEvent: Equatable, Sendable {
    case delta(String)
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

    public func stream(_ request: AIRequest) -> AsyncThrowingStream<AIStreamEvent, Error> {
        let attempt = attempts.next()
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
        func next() -> Int { lock.withLock { defer { count += 1 }; return count } }
        var value: Int { lock.withLock { count } }
    }
}
