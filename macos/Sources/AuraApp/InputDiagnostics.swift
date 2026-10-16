import AppKit
import AuraCore
import os

/// Opt-in keyboard-focus diagnostics (`AURA_DEV_INPUT_LOG=1`), for chasing
/// focus problems with a physical keyboard. Logs which window and responder
/// receive each key event AURA gets, and the focus state around window and
/// full-screen transitions. Privacy: only shortcuts (with ⌘, ⌃, ⌥ or fn) log
/// their key code; plain typing logs as "plain key" with no code. Read with:
///   /usr/bin/log show --last 5m --info --predicate 'subsystem == "com.aura.app" AND category == "input"'
@MainActor
enum InputDiagnostics {
    private static let log = Logger(subsystem: Log.subsystem, category: "input")
    private static var installed = false

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["AURA_DEV_INPUT_LOG"] == "1"
    }

    static func install() {
        guard !installed else { return }
        installed = true
        NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { event in
            let modifiers = event.modifierFlags.intersection([.command, .control, .option, .function])
            let key = modifiers.isEmpty ? "plain key" : "key code=\(event.keyCode) mods=\(describe(modifiers))"
            log.notice("\(key, privacy: .public) eventWindow=\(name(event.window), privacy: .public) \(focusState(), privacy: .public)")
            return event
        }
        let names: [Notification.Name] = [
            NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification,
            NSWindow.willEnterFullScreenNotification, NSWindow.didEnterFullScreenNotification,
            NSWindow.willExitFullScreenNotification, NSWindow.didExitFullScreenNotification,
            NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification,
        ]
        for notificationName in names {
            NotificationCenter.default.addObserver(forName: notificationName, object: nil, queue: .main) { note in
                let event = notificationName.rawValue.replacingOccurrences(of: "Notification", with: "")
                // Delivered on the main queue; the window is only read there.
                nonisolated(unsafe) let object = note.object
                MainActor.assumeIsolated {
                    let window = name(object as? NSWindow)
                    log.notice("\(event, privacy: .public) object=\(window, privacy: .public) \(focusState(), privacy: .public)")
                }
            }
        }
        log.notice("input diagnostics on \(focusState(), privacy: .public)")
    }

    private static func focusState() -> String {
        let key = NSApp.keyWindow
        let responder = key?.firstResponder.map { String(describing: type(of: $0)) } ?? "nil"
        return "active=\(NSApp.isActive) keyWindow=\(name(key)) main=\(name(NSApp.mainWindow)) firstResponder=\(responder) windows=\(NSApp.windows.filter(\.isVisible).map(name))"
    }

    private static func name(_ window: NSWindow?) -> String {
        guard let window else { return "nil" }
        return "\(type(of: window))#\(window.windowNumber)\(window.isKeyWindow ? "*" : "")"
    }

    private static func describe(_ flags: NSEvent.ModifierFlags) -> String {
        [(NSEvent.ModifierFlags.control, "⌃"), (.option, "⌥"), (.command, "⌘"), (.function, "fn")]
            .filter { flags.contains($0.0) }.map(\.1).joined()
    }
}
