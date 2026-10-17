import Foundation

// AI tool permission boundary. Phase 3C-A defined the rules; Phase 3C-B adds
// the read-only tools and their executor (AIToolExecutor).
//
// Rules, enforced here so every executor inherits them:
// - Only tools on the allowlist exist. Anything else (shell, file writes,
//   GitHub writes) is denied by name, whatever the model asks for.
// - Arguments are validated against the tool's declared parameters: unknown
//   or missing names, wrong types, out-of-range values and malformed
//   identifiers are refused before anything runs.
// - Effects are explicit. Read-only tools may run on their own. App actions
//   (navigation) are only suggestions until the user approves them in the UI.
//   Sensitive effects are not available at all in this phase.
// - A model request is never an authorization: approvals come from the user,
//   per call, and are bound to that call's exact arguments.
// - Per reply, the number of tool calls is capped.

public enum AIToolEffect: String, Codable, Sendable {
    /// Reads AURA's own state or GitHub data AURA can already see.
    case readOnly = "read_only"
    /// Changes what AURA shows (navigation). Needs the user's approval.
    case appAction = "app_action"
    /// Writes or anything with outside effects. Denied in Phase 3C.
    case sensitive
}

/// What a tool's result contains, for the privacy gate (AIPrivacyGate).
public enum AIToolData: String, Sendable {
    /// AURA's own state: zone, selected repository, provider. No repository content.
    case workspace
    /// Names and metadata of the repositories AURA can see.
    case repositoryList
    /// One repository's metadata: description, languages, commit messages, file paths.
    case repositoryMetadata
    /// File contents and diffs.
    case repositorySource
    /// Nothing is read; the app does something.
    case none
}

/// Which repositories a tool may touch.
public enum AIToolScope: Sendable {
    case noRepository
    /// Any repository the GitHub installation can access.
    case anyAccessibleRepository
    /// Only the repository the conversation is bound to.
    case conversationRepository
}

public struct AIToolParameter: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case string(maxLength: Int, pattern: String? = nil)
        case integer(ClosedRange<Int>)
        case boolean
        case oneOf([String])
    }
    public var name: String
    public var kind: Kind
    public var required: Bool
    public var description: String

    public init(_ name: String, _ kind: Kind, required: Bool = true, description: String = "") {
        self.name = name
        self.kind = kind
        self.required = required
        self.description = description
    }
}

public struct AIToolDefinition: Equatable, Sendable {
    public var name: String
    public var summary: String
    public var parameters: [AIToolParameter]
    public var effect: AIToolEffect
    public var data: AIToolData
    public var scope: AIToolScope

    public init(name: String, summary: String, parameters: [AIToolParameter], effect: AIToolEffect, data: AIToolData = .none, scope: AIToolScope = .noRepository) {
        self.name = name
        self.summary = summary
        self.parameters = parameters
        self.effect = effect
        self.data = data
        self.scope = scope
    }

    /// JSON Schema for the provider's function definition. Patterns are not
    /// sent (not every runtime accepts them); AURA validates them itself.
    var jsonSchema: [String: Any] {
        var properties: [String: Any] = [:]
        for parameter in parameters {
            var schema: [String: Any]
            switch parameter.kind {
            case .string(let maxLength, _): schema = ["type": "string", "maxLength": maxLength]
            case .integer(let range): schema = ["type": "integer", "minimum": range.lowerBound, "maximum": range.upperBound]
            case .boolean: schema = ["type": "boolean"]
            case .oneOf(let options): schema = ["type": "string", "enum": options]
            }
            if !parameter.description.isEmpty { schema["description"] = parameter.description }
            properties[parameter.name] = schema
        }
        return [
            "type": "object",
            "properties": properties,
            "required": parameters.filter(\.required).map(\.name),
            "additionalProperties": false,
        ]
    }
}

/// A tool call as a model proposed it. Untrusted input.
public struct AIToolCall: Equatable, Sendable {
    public var id: String
    public var name: String
    public var arguments: [String: JSONValue]
    /// The model's arguments were not a JSON object (or too large); the call is refused.
    public var malformedArguments: Bool

    public init(id: String, name: String, arguments: [String: JSONValue], malformedArguments: Bool = false) {
        self.id = id
        self.name = name
        self.arguments = arguments
        self.malformedArguments = malformedArguments
    }

    /// Parses the model's raw argument text (OpenAI sends a JSON string).
    public init(id: String, name: String, rawArguments: String) {
        let trimmed = rawArguments.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            self.init(id: id, name: name, arguments: [:])
        } else if trimmed.utf8.count <= AIToolPolicy.maxArgumentBytes,
                  case .object(let object)? = try? JSONDecoder().decode(JSONValue.self, from: Data(trimmed.utf8)) {
            self.init(id: id, name: name, arguments: object)
        } else {
            self.init(id: id, name: name, arguments: [:], malformedArguments: true)
        }
    }

    /// Arguments as compact JSON with sorted keys (sent back to the provider in the history).
    public var argumentsJSON: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(JSONValue.object(arguments))).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
    }
}

public enum AIToolDecision: Equatable, Sendable {
    /// May run now with these validated arguments.
    case allowed(AIToolDefinition, [String: JSONValue])
    /// Show to the user as a suggestion; run only after their approval.
    case needsApproval(AIToolDefinition, [String: JSONValue])
    case denied(String)
}

/// User approvals, each bound to one call's tool and exact arguments.
public struct AIToolApprovals: Sendable {
    private var approved: Set<String> = []
    public init() {}
    public mutating func approve(_ call: AIToolCall) { approved.insert(Self.key(call)) }
    public func contains(_ call: AIToolCall) -> Bool { approved.contains(Self.key(call)) }
    static func key(_ call: AIToolCall) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let args = (try? encoder.encode(JSONValue.object(call.arguments))).map { String(decoding: $0, as: UTF8.self) } ?? ""
        return "\(call.id)|\(call.name)|\(args)"
    }
}

public struct AIToolPolicy: Sendable {
    public let tools: [String: AIToolDefinition]
    public let maxCallsPerReply: Int
    /// Largest argument object accepted from a model.
    public static let maxArgumentBytes = 4096

    public init(tools: [AIToolDefinition] = AIToolPolicy.phase3CAllowlist, maxCallsPerReply: Int = 8) {
        self.tools = Dictionary(uniqueKeysWithValues: tools.map { ($0.name, $0) })
        self.maxCallsPerReply = maxCallsPerReply
    }

    /// Definitions in a stable order, for the provider request.
    public var definitions: [AIToolDefinition] { tools.values.sorted { $0.name < $1.name } }

    static let fullName = #"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}"#
    static let branch = #"[A-Za-z0-9._/-]{1,200}"#
    static let path = #"[^\x00-\x1F?#%\\]{1,512}"#
    static let sha = #"[0-9a-fA-F]{7,40}"#

    private static let repo = AIToolParameter("fullName", .string(maxLength: 140, pattern: fullName), description: "Repository as owner/name.")
    private static let branchParameter = AIToolParameter("branch", .string(maxLength: 200, pattern: branch), required: false,
                                                         description: "Branch name; the conversation's branch or the default branch when omitted.")

    /// The tools Phase 3C offers. All read-only except navigation, which only
    /// happens after the user approves it.
    public static let phase3CAllowlist: [AIToolDefinition] = [
        AIToolDefinition(name: "get_active_workspace", summary: "What the user has open in AURA: zone, selected repository and branch, AI provider.",
                         parameters: [], effect: .readOnly, data: .workspace),
        AIToolDefinition(name: "list_repositories", summary: "Repositories AURA can access, most recently pushed first, optionally filtered by name, language or topic.",
                         parameters: [
                            AIToolParameter("query", .string(maxLength: 100), required: false, description: "Text to match against name, description, language or topics."),
                            AIToolParameter("limit", .integer(1...50), required: false, description: "Maximum repositories to return (default 20)."),
                         ], effect: .readOnly, data: .repositoryList, scope: .anyAccessibleRepository),
        AIToolDefinition(name: "get_repository_metadata", summary: "Description, visibility, languages, topics, default branch and licence of one repository.",
                         parameters: [repo], effect: .readOnly, data: .repositoryMetadata, scope: .anyAccessibleRepository),
        AIToolDefinition(name: "list_recent_commits", summary: "Recent commits (SHA, date, author, subject) of a repository.",
                         parameters: [repo, branchParameter, AIToolParameter("limit", .integer(1...20), required: false, description: "Number of commits (default 10).")],
                         effect: .readOnly, data: .repositoryMetadata, scope: .anyAccessibleRepository),
        AIToolDefinition(name: "get_commit_details", summary: "Files changed by one commit with line counts; optionally the diff.",
                         parameters: [
                            repo,
                            AIToolParameter("sha", .string(maxLength: 40, pattern: sha), description: "Commit SHA (7-40 hex characters)."),
                            AIToolParameter("includePatch", .boolean, required: false, description: "Include the diff text (source content)."),
                         ], effect: .readOnly, data: .repositoryMetadata, scope: .conversationRepository),
        AIToolDefinition(name: "list_repository_files", summary: "File and directory paths of the conversation's repository, optionally under one directory.",
                         parameters: [repo, AIToolParameter("path", .string(maxLength: 512, pattern: path), required: false, description: "Directory to list; the root when omitted."), branchParameter],
                         effect: .readOnly, data: .repositoryMetadata, scope: .conversationRepository),
        AIToolDefinition(name: "search_repository_paths", summary: "Find files of the conversation's repository whose path contains the query (names only, not contents).",
                         parameters: [repo, AIToolParameter("query", .string(maxLength: 100), description: "Case-insensitive text to find in paths, e.g. \"readme\" or \".swift\"."), branchParameter],
                         effect: .readOnly, data: .repositoryMetadata, scope: .conversationRepository),
        AIToolDefinition(name: "read_repository_file", summary: "Text of one file of the conversation's repository, with line numbers; optionally a line range.",
                         parameters: [
                            repo,
                            AIToolParameter("path", .string(maxLength: 512, pattern: path), description: "File path inside the repository."),
                            branchParameter,
                            AIToolParameter("startLine", .integer(1...1_000_000), required: false, description: "First line (1-based)."),
                            AIToolParameter("endLine", .integer(1...1_000_000), required: false, description: "Last line (inclusive)."),
                         ], effect: .readOnly, data: .repositorySource, scope: .conversationRepository),
        AIToolDefinition(name: "navigate_to_zone", summary: "Suggest moving the studio to a zone. The user must approve.",
                         parameters: [AIToolParameter("zone", .oneOf(ZoneID.allCases.map(\.rawValue)))], effect: .appAction),
    ]

    /// Decides what may happen with one proposed call. `index` is the call's
    /// position within the current reply (0-based).
    public func evaluate(_ call: AIToolCall, index: Int, approvals: AIToolApprovals = AIToolApprovals()) -> AIToolDecision {
        guard index < maxCallsPerReply else { return .denied("too many tool calls in one reply (limit \(maxCallsPerReply))") }
        guard let tool = tools[call.name] else { return .denied("tool \(Self.printable(call.name)) is not available") }
        guard !call.malformedArguments else { return .denied("\(tool.name): arguments must be a JSON object") }
        let arguments: [String: JSONValue]
        do { arguments = try validate(call.arguments, for: tool) } catch let error as AuraError {
            return .denied(BridgeError(error).message)
        } catch {
            return .denied("invalid arguments")
        }
        switch tool.effect {
        case .readOnly: return .allowed(tool, arguments)
        case .appAction: return approvals.contains(call) ? .allowed(tool, arguments) : .needsApproval(tool, arguments)
        case .sensitive: return .denied("\(tool.name) needs a capability AURA does not grant in this phase")
        }
    }

    func validate(_ arguments: [String: JSONValue], for tool: AIToolDefinition) throws -> [String: JSONValue] {
        let declared = Set(tool.parameters.map(\.name))
        if let unknown = arguments.keys.sorted().first(where: { !declared.contains($0) }) {
            throw AuraError.invalidRequest("\(tool.name): unknown argument \(Self.printable(unknown))")
        }
        var result: [String: JSONValue] = [:]
        for parameter in tool.parameters {
            var argument = arguments[parameter.name]
            // Models write repository paths as "docs/", "./docs" or "/README.md": strip
            // those slashes, so "/" and "." mean the root.
            if parameter.name == "path", case .string(let text)? = argument { argument = .string(Self.repositoryPath(text)) }
            // Models often send "" for an optional argument they mean to leave out,
            // and 0 for an optional count or line number that starts at 1.
            let leftOut: Bool = switch (parameter.kind, argument) {
            case (_, .string("")?): true
            case (.integer(let range), .number(0)?): range.lowerBound >= 1
            default: false
            }
            guard let given = argument, given != .null, parameter.required || !leftOut else {
                if parameter.required { throw AuraError.invalidRequest("\(tool.name): missing \(parameter.name)") }
                continue
            }
            // Small models send numbers and booleans as strings: accept the exact forms, then validate as usual.
            var value = given
            switch (parameter.kind, value) {
            case (.integer, .string(let text)) where text.wholeMatch(of: /[0-9]{1,9}/) != nil: value = .number(Double(text) ?? -1)
            case (.boolean, .string("true")): value = .bool(true)
            case (.boolean, .string("false")): value = .bool(false)
            default: break
            }
            switch (parameter.kind, value) {
            case (.string(let maxLength, let pattern), .string(let text)):
                guard !text.isEmpty, text.count <= maxLength,
                      !text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
                      pattern.map({ (try? Regex($0)).map { regex in text.wholeMatch(of: regex) != nil } ?? false }) ?? true,
                      pattern == nil || !text.contains("..")
                else { throw AuraError.invalidRequest("\(tool.name): \(parameter.name) is not valid") }
            case (.integer(let range), .number(let number)):
                guard number.rounded() == number, range.contains(Int(exactly: number) ?? Int.min) else {
                    throw AuraError.invalidRequest("\(tool.name): \(parameter.name) must be an integer in \(range.lowerBound)-\(range.upperBound)")
                }
            case (.boolean, .bool): break
            case (.oneOf(let options), .string(let text)):
                guard options.contains(text) else { throw AuraError.invalidRequest("\(tool.name): \(parameter.name) must be one of \(options.joined(separator: ", "))") }
            default:
                throw AuraError.invalidRequest("\(tool.name): \(parameter.name) has the wrong type")
            }
            result[parameter.name] = value
        }
        return result
    }

    /// Names from a model are echoed only when they look like identifiers.
    static func printable(_ name: String) -> String {
        name.wholeMatch(of: /[A-Za-z0-9_.\-]{1,64}/) != nil ? name : "(unnamed)"
    }

    /// "./docs/", "/docs" and "docs/" → "docs"; "/" and "." → "" (the root).
    static func repositoryPath(_ text: String) -> String {
        var path = Substring(text)
        while path.hasPrefix("./") { path = path.dropFirst(2) }
        while path.hasPrefix("/") { path = path.dropFirst() }
        while path.hasSuffix("/") { path = path.dropLast() }
        return path == "." ? "" : String(path)
    }
}
