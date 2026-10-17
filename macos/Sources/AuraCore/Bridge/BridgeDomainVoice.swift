import Foundation

// Voice (Phase 3C-D). Mirrors the voice section of shared/contracts/domain.ts,
// the voice.* methods in methods.ts and the voice.* events in events.ts.
// Optionals encode as explicit `null` to match the TypeScript types.

public enum PermissionState: String, Codable, Sendable {
    case notDetermined = "not_determined"
    case granted, denied, restricted
}

public enum VoicePhase: String, Codable, Sendable {
    case unavailable
    case needsPermission = "needs_permission"
    case idle, starting, listening, recognizing, thinking, speaking, interrupted, error
}

public enum VoiceListenMode: String, Codable, Sendable {
    case pushToTalk = "push_to_talk"
    case autoEnd = "auto_end"
}

public enum VoiceTransport: String, Codable, Sendable {
    case builtIn = "built_in"
    case bluetooth, usb, other
}

public struct VoiceDevice: Codable, Equatable, Sendable {
    public var name: String
    public var transport: VoiceTransport
    public init(name: String, transport: VoiceTransport) {
        self.name = name
        self.transport = transport
    }
}

public enum VoiceIssueCode: String, Codable, Sendable {
    case permissionDenied = "permission_denied"
    case permissionRestricted = "permission_restricted"
    case noInputDevice = "no_input_device"
    case inputFailed = "input_failed"
    case noAudio = "no_audio"
    case inputLost = "input_lost"
    case deviceChanged = "device_changed"
    case noSpeech = "no_speech"
    case timeLimit = "time_limit"
    case recognitionUnavailable = "recognition_unavailable"
    case recognitionFailed = "recognition_failed"
    case synthesisFailed = "synthesis_failed"
    case playbackFailed = "playback_failed"
    case appInactive = "app_inactive"
    case systemSleep = "system_sleep"
    case conversationEnded = "conversation_ended"
}

public enum VoiceRecovery: String, Codable, Sendable {
    case retry
    case chooseInput = "choose_input"
    case openMicrophoneSettings = "open_microphone_settings"
    case openSpeechSettings = "open_speech_settings"
    case installSpeechAssets = "install_speech_assets"
}

public struct VoiceIssue: Codable, Equatable, Sendable {
    public var code: VoiceIssueCode
    public var message: String
    public var recovery: [VoiceRecovery]
    public var transport: VoiceTransport?

    public init(_ code: VoiceIssueCode, _ message: String, recovery: [VoiceRecovery] = [], transport: VoiceTransport? = nil) {
        self.code = code
        self.message = message
        self.recovery = recovery
        self.transport = transport
    }

    enum Keys: String, CodingKey { case code, message, recovery, transport }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(code, forKey: .code)
        try c.encode(message, forKey: .message)
        try c.encode(recovery, forKey: .recovery)
        try c.encode(transport, forKey: .transport)
    }
}

public struct VoiceStatus: Codable, Equatable, Sendable {
    public var microphone: PermissionState
    public var speechRecognition: PermissionState
    public var listening: Bool
    public var speaking: Bool
    public var phase: VoicePhase
    public var revision: Int
    public var sessionActive: Bool
    public var conversationId: String?
    public var mode: VoiceListenMode?
    public var utteranceId: String?
    public var speechId: String?
    public var speakingStreamId: String?
    public var outputMuted: Bool
    public var inputDevice: VoiceDevice?
    public var issue: VoiceIssue?

    public init(
        microphone: PermissionState, speechRecognition: PermissionState, phase: VoicePhase,
        listening: Bool = false, speaking: Bool = false, revision: Int = 0, sessionActive: Bool = false,
        conversationId: String? = nil, mode: VoiceListenMode? = nil, utteranceId: String? = nil, speechId: String? = nil,
        speakingStreamId: String? = nil, outputMuted: Bool = false, inputDevice: VoiceDevice? = nil, issue: VoiceIssue? = nil
    ) {
        self.microphone = microphone
        self.speechRecognition = speechRecognition
        self.listening = listening
        self.speaking = speaking
        self.phase = phase
        self.revision = revision
        self.sessionActive = sessionActive
        self.conversationId = conversationId
        self.mode = mode
        self.utteranceId = utteranceId
        self.speechId = speechId
        self.speakingStreamId = speakingStreamId
        self.outputMuted = outputMuted
        self.inputDevice = inputDevice
        self.issue = issue
    }

    /// Voice is not part of this build.
    public static let unavailable = VoiceStatus(microphone: .notDetermined, speechRecognition: .notDetermined, phase: .unavailable)

    /// Equal apart from the revision (used to skip no-op updates).
    func sameContent(as other: VoiceStatus) -> Bool {
        var copy = other
        copy.revision = revision
        return copy == self
    }

    enum Keys: String, CodingKey {
        case microphone, speechRecognition, listening, speaking, phase, revision, sessionActive, conversationId, mode
        case utteranceId, speechId, speakingStreamId, outputMuted, inputDevice, issue
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(microphone, forKey: .microphone)
        try c.encode(speechRecognition, forKey: .speechRecognition)
        try c.encode(listening, forKey: .listening)
        try c.encode(speaking, forKey: .speaking)
        try c.encode(phase, forKey: .phase)
        try c.encode(revision, forKey: .revision)
        try c.encode(sessionActive, forKey: .sessionActive)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(mode, forKey: .mode)
        try c.encode(utteranceId, forKey: .utteranceId)
        try c.encode(speechId, forKey: .speechId)
        try c.encode(speakingStreamId, forKey: .speakingStreamId)
        try c.encode(outputMuted, forKey: .outputMuted)
        try c.encode(inputDevice, forKey: .inputDevice)
        try c.encode(issue, forKey: .issue)
    }
}

public struct VoiceCapabilities: Codable, Equatable, Sendable {
    public enum Input: String, Codable, Sendable { case available, needsPermission = "needs_permission", unavailable }
    public enum Recognition: String, Codable, Sendable { case onDevice = "on_device", serverOptIn = "server_opt_in", unavailable }
    public enum Engine: String, Codable, Sendable { case speechAnalyzer = "speech_analyzer", sfSpeechRecognizer = "sf_speech_recognizer", none }
    public enum Assets: String, Codable, Sendable { case installed, downloadable, unsupported, unknown }

    public var input: Input
    public var recognition: Recognition
    public var engine: Engine
    public var requiresSpeechRecognitionPermission: Bool
    public var recognitionAssets: Assets
    public var locale: String
    public var liveTranscripts: Bool
    public var autoEndOfUtterance: Bool
    public var handsFreeBargeIn: Bool
    public var maxUtteranceSeconds: Double

    public init(
        input: Input, recognition: Recognition, engine: Engine, requiresSpeechRecognitionPermission: Bool,
        recognitionAssets: Assets, locale: String, liveTranscripts: Bool, autoEndOfUtterance: Bool,
        handsFreeBargeIn: Bool = false, maxUtteranceSeconds: Double
    ) {
        self.input = input
        self.recognition = recognition
        self.engine = engine
        self.requiresSpeechRecognitionPermission = requiresSpeechRecognitionPermission
        self.recognitionAssets = recognitionAssets
        self.locale = locale
        self.liveTranscripts = liveTranscripts
        self.autoEndOfUtterance = autoEndOfUtterance
        self.handsFreeBargeIn = handsFreeBargeIn
        self.maxUtteranceSeconds = maxUtteranceSeconds
    }

    public static let unavailable = VoiceCapabilities(
        input: .unavailable, recognition: .unavailable, engine: .none, requiresSpeechRecognitionPermission: false,
        recognitionAssets: .unknown, locale: "en-US", liveTranscripts: false, autoEndOfUtterance: false, maxUtteranceSeconds: 0
    )
}

public struct VoiceOption: Codable, Equatable, Sendable {
    public enum Quality: String, Codable, Sendable { case `default`, enhanced, premium }
    public var id: String
    public var name: String
    public var locale: String
    public var quality: Quality
    public init(id: String, name: String, locale: String, quality: Quality) {
        self.id = id
        self.name = name
        self.locale = locale
        self.quality = quality
    }
}

// MARK: method params

public struct SpeakParams: Codable, Sendable {
    public var text: String
    public var interrupt: Bool?
}

public struct StartVoiceSessionParams: Codable, Sendable {
    public var conversationId: String?
}

public struct StartListeningParams: Codable, Sendable {
    public var mode: VoiceListenMode?
}

public struct SpeakReplyParams: Codable, Sendable {
    public var conversationId: String
    public var streamId: String
}

public struct SetOutputMutedParams: Codable, Sendable {
    public var muted: Bool
}

public struct ListVoicesParams: Codable, Sendable {
    public var locale: String?
}

public struct OpenVoiceSettingsParams: Codable, Sendable {
    public enum Target: String, Codable, Sendable {
        case microphone
        case speechRecognition = "speech_recognition"
        case soundInput = "sound_input"
    }
    public var target: Target
}

// MARK: event payloads

public struct VoiceTranscriptPayload: Codable, Equatable, Sendable {
    public var utteranceId: String
    public var seq: Int
    public var text: String
    public var isFinal: Bool
}

public struct VoiceInputLevelPayload: Codable, Equatable, Sendable {
    public var utteranceId: String
    public var level: Double
}

public struct VoiceSpeechLevelPayload: Codable, Equatable, Sendable {
    public var level: Double
}

public struct VoiceSpeechProgressPayload: Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case started, finished }
    public var speechId: String
    public var streamId: String?
    public var segment: Int
    public var text: String
    public var state: State

    enum Keys: String, CodingKey { case speechId, streamId, segment, text, state }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(speechId, forKey: .speechId)
        try c.encode(streamId, forKey: .streamId)
        try c.encode(segment, forKey: .segment)
        try c.encode(text, forKey: .text)
        try c.encode(state, forKey: .state)
    }
}
