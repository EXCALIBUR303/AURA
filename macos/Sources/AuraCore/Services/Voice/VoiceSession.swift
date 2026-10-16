import AVFoundation
import Foundation
import Speech

// Voice foundation (Phase 3A). The session below owns the voice lifecycle:
// permissions, listening, speaking, barge-in and interruptions. Speech
// recognition and synthesis sit behind SpeechInput / SpeechOutput so the
// lifecycle is testable without audio; the SFSpeechRecognizer and
// AVSpeechSynthesizer implementations land in Phase 3C. Until then the bridge
// keeps UnavailableVoiceService, and this session is not wired in.

public typealias VoicePermissionStatus = (microphone: PermissionState, speechRecognition: PermissionState)

public protocol VoicePermissions: Sendable {
    /// Current authorization. Never prompts.
    func status() -> VoicePermissionStatus
    /// Prompts for anything still undetermined, then reports the result.
    func request() async -> VoicePermissionStatus
}

/// Microphone (AVCaptureDevice) and speech recognition (SFSpeechRecognizer).
/// macOS terminates a process that requests either without a usage string in
/// its Info.plist, so `request` refuses to prompt outside the AURA.app bundle
/// (for example under `swift run`) and reports the current status instead.
public struct SystemVoicePermissions: VoicePermissions {
    public init() {}

    public func status() -> VoicePermissionStatus {
        (Self.state(AVCaptureDevice.authorizationStatus(for: .audio)), Self.state(SFSpeechRecognizer.authorizationStatus()))
    }

    public func request() async -> VoicePermissionStatus {
        let info = Bundle.main.infoDictionary ?? [:]
        guard info["NSMicrophoneUsageDescription"] != nil, info["NSSpeechRecognitionUsageDescription"] != nil else {
            Log.voice.error("voice permission request skipped: no usage descriptions in this bundle")
            return status()
        }
        if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .audio)
        }
        if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                SFSpeechRecognizer.requestAuthorization { _ in done.resume() }
            }
        }
        return status()
    }

    static func state(_ status: AVAuthorizationStatus) -> PermissionState {
        switch status {
        case .authorized: .granted
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
    }

    static func state(_ status: SFSpeechRecognizerAuthorizationStatus) -> PermissionState {
        switch status {
        case .authorized: .granted
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
    }
}

public struct Transcript: Equatable, Sendable {
    public var text: String
    public var isFinal: Bool
    public init(text: String, isFinal: Bool) {
        self.text = text
        self.isFinal = isFinal
    }
}

public protocol SpeechInput: Sendable {
    /// Recognizes speech until the consuming task is cancelled, a final
    /// transcript arrives, or recognition fails.
    func transcripts(locale: String) -> AsyncThrowingStream<Transcript, Error>
}

public protocol SpeechOutput: Sendable {
    /// Speaks `text`, yielding normalized output levels (0-1, at most ~30 Hz)
    /// and finishing when done. Cancelling the consuming task stops speech.
    func speak(_ text: String, voiceId: String?, locale: String) -> AsyncThrowingStream<Double, Error>
}

/// Why a session stopped without being asked to.
public enum VoiceInterruption: Sendable {
    /// AURA lost focus or its window was hidden: stop listening (privacy) and speaking.
    case appInactive
    /// The audio device changed or another app took the audio session.
    case audioRouteChanged
}

/// One voice session: at most one of listening / speaking at a time.
/// Starting to listen while speaking stops the speech first (barge-in), and
/// speaking while listening stops listening, so AURA never hears itself.
@MainActor
public final class VoiceSession {
    public private(set) var status: VoiceStatus {
        didSet { if status != oldValue { onStatus?(status) } }
    }
    public var onStatus: (@MainActor (VoiceStatus) -> Void)?
    public var onTranscript: (@MainActor (Transcript) -> Void)?
    public var onSpeechLevel: (@MainActor (Double) -> Void)?
    public var onError: (@MainActor (BridgeError) -> Void)?

    private let permissions: any VoicePermissions
    private let input: any SpeechInput
    private let output: any SpeechOutput
    private let locale: String
    private var listening: Task<Void, Never>?
    private var speaking: Task<Void, Never>?
    // Each run gets a generation so a cancelled run finishing late cannot
    // update the state of the run that replaced it.
    private var listeningGeneration = 0
    private var speakingGeneration = 0

    public init(permissions: any VoicePermissions, input: any SpeechInput, output: any SpeechOutput, locale: String) {
        self.permissions = permissions
        self.input = input
        self.output = output
        self.locale = locale
        let current = permissions.status()
        status = VoiceStatus(microphone: current.microphone, speechRecognition: current.speechRecognition, listening: false, speaking: false)
    }

    @discardableResult
    public func requestPermissions() async -> VoiceStatus {
        let granted = await permissions.request()
        status.microphone = granted.microphone
        status.speechRecognition = granted.speechRecognition
        return status
    }

    @discardableResult
    public func startListening() throws -> VoiceStatus {
        guard status.microphone == .granted, status.speechRecognition == .granted else {
            throw AuraError.permissionDenied("microphone and speech recognition access are required")
        }
        stopSpeaking()
        listening?.cancel()
        listeningGeneration += 1
        let generation = listeningGeneration
        let stream = input.transcripts(locale: locale)
        listening = Task { [weak self] in
            do {
                for try await transcript in stream {
                    self?.onTranscript?(transcript)
                }
            } catch is CancellationError {
            } catch {
                self?.onError?(BridgeError(error))
            }
            self?.finishListening(generation)
        }
        status.listening = true
        return status
    }

    @discardableResult
    public func stopListening() -> VoiceStatus {
        listening?.cancel()
        listening = nil
        status.listening = false
        return status
    }

    /// Speaks `text`. With `interrupt: false`, fails while already speaking.
    public func speak(_ text: String, voiceId: String? = nil, interrupt: Bool = true) throws {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw AuraError.invalidRequest("nothing to speak") }
        if status.speaking, !interrupt { throw AuraError.invalidRequest("already speaking") }
        stopListening()
        speaking?.cancel()
        speakingGeneration += 1
        let generation = speakingGeneration
        let stream = output.speak(text, voiceId: voiceId, locale: locale)
        speaking = Task { [weak self] in
            do {
                for try await level in stream {
                    self?.onSpeechLevel?(level)
                }
            } catch is CancellationError {
            } catch {
                self?.onError?(BridgeError(error))
            }
            self?.finishSpeaking(generation)
        }
        status.speaking = true
    }

    public func stopSpeaking() {
        guard speaking != nil else { return }
        speaking?.cancel()
        speaking = nil
        status.speaking = false
        onSpeechLevel?(0)
    }

    /// Stops everything after a system interruption.
    public func handle(_ interruption: VoiceInterruption) {
        Log.voice.notice("voice interrupted (\(String(describing: interruption), privacy: .public))")
        stopListening()
        stopSpeaking()
    }

    /// Waits for in-flight listening/speaking tasks (tests).
    public func settle() async {
        await listening?.value
        await speaking?.value
    }

    private func finishListening(_ generation: Int) {
        guard generation == listeningGeneration, listening != nil else { return }
        listening = nil
        status.listening = false
    }

    private func finishSpeaking(_ generation: Int) {
        guard generation == speakingGeneration, speaking != nil else { return }
        speaking = nil
        status.speaking = false
        onSpeechLevel?(0)
    }
}
