import AppKit
import AuraCore
import Observation

@MainActor
@Observable
final class AppModel {
    enum State {
        case starting
        case ready(AppServices)
        case failed(String)
    }

    private(set) var state: State = .starting
    /// The zone the studio shows, for the Studio menu's checkmark.
    private(set) var currentZone: ZoneID?
    /// Set by the web view once it exists; events before that are dropped.
    @ObservationIgnored var deliverToWeb: ((String) -> Void)?
    @ObservationIgnored private var voiceObservers: [NSObjectProtocol] = []

    var services: AppServices? {
        if case .ready(let services) = state { services } else { nil }
    }

    func start() async {
        guard case .starting = state else { return }
        do {
            let configuration = try AppConfiguration.load()
            guard configuration.devServerURL != nil || configuration.webRoot != nil else {
                state = .failed("""
                    No frontend to load.
                    Development: run `npm --prefix frontend run dev`, then launch with AURA_DEV_SERVER_URL=http://127.0.0.1:5173
                    Built files: run `npm --prefix frontend run build`, then launch with AURA_WEB_ROOT=<repo>/frontend/dist
                    """)
                return
            }
            let store = try await AppStore.open(in: configuration.dataDirectory)
            let secrets = KeychainSecretStore()
            let services = AppServices(
                configuration: configuration,
                store: store,
                secrets: secrets,
                github: LiveGitHubService(clientID: configuration.gitHubClientID, secrets: secrets),
                credentialPrompt: { await CredentialPrompt.ask($0) },
                voice: VoiceSystem.engines(),
                deliverEvent: { [weak self] json in self?.deliverToWeb?(json) }
            )
            services.preferencesDidChange = { [weak self] prefs in self?.currentZone = prefs.lastZone }
            if let controller = services.voiceController { voiceObservers = VoiceSystem.observeSleep(controller) }
            currentZone = try? await store.loadPreferences().lastZone
            Log.app.notice("started (\(configuration.environment.rawValue, privacy: .public))")
            state = .ready(services)
            // The voice probe and live observer skip the GitHub Keychain read so repeated launches need no Keychain prompt.
            if !VoiceProbe.isEnabled, !LiveVoiceObserver.isEnabled { await services.github.restore() }
            if GitHubProbe.isEnabled { Task { await GitHubProbe.run(services.github) } }
        } catch {
            Log.app.fault("startup failed: \(String(describing: error), privacy: .public)")
            state = .failed("AURA could not start: \(error)")
        }
    }

    func send(_ command: AppCommand) {
        services?.events.emit(.appCommand, command)
    }
}
