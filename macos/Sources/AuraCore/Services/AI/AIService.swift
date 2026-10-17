import Foundation

/// Runs ai.chat streams and turns them into ai.chunk / ai.done / ai.error.
///
/// Guarantees per stream: events are numbered (`seq` 1, 2, …); chunks are
/// coalesced to at most one per `flushInterval`; exactly one terminal event
/// (done or error) is sent and nothing after it; a cancelled stream sends
/// done("cancelled") at once and drops anything still in flight. Failures
/// before any text arrived are retried (network, timeout, short rate limits);
/// after text has been shown they are not, so a reply never repeats.
/// Conversations are not stored: the page sends the history it wants used.
@MainActor
public final class AIService {
    public struct Limits: Sendable {
        public var maxConcurrentStreams = 3
        public var maxMessages = 60
        public var maxMessageChars = 32_000
        public var maxTotalChars = 120_000
        /// Output beyond this ends the stream with finishReason "length".
        public var maxOutputChars = 120_000
        public var maxOutputTokens = 8192
        public var flushInterval: Duration = .milliseconds(33)
        /// Delay before each retry; its count is the number of retries.
        public var retryDelays: [Duration] = [.milliseconds(500), .seconds(2)]
        /// A rate limit asking for a longer wait is reported, not retried.
        public var maxRetryAfterSeconds = 10
        public init() {}
    }

    public let registry: AIProviderRegistry
    private let context: AIContextBuilder
    private let preferences: @MainActor () async -> Preferences
    private let events: BridgeEventEmitter
    private let limits: Limits
    private let sleep: @Sendable (Duration) async throws -> Void
    private let conversations = AIConversationGuard()
    private var streams: [String: ActiveStream] = [:]

    private final class ActiveStream {
        var seq = 0
        var task: Task<Void, Never>?
        var buffer = ""
        var flush: Task<Void, Never>?
    }

    public init(
        registry: AIProviderRegistry,
        context: AIContextBuilder,
        preferences: @escaping @MainActor () async -> Preferences,
        events: BridgeEventEmitter,
        limits: Limits = Limits(),
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.registry = registry
        self.context = context
        self.preferences = preferences
        self.events = events
        self.limits = limits
        self.sleep = sleep
    }

    public var activeStreamIds: [String] { Array(streams.keys) }

    public func previewContext(_ request: AIContextRequest, providerId: String?) async throws -> AIContextSnapshot {
        let prefs = await preferences()
        let info = try await registry.info(providerId ?? prefs.ai.defaultProviderId ?? AIProviderRegistry.mockId)
        return try await context.build(request, preferences: prefs.ai, providerKind: info.kind).snapshot
    }

    /// Validates synchronously-checkable input, then returns the stream id at
    /// once; context, provider errors and output arrive as events.
    public func startChat(_ params: ChatParams) async throws -> StreamRef {
        try validate(params)
        if let conversationId = params.conversationId { try AIConversationGuard.validate(conversationId) }
        if params.context != nil, params.conversationId == nil {
            throw AuraError.invalidRequest("a request with context needs a conversationId")
        }
        guard streams.count < limits.maxConcurrentStreams else {
            throw AuraError.invalidRequest("at most \(limits.maxConcurrentStreams) replies can stream at once")
        }
        let prefs = await preferences()
        let (provider, info) = try await registry.provider(params.providerId ?? prefs.ai.defaultProviderId ?? AIProviderRegistry.mockId)
        let model = try Self.model(params.model, info)
        if let conversationId = params.conversationId, conversations.carriesPrivateContext(conversationId),
           !AIContextBuilder.allowsPrivate(prefs.ai.privateRepositoryContext, info.kind) {
            throw AuraError.permissionDenied("this conversation includes private repository context; start a new conversation to use \(info.displayName)")
        }

        let streamId = "ai-\(UUID().uuidString.lowercased())"
        let active = ActiveStream()
        streams[streamId] = active
        active.task = Task { [weak self] in
            await self?.run(streamId, params: params, provider: provider, info: info, model: model, preferences: prefs)
        }
        Log.ai.info("stream \(streamId, privacy: .public) started (\(info.id, privacy: .public), \(params.messages.count, privacy: .public) messages)")
        return StreamRef(streamId: streamId)
    }

    /// Stops a stream; sends done("cancelled") unless it had already ended.
    public func cancel(_ streamId: String) {
        guard streams[streamId] != nil else { return }
        finish(streamId, .done(.cancelled))
    }

    /// The page that owned the streams is gone (reload, web process crash,
    /// quit): stop everything without sending events to whatever loads next.
    public func cancelAll() {
        for (id, active) in streams {
            active.flush?.cancel()
            active.task?.cancel()
            Log.ai.info("stream \(id, privacy: .public) dropped with its page")
        }
        streams.removeAll()
    }

    // MARK: running

    private func run(_ streamId: String, params: ChatParams, provider: any AIProvider, info: AIProviderInfo, model: String, preferences prefs: Preferences) async {
        do {
            var snapshot: AIContextSnapshot?
            if let request = params.context, let conversationId = params.conversationId {
                let build = try await context.build(request, preferences: prefs.ai, providerKind: info.kind)
                try Task.checkCancellation()
                if build.includesPrivateRepository { conversations.recordPrivateContext(conversationId) }
                snapshot = build.snapshot
            }
            let request = AIRequest(
                messages: [AIPromptComposer.systemMessage(snapshot)] + params.messages,
                model: model,
                maxOutputTokens: min(params.maxOutputTokens ?? limits.maxOutputTokens, limits.maxOutputTokens)
            )
            let reason = try await stream(streamId, request: request, provider: provider)
            finish(streamId, .done(reason))
        } catch is CancellationError {
            finish(streamId, .done(.cancelled))
        } catch {
            if Task.isCancelled { return finish(streamId, .done(.cancelled)) }
            Log.ai.error("stream \(streamId, privacy: .public) failed: \(BridgeError(error).code.rawValue, privacy: .public)")
            finish(streamId, .error(BridgeError(error)))
        }
    }

    /// Consumes the provider, retrying failures that happen before any text.
    private func stream(_ streamId: String, request: AIRequest, provider: any AIProvider) async throws -> FinishReason {
        var attempt = 0
        var produced = 0
        while true {
            do {
                for try await event in provider.stream(request) {
                    try Task.checkCancellation()
                    switch event {
                    case .delta(let text):
                        let room = limits.maxOutputChars - produced
                        produced += text.count
                        append(streamId, String(text.prefix(room)))
                        if produced >= limits.maxOutputChars { return .length }
                    case .finished(let reason):
                        return reason
                    }
                }
                throw AuraError.network("the AI provider ended the stream without finishing")
            } catch {
                try Task.checkCancellation()
                guard produced == 0, attempt < limits.retryDelays.count, let delay = retryDelay(error, attempt) else { throw error }
                attempt += 1
                Log.ai.notice("stream \(streamId, privacy: .public) retry \(attempt, privacy: .public) after \(BridgeError(error).code.rawValue, privacy: .public)")
                try await sleep(delay)
            }
        }
    }

    private func retryDelay(_ error: any Error, _ attempt: Int) -> Duration? {
        switch error {
        case AuraError.network, AuraError.timeout: return limits.retryDelays[attempt]
        case AuraError.rateLimited(let after):
            guard let after else { return limits.retryDelays[attempt] }
            return after <= limits.maxRetryAfterSeconds ? .seconds(after) : nil
        default: return nil
        }
    }

    // MARK: events

    private enum Terminal { case done(FinishReason), error(BridgeError) }

    private func append(_ streamId: String, _ text: String) {
        guard let active = streams[streamId], !text.isEmpty else { return }
        active.buffer += text
        if limits.flushInterval == .zero { return flush(streamId) }
        guard active.flush == nil else { return }
        let interval = limits.flushInterval
        active.flush = Task { [weak self] in
            try? await Task.sleep(for: interval)
            guard !Task.isCancelled else { return }
            self?.flush(streamId)
        }
    }

    private func flush(_ streamId: String) {
        guard let active = streams[streamId] else { return }
        active.flush?.cancel()
        active.flush = nil
        guard !active.buffer.isEmpty else { return }
        active.seq += 1
        events.emit(.aiChunk, AIChunkPayload(streamId: streamId, seq: active.seq, delta: active.buffer))
        active.buffer = ""
    }

    /// Sends the one terminal event and forgets the stream. Later calls are no-ops.
    private func finish(_ streamId: String, _ terminal: Terminal) {
        guard let active = streams[streamId] else { return }
        if case .done(.cancelled) = terminal {
            active.flush?.cancel()
            active.buffer = ""
        } else {
            flush(streamId) // text that arrived before the end (or the error) is still shown
        }
        streams[streamId] = nil
        active.task?.cancel()
        active.seq += 1
        switch terminal {
        case .done(let reason):
            events.emit(.aiDone, AIDonePayload(streamId: streamId, seq: active.seq, finishReason: reason))
            Log.ai.info("stream \(streamId, privacy: .public) done (\(reason.rawValue, privacy: .public))")
        case .error(let error):
            events.emit(.aiError, AIErrorPayload(streamId: streamId, seq: active.seq, error: error))
        }
    }

    // MARK: validation

    private func validate(_ params: ChatParams) throws {
        guard !params.messages.isEmpty, params.messages.count <= limits.maxMessages else {
            throw AuraError.invalidRequest("messages must contain 1-\(limits.maxMessages) entries")
        }
        guard params.messages.allSatisfy({ $0.role != .system }) else {
            throw AuraError.invalidRequest("system messages come from the host, not the page")
        }
        guard params.messages.last?.role == .user else { throw AuraError.invalidRequest("the last message must be from the user") }
        guard params.messages.allSatisfy({ $0.content.count <= limits.maxMessageChars }),
              params.messages.reduce(0, { $0 + $1.content.count }) <= limits.maxTotalChars
        else { throw AuraError.invalidRequest("messages are too long") }
        if let max = params.maxOutputTokens, !(1...limits.maxOutputTokens).contains(max) {
            throw AuraError.invalidRequest("maxOutputTokens must be 1-\(limits.maxOutputTokens)")
        }
    }

    static func model(_ requested: String?, _ info: AIProviderInfo) throws -> String {
        if let requested {
            guard info.models.contains(requested) else { throw AuraError.invalidRequest("model \(requested) is not configured for \(info.displayName)") }
            return requested
        }
        guard let model = info.defaultModel ?? info.models.first else { throw AuraError.unavailable("\(info.displayName) has no model configured") }
        return model
    }
}
