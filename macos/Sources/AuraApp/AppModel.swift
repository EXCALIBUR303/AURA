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
    /// Set by the web view once it exists; events before that are dropped.
    @ObservationIgnored var deliverToWeb: ((String) -> Void)?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

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
            let services = AppServices(
                configuration: configuration,
                store: store,
                secrets: KeychainSecretStore(),
                deliverEvent: { [weak self] json in self?.deliverToWeb?(json) }
            )
            observeActivation(services.events)
            Log.app.notice("started (\(configuration.environment.rawValue, privacy: .public))")
            state = .ready(services)
        } catch {
            Log.app.fault("startup failed: \(String(describing: error), privacy: .public)")
            state = .failed("AURA could not start: \(error)")
        }
    }

    func send(_ command: AppCommand) {
        services?.events.emit(.appCommand, command)
    }

    private func observeActivation(_ events: BridgeEventEmitter) {
        let center = NotificationCenter.default
        for (name, active) in [(NSApplication.didBecomeActiveNotification, true), (NSApplication.didResignActiveNotification, false)] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { events.emit(.appActiveChanged, ActiveChangedPayload(active: active)) }
            })
        }
    }
}
