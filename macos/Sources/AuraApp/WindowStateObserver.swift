import AppKit
import AuraCore

/// Reports the studio window's state to `WindowStateStore`: whether AURA is
/// the active app, and whether any part of the window is on screen (occlusion
/// covers minimized, hidden, fully covered and other-Space windows).
@MainActor
final class WindowStateObserver {
    private weak var window: NSWindow?
    private let store: WindowStateStore
    private var tokens: [NSObjectProtocol] = []

    init(window: NSWindow, store: WindowStateStore) {
        self.window = window
        self.store = store
        let center = NotificationCenter.default
        let appNames: [Notification.Name] = [
            NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification,
            NSApplication.didHideNotification, NSApplication.didUnhideNotification,
        ]
        let windowNames: [Notification.Name] = [
            NSWindow.didChangeOcclusionStateNotification,
            NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification,
        ]
        for name in appNames {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.refresh() }
            })
        }
        for name in windowNames {
            tokens.append(center.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.refresh() }
            })
        }
        refresh()
    }

    isolated deinit {
        tokens.forEach(NotificationCenter.default.removeObserver)
    }

    func refresh() {
        guard let window else { return }
        let visible = window.occlusionState.contains(.visible) && !window.isMiniaturized && !NSApp.isHidden
        store.update(WindowState(active: NSApp.isActive, visible: visible))
    }
}
