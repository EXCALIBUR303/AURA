import Foundation

/// Chat completions with SSE streaming (`POST {base}/chat/completions`,
/// `stream: true`) and the model list (`GET {base}/models`). This is the
/// OpenAI wire format, which hosted APIs and local runtimes (Ollama's /v1,
/// LM Studio, llama.cpp server, vLLM) also speak. The API key, when there is
/// one, is read from the Keychain by the registry and held only for the
/// request; it is never logged or put in an error.
public struct OpenAICompatibleProvider: AIProvider {
    public let baseURL: URL
    private let apiKey: String?
    private let transport: any AIHTTPTransport
    /// Longest SSE line accepted; a provider sending more is treated as broken.
    static let maxLineBytes = 1 << 20

    public init(baseURL: URL, apiKey: String?, transport: any AIHTTPTransport) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.transport = transport
    }

    public func stream(_ request: AIRequest) -> AsyncThrowingStream<AIStreamEvent, Error> {
        let urlRequest: URLRequest
        do { urlRequest = try chatRequest(request) } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
        let transport = transport
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let response = try await transport.stream(urlRequest)
                    guard (200..<300).contains(response.status) else {
                        var body = ""
                        for try await line in response.lines {
                            body += line
                            if body.utf8.count >= 8192 { break }
                        }
                        throw Self.failure(status: response.status, headers: response.headers, body: Data(body.utf8))
                    }
                    var finish: FinishReason?
                    var sawDone = false
                    var calls = ToolCallAssembler()
                    reading: for try await line in response.lines {
                        try Task.checkCancellation()
                        guard line.utf8.count <= Self.maxLineBytes else { throw AuraError.internal("the AI provider sent an oversized stream line") }
                        for event in try OpenAIStreamParser.parse(line) {
                            switch event {
                            case .delta(let text): continuation.yield(.delta(text))
                            case .toolCallDelta(let delta): try calls.add(delta)
                            case .finish(let reason): finish = reason
                            case .done: sawDone = true; break reading
                            }
                        }
                    }
                    try Task.checkCancellation()
                    guard finish != nil || sawDone else { throw AuraError.network("the AI provider closed the stream before finishing") }
                    let proposed = calls.calls()
                    if !proposed.isEmpty { continuation.yield(.toolCalls(proposed)) }
                    continuation.yield(.finished(finish ?? .stop))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func listModels() async throws -> [String] {
        var request = URLRequest(url: baseURL.appending(path: "models"))
        request.timeoutInterval = 10
        authorize(&request)
        let response = try await transport.send(request)
        guard (200..<300).contains(response.status) else {
            throw Self.failure(status: response.status, headers: response.headers, body: response.body)
        }
        guard let object = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
              let data = object["data"] as? [[String: Any]] else {
            throw AuraError.internal("the AI provider sent a malformed model list")
        }
        return data.compactMap { $0["id"] as? String }.filter(AIProviderRegistry.isValidModelId).prefix(100).map { $0 }
    }

    func chatRequest(_ request: AIRequest) throws -> URLRequest {
        var body: [String: Any] = [
            "model": request.model,
            "stream": true,
            "messages": request.messages.map(Self.wire),
        ]
        if let max = request.maxOutputTokens { body["max_tokens"] = max }
        if !request.tools.isEmpty {
            body["tools"] = request.tools.map { tool in
                ["type": "function", "function": ["name": tool.name, "description": tool.summary, "parameters": tool.jsonSchema]]
            }
            body["tool_choice"] = request.toolChoice.rawValue
        }
        var urlRequest = URLRequest(url: baseURL.appending(path: "chat/completions"))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        authorize(&urlRequest)
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)
        return urlRequest
    }

    /// One message in the chat-completions wire format.
    static func wire(_ message: AIMessage) -> [String: Any] {
        switch message.role {
        case .assistant where !message.toolCalls.isEmpty:
            return [
                "role": "assistant",
                "content": message.content.isEmpty ? NSNull() : message.content,
                "tool_calls": message.toolCalls.map { call in
                    ["id": call.id, "type": "function", "function": ["name": call.name, "arguments": call.argumentsJSON]]
                },
            ]
        case .tool:
            return ["role": "tool", "tool_call_id": message.toolCallId ?? "", "content": message.content]
        default:
            return ["role": message.role.rawValue, "content": message.content]
        }
    }

    private func authorize(_ request: inout URLRequest) {
        if let apiKey, !apiKey.isEmpty { request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization") }
    }

    /// Maps an error status onto AuraError. Only the provider's error type/code
    /// token is kept from the body: free text could echo the prompt.
    static func failure(status: Int, headers: [String: String], body: Data) -> AuraError {
        let detail = errorToken(body).map { ", \($0)" } ?? ""
        switch status {
        case 400, 422: return .invalidRequest("the AI provider rejected the request (\(status)\(detail))")
        case 401: return .notAuthenticated("the AI provider rejected the API key")
        case 403: return .permissionDenied("the AI provider refused access (403\(detail))")
        case 404: return .notFound("model or endpoint not found at the AI provider (404\(detail))")
        case 408: return .timeout
        case 429: return .rateLimited(retryAfterSeconds: headers["retry-after"].flatMap { Int($0) })
        case 500..<600: return .network("the AI provider is unavailable (\(status))")
        default: return .network("unexpected AI provider response (\(status))")
        }
    }

    static func errorToken(_ body: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let error = object["error"] as? [String: Any] else { return nil }
        let token = (error["code"] as? String) ?? (error["type"] as? String)
        guard let token, token.wholeMatch(of: /[A-Za-z0-9_.\-]{1,64}/) != nil else { return nil }
        return token
    }
}

/// Streamed tool calls arrive in pieces keyed by `index`: the id and name
/// first, the argument JSON spread over many chunks. Bounded: a provider
/// proposing more calls or longer arguments than AURA accepts is cut off.
struct ToolCallAssembler {
    struct Delta: Equatable { var index: Int; var id: String?; var name: String?; var arguments: String? }
    static let maxCalls = 8
    private var parts: [Int: (id: String, name: String, arguments: String)] = [:]
    private var tooLong: Set<Int> = []

    mutating func add(_ delta: Delta) throws {
        guard (0..<64).contains(delta.index) else { throw AuraError.internal("the AI provider sent a malformed tool call") }
        if parts[delta.index] == nil {
            guard parts.count < Self.maxCalls else { return } // extra calls are dropped
            parts[delta.index] = ("", "", "")
        }
        if let id = delta.id, !id.isEmpty { parts[delta.index]!.id = String(id.prefix(64)) }
        if let name = delta.name, !name.isEmpty { parts[delta.index]!.name = String((parts[delta.index]!.name + name).prefix(64)) }
        if let arguments = delta.arguments {
            if parts[delta.index]!.arguments.utf8.count + arguments.utf8.count > AIToolPolicy.maxArgumentBytes { tooLong.insert(delta.index) } else {
                parts[delta.index]!.arguments += arguments
            }
        }
    }

    /// Complete calls in index order. A call without an id gets one; arguments
    /// that are too long or not a JSON object mark the call as malformed.
    func calls() -> [AIToolCall] {
        parts.keys.sorted().compactMap { index in
            let part = parts[index]!
            guard !part.name.isEmpty else { return nil }
            let id = part.id.wholeMatch(of: /[A-Za-z0-9_.:\-]{1,64}/) != nil ? part.id : "call_\(index)"
            if tooLong.contains(index) { return AIToolCall(id: id, name: part.name, arguments: [:], malformedArguments: true) }
            return AIToolCall(id: id, name: part.name, rawArguments: part.arguments)
        }
    }
}

/// One line of an OpenAI-style SSE stream.
enum OpenAIStreamParser {
    enum Event: Equatable { case delta(String), toolCallDelta(ToolCallAssembler.Delta), finish(FinishReason), done }

    static func parse(_ rawLine: String) throws -> [Event] {
        let line = rawLine.trimmingCharacters(in: .whitespaces)
        guard line.hasPrefix("data:") else { return [] } // blank separators, comments (":"), event:/id:/retry:
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        if payload == "[DONE]" { return [.done] }
        guard let object = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any] else {
            throw AuraError.internal("the AI provider sent a malformed stream")
        }
        if object["error"] != nil {
            let token = OpenAICompatibleProvider.errorToken(Data(payload.utf8)).map { " (\($0))" } ?? ""
            throw AuraError.network("the AI provider reported an error mid-stream\(token)")
        }
        guard let choice = (object["choices"] as? [[String: Any]])?.first else { return [] }
        var events: [Event] = []
        let delta = choice["delta"] as? [String: Any]
        if let text = delta?["content"] as? String, !text.isEmpty {
            events.append(.delta(text))
        }
        for call in delta?["tool_calls"] as? [[String: Any]] ?? [] {
            let function = call["function"] as? [String: Any]
            // Some runtimes send arguments as an object instead of a JSON string.
            var arguments = function?["arguments"] as? String
            if arguments == nil, let object = function?["arguments"], JSONSerialization.isValidJSONObject(object),
               let data = try? JSONSerialization.data(withJSONObject: object) {
                arguments = String(decoding: data, as: UTF8.self)
            }
            events.append(.toolCallDelta(.init(
                index: (call["index"] as? NSNumber)?.intValue ?? 0,
                id: call["id"] as? String,
                name: function?["name"] as? String,
                arguments: arguments
            )))
        }
        if let reason = choice["finish_reason"] as? String {
            events.append(.finish(reason == "length" ? .length : .stop))
        }
        return events
    }
}
