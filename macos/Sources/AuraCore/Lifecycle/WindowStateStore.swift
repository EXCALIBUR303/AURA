import Foundation

/// The host window's state as last reported by the app shell, readable by the
/// page (`app.getWindowState`) and pushed to it on change
/// (`app.windowStateChanged`). The page throttles rendering from it.
@MainActor
public final class WindowStateStore {
    public private(set) var current: WindowState
    private let events: BridgeEventEmitter

    /// Starts active and visible, so a page that loads before the first report
    /// renders normally instead of freezing.
    public init(events: BridgeEventEmitter, initial: WindowState = WindowState(active: true, visible: true)) {
        self.events = events
        current = initial
    }

    /// Records a new state; emits only when something changed.
    public func update(_ next: WindowState) {
        guard next != current else { return }
        let activeChanged = next.active != current.active
        current = next
        Log.app.info("window state active=\(next.active, privacy: .public) visible=\(next.visible, privacy: .public)")
        events.emit(.appWindowStateChanged, next)
        if activeChanged {
            // Deprecated event, kept until the frontend has moved off it (Phase 3B).
            events.emit(.appActiveChanged, ActiveChangedPayload(active: next.active))
        }
    }
}
