import Foundation
@testable import AuraCore

enum Repo {
    /// <repo>/ resolved from this file's location (macos/Tests/AuraCoreTests/…).
    static let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    static func text(_ relativePath: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }
}

struct Fixtures: Decodable {
    struct Valid: Decodable { let name: String; let message: JSONValue }
    struct Invalid: Decodable { let name: String; let json: String; let expectedCode: String }
    let valid: [Valid]
    let invalidRequests: [Invalid]

    static func load() throws -> Fixtures {
        try JSONDecoder().decode(Fixtures.self, from: Data(try Repo.text("shared/fixtures/bridge-messages.json").utf8))
    }
}

/// Records events the services emit.
@MainActor
final class EventRecorder {
    private(set) var events: [(name: String, payload: JSONValue)] = []
    /// Every event exactly as delivered to the page.
    private(set) var raw: [String] = []

    func record(_ json: String) {
        raw.append(json)
        guard case .object(let object)? = try? JSONDecoder().decode(JSONValue.self, from: Data(json.utf8)),
              case .string(let name)? = object["event"], let payload = object["payload"] else { return }
        events.append((name, payload))
    }

    func names() -> [String] { events.map(\.name) }
}

@MainActor
func makeServices(recorder: EventRecorder, aiInterval: Duration = .milliseconds(1)) async throws -> AppServices {
    let configuration = AppConfiguration(
        environment: .development, devServerURL: nil, webRoot: nil,
        dataDirectory: URL(fileURLWithPath: "/dev/null"), appVersion: "0.1.0", build: "test"
    )
    return AppServices(
        configuration: configuration,
        store: try await AppStore(database: Database(path: ":memory:")),
        secrets: InMemorySecretStore(),
        aiMock: MockAIProvider(interval: aiInterval),
        deliverEvent: { recorder.record($0) }
    )
}

@MainActor
func call(_ services: AppServices, _ method: String, _ params: String = "{}") async throws -> JSONValue {
    let reply = await services.router.handle(#"{"kind":"request","v":1,"id":"t1","method":"\#(method)","params":\#(params)}"#)
    return try JSONDecoder().decode(JSONValue.self, from: Data(reply.utf8))
}

extension JSONValue {
    subscript(_ key: String) -> JSONValue? {
        if case .object(let object) = self { return object[key] }
        return nil
    }
}
