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
    /// Called after the page changes preferences, so native UI (menus) can follow.
    public var preferencesDidChange: (@MainActor (Preferences) -> Void)?

    public init(
        configuration: AppConfiguration,
        store: AppStore,
        secrets: any SecretStore,
        github: any GitHubService = MockGitHubService(),
        aiProviders: [any AIProvider] = [MockAIProvider()],
        voice: any VoiceService = UnavailableVoiceService(),
        deliverEvent: @escaping @MainActor (String) -> Void
    ) {
        self.configuration = configuration
        self.store = store
        self.secrets = secrets
        self.github = github
        self.voice = voice
        events = BridgeEventEmitter(deliver: deliverEvent)
        windowState = WindowStateStore(events: events)
        ai = AIService(providers: aiProviders, defaultProviderId: aiProviders.first?.info.id ?? "mock", events: events)
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
            let next = patch.applied(to: try await store.loadPreferences())
            try await store.savePreferences(next)
            events.emit(.prefsChanged, next)
            self?.preferencesDidChange?(next)
            return next
        }

        github.onStatusChange = { status in events.emit(.githubAuthChanged, status) }
        router.register(.githubGetAuthStatus, Empty.self) { _ in github.status }
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

        router.register(.projectsList, Empty.self) { _ in try await store.listProjects() }
        router.register(.projectsUpdate, ProjectPatch.self) { patch in try await store.applyProjectPatch(patch) }
        router.register(.projectsSuggestZones, Empty.self) { _ in
            ProjectZoneClassifier.suggestions(for: try await github.accessibleRepositories(), records: try await store.listProjects())
        }

        router.register(.aiListProviders, Empty.self) { _ in ai.providerInfos }
        router.register(.aiChat, ChatParams.self) { params in try ai.startChat(params) }
        router.register(.aiCancel, StreamRef.self) { ref in
            ai.cancel(ref.streamId)
            return Empty()
        }

        router.register(.voiceGetStatus, Empty.self) { _ in await voice.status() }
        router.register(.voiceRequestPermissions, Empty.self) { _ in try await voice.requestPermissions() }
        router.register(.voiceStartListening, Empty.self) { _ in try await voice.startListening() }
        router.register(.voiceStopListening, Empty.self) { _ in try await voice.stopListening() }
        router.register(.voiceSpeak, SpeakParams.self) { params in
            try await voice.speak(params.text, interrupt: params.interrupt ?? true)
            return Empty()
        }
        router.register(.voiceStopSpeaking, Empty.self) { _ in
            try await voice.stopSpeaking()
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
}
