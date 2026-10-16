import Foundation

/// Process-level configuration, read once at launch.
///
/// Environment variables (development only; never put secrets here —
/// secrets live in the Keychain, see SecretStore):
///   AURA_DEV_SERVER_URL  load the Vite dev server instead of bundled files
///                        (must be http://localhost or http://127.0.0.1)
///   AURA_WEB_ROOT        directory containing the built frontend (index.html)
///   AURA_DATA_DIR        override the Application Support directory
public struct AppConfiguration: Sendable, Equatable {
    public enum Environment: String, Sendable { case development, production }

    public var environment: Environment
    public var devServerURL: URL?
    public var webRoot: URL?
    public var dataDirectory: URL
    public var appVersion: String
    public var build: String

    public init(environment: Environment, devServerURL: URL?, webRoot: URL?, dataDirectory: URL, appVersion: String, build: String) {
        self.environment = environment
        self.devServerURL = devServerURL
        self.webRoot = webRoot
        self.dataDirectory = dataDirectory
        self.appVersion = appVersion
        self.build = build
    }

    public enum ConfigurationError: Error, Equatable {
        case devServerNotLoopback(String)
    }

    public static func load(
        environment env: [String: String] = ProcessInfo.processInfo.environment,
        bundle: Bundle = .main
    ) throws -> AppConfiguration {
        var devServerURL: URL?
        if let raw = env["AURA_DEV_SERVER_URL"], !raw.isEmpty {
            guard let url = URL(string: raw), isLoopbackHTTP(url) else {
                throw ConfigurationError.devServerNotLoopback(raw)
            }
            devServerURL = url
        }

        let bundledWeb = bundle.resourceURL?.appendingPathComponent("web", isDirectory: true)
        let webRoot = env["AURA_WEB_ROOT"].map { URL(fileURLWithPath: $0, isDirectory: true) }
            ?? bundledWeb.flatMap { FileManager.default.fileExists(atPath: $0.appendingPathComponent("index.html").path) ? $0 : nil }

        let dataDirectory = env["AURA_DATA_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) }
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("AURA", isDirectory: true)

        let info = bundle.infoDictionary ?? [:]
        return AppConfiguration(
            environment: devServerURL != nil ? .development : .production,
            devServerURL: devServerURL,
            webRoot: webRoot,
            dataDirectory: dataDirectory,
            appVersion: info["CFBundleShortVersionString"] as? String ?? "0.1.0",
            build: info["CFBundleVersion"] as? String ?? "dev"
        )
    }

    static func isLoopbackHTTP(_ url: URL) -> Bool {
        guard url.scheme == "http", let host = url.host else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
}
