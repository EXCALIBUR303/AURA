import Foundation

// Read-only repository content (Phase 3C-B): file trees, single files and
// commit details, for Astra's tools and for explicitly selected context. All
// three are GET requests that the GitHub App's Contents: read permission
// covers. Nothing is written to disk; the API client's ETag cache is in memory.

/// One file as fetched for Astra. `text` is nil for binary or oversized files.
public struct RepositoryFile: Equatable, Sendable {
    public var fullName: String
    public var path: String
    /// The ref the file was read at (a commit SHA when the caller pinned one).
    public var ref: String
    /// Blob SHA.
    public var sha: String
    public var size: Int
    public var text: String?
    public var isBinary: Bool
    public var tooLarge: Bool

    public init(fullName: String, path: String, ref: String, sha: String, size: Int, text: String?, isBinary: Bool = false, tooLarge: Bool = false) {
        self.fullName = fullName
        self.path = path
        self.ref = ref
        self.sha = sha
        self.size = size
        self.text = text
        self.isBinary = isBinary
        self.tooLarge = tooLarge
    }
}

public struct CommitFileChange: Equatable, Sendable {
    public var path: String
    /// added, modified, removed, renamed, copied, changed, unchanged.
    public var status: String
    public var additions: Int
    public var deletions: Int
    /// Unified diff of this file. Source content: only sent where policy allows.
    public var patch: String?

    public init(path: String, status: String, additions: Int, deletions: Int, patch: String? = nil) {
        self.path = path
        self.status = status
        self.additions = additions
        self.deletions = deletions
        self.patch = patch
    }
}

public struct CommitDetail: Equatable, Sendable {
    public var summary: CommitSummary
    public var additions: Int
    public var deletions: Int
    public var files: [CommitFileChange]
    /// GitHub lists at most 300 files per commit; AURA keeps at most 100.
    public var filesTruncated: Bool

    public init(summary: CommitSummary, additions: Int, deletions: Int, files: [CommitFileChange], filesTruncated: Bool) {
        self.summary = summary
        self.additions = additions
        self.deletions = deletions
        self.files = files
        self.filesTruncated = filesTruncated
    }
}

enum RepositoryContentLimits {
    /// Files above this are reported as too large (GitHub's contents API stops at 1 MB).
    static let maxFileBytes = 1_000_000
    /// Entries AURA keeps from one tree listing.
    static let maxTreeEntries = 20_000
    static let maxCommitFiles = 100
    static let maxPatchChars = 20_000
}

/// A repository-relative path, checked before it goes into a URL path:
/// 1–512 characters, up to 40 segments, no empty, "." or ".." segments, no
/// leading or trailing slash, and none of the characters that would change
/// the meaning of a URL (`?`, `#`, `%`, `\`) or control characters.
func validatedRepositoryPath(_ path: String) throws -> String {
    let segments = path.split(separator: "/", omittingEmptySubsequences: false)
    guard (1...512).contains(path.count), segments.count <= 40,
          segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }),
          !path.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) || "?#%\\".unicodeScalars.contains($0) })
    else { throw AuraError.invalidRequest("path must be a file path inside the repository") }
    return path
}

/// A branch name or commit SHA used as `ref`.
func validatedRef(_ ref: String) throws -> String {
    try AIContextBuilder.validateBranch(ref)
    return ref
}

func isCommitSHA(_ text: String) -> Bool { text.wholeMatch(of: /[0-9a-fA-F]{7,40}/) != nil }

enum RepositoryContentParsing {
    static func tree(_ body: Data, fullName: String, ref: String, commitSha: String) throws -> RepositoryTree {
        let object = try GitHubJSON.object(body)
        let raw = object["tree"] as? [[String: Any]] ?? []
        var entries: [RepositoryTreeEntry] = []
        entries.reserveCapacity(min(raw.count, RepositoryContentLimits.maxTreeEntries))
        for json in raw {
            guard entries.count < RepositoryContentLimits.maxTreeEntries else { break }
            guard let path = json["path"] as? String, (try? validatedRepositoryPath(path)) != nil else { continue }
            switch json["type"] as? String {
            case "blob": entries.append(RepositoryTreeEntry(path: path, type: .file, size: (json["size"] as? NSNumber)?.intValue))
            case "tree": entries.append(RepositoryTreeEntry(path: path, type: .directory, size: nil))
            default: continue // submodules ("commit") and anything else
            }
        }
        let truncated = (object["truncated"] as? Bool ?? false) || raw.count > entries.count
        return RepositoryTree(fullName: fullName, ref: ref, commitSha: commitSha, entries: entries, truncated: truncated)
    }

    static func file(_ body: Data, fullName: String, path: String, ref: String) throws -> RepositoryFile {
        guard let object = try? JSONSerialization.jsonObject(with: body) else { throw AuraError.network("GitHub returned unreadable JSON") }
        guard let json = object as? [String: Any] else { throw AuraError.invalidRequest("\(path) is a directory, not a file") }
        guard json["type"] as? String == "file" else { throw AuraError.invalidRequest("\(path) is not a regular file") }
        let size = (json["size"] as? NSNumber)?.intValue ?? 0
        let sha = json["sha"] as? String ?? ""
        let base = RepositoryFile(fullName: fullName, path: path, ref: ref, sha: sha, size: size, text: nil)
        guard size <= RepositoryContentLimits.maxFileBytes, json["encoding"] as? String == "base64",
              let encoded = json["content"] as? String else {
            var file = base
            file.tooLarge = true
            return file
        }
        guard let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
            throw AuraError.network("GitHub returned unreadable file content")
        }
        var file = base
        if let text = decodedText(data) { file.text = text } else { file.isBinary = true }
        return file
    }

    /// UTF-8 text without NUL bytes, or nil (binary).
    static func decodedText(_ data: Data) -> String? {
        guard !data.prefix(8192).contains(0), let text = String(data: data, encoding: .utf8) else { return nil }
        return text
    }

    static func commit(_ body: Data, fullName: String) throws -> CommitDetail {
        let json = try GitHubJSON.object(body)
        guard let sha = json["sha"] as? String, let commit = json["commit"] as? [String: Any] else {
            throw AuraError.network("unexpected commit response")
        }
        let author = commit["author"] as? [String: Any]
        let committer = commit["committer"] as? [String: Any]
        let summary = CommitSummary(
            sha: sha,
            message: commit["message"] as? String ?? "",
            authorName: author?["name"] as? String ?? "unknown",
            authorLogin: (json["author"] as? [String: Any])?["login"] as? String,
            committedAt: committer?["date"] as? String ?? author?["date"] as? String ?? "",
            htmlUrl: json["html_url"] as? String ?? ""
        )
        let stats = json["stats"] as? [String: Any]
        let rawFiles = json["files"] as? [[String: Any]] ?? []
        let files = rawFiles.prefix(RepositoryContentLimits.maxCommitFiles).compactMap { file -> CommitFileChange? in
            guard let path = file["filename"] as? String else { return nil }
            return CommitFileChange(
                path: path,
                status: file["status"] as? String ?? "changed",
                additions: (file["additions"] as? NSNumber)?.intValue ?? 0,
                deletions: (file["deletions"] as? NSNumber)?.intValue ?? 0,
                patch: (file["patch"] as? String).map { String($0.prefix(RepositoryContentLimits.maxPatchChars)) }
            )
        }
        return CommitDetail(
            summary: summary,
            additions: (stats?["additions"] as? NSNumber)?.intValue ?? 0,
            deletions: (stats?["deletions"] as? NSNumber)?.intValue ?? 0,
            files: files,
            filesTruncated: rawFiles.count > files.count
        )
    }
}

extension LiveGitHubService {
    /// The whole tree at the head of `ref` (default branch when nil), pinned
    /// to that commit. Large responses are parsed off the main actor.
    public func listTree(fullName: String, ref: String?) async throws -> RepositoryTree {
        let fullName = try validatedFullName(fullName)
        let requested = try ref.map(validatedRef)
        let resolvedRef = try await resolve(requested, fullName)
        let commitSha: String
        if isCommitSHA(resolvedRef) {
            commitSha = resolvedRef
        } else {
            guard let head = try await listCommits(fullName: fullName, branch: resolvedRef, limit: 1).first else {
                throw AuraError.notFound("\(fullName) has no commits on \(resolvedRef)")
            }
            commitSha = head.sha
        }
        let body = try await perform { client in
            try await client.get("repos/\(fullName)/git/trees/\(commitSha)", query: [URLQueryItem(name: "recursive", value: "1")]).body
        }
        return try await Task.detached(priority: .userInitiated) {
            try RepositoryContentParsing.tree(body, fullName: fullName, ref: resolvedRef, commitSha: commitSha)
        }.value
    }

    public func file(fullName: String, path: String, ref: String?) async throws -> RepositoryFile {
        let fullName = try validatedFullName(fullName)
        let path = try validatedRepositoryPath(path)
        let requested = try ref.map(validatedRef)
        let resolvedRef = try await resolve(requested, fullName)
        let body = try await perform { client in
            try await client.get("repos/\(fullName)/contents/\(path)", query: [URLQueryItem(name: "ref", value: resolvedRef)]).body
        }
        return try await Task.detached(priority: .userInitiated) {
            try RepositoryContentParsing.file(body, fullName: fullName, path: path, ref: resolvedRef)
        }.value
    }

    public func readme(fullName: String, ref: String?) async throws -> RepositoryFile {
        let fullName = try validatedFullName(fullName)
        let requested = try ref.map(validatedRef)
        let resolvedRef = try await resolve(requested, fullName)
        let body = try await perform { client in
            try await client.get("repos/\(fullName)/readme", query: [URLQueryItem(name: "ref", value: resolvedRef)]).body
        }
        return try await Task.detached(priority: .userInitiated) {
            let path = (try? GitHubJSON.object(body))?["path"] as? String ?? "README"
            return try RepositoryContentParsing.file(body, fullName: fullName, path: (try? validatedRepositoryPath(path)) ?? "README", ref: resolvedRef)
        }.value
    }

    public func commit(fullName: String, sha: String) async throws -> CommitDetail {
        let fullName = try validatedFullName(fullName)
        guard isCommitSHA(sha) else { throw AuraError.invalidRequest("sha must be 7-40 hexadecimal characters") }
        let body = try await perform { client in try await client.get("repos/\(fullName)/commits/\(sha)").body }
        return try await Task.detached(priority: .userInitiated) { try RepositoryContentParsing.commit(body, fullName: fullName) }.value
    }

    private func resolve(_ ref: String?, _ fullName: String) async throws -> String {
        if let ref { return ref }
        return try await repository(fullName: fullName).summary.defaultBranch
    }
}
