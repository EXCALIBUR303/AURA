@preconcurrency import AVFoundation
import Foundation

// Audio input boundary (Phase 3C-D). The live implementations are in
// SystemAudio.swift; tests drive these protocols with scripted audio.
//
// Concurrency rule found in the D0 spike: every closure that AVFoundation or
// CoreAudio calls on its own threads must be `@Sendable` (or built in a
// nonisolated function). A closure written inside @MainActor code inherits
// main-actor isolation, and Swift 6 traps when a realtime thread calls it.

/// One block of microphone audio: mono Float32 at the device's sample rate.
public struct AudioChunk: @unchecked Sendable {
    /// Owned by the chunk after creation; never mutated.
    public let buffer: AVAudioPCMBuffer
    /// Root-mean-square level (0–1 full scale).
    public let rms: Float
    /// Largest absolute sample.
    public let peak: Float

    public init(buffer: AVAudioPCMBuffer) {
        self.buffer = buffer
        (rms, peak) = Self.measure(buffer)
    }

    public var duration: Double { Double(buffer.frameLength) / buffer.format.sampleRate }

    static func measure(_ buffer: AVAudioPCMBuffer) -> (Float, Float) {
        guard let data = buffer.floatChannelData, buffer.frameLength > 0 else { return (0, 0) }
        let samples = data[0]
        var sum: Float = 0
        var peak: Float = 0
        for i in 0..<Int(buffer.frameLength) {
            let v = samples[i]
            sum += v * v
            peak = max(peak, abs(v))
        }
        return ((sum / Float(buffer.frameLength)).squareRoot(), peak)
    }

    /// A mono Float32 copy of channel 0 (input nodes may report 2–3 channels,
    /// for example a Bluetooth headset at 16 kHz/3 ch in the D0 spike).
    public static func mono(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard buffer.frameLength > 0,
              let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: buffer.format.sampleRate, channels: 1, interleaved: false),
              let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: buffer.frameLength),
              let target = out.floatChannelData?[0]
        else { return nil }
        let frames = Int(buffer.frameLength)
        if let source = buffer.floatChannelData {
            if buffer.format.isInterleaved {
                let stride = Int(buffer.format.channelCount)
                for i in 0..<frames { target[i] = source[0][i * stride] }
            } else {
                target.update(from: source[0], count: frames)
            }
        } else if let source = buffer.int16ChannelData {
            let stride = buffer.format.isInterleaved ? Int(buffer.format.channelCount) : 1
            for i in 0..<frames { target[i] = Float(source[0][i * stride]) / 32768 }
        } else {
            return nil
        }
        out.frameLength = buffer.frameLength
        return out
    }

    /// A mono chunk of `samples` (tests and prerecorded audio).
    public static func samples(_ samples: [Float], sampleRate: Double) -> AudioChunk? {
        guard !samples.isEmpty,
              let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let target = buffer.floatChannelData?[0]
        else { return nil }
        samples.withUnsafeBufferPointer { target.update(from: $0.baseAddress!, count: samples.count) }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        return AudioChunk(buffer: buffer)
    }
}

public enum AudioInputEvent: Sendable {
    case chunk(AudioChunk)
    /// The engine's configuration changed (device switched, sample rate changed); capture has stopped.
    case configurationChanged
}

/// A running microphone capture. `stop()` closes the microphone; it is idempotent.
public protocol AudioCapture: Sendable {
    var device: VoiceDevice? { get }
    var events: AsyncStream<AudioInputEvent> { get }
    func stop()
}

public protocol AudioInputSource: Sendable {
    /// Opens the default input device. Throws `VoiceAudioError` when it cannot.
    func start() async throws -> any AudioCapture
}

public enum VoiceAudioError: Error, Equatable, Sendable {
    case noInputDevice
    /// The engine failed to start (OSStatus), for example AVAudioEngine -10875 on a Bluetooth headset.
    case engineFailed(Int, transport: VoiceTransport?)
    case noOutputDevice
}

// MARK: devices

/// A change of the default input or output device, or loss of the device in use.
public struct AudioRouteChange: Equatable, Sendable {
    public enum Direction: String, Sendable { case input, output }
    public enum Kind: String, Sendable {
        /// The system default device changed.
        case defaultChanged
        /// The device that was the default disappeared (unplugged, powered off, out of range).
        case deviceLost
    }
    public var direction: Direction
    public var kind: Kind
    /// The default device after the change; nil when there is none.
    public var device: VoiceDevice?

    public init(direction: Direction, kind: Kind = .defaultChanged, device: VoiceDevice?) {
        self.direction = direction
        self.kind = kind
        self.device = device
    }
}

public protocol AudioDeviceMonitoring: Sendable {
    func currentInput() -> VoiceDevice?
    func currentOutput() -> VoiceDevice?
    /// Yields each change until the consuming task is cancelled.
    func changes() -> AsyncStream<AudioRouteChange>
}

// MARK: timing

/// Timeouts for one listening run. Device-dependent values follow the D0 spike:
/// Bluetooth headsets switch to the hands-free profile when the microphone
/// opens, which can take seconds and starts with silent buffers.
public struct VoiceTiming: Sendable {
    public struct Startup: Sendable {
        /// How long the device may take to deliver its first buffer.
        public var firstAudio: Double
        /// How long buffers may be pure digital silence (exact zeros) after the first one.
        public var silentAudio: Double
        /// A gap in buffers longer than this, once audio flowed, means the input was lost.
        public var stall: Double
        public init(firstAudio: Double, silentAudio: Double, stall: Double) {
            self.firstAudio = firstAudio
            self.silentAudio = silentAudio
            self.stall = stall
        }
    }

    public var builtIn = Startup(firstAudio: 1.5, silentAudio: 2.0, stall: 1.0)
    public var usb = Startup(firstAudio: 2.0, silentAudio: 2.5, stall: 1.5)
    public var bluetooth = Startup(firstAudio: 4.0, silentAudio: 3.5, stall: 2.0)
    public var other = Startup(firstAudio: 2.5, silentAudio: 3.0, stall: 1.5)
    /// Usable audio but no speech (energy or transcript) for this long: no_speech.
    public var noSpeech: Double = 8
    /// In auto_end mode, a pause this long after speech ends the utterance.
    public var endOfUtterance: Double = 1.2
    /// Hard cap per utterance.
    public var utteranceLimit: Double = 60
    /// Recogniser start (model load) allowance.
    public var recognizerStart: Double = 10
    /// Final transcript allowance after the microphone closes.
    public var finalize: Double = 4
    /// Watchdog period.
    public var tick: Duration = .milliseconds(100)

    public init() {}

    public func startup(for transport: VoiceTransport?) -> Startup {
        switch transport {
        case .builtIn: builtIn
        case .usb: usb
        case .bluetooth: bluetooth
        case .other, nil: other
        }
    }
}

// MARK: input health

/// Decides whether a running capture delivers usable audio. Pure: fed buffer
/// arrivals and asked at regular ticks, so it is tested without devices.
///
/// It separates three situations the D0 spike met:
/// - startup latency: no buffer yet, still within the device's allowance;
/// - no usable audio: no buffer at all past the allowance, or only exact
///   digital silence past the silence allowance (a real microphone always has
///   a noise floor far above it);
/// - lost input: buffers flowed, then stopped (device disconnected).
public struct InputHealthMonitor: Sendable {
    public enum Verdict: Equatable, Sendable {
        case waiting
        case healthy
        case notDelivering
        case silent
        case stalled
    }

    /// Below this peak a buffer counts as digital silence (about -100 dBFS).
    public static let silenceFloor: Float = 0.00001

    let startedAt: Double
    let limits: VoiceTiming.Startup
    private(set) var firstChunkAt: Double?
    private(set) var lastChunkAt: Double?
    private(set) var lastAudibleAt: Double?

    public init(startedAt: Double, limits: VoiceTiming.Startup) {
        self.startedAt = startedAt
        self.limits = limits
    }

    public mutating func observe(peak: Float, at time: Double) {
        if firstChunkAt == nil { firstChunkAt = time }
        lastChunkAt = time
        if peak > Self.silenceFloor { lastAudibleAt = time }
    }

    public var hasUsableAudio: Bool { lastAudibleAt != nil }

    public func evaluate(at now: Double) -> Verdict {
        guard let first = firstChunkAt, let last = lastChunkAt else {
            return now - startedAt > limits.firstAudio ? .notDelivering : .waiting
        }
        if now - last > limits.stall { return .stalled }
        if let audible = lastAudibleAt {
            // A device that falls to exact zeros mid-utterance was muted or cut off.
            return now - audible > limits.silentAudio ? .silent : .healthy
        }
        return now - first > limits.silentAudio ? .silent : .waiting
    }
}

// MARK: end of utterance

/// Speech activity from energy (adaptive noise floor) and transcript changes.
/// Pure and tested; used for auto_end and the no-speech timeout.
public struct SpeechActivity: Sendable {
    /// The quietest recent level, rising slowly.
    private(set) var noiseFloor: Float?
    public private(set) var lastSpeechAt: Double?
    public private(set) var speechStarted = false

    /// A level counts as speech when it is this much louder than the floor and above an absolute minimum.
    static let ratio: Float = 3
    static let minimum: Float = 0.008

    public init() {}

    public mutating func observe(rms: Float, at time: Double) {
        guard let floor = noiseFloor else { noiseFloor = rms; return }
        if rms > max(Self.minimum, floor * Self.ratio) {
            heard(at: time)
        } else {
            // Falls at once, rises slowly, and only from non-speech levels.
            noiseFloor = rms < floor ? rms : floor + (rms - floor) * 0.05
        }
    }

    /// The recogniser produced new text: someone is speaking.
    public mutating func heard(at time: Double) {
        speechStarted = true
        lastSpeechAt = max(lastSpeechAt ?? time, time)
    }

    public func pauseExceeded(_ seconds: Double, at now: Double) -> Bool {
        guard speechStarted, let last = lastSpeechAt else { return false }
        return now - last >= seconds
    }
}

/// Normalises an RMS level to 0–1 for meters (speech peaks near 0.25 RMS).
public func normalizedLevel(_ rms: Float) -> Double {
    Double(min(max(rms / 0.3, 0), 1))
}
