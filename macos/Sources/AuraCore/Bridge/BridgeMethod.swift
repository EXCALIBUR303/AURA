// Mirrors the keys of BridgeMethods (shared/contracts/methods.ts) and
// BridgeEvents (shared/contracts/events.ts). ContractParityTests fails if
// either side adds a name the other lacks.

public enum BridgeMethod: String, CaseIterable, Sendable {
    case appGetInfo = "app.getInfo"
    case appGetWindowState = "app.getWindowState"

    case prefsGet = "prefs.get"
    case prefsUpdate = "prefs.update"

    case githubGetAuthStatus = "github.getAuthStatus"
    case githubConnect = "github.connect"
    case githubDisconnect = "github.disconnect"
    case githubRefresh = "github.refresh"
    case githubListRepositories = "github.listRepositories"
    case githubGetRepository = "github.getRepository"
    case githubListBranches = "github.listBranches"
    case githubListCommits = "github.listCommits"
    case githubListFiles = "github.listFiles"

    case projectsList = "projects.list"
    case projectsUpdate = "projects.update"
    case projectsSuggestZones = "projects.suggestZones"

    case aiListProviders = "ai.listProviders"
    case aiSaveProvider = "ai.saveProvider"
    case aiRemoveProvider = "ai.removeProvider"
    case aiRequestCredential = "ai.requestCredential"
    case aiDeleteCredential = "ai.deleteCredential"
    case aiValidateProvider = "ai.validateProvider"
    case aiPreviewContext = "ai.previewContext"
    case aiChat = "ai.chat"
    case aiCancel = "ai.cancel"
    case aiStartConversation = "ai.startConversation"
    case aiListConversations = "ai.listConversations"
    case aiGetConversation = "ai.getConversation"
    case aiSendMessage = "ai.sendMessage"
    case aiSetConversationRepository = "ai.setConversationRepository"
    case aiResetConversation = "ai.resetConversation"
    case aiEndConversation = "ai.endConversation"
    case aiRespondToApproval = "ai.respondToApproval"

    case voiceGetStatus = "voice.getStatus"
    case voiceRequestPermissions = "voice.requestPermissions"
    case voiceStartListening = "voice.startListening"
    case voiceStopListening = "voice.stopListening"
    case voiceSpeak = "voice.speak"
    case voiceStopSpeaking = "voice.stopSpeaking"

    case logWrite = "log.write"
}

public enum BridgeEventName: String, CaseIterable, Sendable {
    case appCommand = "app.command"
    case appWindowStateChanged = "app.windowStateChanged"
    case prefsChanged = "prefs.changed"
    case githubAuthChanged = "github.authChanged"
    case aiChunk = "ai.chunk"
    case aiDone = "ai.done"
    case aiError = "ai.error"
    case aiTurnState = "ai.turnState"
    case aiToolActivity = "ai.toolActivity"
    case aiApprovalRequested = "ai.approvalRequested"
    case aiConversationChanged = "ai.conversationChanged"
    case aiProvidersChanged = "ai.providersChanged"
    case voiceStatusChanged = "voice.statusChanged"
    case voiceTranscript = "voice.transcript"
    case voiceSpeechLevel = "voice.speechLevel"
}
