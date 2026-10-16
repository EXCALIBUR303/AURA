import AuraCore
import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the built frontend from disk as `aura://app/…`. A custom scheme
/// (rather than file://) gives the page a real origin, so fetch() of the GLB,
/// module scripts and CSP all behave as they do on a web server.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "aura"
    static let host = "app"
    static let indexURL = URL(string: "\(scheme)://\(host)/index.html")!

    /// Tight by default; widen deliberately (and document why) if the frontend needs more.
    static let contentSecurityPolicy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self' data: blob:",
        "worker-src 'self' blob:",
        "font-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
    ].joined(separator: "; ")

    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url, url.host == Self.host else {
            return fail(task, status: 400)
        }
        let relative = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()

        // Path traversal guard: the resolved file must stay inside the web root.
        guard file.path.hasPrefix(root.path + "/") else {
            Log.app.error("blocked scheme request outside web root")
            return fail(task, status: 403)
        }
        // Phase 1: synchronous read on the main thread (17 MB GLB ≈ tens of ms).
        // Move to a background read with stop-handling if this shows up in profiles.
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return fail(task, status: 404)
        }

        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
            ?? (file.pathExtension == "glb" ? "model/gltf-binary" : "application/octet-stream")
        var headers = [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        ]
        if mime == "text/html" { headers["Content-Security-Policy"] = Self.contentSecurityPolicy }

        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    private func fail(_ task: any WKURLSchemeTask, status: Int) {
        let url = task.request.url ?? Self.indexURL
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!)
        task.didFinish()
    }
}
