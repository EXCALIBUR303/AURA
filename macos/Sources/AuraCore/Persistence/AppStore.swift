import Foundation

/// Schema and typed access for AURA's local metadata.
public struct AppStore: Sendable {
    public static let migrations: [Database.Migration] = [
        .init(version: 1, sql: """
            CREATE TABLE kv (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,       -- "owner/name"
                zone TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            """),
    ]

    private static let preferencesKey = "preferences"

    public let database: Database

    public init(database: Database) async throws {
        self.database = database
        try await database.migrate(Self.migrations)
    }

    /// Opens (creating if needed) `<directory>/aura.sqlite`.
    public static func open(in directory: URL) async throws -> AppStore {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let path = directory.appendingPathComponent("aura.sqlite").path
        return try await AppStore(database: Database(path: path))
    }

    // MARK: preferences

    /// Returns stored preferences, or defaults when missing or unreadable.
    public func loadPreferences() async throws -> Preferences {
        guard let json = try await database.query("SELECT value FROM kv WHERE key = ?", [.text(Self.preferencesKey)]).first?["value"]?.stringValue else {
            return .defaults
        }
        do {
            return try BridgeCoding.decoder.decode(Preferences.self, from: Data(json.utf8))
        } catch {
            Log.persistence.error("stored preferences unreadable; using defaults")
            return .defaults
        }
    }

    public func savePreferences(_ preferences: Preferences) async throws {
        let json = String(decoding: try BridgeCoding.encoder.encode(preferences), as: UTF8.self)
        try await database.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [.text(Self.preferencesKey), .text(json), .text(Self.now())]
        )
    }

    // MARK: other settings

    /// A JSON value stored under `key` in `kv`, or nil when missing or unreadable.
    public func loadValue<T: Decodable>(_ type: T.Type, key: String) async throws -> T? {
        guard let json = try await database.query("SELECT value FROM kv WHERE key = ?", [.text(key)]).first?["value"]?.stringValue else { return nil }
        do {
            return try BridgeCoding.decoder.decode(T.self, from: Data(json.utf8))
        } catch {
            Log.persistence.error("stored value \(key, privacy: .public) unreadable; ignoring it")
            return nil
        }
    }

    public func saveValue<T: Encodable>(_ value: T, key: String) async throws {
        let json = String(decoding: try BridgeCoding.encoder.encode(value), as: UTF8.self)
        try await database.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [.text(key), .text(json), .text(Self.now())]
        )
    }

    // MARK: projects

    public func listProjects() async throws -> [ProjectRecord] {
        try await database.query("SELECT id, zone, pinned, notes, updated_at FROM projects ORDER BY pinned DESC, id").map(Self.project)
    }

    public func applyProjectPatch(_ patch: ProjectPatch) async throws -> ProjectRecord {
        guard patch.id.split(separator: "/").count == 2 else {
            throw AuraError.invalidRequest("project id must be owner/name")
        }
        let existing = try await database.query("SELECT id, zone, pinned, notes, updated_at FROM projects WHERE id = ?", [.text(patch.id)]).first.map(Self.project)
        var record = existing ?? ProjectRecord(id: patch.id, zone: nil, pinned: false, notes: "", updatedAt: "")
        if let zone = patch.zone { record.zone = zone }
        if let pinned = patch.pinned { record.pinned = pinned }
        if let notes = patch.notes { record.notes = notes }
        record.updatedAt = Self.now()
        try await database.execute(
            """
            INSERT INTO projects (id, zone, pinned, notes, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET zone = excluded.zone, pinned = excluded.pinned, notes = excluded.notes, updated_at = excluded.updated_at
            """,
            [.text(record.id), record.zone.map { .text($0.rawValue) } ?? .null, .integer(record.pinned ? 1 : 0), .text(record.notes), .text(record.updatedAt)]
        )
        return record
    }

    private static func project(_ row: SQLRow) -> ProjectRecord {
        ProjectRecord(
            id: row["id"]?.stringValue ?? "",
            zone: row["zone"]?.stringValue.flatMap(ZoneID.init(rawValue:)),
            pinned: row["pinned"]?.integerValue == 1,
            notes: row["notes"]?.stringValue ?? "",
            updatedAt: row["updated_at"]?.stringValue ?? ""
        )
    }

    private static func now() -> String {
        Date.now.formatted(.iso8601)
    }
}
