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
                    reading: for try await line in response.lines {
                        try Task.checkCancellation()
                        guard line.utf8.count <= Self.maxLineBytes else { throw AuraError.internal("the AI provider sent an oversized stream line") }
                        for event in try OpenAIStreamParser.parse(line) {
                            switch event {
                            case .delta(let text): continuation.yield(.delta(text))
                            case .finish(let reason): finish = reason
                            case .done: sawDone = true; break reading
                            }
                        }
                    }
                    try Task.checkCancellation()
                    guard finish != nil || sawDone else { throw AuraError.network("the AI provider closed the stream before finishing") }
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
            "messages": request.messages.map { ["role": $0.role.rawValue, "content": $0.content] },
        ]
        if let max = request.maxOutputTokens { body["max_tokens"] = max }
        var urlRequest = URLRequest(url: baseURL.appending(path: "chat/completions"))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        authorize(&urlRequest)
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)
        return urlRequest
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

/// One line of an OpenAI-style SSE stream.
enum OpenAIStreamParser {
    enum Event: Equatable { case delta(String), finish(FinishReason), done }

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
        if let text = (choice["delta"] as? [String: Any])?["content"] as? String, !text.isEmpty {
            events.append(.delta(text))
        }
        if let reason = choice["finish_reason"] as? String {
            events.append(.finish(reason == "length" ? .length : .stop))
        }
        return events
    }
}
