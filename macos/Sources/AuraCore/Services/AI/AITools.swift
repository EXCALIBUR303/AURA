import Foundation

// AI tool permission boundary (Phase 3C-A: definitions, validation and
// decisions only; nothing executes a tool until Phase 3C-B).
//
// Rules, enforced here so every future executor inherits them:
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

    public init(_ name: String, _ kind: Kind, required: Bool = true) {
        self.name = name
        self.kind = kind
        self.required = required
    }
}

public struct AIToolDefinition: Equatable, Sendable {
    public var name: String
    public var summary: String
    public var parameters: [AIToolParameter]
    public var effect: AIToolEffect

    public init(name: String, summary: String, parameters: [AIToolParameter], effect: AIToolEffect) {
        self.name = name
        self.summary = summary
        self.parameters = parameters
        self.effect = effect
    }
}

/// A tool call as a model proposed it. Untrusted input.
public struct AIToolCall: Equatable, Sendable {
    public var id: String
    public var name: String
    public var arguments: [String: JSONValue]

    public init(id: String, name: String, arguments: [String: JSONValue]) {
        self.id = id
        self.name = name
        self.arguments = arguments
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

    public init(tools: [AIToolDefinition] = AIToolPolicy.phase3CAllowlist, maxCallsPerReply: Int = 5) {
        self.tools = Dictionary(uniqueKeysWithValues: tools.map { ($0.name, $0) })
        self.maxCallsPerReply = maxCallsPerReply
    }

    static let fullName = #"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}"#
    static let branch = #"[A-Za-z0-9._/-]{1,200}"#

    /// The tools Phase 3C may offer. All read-only except navigation.
    public static let phase3CAllowlist: [AIToolDefinition] = [
        AIToolDefinition(name: "search_projects", summary: "Search the user's repositories and AURA projects by name, language or topic.",
                         parameters: [AIToolParameter("query", .string(maxLength: 100))], effect: .readOnly),
        AIToolDefinition(name: "get_repository", summary: "Metadata of one repository AURA can access.",
                         parameters: [AIToolParameter("fullName", .string(maxLength: 140, pattern: fullName))], effect: .readOnly),
        AIToolDefinition(name: "list_recent_commits", summary: "Recent commit summaries of a repository.",
                         parameters: [
                            AIToolParameter("fullName", .string(maxLength: 140, pattern: fullName)),
                            AIToolParameter("branch", .string(maxLength: 200, pattern: branch), required: false),
                            AIToolParameter("limit", .integer(1...20), required: false),
                         ], effect: .readOnly),
        AIToolDefinition(name: "navigate_to_zone", summary: "Suggest moving the studio to a zone.",
                         parameters: [AIToolParameter("zone", .oneOf(ZoneID.allCases.map(\.rawValue)))], effect: .appAction),
    ]

    /// Decides what may happen with one proposed call. `index` is the call's
    /// position within the current reply (0-based).
    public func evaluate(_ call: AIToolCall, index: Int, approvals: AIToolApprovals = AIToolApprovals()) -> AIToolDecision {
        guard index < maxCallsPerReply else { return .denied("too many tool calls in one reply (limit \(maxCallsPerReply))") }
        guard let tool = tools[call.name] else { return .denied("tool \(Self.printable(call.name)) is not available") }
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
            guard let value = arguments[parameter.name], value != .null else {
                if parameter.required { throw AuraError.invalidRequest("\(tool.name): missing \(parameter.name)") }
                continue
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
}
