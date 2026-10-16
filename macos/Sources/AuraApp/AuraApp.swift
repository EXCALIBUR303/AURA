import AppKit
import AuraCore
import SwiftUI

@main
struct AuraApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    // The model lives on the delegate (created once) rather than in @State:
    // SwiftUI's @State macro plugin ships only with full Xcode, and this
    // package must also build with the Command Line Tools.
    private var model: AppModel { appDelegate.model }

    var body: some Scene {
        // One window: a second copy of the studio would run a second render
        // loop, and native events reach only one web view.
        Window("AURA", id: "main") {
            RootView(model: model)
                .frame(minWidth: 1100, minHeight: 700)
                .task { await model.start() }
        }
        .windowStyle(.hiddenTitleBar)
        .commands { StudioCommands(model: model) }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = AppModel()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // `swift run` launches a bare executable with no bundle; make it a
        // regular foreground app so the window and menu bar appear.
        if Bundle.main.bundleIdentifier == nil {
            NSApp.setActivationPolicy(.regular)
            NSApp.activate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

/// Native menu → web commands. Shortcuts match the Stitch navigation (⌘1–⌘6).
struct StudioCommands: Commands {
    let model: AppModel

    private static let zones: [(ZoneID, String, KeyEquivalent)] = [
        (.studio, "Main Studio", "1"),
        (.hardware, "Hardware Lab", "2"),
        (.software, "Software Studio", "3"),
        (.aiLab, "AI / LLM Lab", "4"),
        (.github, "GitHub Projects", "5"),
        (.companion, "AI Companion", "6"),
    ]

    var body: some Commands {
        CommandMenu("Studio") {
            ForEach(Self.zones, id: \.0) { zone, title, key in
                Button(title) { model.send(.navigate(zone)) }
                    .keyboardShortcut(key, modifiers: .command)
            }
            Divider()
            Button("Talk to Astra") { model.send(.focusCompanion) }
                .keyboardShortcut(.space, modifiers: [.command, .shift])
            Button("Command Palette") { model.send(.openCommandPalette) }
                .keyboardShortcut("k", modifiers: .command)
        }
    }
}
