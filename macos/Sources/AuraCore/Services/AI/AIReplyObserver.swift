import Foundation

/// Native-only view of conversation replies, for voice (Phase 3C-D). It sees
/// exactly what the page sees (the same flushed text, state changes and ends)
/// and cannot change anything: AIService calls it after emitting each event.
@MainActor
public protocol AIReplyObserver: AnyObject {
    func replyStarted(streamId: String, conversationId: String)
    func replyText(streamId: String, delta: String)
    func replyState(streamId: String, state: AITurnState)
    /// `.error` for failed replies.
    func replyEnded(streamId: String, reason: FinishReason)
    func conversationChanged(conversationId: String, reason: AIConversationChangeReason)
}
