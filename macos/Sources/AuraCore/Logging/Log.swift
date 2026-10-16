import os

/// Unified-logging categories. Stream everything with:
///   log stream --level debug --predicate 'subsystem == "com.aura.app"'
///
/// Rules: interpolate user/remote data with `privacy: .private` (the default
/// for strings) — never `.public` for tokens, prompts, transcripts, file paths
/// in the user's home, or repository contents. Use `.public` only for
/// identifiers we control (method names, error codes, durations).
public enum Log {
    public static let subsystem = "com.aura.app"

    public static let app = Logger(subsystem: subsystem, category: "app")
    public static let bridge = Logger(subsystem: subsystem, category: "bridge")
    public static let web = Logger(subsystem: subsystem, category: "web")
    public static let github = Logger(subsystem: subsystem, category: "github")
    public static let ai = Logger(subsystem: subsystem, category: "ai")
    public static let voice = Logger(subsystem: subsystem, category: "voice")
    public static let persistence = Logger(subsystem: subsystem, category: "persistence")
    public static let security = Logger(subsystem: subsystem, category: "security")
}
