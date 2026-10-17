import Foundation

// Host-owned conversations (Phase 3C-B). Unlike ai.chat, the history lives
// here, so the model's tool calls and their results never pass through the
// page, and the host decides what each request contains:
//
// - A conversation is bound to one provider (fingerprinted: id, kind and
//   endpoint) and model, and to at most one repository. Changing the
//   repository is an explicit call; a changed provider ends the conversation.
// - One reply at a time. Each reply moves through AITurnState; every event it
//   sends shares one `seq`; it ends with exactly one ai.done or ai.error.
// - Tools run only through AIToolPolicy (allowlist, arguments) and
//   AIToolExecutor (scope, privacy, budgets). Private source for a cloud
//   provider waits for the user's approval (ai.respondToApproval).
// - History is bounded and in memory only: older tool exchanges are dropped,
//   long histories lose their oldest turns, and nothing is written to disk.

@MainActor
final class AIConversation {
    let id: String
    let providerId: String
    let providerName: String
    let providerKind: AIProviderInfo.Kind
    /// id, kind and endpoint at start: any change ends the conversation.
    let providerFingerprint: String
    let model: String
    let createdAt: String
    /// Random per conversation (rotated on reset): frames source and tool results.
    var boundary = AIPromptComposer.newBoundary()
    var repository: AIConversationRepository?
    let toolsRequested: Bool
    var toolsUnsupported = false
    var providerInvalid = false
    var turns: [Turn] = []
    /// Context attached by the latest message that asked for some; kept for later turns.
    var context: AIContextSnapshot?
    /// Lowercased repositories whose private source the user allowed for this conversation.
    var sourceGrants: Set<String> = []
    var carriesPrivate = false
    var zone: ZoneID?
    var activeStreamId: String?
    var state: AITurnState = .idle
    var lastUsed = Date()

    struct Turn {
        var streamId: String
        var userText: String
        var reply = ""
        /// Assistant tool-call messages and tool results. Kept only for the latest completed turn.
        var exchange: [AIMessage] = []
        var finishReason: FinishReason?
        var state: AITurnState = .idle
        var tools: [AIToolActivity] = []
        var sources: [AISourceRef] = []
        var toolResultChars = 0
    }

    init(id: String, info: AIProviderInfo, model: String, repository: AIConversationRepository?, tools: Bool, createdAt: String) {
        self.id = id
        providerId = info.id
        providerName = info.displayName
        providerKind = info.kind
        providerFingerprint = Self.fingerprint(info)
        self.model = model
        self.repository = repository
        toolsRequested = tools
        self.createdAt = createdAt
    }

    static func fingerprint(_ info: AIProviderInfo) -> String { "\(info.id)|\(info.kind.rawValue)|\(info.baseUrl ?? "builtin")" }

    func info(toolsAvailable: Bool) -> AIConversationInfo {
        AIConversationInfo(
            conversationId: id, providerId: providerId, providerName: providerName, providerKind: providerKind, model: model,
            repository: repository, toolsEnabled: toolsAvailable && toolsRequested && !toolsUnsupported, state: state,
            activeStreamId: activeStreamId, turnCount: turns.count, carriesPrivateContext: carriesPrivate,
            sourceSharingAllowed: sourceGrants.sorted(), createdAt: createdAt
        )
    }

    /// Earlier turns as provider messages, newest last, within the limits.
    /// The tool exchange is replayed only for the latest earlier turn.
    func history(maxChars: Int) -> [AIMessage] {
        let finished = turns.filter { $0.streamId != activeStreamId }
        var blocks: [[AIMessage]] = []
        for (index, turn) in finished.enumerated() {
            var block = [AIMessage(role: .user, content: turn.userText)]
            if index == finished.count - 1, turn.state == .completed { block += turn.exchange }
            if !turn.reply.isEmpty {
                block.append(AIMessage(role: .assistant, content: turn.state == .completed ? turn.reply : turn.reply + "\n[reply interrupted]"))
            }
            blocks.append(block)
        }
        var total = 0
        var kept: [[AIMessage]] = []
        for block in blocks.reversed() {
            let size = block.reduce(0) { $0 + $1.content.count + $1.toolCalls.reduce(0) { $0 + $1.argumentsJSON.count } }
            guard total + size <= maxChars else { break }
            total += size
            kept.append(block)
        }
        return kept.reversed().flatMap { $0 }
    }

    func clearHistory() {
        turns.removeAll()
        context = nil
        sourceGrants.removeAll()
        carriesPrivate = false
        boundary = AIPromptComposer.newBoundary()
        state = .idle
    }
}

extension AIService {
    // MARK: lifecycle

    public func startConversation(_ params: StartConversationParams) async throws -> AIConversationInfo {
        let prefs = await preferences()
        let info = try await registry.info(params.providerId ?? prefs.ai.defaultProviderId ?? AIProviderRegistry.mockId)
        guard info.available else {
            throw AuraError.unavailable(info.credential == .missing ? "add an API key for \(info.displayName) first" : "\(info.displayName) is not configured")
        }
        let model = try Self.model(params.model, info)
        var repository: AIConversationRepository?
        if let ref = params.repository { repository = try await resolveRepository(ref) }
        try makeRoomForConversation()
        let id = "conv-\(UUID().uuidString.lowercased())"
        let conversation = AIConversation(
            id: id, info: info, model: model, repository: repository, tools: params.tools ?? true, createdAt: Date.now.formatted(.iso8601)
        )
        conversation.zone = prefs.lastZone
        conversationTable[id] = conversation
        Log.ai.info("conversation \(id, privacy: .public) started (\(info.id, privacy: .public), repository \(repository == nil ? "none" : "set", privacy: .public))")
        return conversation.info(toolsAvailable: toolsAvailable(prefs))
    }

    public func listConversations() async -> [AIConversationInfo] {
        let available = toolsAvailable(await preferences())
        return conversationTable.values.sorted { $0.createdAt < $1.createdAt }.map { $0.info(toolsAvailable: available) }
    }

    public func conversationDetail(_ id: String) async throws -> AIConversationDetail {
        let conversation = try find(id)
        let turns = conversation.turns.map {
            AIConversationTurn(streamId: $0.streamId, userText: $0.userText, replyText: $0.reply, finishReason: $0.finishReason,
                               state: $0.state, tools: $0.tools, sources: $0.sources)
        }
        return AIConversationDetail(conversation: conversation.info(toolsAvailable: toolsAvailable(await preferences())), turns: turns)
    }

    /// ai.previewContext with a conversationId: the conversation's provider
    /// and repository, and its source approvals, exactly as sendMessage would.
    public func previewConversationContext(_ id: String, _ request: AIContextRequest) async throws -> AIContextSnapshot {
        let conversation = try find(id)
        guard request.repository == nil else {
            throw AuraError.invalidRequest("a conversation uses its own repository; change it with ai.setConversationRepository")
        }
        var request = request
        request.repository = conversation.repository.map { AIContextRequest.Repository(fullName: $0.fullName, branch: $0.branch) }
        let prefs = await preferences()
        let consent = conversation.sourceGrants.contains(conversation.repository?.fullName.lowercased() ?? "")
        return try await context.build(request, preferences: prefs.ai, providerKind: conversation.providerKind, sourceConsent: consent).snapshot
    }

    public func setConversationRepository(_ params: SetConversationRepositoryParams) async throws -> AIConversationInfo {
        let conversation = try find(params.conversationId)
        guard conversation.activeStreamId == nil else { throw AuraError.invalidRequest("wait for the reply to finish, or cancel it, before switching repositories") }
        var repository: AIConversationRepository?
        if let ref = params.repository { repository = try await resolveRepository(ref) }
        conversation.repository = repository
        conversation.context = nil
        conversation.sourceGrants.removeAll()
        tools?.forget(conversation: conversation.id)
        let info = conversation.info(toolsAvailable: toolsAvailable(await preferences()))
        conversationChanged(AIConversationChangedPayload(conversationId: conversation.id, reason: .repositoryChanged, conversation: info))
        return info
    }

    public func resetConversation(_ id: String) async throws -> AIConversationInfo {
        let conversation = try find(id)
        if let active = conversation.activeStreamId { cancel(active) }
        conversation.clearHistory()
        tools?.forget(conversation: id)
        let info = conversation.info(toolsAvailable: toolsAvailable(await preferences()))
        conversationChanged(AIConversationChangedPayload(conversationId: id, reason: .reset, conversation: info))
        return info
    }

    public func endConversation(_ id: String) throws {
        let conversation = try find(id)
        if let active = conversation.activeStreamId { cancel(active) }
        conversationTable[id] = nil
        tools?.forget(conversation: id)
        conversationChanged(AIConversationChangedPayload(conversationId: id, reason: .ended, conversation: nil))
    }

    public func respondToApproval(_ params: RespondToApprovalParams) throws {
        let conversation = try find(params.conversationId)
        guard let streamId = conversation.activeStreamId, let active = streams[streamId],
              let continuation = active.approvals.removeValue(forKey: params.approvalId) else {
            throw AuraError.notFound("no pending approval \(AIToolPolicy.printable(params.approvalId)) in this conversation")
        }
        Log.ai.notice("approval \(params.approvalId, privacy: .public) answered: \(params.decision.rawValue, privacy: .public)")
        continuation.resume(returning: params.decision)
    }

    /// GitHub disconnected, expired, failed or switched accounts: cached
    /// repository data and approvals go, and conversations holding private
    /// repository content are cleared (their replies are cancelled).
    public func githubAccessChanged(_ status: GitHubAuthStatus) {
        let login: String?
        switch status {
        case .connected(let account, _), .rateLimited(let account, _, _): login = account.login
        case .authorizing: return
        case .error(let reason, _, _) where reason == .network: return // offline: the session is kept
        default: login = nil
        }
        defer { lastGitHubLogin = login }
        guard login == nil || (lastGitHubLogin != nil && login != lastGitHubLogin) else { return }
        tools?.forgetAll()
        for conversation in conversationTable.values {
            conversation.sourceGrants.removeAll()
            guard conversation.carriesPrivate || conversation.repository?.isPrivate == true else { continue }
            if let active = conversation.activeStreamId { cancel(active) }
            conversation.clearHistory()
            if conversation.repository?.isPrivate == true { conversation.repository = nil }
            conversationChanged(AIConversationChangedPayload(
                conversationId: conversation.id, reason: .githubAccessChanged, conversation: conversation.info(toolsAvailable: tools != nil)
            ))
        }
    }

    /// The provider list changed: a conversation whose provider was removed or
    /// moved (endpoint, kind) cannot continue.
    public func providersChanged(_ infos: [AIProviderInfo]) {
        let current = Dictionary(infos.map { ($0.id, AIConversation.fingerprint($0)) }, uniquingKeysWith: { first, _ in first })
        for conversation in conversationTable.values where !conversation.providerInvalid {
            guard current[conversation.providerId] != conversation.providerFingerprint else { continue }
            conversation.providerInvalid = true
            if let active = conversation.activeStreamId { cancel(active) }
            conversationChanged(AIConversationChangedPayload(
                conversationId: conversation.id, reason: .providerChanged, conversation: conversation.info(toolsAvailable: tools != nil)
            ))
        }
    }

    // MARK: sending

    public func sendMessage(_ params: SendMessageParams) async throws -> StreamRef {
        let conversation = try find(params.conversationId)
        guard conversation.activeStreamId == nil else { throw AuraError.invalidRequest("a reply is already in progress in this conversation") }
        guard !conversation.providerInvalid else {
            throw AuraError.permissionDenied("\(conversation.providerName) was removed or changed; start a new conversation")
        }
        let text = params.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= limits.maxMessageChars else { throw AuraError.invalidRequest("text must be 1-\(limits.maxMessageChars) characters") }
        if let max = params.maxOutputTokens, !(1...limits.maxOutputTokens).contains(max) {
            throw AuraError.invalidRequest("maxOutputTokens must be 1-\(limits.maxOutputTokens)")
        }
        if let context = params.context {
            guard context.repository == nil else {
                throw AuraError.invalidRequest("a conversation uses its own repository; change it with ai.setConversationRepository")
            }
            guard (context.files ?? []).count <= AIContextBuilder.Budget().maxFiles else { throw AuraError.invalidRequest("at most \(AIContextBuilder.Budget().maxFiles) files") }
            for file in context.files ?? [] { try AIContextBuilder.validate(file) }
            if !(context.files ?? []).isEmpty, conversation.repository == nil { throw AuraError.invalidRequest("select a repository for this conversation before attaching files") }
        }
        guard streams.count < limits.maxConcurrentStreams else {
            throw AuraError.invalidRequest("at most \(limits.maxConcurrentStreams) replies can stream at once")
        }
        let prefs = await preferences()
        // Private repository content already in the history may only keep going
        // to this provider while the settings still allow it.
        if conversation.carriesPrivate,
           !prefs.ai.contextSharing || !AIContextBuilder.allowsPrivate(prefs.ai.privateRepositoryContext, conversation.providerKind) {
            throw AuraError.permissionDenied("this conversation includes private repository content that AURA's privacy settings no longer allow sending to \(conversation.providerName); reset it or start a new conversation")
        }
        let (provider, info) = try await registry.provider(conversation.providerId)
        guard AIConversation.fingerprint(info) == conversation.providerFingerprint, info.models.contains(conversation.model) else {
            conversation.providerInvalid = true
            throw AuraError.permissionDenied("\(conversation.providerName)'s settings changed; start a new conversation")
        }
        // Raced with another send while the provider was being prepared.
        guard conversation.activeStreamId == nil else { throw AuraError.invalidRequest("a reply is already in progress in this conversation") }

        let streamId = "ai-\(UUID().uuidString.lowercased())"
        let active = ActiveStream()
        active.conversationId = conversation.id
        streams[streamId] = active
        conversation.activeStreamId = streamId
        conversation.state = .idle
        conversation.lastUsed = Date()
        conversation.turns.append(AIConversation.Turn(streamId: streamId, userText: text))
        if conversation.turns.count > limits.maxTurnsKept { conversation.turns.removeFirst(conversation.turns.count - limits.maxTurnsKept) }
        active.task = Task { [weak self] in
            await self?.runTurn(streamId, conversation, text: text, context: params.context, provider: provider, info: info,
                                preferences: prefs, maxOutputTokens: params.maxOutputTokens)
        }
        Log.ai.info("conversation \(conversation.id, privacy: .public) reply \(streamId, privacy: .public) started")
        replyObserver?.replyStarted(streamId: streamId, conversationId: conversation.id)
        return StreamRef(streamId: streamId)
    }

    private func runTurn(
        _ streamId: String, _ conversation: AIConversation, text: String, context request: AIContextRequest?,
        provider: any AIProvider, info: AIProviderInfo, preferences prefs: Preferences, maxOutputTokens: Int?
    ) async {
        do {
            move(streamId, .preparingContext)
            if let request { try await attachContext(streamId, conversation, request, info: info, preferences: prefs) }

            let toolsOn = toolsAvailable(prefs) && conversation.toolsRequested && !conversation.toolsUnsupported
            var exchange: [AIMessage] = []
            var calls = 0
            var rounds = 0
            var produced = 0
            var seen: [String: String] = [:]
            var usedIds: Set<String> = []
            while true {
                try Task.checkCancellation()
                move(streamId, .requesting)
                let offerTools = toolsOn && !conversation.toolsUnsupported
                let lastRound = rounds >= limits.maxToolRounds || calls >= limits.maxToolCallsPerReply
                let system = AIPromptComposer.systemMessage(conversation.context, boundary: conversation.boundary, facts: facts(conversation, prefs), tools: offerTools)
                let request = AIRequest(
                    messages: [AIMessage(system)] + conversation.history(maxChars: limits.maxHistoryChars) + [AIMessage(role: .user, content: text)] + exchange,
                    model: conversation.model,
                    maxOutputTokens: min(maxOutputTokens ?? limits.maxOutputTokens, limits.maxOutputTokens),
                    tools: offerTools ? toolPolicy.definitions : [],
                    toolChoice: lastRound ? .none : .auto
                )
                let result: RoundResult
                do {
                    result = try await stream(streamId, request: request, provider: provider, outputBudget: limits.maxOutputChars - produced)
                } catch AuraError.invalidRequest(let message) where offerTools && rounds == 0 && exchange.isEmpty {
                    // Some runtimes reject tool definitions outright: continue without tools, once, and say so.
                    Log.ai.notice("conversation \(conversation.id, privacy: .public): provider rejected tools (\(message, privacy: .private)); continuing without")
                    conversation.toolsUnsupported = true
                    conversationChanged(AIConversationChangedPayload(
                        conversationId: conversation.id, reason: .toolsUnavailable, conversation: conversation.info(toolsAvailable: true)
                    ))
                    continue
                }
                produced += result.text.count
                guard !result.toolCalls.isEmpty, result.reason != .length else { return finish(streamId, .done(result.reason)) }
                // The tool budget is spent and the model still asks: stop rather than loop.
                guard !lastRound else { return finish(streamId, .done(.length)) }

                rounds += 1
                move(streamId, .waitingForTool)
                // Ids come from the model: make them well-formed and unique within the reply.
                let proposed = result.toolCalls.prefix(limits.maxToolCallsPerReply).enumerated().map { offset, call in
                    var call = call
                    if call.id.wholeMatch(of: /[A-Za-z0-9_.:\-]{1,64}/) == nil || usedIds.contains(call.id) { call.id = "call_\(calls + offset + 1)_\(rounds)" }
                    usedIds.insert(call.id)
                    return call
                }
                exchange.append(AIMessage(role: .assistant, content: result.text, toolCalls: proposed))
                for call in proposed {
                    try Task.checkCancellation()
                    let output = try await runTool(streamId, conversation, call, index: calls, info: info, preferences: prefs, seen: &seen)
                    calls += 1
                    exchange.append(AIMessage(role: .tool, content: AIPromptComposer.fence(output, label: "result of \(AIToolPolicy.printable(call.name))", boundary: conversation.boundary), toolCallId: call.id))
                }
                updateTurn(streamId, conversation) { $0.exchange = exchange }
            }
        } catch is CancellationError {
            finish(streamId, .done(.cancelled))
        } catch {
            if Task.isCancelled { return finish(streamId, .done(.cancelled)) }
            Log.ai.error("conversation reply \(streamId, privacy: .public) failed: \(BridgeError(error).code.rawValue, privacy: .public)")
            finish(streamId, .error(BridgeError(error)))
        }
    }

    /// Builds the requested context for the conversation's repository; asks
    /// before private source goes to a cloud provider.
    private func attachContext(_ streamId: String, _ conversation: AIConversation, _ request: AIContextRequest, info: AIProviderInfo, preferences prefs: Preferences) async throws {
        var request = request
        if let zone = request.zone { conversation.zone = zone }
        request.repository = conversation.repository.map { AIContextRequest.Repository(fullName: $0.fullName, branch: $0.branch) }
        let key = conversation.repository?.fullName.lowercased() ?? ""
        var build = try await context.build(request, preferences: prefs.ai, providerKind: info.kind, sourceConsent: conversation.sourceGrants.contains(key))
        try Task.checkCancellation()
        if !build.consentNeeded.isEmpty, let repository = conversation.repository {
            let decision = await askApproval(streamId, conversation, AIApprovalRequest(
                approvalId: "appr-\(UUID().uuidString.lowercased())", kind: .sharePrivateSource, callId: nil, tool: nil,
                summary: "Send \(build.consentNeeded.count == 1 ? build.consentNeeded[0] : "\(build.consentNeeded.count) files") from the private repository \(repository.fullName) to \(info.displayName)",
                repository: repository.fullName, paths: build.consentNeeded, providerName: info.displayName, providerKind: info.kind,
                expiresInSeconds: Int(limits.approvalTimeout.components.seconds)
            ), returnTo: .preparingContext)
            try Task.checkCancellation()
            if decision != .deny {
                if decision == .allowForConversation { conversation.sourceGrants.insert(key) }
                build = try await context.build(request, preferences: prefs.ai, providerKind: info.kind, sourceConsent: true)
            }
        }
        guard streams[streamId] != nil else { throw CancellationError() }
        conversation.context = build.snapshot
        if build.includesPrivateRepository { conversation.carriesPrivate = true }
        updateTurn(streamId, conversation) { $0.sources += build.sources }
    }

    /// One proposed call: policy, scope and privacy, approval, execution with
    /// a timeout, budget. Returns the text for the model (fenced by the caller).
    private func runTool(
        _ streamId: String, _ conversation: AIConversation, _ call: AIToolCall, index: Int,
        info: AIProviderInfo, preferences prefs: Preferences, seen: inout [String: String]
    ) async throws -> String {
        let name = toolPolicy.tools[call.name] == nil ? "unknown" : call.name
        func report(_ status: AIToolActivity.Status, _ summary: String, sources: [AISourceRef] = [], message: String? = nil) {
            activity(streamId, conversation, AIToolActivity(callId: call.id, tool: name, status: status, summary: summary, sources: sources, message: message))
        }
        func audit(_ outcome: String, chars: Int = 0) {
            Log.ai.notice("tool \(name, privacy: .public) \(outcome, privacy: .public) conversation \(conversation.id, privacy: .public) reply \(streamId, privacy: .public) chars \(chars, privacy: .public)")
        }

        let (tool, arguments): (AIToolDefinition, [String: JSONValue])
        switch toolPolicy.evaluate(call, index: index) {
        case .denied(let reason):
            report(.denied, "Refused a tool request", message: reason)
            audit("denied-by-policy")
            return Self.noData("Denied: \(reason).")
        case .allowed(let definition, let validated), .needsApproval(let definition, let validated):
            (tool, arguments) = (definition, validated)
        }
        let key = tool.name + AIToolCall(id: "", name: tool.name, arguments: arguments).argumentsJSON
        if seen[key] != nil {
            report(.succeeded, "Reused an earlier result")
            audit("duplicate")
            return "This is the same call as earlier in this reply; use that result."
        }
        guard let executor = tools else {
            report(.denied, "Tools are not available", message: "tools are not available")
            return Self.noData("Denied: tools are not available.")
        }

        let toolContext = AIToolContext(
            conversationId: conversation.id, repository: conversation.repository, providerName: info.displayName, providerKind: info.kind,
            model: conversation.model, preferences: prefs, zone: conversation.zone, sourceGrants: conversation.sourceGrants
        )
        var repository: RepositorySummary?
        let preparation: AIToolExecutor.Preparation
        do {
            preparation = try await withTimeout(limits.toolCallTimeout) { await executor.prepare(tool, arguments, in: toolContext) }
        } catch {
            try Task.checkCancellation()
            preparation = .denied(AIToolExecutor.failure(error))
        }
        switch preparation {
        case .denied(let reason):
            report(.denied, "Refused \(tool.name)", message: reason)
            audit("denied")
            return Self.noData("Denied: \(reason).")
        case .run(let summary):
            repository = summary
        case .needsApproval(let kind, let summary, let repo, let paths):
            try Task.checkCancellation()
            report(.awaitingApproval, summary)
            let decision = await askApproval(streamId, conversation, AIApprovalRequest(
                approvalId: "appr-\(UUID().uuidString.lowercased())", kind: kind, callId: call.id, tool: tool.name, summary: summary,
                repository: repo?.fullName, paths: paths, providerName: info.displayName, providerKind: info.kind,
                expiresInSeconds: Int(limits.approvalTimeout.components.seconds)
            ), returnTo: .waitingForTool)
            try Task.checkCancellation()
            guard decision != .deny else {
                report(.denied, summary, message: "the user declined")
                audit("declined-by-user")
                return Self.noData("The user declined this request. Do not ask again in this reply.")
            }
            if kind == .sharePrivateSource, decision == .allowForConversation, let repo { conversation.sourceGrants.insert(repo.fullName.lowercased()) }
            repository = repo
        }

        report(.running, "Running \(tool.name)")
        let remaining = limits.maxToolResultChars - (currentTurn(streamId, conversation)?.toolResultChars ?? 0)
        guard remaining > 200 else {
            report(.denied, "Tool budget used up", message: "this reply has read as much as AURA allows")
            audit("budget")
            return Self.noData("Denied: this reply has used its tool output budget.")
        }
        let outcome: AIToolOutcome
        do {
            let resolved = repository
            outcome = try await withTimeout(limits.toolCallTimeout) { try await executor.execute(tool, arguments, repository: resolved, in: toolContext) }
        } catch is CancellationError {
            report(.cancelled, "Stopped \(tool.name)")
            throw CancellationError()
        } catch {
            if Task.isCancelled { report(.cancelled, "Stopped \(tool.name)"); throw CancellationError() }
            let reason = AIToolExecutor.failure(error)
            report(.failed, "\(tool.name) failed", message: reason)
            audit("failed-\(BridgeError(error).code.rawValue)")
            return Self.noData("Failed: \(reason).")
        }
        let text = outcome.text.count > remaining ? String(outcome.text.prefix(remaining - 80)) + "\n… (cut: this reply's tool output budget is used up)" : outcome.text
        seen[key] = outcome.summary
        updateTurn(streamId, conversation) {
            $0.sources += outcome.sources
            $0.toolResultChars += text.count
        }
        if outcome.includesPrivate { conversation.carriesPrivate = true }
        report(.succeeded, outcome.summary, sources: outcome.sources)
        audit("ok", chars: text.count)
        return text
    }

    /// A tool result that carries no repository data says so, so the model
    /// does not answer as if it had read something.
    static func noData(_ reason: String) -> String {
        "\(reason) No repository data was returned. Do not guess or describe what it contains; correct the arguments and call again, or tell the user what you could not read."
    }

    // MARK: approvals

    /// Waits for the page's answer (or expiry, or the end of the reply).
    private func askApproval(_ streamId: String, _ conversation: AIConversation, _ request: AIApprovalRequest, returnTo: AITurnState) async -> AIApprovalDecision {
        guard let active = streams[streamId] else { return .deny }
        move(streamId, .waitingForApproval)
        if let seq = nextSeq(streamId) {
            events.emit(.aiApprovalRequested, AIApprovalRequestedPayload(streamId: streamId, conversationId: conversation.id, seq: seq, approval: request))
        }
        Log.ai.notice("approval \(request.approvalId, privacy: .public) requested (\(request.kind.rawValue, privacy: .public))")
        let timeout = limits.approvalTimeout
        let id = request.approvalId
        let expiry = Task { [weak self] in
            try? await Task.sleep(for: timeout)
            guard !Task.isCancelled, let continuation = self?.streams[streamId]?.approvals.removeValue(forKey: id) else { return }
            Log.ai.notice("approval \(id, privacy: .public) expired")
            continuation.resume(returning: .deny)
        }
        let decision = await withCheckedContinuation { continuation in active.approvals[id] = continuation }
        expiry.cancel()
        move(streamId, returnTo)
        return decision
    }

    // MARK: state and events

    func toolsAvailable(_ prefs: Preferences) -> Bool { tools != nil && prefs.ai.contextSharing }

    /// Called on the first text of every provider response.
    func firstOutput(_ streamId: String) {
        guard let id = streams[streamId]?.conversationId, conversationTable[id]?.state == .requesting else { return }
        move(streamId, .streaming)
    }

    /// Moves a live reply to `next`, if the state machine allows it.
    private func move(_ streamId: String, _ next: AITurnState) {
        guard let conversationId = streams[streamId]?.conversationId, let conversation = conversationTable[conversationId],
              conversation.activeStreamId == streamId else { return }
        guard conversation.state != next else { return }
        guard conversation.state.canMove(to: next) else {
            Log.ai.fault("reply \(streamId, privacy: .public): refused state change \(conversation.state.rawValue, privacy: .public) → \(next.rawValue, privacy: .public)")
            return
        }
        conversation.state = next
        updateTurn(streamId, conversation) { $0.state = next }
        if let seq = nextSeq(streamId) {
            events.emit(.aiTurnState, AITurnStatePayload(streamId: streamId, conversationId: conversationId, seq: seq, state: next))
        }
        replyObserver?.replyState(streamId: streamId, state: next)
    }

    private func activity(_ streamId: String, _ conversation: AIConversation, _ activity: AIToolActivity) {
        guard streams[streamId] != nil else { return }
        flush(streamId) // text before the tool call is shown before its activity
        updateTurn(streamId, conversation) { turn in
            if let index = turn.tools.firstIndex(where: { $0.callId == activity.callId }) { turn.tools[index] = activity } else { turn.tools.append(activity) }
        }
        if let seq = nextSeq(streamId) {
            events.emit(.aiToolActivity, AIToolActivityPayload(streamId: streamId, conversationId: conversation.id, seq: seq, activity: activity))
        }
    }

    private func currentTurn(_ streamId: String, _ conversation: AIConversation) -> AIConversation.Turn? {
        conversation.turns.last { $0.streamId == streamId }
    }

    /// Changes the reply's record while the reply is live; afterwards it is final.
    private func updateTurn(_ streamId: String, _ conversation: AIConversation, _ change: (inout AIConversation.Turn) -> Void) {
        guard streams[streamId] != nil, conversation.activeStreamId == streamId,
              let index = conversation.turns.lastIndex(where: { $0.streamId == streamId }) else { return }
        change(&conversation.turns[index])
    }

    /// From flush(): text the page has been sent becomes part of the reply.
    func replyShown(_ streamId: String, _ conversationId: String, _ text: String) {
        guard let conversation = conversationTable[conversationId] else { return }
        updateTurn(streamId, conversation) { $0.reply += text }
    }

    /// From finish(): the reply's last state change, before its terminal event.
    func endTurn(_ streamId: String, _ conversationId: String, _ terminal: Terminal) {
        guard let conversation = conversationTable[conversationId], conversation.activeStreamId == streamId else { return }
        let (state, reason): (AITurnState, FinishReason) = switch terminal {
        case .done(.cancelled): (.cancelled, .cancelled)
        case .done(let reason): (.completed, reason)
        case .error: (.error, .error)
        }
        if conversation.state == .idle {
            // Ended before it started (cancelled at once): idle cannot move to a terminal state; record it directly.
            conversation.state = state
            updateTurn(streamId, conversation) { $0.state = state }
        } else {
            move(streamId, state)
        }
        updateTurn(streamId, conversation) { turn in
            turn.finishReason = reason
            // A cut-short exchange may hold calls without results: never replay it.
            if state != .completed { turn.exchange = [] }
        }
        // Only the latest completed turn keeps its tool exchange.
        if state == .completed {
            for index in conversation.turns.indices where conversation.turns[index].streamId != streamId { conversation.turns[index].exchange = [] }
        }
        conversation.activeStreamId = nil
        Log.ai.info("conversation \(conversationId, privacy: .public) reply \(streamId, privacy: .public) \(state.rawValue, privacy: .public)")
    }

    /// From cancelAll(): the page is gone, so no events.
    func endTurnQuietly(_ streamId: String, _ conversationId: String) {
        guard let conversation = conversationTable[conversationId], conversation.activeStreamId == streamId,
              let index = conversation.turns.lastIndex(where: { $0.streamId == streamId }) else { return }
        conversation.turns[index].state = .cancelled
        conversation.turns[index].finishReason = .cancelled
        conversation.turns[index].exchange = []
        conversation.state = .cancelled
        conversation.activeStreamId = nil
    }

    // MARK: helpers

    private func find(_ id: String) throws -> AIConversation {
        guard let conversation = conversationTable[id] else { throw AuraError.notFound("no conversation \(AIToolPolicy.printable(id))") }
        return conversation
    }

    /// The repository must be one the GitHub installation can access.
    private func resolveRepository(_ ref: AIContextRequest.Repository) async throws -> AIConversationRepository {
        _ = try validatedFullName(ref.fullName)
        if let branch = ref.branch { try AIContextBuilder.validateBranch(branch) }
        let detail = try await context.repositoryDetail(ref.fullName)
        return AIConversationRepository(fullName: detail.summary.fullName, branch: ref.branch, isPrivate: detail.summary.isPrivate)
    }

    private func makeRoomForConversation() throws {
        guard conversationTable.count >= limits.maxConversations else { return }
        guard let oldest = conversationTable.values.filter({ $0.activeStreamId == nil }).min(by: { $0.lastUsed < $1.lastUsed }) else {
            throw AuraError.invalidRequest("too many conversations are replying at once")
        }
        conversationTable[oldest.id] = nil
        tools?.forget(conversation: oldest.id)
        conversationChanged(AIConversationChangedPayload(conversationId: oldest.id, reason: .evicted, conversation: nil))
    }

    /// Trusted, host-written lines about the conversation for the system message.
    private func facts(_ conversation: AIConversation, _ prefs: Preferences) -> [String] {
        var lines: [String] = []
        if !prefs.ai.contextSharing {
            lines.append("The user turned off workspace sharing: AURA shares no repository data in this conversation.")
        } else if let repository = conversation.repository {
            if repository.isPrivate, !AIContextBuilder.allowsPrivate(prefs.ai.privateRepositoryContext, conversation.providerKind) {
                lines.append("The selected repository is private; AURA's privacy settings keep its data from this provider.")
            } else {
                lines.append("Selected repository: \(repository.fullName)\(repository.branch.map { " (branch \($0))" } ?? "")\(repository.isPrivate ? ", private" : "").")
            }
        } else {
            lines.append("No repository is selected; file tools are unavailable until the user selects one in AURA.")
        }
        if let zone = conversation.zone { lines.append("The user is in the \(AIContextBuilder.zoneName(zone)) zone.") }
        return lines
    }
}

/// Runs `work`, failing with AuraError.timeout after `duration`.
@MainActor
func withTimeout<T: Sendable>(_ duration: Duration, _ work: @escaping @MainActor () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await work() }
        group.addTask {
            try await Task.sleep(for: duration)
            throw AuraError.timeout
        }
        defer { group.cancelAll() }
        guard let result = try await group.next() else { throw AuraError.timeout }
        return result
    }
}
