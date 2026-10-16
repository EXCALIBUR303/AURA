import Foundation
import SQLite3

/// Values bound to / read from SQLite.
public enum SQLValue: Equatable, Sendable {
    case null
    case integer(Int64)
    case real(Double)
    case text(String)

    public var stringValue: String? {
        if case .text(let value) = self { return value }
        return nil
    }

    public var integerValue: Int64? {
        if case .integer(let value) = self { return value }
        return nil
    }
}

public typealias SQLRow = [String: SQLValue]

/// Thin, dependency-free wrapper over the system SQLite. One connection,
/// serialised by actor isolation. Holds app metadata only — never secrets
/// (those go to the Keychain) and never cached repository contents.
public actor Database {
    public struct Migration: Sendable {
        public let version: Int32
        public let sql: String
    }

    public enum DatabaseError: Error, Equatable {
        case open(String)
        case prepare(String)
        case step(String)
    }

    private nonisolated(unsafe) let handle: OpaquePointer
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    /// `path` of ":memory:" opens a private in-memory database (tests).
    public init(path: String) throws {
        var pointer: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path, &pointer, flags, nil) == SQLITE_OK, let pointer else {
            let message = pointer.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            sqlite3_close(pointer)
            throw DatabaseError.open(message)
        }
        handle = pointer
        sqlite3_busy_timeout(pointer, 2_000)
        if path != ":memory:" { sqlite3_exec(pointer, "PRAGMA journal_mode=WAL;", nil, nil, nil) }
        sqlite3_exec(pointer, "PRAGMA foreign_keys=ON;", nil, nil, nil)
    }

    deinit {
        sqlite3_close_v2(handle)
    }

    public func execute(_ sql: String, _ bindings: [SQLValue] = []) throws {
        _ = try run(sql, bindings)
    }

    public func query(_ sql: String, _ bindings: [SQLValue] = []) throws -> [SQLRow] {
        try run(sql, bindings)
    }

    public func userVersion() throws -> Int32 {
        Int32(try run("PRAGMA user_version;", []).first?["user_version"]?.integerValue ?? 0)
    }

    /// Applies migrations with a version above PRAGMA user_version, each in its own transaction.
    public func migrate(_ migrations: [Migration]) throws {
        let current = try userVersion()
        for migration in migrations.sorted(by: { $0.version < $1.version }) where migration.version > current {
            try execBatch("BEGIN IMMEDIATE;")
            do {
                try execBatch(migration.sql)
                try execBatch("PRAGMA user_version = \(migration.version);")
                try execBatch("COMMIT;")
                Log.persistence.notice("migrated schema to v\(migration.version, privacy: .public)")
            } catch {
                try? execBatch("ROLLBACK;")
                throw error
            }
        }
    }

    // MARK: private

    private func execBatch(_ sql: String) throws {
        var error: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(handle, sql, nil, nil, &error) == SQLITE_OK else {
            let message = error.map { String(cString: $0) } ?? "unknown"
            sqlite3_free(error)
            throw DatabaseError.step(message)
        }
    }

    private func run(_ sql: String, _ bindings: [SQLValue]) throws -> [SQLRow] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw DatabaseError.prepare(String(cString: sqlite3_errmsg(handle)))
        }
        defer { sqlite3_finalize(statement) }

        for (offset, value) in bindings.enumerated() {
            let index = Int32(offset + 1)
            switch value {
            case .null: sqlite3_bind_null(statement, index)
            case .integer(let v): sqlite3_bind_int64(statement, index, v)
            case .real(let v): sqlite3_bind_double(statement, index, v)
            case .text(let v): sqlite3_bind_text(statement, index, v, -1, Self.transient)
            }
        }

        var rows: [SQLRow] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { break }
            guard status == SQLITE_ROW else { throw DatabaseError.step(String(cString: sqlite3_errmsg(handle))) }
            var row: SQLRow = [:]
            for column in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, column))
                switch sqlite3_column_type(statement, column) {
                case SQLITE_INTEGER: row[name] = .integer(sqlite3_column_int64(statement, column))
                case SQLITE_FLOAT: row[name] = .real(sqlite3_column_double(statement, column))
                case SQLITE_TEXT: row[name] = .text(String(cString: sqlite3_column_text(statement, column)))
                default: row[name] = .null
                }
            }
            rows.append(row)
        }
        return rows
    }
}
