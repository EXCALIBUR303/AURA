import AppKit
import AuraCore

/// The only place an AI provider API key is typed: a native sheet with a
/// secure field. The key goes from here to the Keychain (AIProviderRegistry);
/// the web view never sees it, and the sheet says where it will be sent.
@MainActor
enum CredentialPrompt {
    /// Re-asks (with the reason) until the key has a valid shape, or the user cancels.
    static func ask(_ request: AICredentialPromptRequest) async -> String? {
        var problem: String?
        while let key = await askOnce(request, problem: problem) {
            do { return try AICredentialStore.normalized(key) } catch { problem = BridgeError(error).message }
        }
        return nil
    }

    private static func askOnce(_ request: AICredentialPromptRequest, problem: String?) async -> String? {
        let alert = NSAlert()
        alert.messageText = "API key for \(request.providerName)"
        alert.informativeText = (problem.map { "\($0)\n\n" } ?? "") + """
            AURA keeps the key in your login Keychain on this Mac and sends it only to \(request.destination). \
            The studio's web interface never sees it.
            """
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.placeholderString = "Paste the API key"
        alert.accessoryView = field
        alert.addButton(withTitle: "Save to Keychain")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field

        let response: NSApplication.ModalResponse
        if let window = NSApp.keyWindow ?? NSApp.mainWindow {
            response = await alert.beginSheetModal(for: window)
        } else {
            response = alert.runModal()
        }
        let key = field.stringValue
        field.stringValue = ""
        guard response == .alertFirstButtonReturn, !key.isEmpty else { return nil }
        return key
    }
}
