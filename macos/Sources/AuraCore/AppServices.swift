import Foundation

/// Composition root: owns the services and wires every BridgeMethod to one.
/// The app and the tests both build this; only the event sink differs.
@MainActor
public final class AppServices {
    public let configuration: AppConfiguration
    public let router = BridgeRouter()
    public let events: BridgeEventEmitter
    public let windowState: WindowStateStore
    public let store: AppStore
    public let secrets: any SecretStore
    public let github: any GitHubService
    public let ai: AIService
    public let voice: any VoiceService
    /// The live voice host when this build has voice (nil: `voice` is unavailable).
    public let voiceController: VoiceController?
    /// Native secure prompt for API keys (AuraApp). Without one, ai.requestCredential is unavailable.
    public var credentialPrompt: AICredentialPrompt?
    /// Called after the page changes preferences, so native UI (menus) can follow.
    public var preferencesDidChange: (@MainActor (Preferences) -> Void)?

    public init(
        configuration: AppConfiguration,
        store: AppStore,
        secrets: any SecretStore,
        github: any GitHubService = MockGitHubService(),
        aiMock: any AIProvider = MockAIProvider(),
        aiProviderFactory: AIProviderRegistry.ProviderFactory? = nil,
        aiLimits: AIService.Limits = AIService.Limits(),
        credentialPrompt: AICredentialPrompt? = nil,
        voice voiceEngines: VoiceEngines? = nil,
        deliverEvent: @escaping @MainActor (String) -> Void
    ) {
        self.configuration = configuration
        self.store = store
        self.secrets = secrets
        self.github = github
        events = BridgeEventEmitter(deliver: deliverEvent)
        windowState = WindowStateStore(events: events)
        self.credentialPrompt = credentialPrompt
        let registry = AIProviderRegistry(store: store, secrets: secrets, mock: aiMock, makeProvider: aiProviderFactory)
        let tools = AIToolExecutor(github: github)
        tools.navigate = { [events] zone in events.emit(.appCommand, AppCommand.navigate(zone)) }
        ai = AIService(
            registry: registry,
            context: AIContextBuilder(github: github, store: store),
            preferences: { (try? await store.loadPreferences()) ?? .defaults },
            events: events,
            limits: aiLimits,
            tools: tools
        )
        if let voiceEngines {
            let controller = VoiceController(engines: voiceEngines, events: events, preferences: { (try? await store.loadPreferences()) ?? .defaults })
            ai.replyObserver = controller
            windowState.onChange = { [weak controller] state in
                if !state.active || !state.visible { controller?.handle(.appInactive) }
            }
            voiceController = controller
            voice = controller
        } else {
            voiceController = nil
            voice = UnavailableVoiceService()
        }
        registry.onChange = { [events, ai] infos in
            events.emit(.aiProvidersChanged, infos)
            ai.providersChanged(infos)
        }
        registerHandlers()
    }

    private func registerHandlers() {
        let configuration = configuration, store = store, github = github, ai = ai, voice = voice, events = events
        let windowState = windowState

        router.register(.appGetInfo, Empty.self) { _ in
            AppInfo(
                appVersion: configuration.appVersion,
                build: configuration.build,
                host: .macos,
                bridgeVersion: BridgeProtocol.version,
                environment: configuration.environment == .development ? .development : .production
            )
        }

        router.register(.appGetWindowState, Empty.self) { _ in windowState.current }

        router.register(.prefsGet, Empty.self) { _ in try await store.loadPreferences() }
        router.register(.prefsUpdate, PreferencesPatch.self) { [weak self] patch in
            let next = try patch.validatedApplied(to: try await store.loadPreferences())
            try await store.savePreferences(next)
            events.emit(.prefsChanged, next)
            self?.preferencesDidChange?(next)
            return next
        }

        github.onStatusChange = { status in
            events.emit(.githubAuthChanged, status)
            ai.githubAccessChanged(status)
        }
        router.register(.githubGetAuthStatus, Empty.self) { _ in
            await github.waitUntilRestored()
            return github.status
        }
        router.register(.githubConnect, Empty.self) { _ in await github.connect() }
        router.register(.githubDisconnect, Empty.self) { _ in await github.disconnect() }
        router.register(.githubRefresh, Empty.self) { _ in await github.refresh() }
        router.register(.githubListRepositories, ListRepositoriesParams.self) { params in
            try await github.listRepositories(cursor: params.cursor, perPage: min(max(params.perPage ?? 30, 1), 100))
        }
        router.register(.githubGetRepository, RepositoryRef.self) { params in try await github.repository(fullName: params.fullName) }
        router.register(.githubListBranches, ListBranchesParams.self) { params in
            try await github.listBranches(fullName: params.fullName, cursor: params.cursor, perPage: min(max(params.perPage ?? 30, 1), 100))
        }
        router.register(.githubListCommits, ListCommitsParams.self) { params in
            try await github.listCommits(fullName: params.fullName, branch: params.branch, limit: min(max(params.limit ?? 10, 1), 100))
        }
        router.register(.githubListFiles, ListFilesParams.self) { params in
            try await Self.listFiles(github, params)
        }

        router.register(.projectsList, Empty.self) { _ in try await store.listProjects() }
        router.register(.projectsUpdate, ProjectPatch.self) { patch in try await store.applyProjectPatch(patch) }
        router.register(.projectsSuggestZones, Empty.self) { _ in
            ProjectZoneClassifier.suggestions(for: try await github.accessibleRepositories(), records: try await store.listProjects())
        }

        let registry = ai.registry
        router.register(.aiListProviders, Empty.self) { _ in await registry.infos() }
        router.register(.aiSaveProvider, AIProviderSettings.self) { settings in try await registry.save(settings) }
        router.register(.aiRemoveProvider, ProviderRef.self) { ref in
            try await registry.remove(ref.providerId)
            return Empty()
        }
        router.register(.aiRequestCredential, ProviderRef.self) { [weak self] ref in
            guard let prompt = self?.credentialPrompt else { throw AuraError.unavailable("API keys can only be entered in the AURA app") }
            try await registry.prepareKeyEntry(ref.providerId)
            // Returns at once: the user may take longer than a bridge request may stay open.
            Task {
                do { try await registry.requestKey(ref.providerId, prompt: prompt) } catch {
                    Log.ai.error("storing an API key failed: \(BridgeError(error).code.rawValue, privacy: .public)")
                }
            }
            return Empty()
        }
        router.register(.aiDeleteCredential, ProviderRef.self) { ref in try await registry.deleteKey(ref.providerId) }
        router.register(.aiValidateProvider, ProviderRef.self) { ref in try await registry.validate(ref.providerId) }
        router.register(.aiPreviewContext, PreviewContextParams.self) { params in
            if let conversationId = params.conversationId { return try await ai.previewConversationContext(conversationId, params.context) }
            return try await ai.previewContext(params.context, providerId: params.providerId)
        }
        router.register(.aiChat, ChatParams.self) { params in try await ai.startChat(params) }
        router.register(.aiCancel, StreamRef.self) { ref in
            ai.cancel(ref.streamId)
            return Empty()
        }
        router.register(.aiStartConversation, StartConversationParams.self) { params in try await ai.startConversation(params) }
        router.register(.aiListConversations, Empty.self) { _ in await ai.listConversations() }
        router.register(.aiGetConversation, ConversationRef.self) { ref in try await ai.conversationDetail(ref.conversationId) }
        router.register(.aiSendMessage, SendMessageParams.self) { params in try await ai.sendMessage(params) }
        router.register(.aiSetConversationRepository, SetConversationRepositoryParams.self) { params in try await ai.setConversationRepository(params) }
        router.register(.aiResetConversation, ConversationRef.self) { ref in try await ai.resetConversation(ref.conversationId) }
        router.register(.aiEndConversation, ConversationRef.self) { ref in
            try ai.endConversation(ref.conversationId)
            return Empty()
        }
        router.register(.aiRespondToApproval, RespondToApprovalParams.self) { params in
            try ai.respondToApproval(params)
            return Empty()
        }

        router.register(.voiceGetStatus, Empty.self) { _ in await voice.status() }
        router.register(.voiceGetCapabilities, Empty.self) { _ in await voice.capabilities() }
        router.register(.voiceRequestPermissions, Empty.self) { _ in try await voice.requestPermissions() }
        router.register(.voiceStartSession, StartVoiceSessionParams.self) { params in try await voice.startSession(conversationId: params.conversationId) }
        router.register(.voiceEndSession, Empty.self) { _ in await voice.endSession() }
        router.register(.voiceStartListening, StartListeningParams.self) { params in try await voice.startListening(mode: params.mode ?? .autoEnd) }
        router.register(.voiceStopListening, Empty.self) { _ in await voice.stopListening() }
        router.register(.voiceCancelListening, Empty.self) { _ in await voice.cancelListening() }
        router.register(.voiceSpeak, SpeakParams.self) { params in
            try await voice.speak(params.text, interrupt: params.interrupt ?? true)
            return Empty()
        }
        router.register(.voiceSpeakReply, SpeakReplyParams.self) { params in
            try await voice.speakReply(conversationId: params.conversationId, streamId: params.streamId)
        }
        router.register(.voiceStopSpeaking, Empty.self) { _ in
            await voice.stopSpeaking()
            return Empty()
        }
        router.register(.voicePauseSpeaking, Empty.self) { _ in await voice.pauseSpeaking() }
        router.register(.voiceResumeSpeaking, Empty.self) { _ in await voice.resumeSpeaking() }
        router.register(.voiceReplay, Empty.self) { _ in try await voice.replay() }
        router.register(.voiceSetOutputMuted, SetOutputMutedParams.self) { params in await voice.setOutputMuted(params.muted) }
        router.register(.voiceListVoices, ListVoicesParams.self) { params in await voice.voices(locale: params.locale) }
        router.register(.voiceOpenSettings, OpenVoiceSettingsParams.self) { params in
            try await voice.openSettings(params.target)
            return Empty()
        }
        router.register(.voiceInstallRecognitionAssets, Empty.self) { _ in
            try await voice.installRecognitionAssets()
            return Empty()
        }

        router.register(.logWrite, LogWriteParams.self) { params in
            let context = (params.context ?? [:]).sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: " ")
            switch params.level {
            case .debug: Log.web.debug("\(params.message, privacy: .public) \(context, privacy: .private)")
            case .info: Log.web.info("\(params.message, privacy: .public) \(context, privacy: .private)")
            case .notice: Log.web.notice("\(params.message, privacy: .public) \(context, privacy: .private)")
            case .error: Log.web.error("\(params.message, privacy: .public) \(context, privacy: .private)")
            case .fault: Log.web.fault("\(params.message, privacy: .public) \(context, privacy: .private)")
            }
            return Empty()
        }
    }

    /// github.listFiles: paths under `path` (all when nil), at most `limit`.
    static func listFiles(_ github: any GitHubService, _ params: ListFilesParams) async throws -> RepositoryTree {
        let limit = min(max(params.limit ?? 500, 1), 1000)
        let path = try params.path.map(validatedRepositoryPath)
        var tree = try await github.listTree(fullName: params.fullName, ref: params.branch)
        if let path {
            guard tree.entries.contains(where: { $0.path == path && $0.type == .directory }) else { throw AuraError.notFound("\(path) is not a directory") }
            tree.entries = tree.entries.filter { $0.path.hasPrefix(path + "/") }
        }
        if tree.entries.count > limit {
            tree.entries = Array(tree.entries.prefix(limit))
            tree.truncated = true
        }
        return tree
    }
}
