import AppKit
import AuraCore
import WebKit

/// WKWebView that can turn the current press into a native window drag.
///
/// AppKit only starts a window drag from inside the dispatch of a live mouse
/// event, but the page decides asynchronously whether a press landed on a drag
/// region. So a request from the page arms the press, and the next
/// mouse-dragged event of that same press starts the drag.
final class AuraWebView: WKWebView {
    private var pressNumber: Int?
    private var armedPressNumber: Int?

    override func mouseDown(with event: NSEvent) {
        pressNumber = event.eventNumber
        armedPressNumber = nil
        super.mouseDown(with: event)
    }

    override func mouseDragged(with event: NSEvent) {
        if let armed = armedPressNumber, armed == pressNumber, let window {
            armedPressNumber = nil
            window.performDrag(with: event)
            return
        }
        super.mouseDragged(with: event)
    }

    /// Gives the page keyboard focus unless something inside it already has
    /// it. At launch the window (not the page) is first responder, so Tab and
    /// typing would reach the studio only after a click.
    func takeKeyboardFocus() {
        guard let window else { return }
        if let responder = window.firstResponder as? NSView, responder === self || responder.isDescendant(of: self) { return }
        window.makeFirstResponder(self)
    }

    override func mouseUp(with event: NSEvent) {
        armedPressNumber = nil
        super.mouseUp(with: event)
    }

    /// Arms the press in progress, if the primary button is still held.
    fileprivate func armWindowDrag() {
        guard let pressNumber, NSEvent.pressedMouseButtons & 1 != 0 else { return }
        armedPressNumber = pressNumber
    }
}

/// Native window dragging for the hidden title bar.
///
/// The frontend marks empty title-bar areas with `data-aura-drag-region`
/// (docs/PHASE2_CODEX_HANDOFF.md § D). A script in an isolated content world
/// (invisible to page scripts, which cannot call its handler) reports a plain
/// primary-button press on such an area that is not inside an interactive
/// element. The host arms that press, and its next mouse-dragged event goes to
/// `NSWindow.performDrag(with:)`, so AppKit runs its standard window drag
/// (snapping, tiling, Spaces) itself. No global event monitors are involved.
@MainActor
final class WindowDragHandler: NSObject, WKScriptMessageHandler {
    static let world = WKContentWorld.world(name: "aura-window")
    static let handlerName = "auraWindow"

    static let script = """
    (() => {
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(handlerName);
      if (!handler) return;
      const interactive = 'a[href],button,input,textarea,select,label,summary,canvas,[contenteditable]:not([contenteditable="false"]),' +
        '[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="slider"],[tabindex]:not([tabindex="-1"])';
      window.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || !target.closest('[data-aura-drag-region]') || target.closest(interactive)) return;
        handler.postMessage({ action: event.detail >= 2 ? 'doubleClick' : 'drag' });
      }, true);
    })();
    """

    private let isTrusted: @MainActor (WKFrameInfo) -> Bool

    init(isTrusted: @escaping @MainActor (WKFrameInfo) -> Bool) {
        self.isTrusted = isTrusted
    }

    func install(in controller: WKUserContentController) {
        controller.addUserScript(WKUserScript(source: Self.script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: Self.world))
        controller.add(self, contentWorld: Self.world, name: Self.handlerName)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, isTrusted(message.frameInfo),
              let webView = message.webView as? AuraWebView, let window = webView.window,
              let action = (message.body as? [String: Any])?["action"] as? String
        else { return }
        switch action {
        case "drag": webView.armWindowDrag()
        case "doubleClick": Self.performTitleBarDoubleClick(window)
        default: Log.app.error("unknown window action \(action, privacy: .public)")
        }
    }

    /// Honours System Settings › Desktop & Dock › "Double-click a window's title bar to".
    static func performTitleBarDoubleClick(_ window: NSWindow) {
        guard !window.styleMask.contains(.fullScreen) else { return }
        let defaults = UserDefaults.standard
        switch defaults.string(forKey: "AppleActionOnDoubleClick") {
        case "Minimize": window.performMiniaturize(nil)
        case "None": break
        case nil where defaults.bool(forKey: "AppleMiniaturizeOnDoubleClick"): window.performMiniaturize(nil)
        default: window.performZoom(nil)
        }
    }
}
