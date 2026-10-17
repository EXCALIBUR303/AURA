@preconcurrency import AVFoundation
import Foundation

// Text-to-speech boundary (Phase 3C-D): synthesis renders a sentence to audio
// buffers, playback plays them and reports levels. AVSpeechSynthesizer.write
// was verified in the sandboxed app in D0 (22.05 kHz mono Float32, ~300 ms
// per warm sentence, ~800 ms for the first one in a process).

/// One rendered sentence and its level envelope.
public struct SynthesizedSpeech: @unchecked Sendable {
    public let buffers: [AVAudioPCMBuffer]
    /// Normalised 0–1 levels, one per `envelopeInterval` seconds of audio.
    public let envelope: [Double]
    public static let envelopeInterval = 1.0 / 30

    public init(buffers: [AVAudioPCMBuffer]) {
        self.buffers = buffers
        envelope = Self.envelope(of: buffers)
    }

    public var format: AVAudioFormat? { buffers.first?.format }
    public var duration: Double {
        guard let rate = format?.sampleRate, rate > 0 else { return 0 }
        return Double(buffers.reduce(0) { $0 + Int($1.frameLength) }) / rate
    }

    /// RMS per 1/30 s window across all buffers (D0: a mixer tap only reaches ~10 Hz,
    /// too slow for lip sync, so levels come from the rendered audio itself).
    static func envelope(of buffers: [AVAudioPCMBuffer]) -> [Double] {
        guard let rate = buffers.first?.format.sampleRate, rate > 0 else { return [] }
        let window = max(Int(rate * envelopeInterval), 1)
        var levels: [Double] = []
        var sum: Float = 0
        var count = 0
        for buffer in buffers {
            guard let data = buffer.floatChannelData else { continue }
            let samples = data[0]
            for i in 0..<Int(buffer.frameLength) {
                sum += samples[i] * samples[i]
                count += 1
                if count == window {
                    levels.append(normalizedLevel((sum / Float(count)).squareRoot()))
                    sum = 0
                    count = 0
                }
            }
        }
        if count > 0 { levels.append(normalizedLevel((sum / Float(count)).squareRoot())) }
        return levels
    }
}

public struct SpeechVoiceRequest: Equatable, Sendable {
    public var locale: String
    public var voiceId: String?
    /// Multiplier on the default rate, 0.8–1.2.
    public var rate: Double
    public init(locale: String, voiceId: String?, rate: Double) {
        self.locale = locale
        self.voiceId = voiceId
        self.rate = rate
    }
}

public enum SpeechSynthesisError: Error, Equatable, Sendable {
    case noAudio
    case failed(String)
}

public protocol SpeechSynthesisEngine: Sendable {
    func render(_ text: String, voice: SpeechVoiceRequest) async throws -> SynthesizedSpeech
    func voices(locale: String) -> [VoiceOption]
}

public struct SystemSpeechSynthesis: SpeechSynthesisEngine {
    public init() {}

    public func render(_ text: String, voice request: SpeechVoiceRequest) async throws -> SynthesizedSpeech {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.voice(for: request)
        utterance.rate = Float(Double(AVSpeechUtteranceDefaultSpeechRate) * request.rate)
        // A synthesizer per sentence keeps concurrent renders independent; D0 showed
        // warm renders stay ~300 ms with fresh instances (the cost is per process).
        let synthesizer = AVSpeechSynthesizer()
        let collector = BufferCollector()
        let buffers: [AVAudioPCMBuffer] = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (done: CheckedContinuation<[AVAudioPCMBuffer], Error>) in
                collector.attach(done)
                synthesizer.write(utterance) { @Sendable buffer in collector.receive(buffer) }
            }
        } onCancel: {
            collector.cancel()
        }
        withExtendedLifetime(synthesizer) {}
        guard !buffers.isEmpty else { throw SpeechSynthesisError.noAudio }
        return SynthesizedSpeech(buffers: buffers)
    }

    public func voices(locale: String) -> [VoiceOption] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == locale }
            .map { VoiceOption(id: $0.identifier, name: $0.name, locale: $0.language, quality: Self.quality($0.quality)) }
            .sorted { Self.rank($0.quality) == Self.rank($1.quality) ? $0.name < $1.name : Self.rank($0.quality) > Self.rank($1.quality) }
    }

    static func voice(for request: SpeechVoiceRequest) -> AVSpeechSynthesisVoice? {
        if let id = request.voiceId, let voice = AVSpeechSynthesisVoice(identifier: id) { return voice }
        let candidates = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == request.locale }
        return candidates.max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: request.locale)
    }

    static func quality(_ quality: AVSpeechSynthesisVoiceQuality) -> VoiceOption.Quality {
        switch quality {
        case .premium: .premium
        case .enhanced: .enhanced
        default: .default
        }
    }

    static func rank(_ quality: VoiceOption.Quality) -> Int {
        switch quality {
        case .premium: 2
        case .enhanced: 1
        case .default: 0
        }
    }
}

/// Collects AVSpeechSynthesizer.write buffers (called on the synthesizer's thread).
final class BufferCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var buffers: [AVAudioPCMBuffer] = []
    private var continuation: CheckedContinuation<[AVAudioPCMBuffer], Error>?
    private var finished = false

    func attach(_ continuation: CheckedContinuation<[AVAudioPCMBuffer], Error>) {
        lock.lock()
        defer { lock.unlock() }
        if finished { continuation.resume(throwing: CancellationError()) } else { self.continuation = continuation }
    }

    func receive(_ buffer: AVAudioBuffer) {
        lock.lock()
        defer { lock.unlock() }
        guard !finished else { return }
        guard let pcm = buffer as? AVAudioPCMBuffer, pcm.frameLength > 0 else {
            // An empty buffer marks the end of the utterance.
            finished = true
            continuation?.resume(returning: buffers)
            continuation = nil
            return
        }
        if pcm.format.commonFormat == .pcmFormatFloat32 {
            buffers.append(pcm)
        } else if let converted = Self.float32(pcm) {
            buffers.append(converted)
        }
    }

    func cancel() {
        lock.lock()
        defer { lock.unlock() }
        guard !finished else { return }
        finished = true
        continuation?.resume(throwing: CancellationError())
        continuation = nil
    }

    static func float32(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        AudioChunk.mono(buffer)
    }
}

// MARK: playback

public enum PlaybackEvent: Equatable, Sendable {
    case started
    /// Normalised output level at the current playback position (~30 Hz).
    case level(Double)
    case finished
}

public enum PlaybackError: Error, Equatable, Sendable {
    /// The output device changed or went away during playback.
    case deviceChanged
    case failed(Int)
}

public protocol AudioPlayback: Sendable {
    /// Plays one sentence. Cancelling the consuming task stops it at once.
    func play(_ speech: SynthesizedSpeech) -> AsyncThrowingStream<PlaybackEvent, Error>
    /// Stops playback and releases the output engine (idle: no audio running).
    func release()
}

/// AVAudioEngine + player node. The engine stays up between the sentences of
/// one speech and is released afterwards. No input node is touched, so
/// playback never opens the microphone.
public final class EnginePlayback: AudioPlayback, @unchecked Sendable {
    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var format: AVAudioFormat?
    private var configurationObserver: NSObjectProtocol?
    private var onConfigurationChange: (@Sendable () -> Void)?

    public init() {}

    public func play(_ speech: SynthesizedSpeech) -> AsyncThrowingStream<PlaybackEvent, Error> {
        AsyncThrowingStream { continuation in
            guard let format = speech.format, !speech.buffers.isEmpty else {
                continuation.yield(.finished)
                continuation.finish()
                return
            }
            let player: AVAudioPlayerNode
            do {
                player = try prepare(format: format) { continuation.finish(throwing: PlaybackError.deviceChanged) }
            } catch {
                continuation.finish(throwing: PlaybackError.failed((error as NSError).code))
                return
            }
            let done = OnceFlag()
            let sampleRate = format.sampleRate
            let envelope = speech.envelope
            for (index, buffer) in speech.buffers.enumerated() {
                if index == speech.buffers.count - 1 {
                    player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { @Sendable _ in
                        guard done.set() else { return }
                        continuation.yield(.level(0))
                        continuation.yield(.finished)
                        continuation.finish()
                    }
                } else {
                    player.scheduleBuffer(buffer, completionHandler: nil)
                }
            }
            player.play()
            continuation.yield(.started)
            let meter = Task.detached {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(33))
                    guard let renderTime = player.lastRenderTime, let time = player.playerTime(forNodeTime: renderTime) else { continue }
                    let index = Int(Double(time.sampleTime) / sampleRate / SynthesizedSpeech.envelopeInterval)
                    if index >= 0, index < envelope.count { continuation.yield(.level(envelope[index])) }
                }
            }
            continuation.onTermination = { @Sendable _ in
                meter.cancel()
                if done.set() { player.stop() }
            }
        }
    }

    /// Returns a player connected for `format`, starting the engine if needed.
    private func prepare(format: AVAudioFormat, onChange: @escaping @Sendable () -> Void) throws -> AVAudioPlayerNode {
        lock.lock()
        defer { lock.unlock() }
        onConfigurationChange = onChange
        if let engine, let player, self.format == format, engine.isRunning { return player }
        tearDownLocked()
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        configurationObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { @Sendable [weak self] _ in
            self?.configurationChanged()
        }
        engine.prepare()
        try engine.start()
        self.engine = engine
        self.player = player
        self.format = format
        return player
    }

    private func configurationChanged() {
        lock.lock()
        let notify = onConfigurationChange
        tearDownLocked()
        lock.unlock()
        notify?()
    }

    public func release() {
        lock.lock()
        defer { lock.unlock() }
        tearDownLocked()
    }

    private func tearDownLocked() {
        if let configurationObserver { NotificationCenter.default.removeObserver(configurationObserver) }
        configurationObserver = nil
        onConfigurationChange = nil
        player?.stop()
        engine?.stop()
        engine = nil
        player = nil
        format = nil
    }
}
