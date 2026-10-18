@preconcurrency import AVFoundation
import AuraCore
import Foundation
import os

/// Deterministic voice engines for in-app validation without audio hardware
/// (`AURA_DEV_VOICE_PROBE=<scenario>`, development only). Recognition and
/// synthesis are the real on-device engines; the microphone is replaced by
/// prerecorded (synthesized) speech fed in real time, playback is silent but
/// timed and metered from the rendered audio, permissions and devices are
/// scripted. Nothing opens the microphone or plays sound.
enum VoiceFixture {
    static let log = Logger(subsystem: Log.subsystem, category: "voice-probe")
    /// What the fixture microphone "says".
    static let sentence = "Astra, show me the latest commits in the AURA repository."

    enum Scenario: String {
        case flow, noAudio = "no_audio", silent, lost, inputFailed = "input_failed", denied, notDetermined = "not_determined"
        case model, deviceChange = "device_change", reducedMotion = "reduced_motion", interruptions, manual
    }

    static func engines(_ scenario: Scenario, openSettings: @escaping @MainActor @Sendable (OpenVoiceSettingsParams.Target) -> Bool) -> VoiceEngines {
        let devices = FixtureDevices()
        let recognition: any SpeechRecognitionEngine
        if #available(macOS 26, *) {
            recognition = scenario == .model ? ModelFixtureRecognition(base: AnalyzerRecognitionEngine()) : AnalyzerRecognitionEngine()
        } else {
            recognition = SpeechRecognitionEngines.system()
        }
        var timing = VoiceTiming()
        timing.noSpeech = 6
        return VoiceEngines(
            permissions: FixturePermissions(scenario), input: FixtureAudioInput(scenario, devices: devices), devices: devices,
            recognition: recognition, synthesis: SystemSpeechSynthesis(), playback: SilentPlayback(), timing: timing,
            openSettings: { target in
                log.notice("fixture: openSettings(\(target.rawValue, privacy: .public)) — System Settings not opened in probe mode")
                return true
            }
        )
    }
}

final class FixturePermissions: VoicePermissions, @unchecked Sendable {
    private let lock = NSLock()
    private var microphone: PermissionState
    init(_ scenario: VoiceFixture.Scenario) {
        microphone = scenario == .denied ? .denied : scenario == .notDetermined ? .notDetermined : .granted
    }
    func status() -> VoicePermissionStatus { (lock.withLock { microphone }, .notDetermined) }
    func request(speechRecognition: Bool) async -> VoicePermissionStatus {
        lock.withLock { if microphone == .notDetermined { microphone = .granted } } // simulated "Allow"
        VoiceFixture.log.notice("fixture: permission prompt simulated")
        return status()
    }
}

final class FixtureDevices: AudioDeviceMonitoring, @unchecked Sendable {
    let stream: AsyncStream<AudioRouteChange>
    let continuation: AsyncStream<AudioRouteChange>.Continuation
    init() { (stream, continuation) = AsyncStream<AudioRouteChange>.makeStream() }
    func currentInput() -> VoiceDevice? { VoiceDevice(name: "Fixture microphone (no hardware)", transport: .builtIn) }
    func currentOutput() -> VoiceDevice? { VoiceDevice(name: "Fixture speaker (silent)", transport: .builtIn) }
    func changes() -> AsyncStream<AudioRouteChange> { stream }
}

/// Prerecorded speech as microphone chunks (rendered once per process).
actor FixtureRecording {
    static let shared = FixtureRecording()
    private var chunks: [AudioChunk]?

    func speech() async -> [AudioChunk] {
        if let chunks { return chunks }
        var out: [AudioChunk] = []
        if let speech = try? await SystemSpeechSynthesis().render(VoiceFixture.sentence, voice: SpeechVoiceRequest(locale: "en-US", voiceId: nil, rate: 1)) {
            // Re-chunk into ~100 ms blocks like a microphone tap.
            var samples: [Float] = []
            for buffer in speech.buffers { if let data = buffer.floatChannelData { samples += UnsafeBufferPointer(start: data[0], count: Int(buffer.frameLength)) } }
            let rate = speech.format?.sampleRate ?? 22_050
            let size = Int(rate / 10)
            var index = 0
            while index < samples.count {
                if let chunk = AudioChunk.samples(Array(samples[index..<min(index + size, samples.count)]), sampleRate: rate) { out.append(chunk) }
                index += size
            }
        }
        chunks = out
        return out
    }
}

struct FixtureAudioInput: AudioInputSource {
    let scenario: VoiceFixture.Scenario
    let devices: FixtureDevices
    init(_ scenario: VoiceFixture.Scenario, devices: FixtureDevices) {
        self.scenario = scenario
        self.devices = devices
    }

    func start() async throws -> any AudioCapture {
        if scenario == .inputFailed { throw VoiceAudioError.engineFailed(-10875, transport: .bluetooth) }
        let speech = await FixtureRecording.shared.speech()
        return FixtureCapture(scenario: scenario, speech: speech, devices: devices)
    }
}

final class FixtureCapture: AudioCapture, @unchecked Sendable {
    let device: VoiceDevice? = VoiceDevice(name: "Fixture microphone (no hardware)", transport: .builtIn)
    let events: AsyncStream<AudioInputEvent>
    private let continuation: AsyncStream<AudioInputEvent>.Continuation
    private var feeder: Task<Void, Never>?

    init(scenario: VoiceFixture.Scenario, speech: [AudioChunk], devices: FixtureDevices) {
        (events, continuation) = AsyncStream<AudioInputEvent>.makeStream()
        let continuation = continuation
        VoiceFixture.log.notice("fixture: capture opened (\(scenario.rawValue, privacy: .public)) — no microphone")
        feeder = Task.detached {
            func noise(_ amplitude: Float) -> AudioChunk? {
                AudioChunk.samples((0..<2205).map { _ in Float.random(in: -amplitude...amplitude) }, sampleRate: 22_050)
            }
            func pause(_ chunk: AudioChunk?) async {
                try? await Task.sleep(for: .milliseconds(Int((chunk?.duration ?? 0.1) * 1000)))
            }
            switch scenario {
            case .noAudio:
                return // never delivers
            case .silent:
                while !Task.isCancelled { let c = AudioChunk.samples([Float](repeating: 0, count: 2205), sampleRate: 22_050); if let c { continuation.yield(.chunk(c)) }; await pause(c) }
                return
            default: break
            }
            for _ in 0..<3 { let c = noise(0.002); if let c { continuation.yield(.chunk(c)) }; await pause(c) }
            for (index, chunk) in speech.enumerated() {
                guard !Task.isCancelled else { return }
                if scenario == .lost, index == speech.count / 2 { return } // buffers stop: lost input
                if scenario == .deviceChange, index == speech.count / 2 {
                    devices.continuation.yield(AudioRouteChange(direction: .input, device: VoiceDevice(name: "Fixture USB microphone", transport: .usb)))
                }
                continuation.yield(.chunk(chunk))
                await pause(chunk)
            }
            // Room tone afterwards so auto end can hear the pause.
            while !Task.isCancelled { let c = noise(0.002); if let c { continuation.yield(.chunk(c)) }; await pause(c) }
        }
    }

    func stop() {
        feeder?.cancel()
        continuation.finish()
    }
}

/// Plays nothing; reports start, ~30 Hz levels from the envelope and completion in real time.
final class SilentPlayback: AudioPlayback, @unchecked Sendable {
    private let lock = NSLock()
    private var paused = false
    private var isPaused: Bool { lock.withLock { paused } }
    func pause() { lock.withLock { paused = true } }
    func resume() { lock.withLock { paused = false } }
    func play(_ speech: SynthesizedSpeech) -> AsyncThrowingStream<PlaybackEvent, Error> {
        AsyncThrowingStream { continuation in
            let envelope = speech.envelope
            let task = Task.detached { [weak self] in
                continuation.yield(.started)
                for level in envelope {
                    while self?.isPaused == true, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(33)) }
                    if Task.isCancelled { return }
                    continuation.yield(.level(level))
                    try? await Task.sleep(for: .milliseconds(33))
                }
                continuation.yield(.level(0))
                continuation.yield(.finished)
                continuation.finish()
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }
    func release() { lock.withLock { paused = false } }
}

/// Missing-model scenario: the first start reports the model missing until "installed".
@available(macOS 26, *)
final class ModelFixtureRecognition: SpeechRecognitionEngine, @unchecked Sendable {
    let base: AnalyzerRecognitionEngine
    private let lock = NSLock()
    private var installed = false
    init(base: AnalyzerRecognitionEngine) { self.base = base }
    var engine: VoiceCapabilities.Engine { base.engine }
    var requiresSpeechPermission: Bool { false }
    var liveTranscripts: Bool { true }
    func availability(locale: String, allowServer: Bool) async -> RecognitionAvailability {
        lock.withLock { installed } ? await base.availability(locale: locale, allowServer: allowServer) : RecognitionAvailability(recognition: .onDevice, assets: .downloadable)
    }
    func start(locale: String, allowServer: Bool) async throws -> any RecognitionSession {
        guard lock.withLock({ installed }) else { throw RecognitionError.assetsMissing }
        return try await base.start(locale: locale, allowServer: allowServer)
    }
    func installAssets(locale: String) async throws {
        try? await Task.sleep(for: .milliseconds(500))
        lock.withLock { installed = true }
        VoiceFixture.log.notice("fixture: speech model install simulated (no download)")
    }
}
