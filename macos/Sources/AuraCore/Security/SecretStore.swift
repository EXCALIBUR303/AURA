import Foundation
import Security

/// Names of secrets AURA may hold. Values never cross the bridge — the web
/// side only ever sees derived state (e.g. GitHubAuthStatus).
public struct SecretKey: RawRepresentable, Hashable, Sendable {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }

    public static let githubToken = SecretKey(rawValue: "github.token")
    public static func aiProviderKey(_ providerId: String) -> SecretKey {
        SecretKey(rawValue: "ai.\(providerId).apiKey")
    }
}

public protocol SecretStore: Sendable {
    func read(_ key: SecretKey) throws -> String?
    func write(_ value: String, for key: SecretKey) throws
    func delete(_ key: SecretKey) throws
}

/// Generic-password items in the login keychain, readable only on this
/// device after first unlock and never synced to iCloud.
public struct KeychainSecretStore: SecretStore {
    public static let defaultService = "com.aura.app"
    private let service: String

    public init(service: String = KeychainSecretStore.defaultService) {
        self.service = service
    }

    public func read(_ key: SecretKey) throws -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else { throw AuraError.internal("keychain returned non-data") }
            return String(decoding: data, as: UTF8.self)
        case errSecItemNotFound:
            return nil
        default:
            throw Self.failure("read", status)
        }
    }

    public func write(_ value: String, for key: SecretKey) throws {
        let data = Data(value.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(baseQuery(key) as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery(key)
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw Self.failure("write", status) }
        Log.security.notice("stored secret \(key.rawValue, privacy: .public)")
    }

    public func delete(_ key: SecretKey) throws {
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Self.failure("delete", status) }
    }

    private func baseQuery(_ key: SecretKey) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrSynchronizable as String: false,
        ]
    }

    private static func failure(_ operation: String, _ status: OSStatus) -> AuraError {
        Log.security.error("keychain \(operation, privacy: .public) failed: \(status, privacy: .public)")
        return .internal("keychain \(operation) failed (\(status))")
    }
}

/// For tests and previews. Not persisted.
public final class InMemorySecretStore: SecretStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [SecretKey: String] = [:]

    public init(_ values: [SecretKey: String] = [:]) {
        self.values = values
    }

    public func read(_ key: SecretKey) throws -> String? {
        lock.withLock { values[key] }
    }

    public func write(_ value: String, for key: SecretKey) throws {
        lock.withLock { values[key] = value }
    }

    public func delete(_ key: SecretKey) throws {
        lock.withLock { _ = values.removeValue(forKey: key) }
    }
}
