import AuraCore
import Foundation
import WebKit
import os

/// Opt-in live check of AI provider key management through the real page
/// bridge and the real native key sheet (`AURA_DEV_AI_PROBE=run|verify|cleanup`).
/// It calls the bridge from the page world exactly as the frontend does, waits
/// at each step for the person running it to use the native sheet, and logs
/// outcomes only: provider ids, credential states, error codes and event
/// counts. Key values are never read, logged or returned to the page.
///   /usr/bin/log show --last 10m --info --predicate 'subsystem == "com.aura.app" AND category == "ai-probe"'
@MainActor
enum AIProbe {
    private static let log = Logger(subsystem: Log.subsystem, category: "ai-probe")
    private static var mode: String? { ProcessInfo.processInfo.environment["AURA_DEV_AI_PROBE"] }
    static var isEnabled: Bool { mode != nil }

    // Sets up recording of native events and a call helper in the page.
    private static let prelude = """
        if (!window.__aiProbe) {
          const events = [];
          const bridge = window.__AURA_BRIDGE__;
          const original = bridge.dispatch.bind(bridge);
          bridge.dispatch = (json) => { try { const m = JSON.parse(json); if (m.event === 'ai.providersChanged') events.push(m.payload.map((p) => p.id + ':' + p.credential).join(',')); } catch {} original(json); };
          let n = 0;
          window.__aiProbe = {
            events,
            call: async (method, params) => JSON.parse(await window.webkit.messageHandlers.aura.postMessage(JSON.stringify({ kind: 'request', v: 1, id: 'probe-' + (++n), method, params }))),
          };
        }
        """

    static func run(webView: WebView) async {
        guard let mode else { return }
        log.notice("probe start mode=\(mode, privacy: .public)")
        for _ in 0..<100 where await js(webView, "return String(!!(window.__AURA_BRIDGE__ && window.webkit))") != "true" {
            try? await Task.sleep(for: .milliseconds(300))
        }
        guard await js(webView, "\(prelude); return 'ok'") == "ok" else { return }
        switch mode {
        case "run": await runAll(webView)
        case "recheck":
            await report(webView, "after restart")
            _ = await call(webView, "ai.requestCredential", #"{"providerId":"local-test"}"#)
            await step(webView, "J type a malformed key: the sheet must stay open and explain; then a valid key", "move-test", until: "stored", wait: 180)
            await report(webView, "J done (key left stored for the restart check)")
        case "sheet":
            await step(webView, "K look at the sheet (no Passwords autofill button), then Cancel", "move-test", until: nil, wait: 90)
        case "verify": await report(webView, "verify")
        case "cleanup":
            for id in ["cloud-test", "local-test", "move-test"] { _ = await call(webView, "ai.removeProvider", #"{"providerId":"\#(id)"}"#) }
            await report(webView, "cleanup")
        default: log.error("unknown probe mode")
        }
        log.notice("probe end")
    }

    private static func runAll(_ w: WebView) async {
        let cloud = #"{"id":"cloud-test","displayName":"Cloud test","api":"openai_compatible","baseUrl":"https://api.example.invalid/v1","models":["test-model"],"defaultModel":null}"#
        let local = #"{"id":"local-test","displayName":"Local test","api":"openai_compatible","baseUrl":"http://127.0.0.1:11434/v1","models":["llama3.2:3b"],"defaultModel":null}"#
        _ = await call(w, "ai.saveProvider", cloud)
        _ = await call(w, "ai.saveProvider", local)
        await report(w, "A saved")

        // Local providers take no key.
        _ = await call(w, "ai.requestCredential", #"{"providerId":"local-test"}"#)
        _ = await call(w, "ai.requestCredential", #"{"providerId":"nope"}"#)

        await step(w, "B add: type a test key and Save", "cloud-test", until: "stored")
        await step(w, "C update: type a different test key and Save", "cloud-test", until: nil, wait: 45)
        await step(w, "D cancel the sheet", "cloud-test", until: nil, wait: 45)
        await step(w, "E malformed key (contains a space) and Save", "cloud-test", until: nil, wait: 45)

        _ = await call(w, "ai.validateProvider", #"{"providerId":"cloud-test"}"#)
        _ = await call(w, "ai.validateProvider", #"{"providerId":"local-test"}"#)
        await report(w, "F validated")

        _ = await call(w, "ai.deleteCredential", #"{"providerId":"cloud-test"}"#)
        await report(w, "G key deleted")

        await step(w, "H add key again, then remove provider", "cloud-test", until: "stored")
        _ = await call(w, "ai.removeProvider", #"{"providerId":"cloud-test"}"#)
        await report(w, "H provider removed")

        _ = await call(w, "ai.saveProvider", #"{"id":"move-test","displayName":"Move test","api":"openai_compatible","baseUrl":"https://api.example.invalid/v1","models":["m"],"defaultModel":null}"#)
        await step(w, "I add key, then the endpoint moves", "move-test", until: "stored")
        _ = await call(w, "ai.saveProvider", #"{"id":"move-test","displayName":"Move test","api":"openai_compatible","baseUrl":"https://collector.example.invalid/v1","models":["m"],"defaultModel":null}"#)
        await report(w, "I endpoint moved")
        log.notice("run finished; leave providers for the restart check (mode=verify), then mode=cleanup")
    }

    /// Opens the native sheet via the bridge and waits for the person to finish it.
    private static func step(_ w: WebView, _ title: String, _ id: String, until: String?, wait: Int = 120) async {
        let before = await js(w, "return String(window.__aiProbe.events.length)") ?? "?"
        log.notice("STEP \(title, privacy: .public): opening the sheet")
        let reply = await call(w, "ai.requestCredential", #"{"providerId":"\#(id)"}"#)
        log.notice("step reply: \(reply, privacy: .public)")
        let deadline = ContinuousClock.now + .seconds(wait)
        while ContinuousClock.now < deadline {
            let count = await js(w, "return String(window.__aiProbe.events.length)") ?? "?"
            if count != before {
                let state = await credential(w, id)
                if until == nil || state == until { break }
            }
            try? await Task.sleep(for: .milliseconds(300))
        }
        let after = await js(w, "return String(window.__aiProbe.events.length)") ?? "?"
        let finalState = await credential(w, id)
        log.notice("STEP done: providersChanged events \(before, privacy: .public) -> \(after, privacy: .public); \(id, privacy: .public) credential=\(finalState, privacy: .public)")
    }

    private static func credential(_ w: WebView, _ id: String) async -> String {
        await js(w, """
            const r = await window.__aiProbe.call('ai.listProviders', {});
            return (r.result.find((p) => p.id === '\(id)') ?? {}).credential ?? 'absent';
            """) ?? "?"
    }

    private static func report(_ w: WebView, _ title: String) async {
        let summary = await js(w, """
            const r = await window.__aiProbe.call('ai.listProviders', {});
            return JSON.stringify(r.result.map((p) => ({ id: p.id, kind: p.kind, credential: p.credential, available: p.available,
              check: p.lastCheck ? { ok: p.lastCheck.ok, code: p.lastCheck.code, message: p.lastCheck.message } : null })));
            """) ?? "?"
        log.notice("REPORT \(title, privacy: .public): \(summary, privacy: .public)")
    }

    /// Sends a bridge request from the page; logs only the outcome's code.
    @discardableResult
    private static func call(_ w: WebView, _ method: String, _ params: String) async -> String {
        let outcome = await js(w, """
            const r = await window.__aiProbe.call('\(method)', \(params));
            return r.ok ? 'ok' : 'error:' + r.error.code + ':' + r.error.message;
            """) ?? "?"
        log.notice("call \(method, privacy: .public) -> \(outcome, privacy: .public)")
        return outcome
    }

    private static func js(_ w: WebView, _ body: String) async -> String? {
        do { return try await w.callAsyncJavaScript(body, contentWorld: .page) as? String } catch {
            log.error("probe js error: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    typealias WebView = WKWebView
}
