import Foundation

/// AURA's read-only GitHub security model, checked against what GitHub reports
/// for each installation of the app (`GET /user/installations`).
///
/// - Required: `metadata: read` and `contents: read`. Without contents the
///   explorer still lists repositories, but branches and commits fail.
/// - Unneeded: any other permission at `read`. AURA never calls those APIs;
///   they are reported so the owner can remove them, and AURA keeps working.
/// - Excessive: any permission above `read` (`write`, `admin`, or a level this
///   build does not know). AURA refuses the session: it deletes the stored
///   token, which could write, and asks the owner to make the app read-only.
public enum GitHubPermissionPolicy {
    public static let required: [String: String] = ["metadata": "read", "contents": "read"]

    public struct Review: Equatable, Sendable {
        /// Required permissions that are absent, as "name".
        public var missing: [String]
        /// Read permissions AURA does not use, as "name".
        public var unneeded: [String]
        /// Anything above read, as "name=level".
        public var excessive: [String]

        public var isAcceptable: Bool { excessive.isEmpty }
    }

    public static func review(_ permissions: [String: String]) -> Review {
        var review = Review(missing: [], unneeded: [], excessive: [])
        for (name, level) in permissions.sorted(by: { $0.key < $1.key }) {
            if level != "read" {
                review.excessive.append("\(name)=\(level)")
            } else if required[name] == nil {
                review.unneeded.append(name)
            }
        }
        review.missing = required.keys.filter { permissions[$0] == nil }.sorted()
        return review
    }

    /// Throws when any installation grants more than read access.
    static func enforce(_ installations: [GitHubInstallation]) throws {
        let offending = installations.filter { !review($0.permissions).isAcceptable }
        guard let first = offending.first else { return }
        throw GitHubPermissionViolation(
            installationIds: offending.map(\.id),
            accountLogins: offending.map(\.accountLogin),
            excessive: Array(Set(offending.flatMap { review($0.permissions).excessive })).sorted(),
            manageUrl: first.manageUrl
        )
    }
}

/// An installation grants more than AURA's read-only allowlist.
public struct GitHubPermissionViolation: Error, Equatable, Sendable {
    public var installationIds: [Int]
    public var accountLogins: [String]
    /// "name=level" entries, e.g. "contents=write".
    public var excessive: [String]
    public var manageUrl: String

    var userMessage: String {
        "AURA's GitHub App has more than read access (\(excessive.joined(separator: ", "))) on \(accountLogins.joined(separator: ", ")). "
            + "AURA only reads, so it signed out and deleted the token. Set the app to read-only (Metadata and Contents) at \(manageUrl), then reconnect."
    }
}
