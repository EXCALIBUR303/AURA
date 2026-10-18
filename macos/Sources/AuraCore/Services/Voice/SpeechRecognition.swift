@preconcurrency import AVFoundation
import Foundation
@preconcurrency import Speech

// Speech-to-text boundary (Phase 3C-D). Two system engines, both on device by default:
// - SpeechAnalyzer + SpeechTranscriber (macOS 26+). D0 showed it needs only the
//   microphone permission, not speech-recognition authorization.
// - SFSpeechRecognizer (macOS 15–25 fallback), on-device only unless the user
//   opted into Apple's server recognition. Needs speech-recognition authorization.

public enum RecognitionResult: Equatable, Sendable {
    /// Tentative text for the part not yet finalised (replaces the previous volatile text).
    case volatile(String)
    /// Finalised text, appended to what was finalised before.
    case final(String)
}

/// One utterance's recognition. Feed audio, then `finish()` (results end after
/// the last final) or `cancel()` (results end at once, nothing more is final).
public protocol RecognitionSession: Sendable {
    var results: AsyncThrowingStream<RecognitionResult, Error> { get }
    func append(_ chunk: AudioChunk)
    func finish() async
    func cancel() async
}

public struct RecognitionAvailability: Equatable, Sendable {
    public var recognition: VoiceCapabilities.Recognition
    public var assets: VoiceCapabilities.Assets
    public init(recognition: VoiceCapabilities.Recognition, assets: VoiceCapabilities.Assets) {
        self.recognition = recognition
        self.assets = assets
    }
}

public enum RecognitionError: Error, Equatable, Sendable {
    /// No recogniser for the locale on this Mac (or only a server one the user did not allow).
    case unavailable(String)
    /// The on-device model must be downloaded first (voice.installRecognitionAssets).
    case assetsMissing
    case failed(String)
}

public protocol SpeechRecognitionEngine: Sendable {
    var engine: VoiceCapabilities.Engine { get }
    var requiresSpeechPermission: Bool { get }
    var liveTranscripts: Bool { get }
    func availability(locale: String, allowServer: Bool) async -> RecognitionAvailability
    /// Loads the model and returns a session ready for audio. Can run while the microphone starts.
    func start(locale: String, allowServer: Bool) async throws -> any RecognitionSession
    func installAssets(locale: String) async throws
}

/// Words the recogniser should expect in AURA (contextual strings). On the built-in
/// microphone "GitHub" was heard as "guitar" and "Githav" without them (real-audio run, §2).
public enum RecognitionVocabulary {
    public static let terms = [
        "AURA", "Astra", "GitHub", "Git", "repository", "repositories", "repo", "commit", "commits", "pull request", "pull requests",
        "branch", "merge", "rebase", "issue", "Xcode", "Swift", "SwiftUI", "TypeScript", "JavaScript", "React", "three.js", "Vite",
        "npm", "macOS", "API", "JSON", "README", "localhost", "WebKit", "Keychain", "Codex", "Claude", "workflow", "CI",
        "Studio", "Hardware", "Software", "AI Lab", "Projects", "Companion",
    ]
}

public enum SpeechRecognitionEngines {
    /// The best engine on this macOS version.
    public static func system() -> any SpeechRecognitionEngine {
        if #available(macOS 26, *) { return AnalyzerRecognitionEngine() }
        return LegacyRecognitionEngine()
    }
}

// MARK: SpeechAnalyzer (macOS 26+)

@available(macOS 26, *)
public struct AnalyzerRecognitionEngine: SpeechRecognitionEngine {
    /// Bias recognition toward RecognitionVocabulary (off only for A/B measurements).
    let useVocabulary: Bool
    public init(useVocabulary: Bool = true) { self.useVocabulary = useVocabulary }
    public var engine: VoiceCapabilities.Engine { .speechAnalyzer }
    public var requiresSpeechPermission: Bool { false }
    public var liveTranscripts: Bool { true }

    public func availability(locale: String, allowServer: Bool) async -> RecognitionAvailability {
        guard SpeechTranscriber.isAvailable,
              let supported = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: locale)) else {
            return RecognitionAvailability(recognition: .unavailable, assets: .unsupported)
        }
        let installed = await SpeechTranscriber.installedLocales
        let has = installed.contains { $0.identifier(.bcp47) == supported.identifier(.bcp47) }
        return RecognitionAvailability(recognition: .onDevice, assets: has ? .installed : .downloadable)
    }

    public func start(locale: String, allowServer: Bool) async throws -> any RecognitionSession {
        guard SpeechTranscriber.isAvailable,
              let supported = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: locale)) else {
            throw RecognitionError.unavailable("on-device speech recognition does not support \(locale)")
        }
        let transcriber = SpeechTranscriber(locale: supported, preset: .progressiveTranscription)
        let installed = await SpeechTranscriber.installedLocales
        guard installed.contains(where: { $0.identifier(.bcp47) == supported.identifier(.bcp47) }) else { throw RecognitionError.assetsMissing }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw RecognitionError.failed("no audio format for the recogniser")
        }
        let analyzer = SpeechAnalyzer(modules: [transcriber], options: .init(priority: .userInitiated, modelRetention: .lingering))
        do {
            try await analyzer.prepareToAnalyze(in: format)
        } catch {
            throw RecognitionError.failed("the recogniser could not start (\(Self.describe(error)))")
        }
        if useVocabulary {
            let context = AnalysisContext()
            context.contextualStrings[.general] = RecognitionVocabulary.terms
            do { try await analyzer.setContext(context) } catch {
                Log.voice.notice("recogniser vocabulary not applied (\(Self.describe(error), privacy: .public))")
            }
        }
        let session = AnalyzerSession(analyzer: analyzer, transcriber: transcriber, format: format)
        try await session.begin()
        return session
    }

    public func installAssets(locale: String) async throws {
        guard let supported = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: locale)) else {
            throw RecognitionError.unavailable("on-device speech recognition does not support \(locale)")
        }
        let transcriber = SpeechTranscriber(locale: supported, preset: .progressiveTranscription)
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
    }

    static func describe(_ error: any Error) -> String {
        let ns = error as NSError
        return "\(ns.domain) \(ns.code)"
    }
}

@available(macOS 26, *)
final class AnalyzerSession: RecognitionSession, @unchecked Sendable {
    let results: AsyncThrowingStream<RecognitionResult, Error>
    private let output: AsyncThrowingStream<RecognitionResult, Error>.Continuation
    private let analyzer: SpeechAnalyzer
    private let transcriber: SpeechTranscriber
    private let format: AVAudioFormat
    private let inputs: AsyncStream<AnalyzerInput>
    private let feed: AsyncStream<AnalyzerInput>.Continuation
    private let lock = NSLock()
    private var converter: AVAudioConverter?
    private var reader: Task<Void, Never>?
    private var ended = false

    init(analyzer: SpeechAnalyzer, transcriber: SpeechTranscriber, format: AVAudioFormat) {
        self.analyzer = analyzer
        self.transcriber = transcriber
        self.format = format
        (results, output) = AsyncThrowingStream<RecognitionResult, Error>.makeStream()
        (inputs, feed) = AsyncStream<AnalyzerInput>.makeStream()
    }

    func begin() async throws {
        let transcriber = transcriber, output = output
        reader = Task {
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    output.yield(result.isFinal ? .final(text) : .volatile(text))
                }
                output.finish()
            } catch {
                output.finish(throwing: RecognitionError.failed(AnalyzerRecognitionEngine.describe(error)))
            }
        }
        try await analyzer.start(inputSequence: inputs)
    }

    func append(_ chunk: AudioChunk) {
        lock.lock()
        defer { lock.unlock() }
        guard !ended else { return }
        if chunk.buffer.format != format, converter?.inputFormat != chunk.buffer.format {
            converter = AVAudioConverter(from: chunk.buffer.format, to: format)
        }
        let buffer = chunk.buffer.format == format ? chunk.buffer : converter.flatMap { Self.convert(chunk.buffer, with: $0, to: format) }
        if let buffer { feed.yield(AnalyzerInput(buffer: buffer)) }
    }

    func finish() async {
        guard markEnded() else { return }
        feed.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            output.finish(throwing: RecognitionError.failed(AnalyzerRecognitionEngine.describe(error)))
        }
        await reader?.value
    }

    func cancel() async {
        guard markEnded() else { return }
        feed.finish()
        await analyzer.cancelAndFinishNow()
        reader?.cancel()
        output.finish()
    }

    private func markEnded() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if ended { return false }
        ended = true
        return true
    }

    static func convert(_ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate).rounded(.up)) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        let delivered = OnceFlag()
        var error: NSError?
        converter.convert(to: out, error: &error) { @Sendable _, status in
            if delivered.set() { status.pointee = .haveData; return buffer }
            status.pointee = .noDataNow
            return nil
        }
        return error == nil && out.frameLength > 0 ? out : nil
    }
}

/// Thread-safe "first time only".
final class OnceFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    /// True the first time only.
    func set() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}

// MARK: SFSpeechRecognizer (macOS 15–25)

public struct LegacyRecognitionEngine: SpeechRecognitionEngine {
    public init() {}
    public var engine: VoiceCapabilities.Engine { .sfSpeechRecognizer }
    public var requiresSpeechPermission: Bool { true }
    public var liveTranscripts: Bool { true }

    public func availability(locale: String, allowServer: Bool) async -> RecognitionAvailability {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) else {
            return RecognitionAvailability(recognition: .unavailable, assets: .unsupported)
        }
        if recognizer.supportsOnDeviceRecognition { return RecognitionAvailability(recognition: .onDevice, assets: .installed) }
        return RecognitionAvailability(recognition: .serverOptIn, assets: .unsupported)
    }

    public func start(locale: String, allowServer: Bool) async throws -> any RecognitionSession {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else {
            throw RecognitionError.unavailable("speech recognition is not available for \(locale)")
        }
        guard recognizer.supportsOnDeviceRecognition || allowServer else {
            throw RecognitionError.unavailable("on-device recognition is not available for \(locale); server recognition is off")
        }
        return LegacySession(recognizer: recognizer, onDevice: recognizer.supportsOnDeviceRecognition)
    }

    public func installAssets(locale: String) async throws {
        throw RecognitionError.unavailable("this macOS version manages speech models in System Settings")
    }
}

final class LegacySession: RecognitionSession, @unchecked Sendable {
    let results: AsyncThrowingStream<RecognitionResult, Error>
    private let output: AsyncThrowingStream<RecognitionResult, Error>.Continuation
    private let request = SFSpeechAudioBufferRecognitionRequest()
    private var task: SFSpeechRecognitionTask?
    private let ended = OnceFlag()

    init(recognizer: SFSpeechRecognizer, onDevice: Bool) {
        (results, output) = AsyncThrowingStream<RecognitionResult, Error>.makeStream()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = onDevice
        request.contextualStrings = RecognitionVocabulary.terms
        let output = output
        task = recognizer.recognitionTask(with: request) { @Sendable result, error in
            if let result {
                let text = result.bestTranscription.formattedString
                if result.isFinal {
                    output.yield(.final(text))
                    output.finish()
                } else {
                    output.yield(.volatile(text))
                }
            } else if let error {
                output.finish(throwing: RecognitionError.failed("\((error as NSError).domain) \((error as NSError).code)"))
            }
        }
    }

    func append(_ chunk: AudioChunk) { request.append(chunk.buffer) }

    func finish() async {
        guard ended.set() else { return }
        request.endAudio()
    }

    func cancel() async {
        guard ended.set() else { return }
        task?.cancel()
        output.finish()
    }
}
