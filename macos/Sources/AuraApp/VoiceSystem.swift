import AppKit
import AuraCore

/// AURA.app's voice wiring: system engines only inside the bundle (the usage
/// strings live in its Info.plist), System Settings links, and sleep/lock stops.
@MainActor
enum VoiceSystem {
    /// Voice engines for this process, or nil when it is not the AURA.app bundle (`swift run`).
    static func engines() -> VoiceEngines? {
        let info = Bundle.main.infoDictionary ?? [:]
        guard Bundle.main.bundleIdentifier != nil,
              info["NSMicrophoneUsageDescription"] != nil, info["NSSpeechRecognitionUsageDescription"] != nil else { return nil }
        return .system(openSettings: { target in
            guard let url = URL(string: settingsURL(target)) else { return false }
            return NSWorkspace.shared.open(url)
        })
    }

    static func settingsURL(_ target: OpenVoiceSettingsParams.Target) -> String {
        switch target {
        case .microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        case .speechRecognition: "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"
        case .soundInput: "x-apple.systempreferences:com.apple.Sound-Settings.extension?input"
        }
    }

    /// Stops voice when the Mac sleeps, the screens sleep or the session locks.
    static func observeSleep(_ controller: VoiceController) -> [NSObjectProtocol] {
        let workspace = NSWorkspace.shared.notificationCenter
        var tokens: [NSObjectProtocol] = []
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification, NSWorkspace.sessionDidResignActiveNotification] {
            tokens.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak controller] _ in
                MainActor.assumeIsolated { controller?.handle(.systemSleep) }
            })
        }
        tokens.append(DistributedNotificationCenter.default().addObserver(forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak controller] _ in
            MainActor.assumeIsolated { controller?.handle(.systemSleep) }
        })
        return tokens
    }
}
