import AppKit
import AuraCore
import SwiftUI
import WebKit

/// Hosts the React studio and connects it to the bridge router.
struct StudioWebView: NSViewRepresentable {
    let services: AppServices
    let model: AppModel

    func makeCoordinator() -> Coordinator {
        Coordinator(services: services, model: model)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = services.configuration
        let webConfiguration = WKWebViewConfiguration()
        if let webRoot = configuration.webRoot, configuration.devServerURL == nil {
            webConfiguration.setURLSchemeHandler(AppSchemeHandler(root: webRoot), forURLScheme: AppSchemeHandler.scheme)
        }
        webConfiguration.userContentController.addScriptMessageHandler(
            context.coordinator, contentWorld: .page, name: BridgeProtocol.handlerName
        )
        context.coordinator.windowDrag.install(in: webConfiguration.userContentController)
        // Tab moves through every control (Safari's "Press Tab to highlight each
        // item"), not only text fields, even when the Mac's full keyboard access is off.
        webConfiguration.preferences.tabFocusesLinks = true

        let webView = AuraWebView(frame: .zero, configuration: webConfiguration)
        let coordinator = context.coordinator
        webView.onWindowChange = { [weak coordinator] window in coordinator?.attach(to: window) }
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isInspectable = configuration.environment == .development
        webView.allowsMagnification = false
        context.coordinator.webView = webView

        model.deliverToWeb = { [weak webView] json in
            webView?.callAsyncJavaScript(
                "window.\(BridgeProtocol.webGlobal)?.dispatch(message)",
                arguments: ["message": json], in: nil, in: .page, completionHandler: nil
            )
        }

        let startURL = configuration.devServerURL ?? AppSchemeHandler.indexURL
        context.coordinator.trustedOrigin = Origin(startURL)
        Log.app.notice("loading \(startURL.absoluteString, privacy: .public)")
        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    struct Origin: Equatable {
        let scheme: String
        let host: String
        let port: Int

        init(_ url: URL) {
            scheme = url.scheme ?? ""
            host = url.host ?? ""
            port = url.port ?? 0
        }

        @MainActor
        init(_ origin: WKSecurityOrigin) {
            scheme = origin.protocol
            host = origin.host
            port = origin.port
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
        let services: AppServices
        let model: AppModel
        weak var webView: WKWebView?
        var trustedOrigin: Origin?
        private var probeStarted = false
        private var windowStateObserver: WindowStateObserver?
        private(set) lazy var windowDrag = WindowDragHandler { [weak self] frame in
            self?.isTrusted(frame) ?? false
        }

        init(services: AppServices, model: AppModel) {
            self.services = services
            self.model = model
        }

        func attach(to window: NSWindow?) {
            windowStateObserver = window.map { WindowStateObserver(window: $0, store: services.windowState) }
        }

        /// Only our own top-level document may talk to the host.
        func isTrusted(_ frame: WKFrameInfo) -> Bool {
            frame.isMainFrame && Origin(frame.securityOrigin) == trustedOrigin
        }

        // MARK: bridge

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
        ) {
            guard isTrusted(message.frameInfo) else {
                Log.bridge.error("rejected message from untrusted frame or origin")
                replyHandler(nil, "untrusted origin")
                return
            }
            guard let body = message.body as? String else {
                replyHandler(nil, "bridge messages must be JSON strings")
                return
            }
            let router = services.router
            Task { @MainActor in
                replyHandler(await router.handle(body), nil)
            }
        }

        // MARK: navigation — the web view never leaves the app's origin

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            if Origin(url) == trustedOrigin || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
                return .allow
            }
            if action.navigationType == .linkActivated, ["http", "https", "mailto"].contains(url.scheme ?? "") {
                NSWorkspace.shared.open(url)
            } else {
                Log.app.error("blocked navigation to \(url.scheme ?? "?", privacy: .public) URL")
            }
            return .cancel
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            // target=_blank / window.open → default browser, never a second web view.
            if let url = action.request.url, ["http", "https"].contains(url.scheme ?? "") {
                NSWorkspace.shared.open(url)
            }
            return nil
        }

        /// A new document replaced the page (reload, crash recovery): streams
        /// the old page started have no listener any more.
        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            services.ai.cancelAll()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            (webView as? AuraWebView)?.takeKeyboardFocus()
            if AIProbe.isEnabled, !probeStarted {
                probeStarted = true
                Task { await AIProbe.run(webView: webView) }
                return
            }
            guard DevProbe.isEnabled, !probeStarted else { return }
            probeStarted = true
            let model = model
            Task { await DevProbe.run(webView: webView, model: model) }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Log.app.error("navigation failed: \(error.localizedDescription, privacy: .public)")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            Log.app.error("load failed: \(error.localizedDescription, privacy: .public)")
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            Log.app.fault("web content process terminated; reloading")
            services.ai.cancelAll()
            webView.reload()
        }
    }
}
