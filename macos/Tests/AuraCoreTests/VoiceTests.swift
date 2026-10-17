@preconcurrency import AVFoundation
import Foundation
import Speech
import Testing
@testable import AuraCore

// Phase 3C-D voice. Routine tests use scripted audio, recognition, synthesis
// and playback: no microphone, no speakers, no network. One suite at the end
// feeds prerecorded (synthesized) speech through the real on-device recogniser
// when this Mac has it; it never opens a microphone.

// MARK: fakes

final class FakeVoicePermissions: VoicePermissions, @unchecked Sendable {
    var current: VoicePermissionStatus = (.notDetermined, .notDetermined)
    var afterRequest: VoicePermissionStatus = (.granted, .notDetermined)
    private(set) var requests: [Bool] = []
    func status() -> VoicePermissionStatus { current }
    func request(speechRecognition: Bool) async -> VoicePermissionStatus {
        requests.append(speechRecognition)
        current = afterRequest
        return current
    }
}

final class FakeCapture: AudioCapture, @unchecked Sendable {
    let device: VoiceDevice?
    let events: AsyncStream<AudioInputEvent>
    private let continuation: AsyncStream<AudioInputEvent>.Continuation
    private let lock = NSLock()
    private var _stopped = false
    var stopped: Bool { lock.withLock { _stopped } }

    init(device: VoiceDevice?) {
        self.device = device
        (events, continuation) = AsyncStream<AudioInputEvent>.makeStream()
    }

    func stop() {
        lock.withLock { _stopped = true }
        continuation.finish()
    }

    /// 0.1 s of a 220 Hz tone at `amplitude` (0: digital silence).
    func send(amplitude: Float, seconds: Double = 0.1, sampleRate: Double = 16_000) {
        let count = Int(seconds * sampleRate)
        let samples = (0..<count).map { amplitude * sin(Float($0) * 2 * .pi * 220 / Float(sampleRate)) }
        if let chunk = AudioChunk.samples(samples, sampleRate: sampleRate) { continuation.yield(.chunk(chunk)) }
    }

    func send(_ chunk: AudioChunk) { continuation.yield(.chunk(chunk)) }
    func configurationChanged() { continuation.yield(.configurationChanged) }
}

final class FakeAudioInput: AudioInputSource, @unchecked Sendable {
    enum Behaviour { case deliver, fail(VoiceAudioError), hang }
    var behaviour = Behaviour.deliver
    var device: VoiceDevice? = VoiceDevice(name: "Test Microphone", transport: .builtIn)
    private let lock = NSLock()
    private var _captures: [FakeCapture] = []
    var captures: [FakeCapture] { lock.withLock { _captures } }
    var current: FakeCapture? { captures.last }

    func start() async throws -> any AudioCapture {
        switch behaviour {
        case .fail(let error): throw error
        case .hang:
            try await Task.sleep(for: .seconds(30))
            throw CancellationError()
        case .deliver:
            let capture = FakeCapture(device: device)
            lock.withLock { _captures.append(capture) }
            return capture
        }
    }
}

final class FakeRecognitionSession: RecognitionSession, @unchecked Sendable {
    let results: AsyncThrowingStream<RecognitionResult, Error>
    private let continuation: AsyncThrowingStream<RecognitionResult, Error>.Continuation
    private let lock = NSLock()
    private var _chunks = 0
    private var _finished = false
    private var _cancelled = false
    /// Sent as the last final result when finish() is called; nil: finish never completes.
    var finalOnFinish: String? = ""
    var chunks: Int { lock.withLock { _chunks } }
    var finished: Bool { lock.withLock { _finished } }
    var cancelled: Bool { lock.withLock { _cancelled } }

    init() { (results, continuation) = AsyncThrowingStream<RecognitionResult, Error>.makeStream() }

    func append(_ chunk: AudioChunk) { lock.withLock { _chunks += 1 } }

    func finish() async {
        lock.withLock { _finished = true }
        guard let text = finalOnFinish else { return }
        if !text.isEmpty { continuation.yield(.final(text)) }
        continuation.finish()
    }

    func cancel() async {
        lock.withLock { _cancelled = true }
        continuation.finish()
    }

    func emit(_ result: RecognitionResult) { continuation.yield(result) }
    func fail() { continuation.finish(throwing: RecognitionError.failed("test")) }
}

final class FakeRecognition: SpeechRecognitionEngine, @unchecked Sendable {
    var engine: VoiceCapabilities.Engine = .speechAnalyzer
    var requiresSpeechPermission = false
    var liveTranscripts: Bool { true }
    var startError: RecognitionError?
    var startDelay: Duration = .zero
    var finalOnFinish: String? = ""
    private let lock = NSLock()
    private var _sessions: [FakeRecognitionSession] = []
    var sessions: [FakeRecognitionSession] { lock.withLock { _sessions } }
    var current: FakeRecognitionSession? { sessions.last }
    private(set) var installs = 0

    func availability(locale: String, allowServer: Bool) async -> RecognitionAvailability {
        RecognitionAvailability(recognition: .onDevice, assets: .installed)
    }

    func start(locale: String, allowServer: Bool) async throws -> any RecognitionSession {
        if startDelay > .zero { try? await Task.sleep(for: startDelay) }
        let session = FakeRecognitionSession()
        session.finalOnFinish = finalOnFinish
        lock.withLock { _sessions.append(session) }
        if let startError { throw startError }
        return session
    }

    func installAssets(locale: String) async throws { installs += 1 }
}

final class FakeSynthesis: SpeechSynthesisEngine, @unchecked Sendable {
    private let lock = NSLock()
    private var _rendered: [String] = []
    var rendered: [String] { lock.withLock { _rendered } }
    var failing = false

    func render(_ text: String, voice: SpeechVoiceRequest) async throws -> SynthesizedSpeech {
        lock.withLock { _rendered.append(text) }
        if failing { throw SpeechSynthesisError.failed("test") }
        let samples = (0..<2205).map { 0.2 * sin(Float($0) * 0.05) }
        return SynthesizedSpeech(buffers: [AudioChunk.samples(samples, sampleRate: 22_050)!.buffer])
    }

    func voices(locale: String) -> [VoiceOption] {
        [VoiceOption(id: "test.voice", name: "Test", locale: locale, quality: .default)]
    }
}

final class FakePlayback: AudioPlayback, @unchecked Sendable {
    enum Mode { case automatic, manual, deviceChange, fail }
    var mode = Mode.automatic
    private let lock = NSLock()
    private var _played = 0
    private var _terminated = 0
    private var _releases = 0
    private var pending: AsyncThrowingStream<PlaybackEvent, Error>.Continuation?
    var played: Int { lock.withLock { _played } }
    var terminated: Int { lock.withLock { _terminated } }
    var releases: Int { lock.withLock { _releases } }

    func play(_ speech: SynthesizedSpeech) -> AsyncThrowingStream<PlaybackEvent, Error> {
        let mode = mode
        return AsyncThrowingStream { continuation in
            self.lock.withLock { self._played += 1 }
            continuation.onTermination = { @Sendable [weak self] _ in self?.lock.withLock { self?._terminated += 1 } }
            continuation.yield(.started)
            continuation.yield(.level(0.5))
            switch mode {
            case .automatic:
                continuation.yield(.finished)
                continuation.finish()
            case .manual: self.lock.withLock { self.pending = continuation }
            case .deviceChange: continuation.finish(throwing: PlaybackError.deviceChanged)
            case .fail: continuation.finish(throwing: PlaybackError.failed(-1))
            }
        }
    }

    /// Manual mode: finishes the sentence that is playing.
    func finishCurrent() {
        let continuation = lock.withLock { () -> AsyncThrowingStream<PlaybackEvent, Error>.Continuation? in
            defer { pending = nil }
            return pending
        }
        continuation?.yield(.finished)
        continuation?.finish()
    }

    func release() { lock.withLock { _releases += 1 } }
}

final class FakeDevices: AudioDeviceMonitoring, @unchecked Sendable {
    var input: VoiceDevice? = VoiceDevice(name: "Test Microphone", transport: .builtIn)
    var output: VoiceDevice? = VoiceDevice(name: "Test Speakers", transport: .builtIn)
    let stream: AsyncStream<AudioRouteChange>
    let continuation: AsyncStream<AudioRouteChange>.Continuation
    init() { (stream, continuation) = AsyncStream<AudioRouteChange>.makeStream() }
    func currentInput() -> VoiceDevice? { input }
    func currentOutput() -> VoiceDevice? { output }
    func changes() -> AsyncStream<AudioRouteChange> { stream }
}

extension VoiceTiming {
    /// Short limits so failure paths finish in well under a second.
    static var fast: VoiceTiming {
        var timing = VoiceTiming()
        timing.builtIn = .init(firstAudio: 0.3, silentAudio: 0.3, stall: 0.3)
        timing.bluetooth = .init(firstAudio: 0.7, silentAudio: 0.5, stall: 0.4)
        timing.other = timing.builtIn
        timing.usb = timing.builtIn
        timing.noSpeech = 0.5
        timing.endOfUtterance = 0.25
        timing.utteranceLimit = 3
        timing.recognizerStart = 0.5
        timing.finalize = 0.4
        timing.tick = .milliseconds(20)
        return timing
    }
}

@MainActor
final class VoiceHarness {
    let recorder = EventRecorder()
    let permissions = FakeVoicePermissions()
    let input = FakeAudioInput()
    let recognition = FakeRecognition()
    let synthesis = FakeSynthesis()
    let playback = FakePlayback()
    let devices = FakeDevices()
    var opened: [OpenVoiceSettingsParams.Target] = []
    private(set) var controller: VoiceController!

    init(granted: Bool = true, timing: VoiceTiming = .fast) {
        if granted { permissions.current = (.granted, .notDetermined) }
        let engines = engines(timing: timing)
        let events = BridgeEventEmitter { [recorder] in recorder.record($0) }
        controller = VoiceController(engines: engines, events: events, preferences: { .defaults })
    }

    func engines(timing: VoiceTiming) -> VoiceEngines {
        VoiceEngines(
            permissions: permissions, input: input, devices: devices, recognition: recognition, synthesis: synthesis, playback: playback,
            timing: timing, openSettings: { [weak self] target in self?.opened.append(target); return true }
        )
    }

    var statuses: [JSONValue] { recorder.events.filter { $0.name == "voice.statusChanged" }.map(\.payload) }
    var phase: String? { if case .string(let p)? = statuses.last?["phase"] { return p }; return nil }
    func events(_ name: String) -> [JSONValue] { recorder.events.filter { $0.name == name }.map(\.payload) }
    var finals: [String] { events("voice.transcript").filter { $0["isFinal"] == .bool(true) }.compactMap { if case .string(let t)? = $0["text"] { t } else { nil } } }

    /// Waits up to `seconds` for `condition`.
    func until(_ seconds: Double = 2, _ condition: () -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + .seconds(seconds)
        while !condition() {
            if ContinuousClock.now > deadline { return false }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return true
    }

    /// Starts listening and waits until the fake microphone and recogniser are attached.
    @discardableResult
    func listen(_ mode: VoiceListenMode = .pushToTalk) async throws -> FakeCapture {
        let before = input.captures.count
        _ = try await controller.startListening(mode: mode)
        #expect(await until { input.captures.count > before && recognition.sessions.count > before })
        try await Task.sleep(for: .milliseconds(10))
        return input.current!
    }

    /// Feeds speech-level audio until the phase is listening.
    func speakIntoMic(_ capture: FakeCapture) async {
        capture.send(amplitude: 0.003)
        capture.send(amplitude: 0.2)
        _ = await until { controller.status.phase == .listening }
    }
}

// MARK: lifecycle and permissions

@Suite @MainActor struct VoiceLifecycleTests {
    @Test func nothingListensOrEmitsUntilAsked() async throws {
        let h = VoiceHarness()
        try await Task.sleep(for: .milliseconds(30))
        #expect(h.input.captures.isEmpty && h.recognition.sessions.isEmpty)
        #expect(h.recorder.events.isEmpty)
        #expect(h.controller.status.phase == .idle && !h.controller.status.listening && !h.controller.status.speaking)
        #expect(VoiceHarness(granted: false).controller.status.phase == .needsPermission)
    }

    @Test func listeningWithoutPermissionFailsWithoutPrompting() async throws {
        let h = VoiceHarness(granted: false)
        await #expect(throws: AuraError.self) { _ = try await h.controller.startListening(mode: .autoEnd) }
        #expect(h.permissions.requests.isEmpty)
        #expect(h.input.captures.isEmpty)
        #expect(h.controller.status.phase == .needsPermission)
        #expect(h.controller.status.issue == nil) // not determined yet: the page shows its explainer first
    }

    @Test func deniedMicrophoneOffersSettings() async throws {
        let h = VoiceHarness(granted: false)
        h.permissions.current = (.denied, .notDetermined)
        await #expect(throws: AuraError.self) { _ = try await h.controller.startListening(mode: .autoEnd) }
        #expect(h.controller.status.issue?.code == .permissionDenied)
        #expect(h.controller.status.issue?.recovery == [.openMicrophoneSettings])
        try await h.controller.openSettings(.microphone)
        #expect(h.opened == [.microphone])
        #expect(h.input.captures.isEmpty)
    }

    @Test func requestsOnlyTheMicrophoneWhenTheEngineNeedsNoSpeechPermission() async throws {
        let h = VoiceHarness(granted: false)
        let status = try await h.controller.requestPermissions()
        #expect(h.permissions.requests == [false])
        #expect(status.phase == .idle && status.microphone == .granted)
        #expect(!h.events("voice.capabilitiesChanged").isEmpty)

        let legacy = VoiceHarness(granted: false)
        legacy.recognition.requiresSpeechPermission = true
        legacy.permissions.afterRequest = (.granted, .denied)
        let denied = try await legacy.controller.requestPermissions()
        #expect(legacy.permissions.requests == [true])
        #expect(denied.phase == .needsPermission && denied.issue?.recovery == [.openSpeechSettings])
    }

    @Test func capabilitiesNeverOfferHandsFreeBargeIn() async {
        let caps = await VoiceHarness().controller.capabilities()
        #expect(caps.handsFreeBargeIn == false)
        #expect(caps.engine == .speechAnalyzer && caps.recognition == .onDevice && !caps.requiresSpeechRecognitionPermission)
        #expect(caps.input == .available && caps.maxUtteranceSeconds == 3)
    }

    @Test func endSessionReleasesEverything() async throws {
        let h = VoiceHarness()
        _ = try await h.controller.startSession(conversationId: "conv-1")
        let capture = try await h.listen()
        _ = await h.controller.endSession()
        #expect(capture.stopped)
        #expect(await h.until { h.recognition.current?.cancelled == true })
        #expect(h.playback.releases >= 1)
        let status = h.controller.status
        #expect(!status.sessionActive && status.conversationId == nil && status.phase == .idle && !status.listening)
    }

    @Test func shutdownDuringASessionStopsAllAudioAndGoesSilent() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        let session = try #require(h.recognition.current)
        h.controller.shutdownNow()
        #expect(capture.stopped)
        #expect(await h.until { session.cancelled })
        let count = h.recorder.events.count
        session.emit(.volatile("late"))
        capture.send(amplitude: 0.2)
        try await Task.sleep(for: .milliseconds(60))
        #expect(h.recorder.events.count == count) // nothing after shutdown
        await #expect(throws: AuraError.self) { _ = try await h.controller.startListening(mode: .autoEnd) }
        await #expect(throws: AuraError.self) { try await h.controller.speak("hi", interrupt: true) }
    }
}

// MARK: listening

@Suite @MainActor struct VoiceListeningTests {
    @Test func transcriptsFlowAndExactlyOneFinalEndsTheUtterance() async throws {
        let h = VoiceHarness()
        h.recognition.finalOnFinish = "world."
        let capture = try await h.listen(.pushToTalk)
        #expect(h.controller.status.phase == .starting)
        await h.speakIntoMic(capture)
        #expect(h.controller.status.phase == .listening && h.controller.status.listening)
        let session = try #require(h.recognition.current)
        session.emit(.volatile("hel"))
        session.emit(.volatile("hel")) // duplicate: no new event
        session.emit(.final("Hello"))
        session.emit(.volatile("wor"))
        #expect(await h.until { h.events("voice.transcript").count == 3 })
        let texts = h.events("voice.transcript").map { $0["text"] }
        #expect(texts == [.string("hel"), .string("Hello"), .string("Hello wor")])
        #expect(h.events("voice.transcript").map { $0["seq"] } == [.number(1), .number(2), .number(3)])
        #expect(!h.events("voice.inputLevel").isEmpty)

        let stopping = await h.controller.stopListening()
        #expect(stopping.phase == .recognizing && !stopping.listening)
        #expect(capture.stopped) // the microphone closes before the final transcript
        #expect(await h.until { h.controller.status.phase == .idle })
        #expect(h.finals == ["Hello world."])
        _ = await h.controller.stopListening() // idempotent: no second final
        #expect(h.finals.count == 1)
        #expect(h.controller.status.issue == nil)
    }

    @Test func startupLatencyWithinTheAllowanceIsNotAFailure() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        try await Task.sleep(for: .milliseconds(200)) // below the 0.3 s first-audio allowance
        capture.send(amplitude: 0) // a silent first buffer is normal while a device starts
        try await Task.sleep(for: .milliseconds(150))
        await h.speakIntoMic(capture)
        #expect(h.controller.status.phase == .listening && h.controller.status.issue == nil)
    }

    @Test func noAudioAtAllEndsWithARecoverableError() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        #expect(await h.until { h.controller.status.phase == .error })
        let issue = try #require(h.controller.status.issue)
        #expect(issue.code == .noAudio && issue.recovery == [.retry, .chooseInput])
        #expect(capture.stopped && !h.controller.status.listening)
        #expect(await h.until { h.recognition.current?.cancelled == true })
        // Retry works.
        let again = try await h.listen()
        await h.speakIntoMic(again)
        #expect(h.controller.status.phase == .listening && h.controller.status.issue == nil)
    }

    @Test func bluetoothGetsALongerStartupAllowance() async throws {
        let h = VoiceHarness()
        h.input.device = VoiceDevice(name: "Test Headset", transport: .bluetooth)
        h.devices.input = h.input.device
        _ = try await h.listen()
        try await Task.sleep(for: .milliseconds(450)) // past the built-in allowance, within Bluetooth's
        #expect(h.controller.status.phase == .starting)
        #expect(await h.until { h.controller.status.phase == .error })
        let issue = try #require(h.controller.status.issue)
        #expect(issue.code == .noAudio && issue.transport == .bluetooth && issue.message.contains("Bluetooth"))
    }

    @Test func digitalSilenceIsReportedAsNoUsableAudio() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        let feeder = Task { for _ in 0..<40 { capture.send(amplitude: 0); try? await Task.sleep(for: .milliseconds(20)) } }
        #expect(await h.until { h.controller.status.phase == .error })
        feeder.cancel()
        #expect(h.controller.status.issue?.code == .noAudio)
        #expect(h.controller.status.issue?.message.contains("silence") == true)
    }

    @Test func audioThatStopsMeansTheInputWasLost() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .inputLost)
        #expect(capture.stopped)
    }

    @Test func engineStartFailureOffersRetryAndAnotherInput() async throws {
        let h = VoiceHarness()
        h.input.behaviour = .fail(.engineFailed(-10875, transport: .bluetooth))
        _ = try await h.controller.startListening(mode: .autoEnd)
        #expect(await h.until { h.controller.status.phase == .error })
        let issue = try #require(h.controller.status.issue)
        #expect(issue.code == .inputFailed && issue.transport == .bluetooth && issue.recovery == [.retry, .chooseInput])
        #expect(issue.message.contains("-10875"))
        #expect(await h.until { h.recognition.current?.cancelled == true })
        try await h.controller.openSettings(.soundInput)
        #expect(h.opened == [.soundInput])
    }

    @Test func noInputDevice() async throws {
        let h = VoiceHarness()
        h.input.behaviour = .fail(.noInputDevice)
        _ = try await h.controller.startListening(mode: .autoEnd)
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .noInputDevice)
    }

    @Test func aHangingMicrophoneTimesOut() async throws {
        let h = VoiceHarness()
        h.input.behaviour = .hang
        _ = try await h.controller.startListening(mode: .autoEnd)
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .inputFailed)
    }

    @Test func bluetoothDisconnectionInterruptsAndRetryUsesTheNewDevice() async throws {
        let h = VoiceHarness()
        h.input.device = VoiceDevice(name: "Test Headset", transport: .bluetooth)
        h.devices.input = h.input.device
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        let builtIn = VoiceDevice(name: "Test Microphone", transport: .builtIn)
        h.devices.input = builtIn
        h.input.device = builtIn
        h.devices.continuation.yield(AudioRouteChange(direction: .input, kind: .deviceLost, device: builtIn))
        #expect(await h.until { h.controller.status.phase == .interrupted })
        #expect(h.controller.status.issue?.code == .inputLost)
        #expect(h.controller.status.inputDevice == builtIn)
        #expect(capture.stopped)
        let next = try await h.listen()
        #expect(next.device == builtIn)
        await h.speakIntoMic(next)
        #expect(h.controller.status.phase == .listening)
    }

    @Test func aDeviceSwitchInterruptsButTheSameDeviceReannouncingDoesNot() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        h.devices.continuation.yield(AudioRouteChange(direction: .input, device: h.input.device)) // Bluetooth profile switch style
        try await Task.sleep(for: .milliseconds(40))
        capture.send(amplitude: 0.2)
        #expect(h.controller.status.phase == .listening)
        h.devices.continuation.yield(AudioRouteChange(direction: .input, device: VoiceDevice(name: "USB Mic", transport: .usb)))
        #expect(await h.until { h.controller.status.phase == .interrupted })
        #expect(h.controller.status.issue?.code == .deviceChanged && h.controller.status.issue?.message.contains("USB Mic") == true)
    }

    @Test func anEngineConfigurationChangeInterrupts() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        capture.configurationChanged()
        #expect(await h.until { h.controller.status.phase == .interrupted })
        #expect(h.controller.status.issue?.code == .deviceChanged)
    }

    @Test func recognitionFailureEndsListening() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        h.recognition.current?.fail()
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .recognitionFailed)
        #expect(capture.stopped)
    }

    @Test func missingModelOffersInstallAndSlowStartTimesOut() async throws {
        let h = VoiceHarness()
        h.recognition.startError = .assetsMissing
        _ = try await h.controller.startListening(mode: .autoEnd)
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .recognitionUnavailable && h.controller.status.issue?.recovery == [.installSpeechAssets])
        #expect(h.input.current?.stopped == true)
        try await h.controller.installRecognitionAssets()
        #expect(await h.until { !h.events("voice.capabilitiesChanged").isEmpty })
        #expect(h.recognition.installs == 1)

        let slow = VoiceHarness()
        slow.recognition.startDelay = .milliseconds(800) // past recognizerStart (0.5 s)
        _ = try await slow.controller.startListening(mode: .autoEnd)
        #expect(await slow.until { slow.controller.status.phase == .error })
        #expect(slow.controller.status.issue?.code == .recognitionFailed)
        #expect(await slow.until { slow.recognition.current?.cancelled == true }) // the late session is released
    }

    @Test func silenceAfterOpeningIsNoSpeechNotAnError() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen(.autoEnd)
        let feeder = Task { for _ in 0..<60 { capture.send(amplitude: 0.002); try? await Task.sleep(for: .milliseconds(20)) } }
        #expect(await h.until { h.controller.status.issue != nil })
        feeder.cancel()
        #expect(h.controller.status.phase == .idle && h.controller.status.issue?.code == .noSpeech)
        #expect(h.finals.isEmpty && capture.stopped)
    }

    @Test func autoEndFinishesAfterAPause() async throws {
        let h = VoiceHarness()
        h.recognition.finalOnFinish = ""
        let capture = try await h.listen(.autoEnd)
        await h.speakIntoMic(capture)
        h.recognition.current?.emit(.final("Open the AURA repository."))
        let feeder = Task { for _ in 0..<40 { capture.send(amplitude: 0.002); try? await Task.sleep(for: .milliseconds(20)) } }
        #expect(await h.until { !h.finals.isEmpty })
        feeder.cancel()
        #expect(h.finals == ["Open the AURA repository."])
        #expect(h.controller.status.phase == .idle && capture.stopped)
    }

    @Test func pushToTalkWaitsForTheUser() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen(.pushToTalk)
        await h.speakIntoMic(capture)
        h.recognition.current?.emit(.volatile("still talking"))
        for _ in 0..<20 { capture.send(amplitude: 0.002); try await Task.sleep(for: .milliseconds(20)) }
        #expect(h.controller.status.phase == .listening && h.finals.isEmpty)
        _ = await h.controller.cancelListening()
    }

    @Test func theUtteranceLimitStillDeliversWhatWasHeard() async throws {
        var timing = VoiceTiming.fast
        timing.utteranceLimit = 0.4
        let h = VoiceHarness(timing: timing)
        h.recognition.finalOnFinish = ""
        let capture = try await h.listen(.pushToTalk)
        await h.speakIntoMic(capture)
        h.recognition.current?.emit(.final("A long request"))
        let feeder = Task { for _ in 0..<40 { capture.send(amplitude: 0.2); try? await Task.sleep(for: .milliseconds(20)) } }
        #expect(await h.until { !h.finals.isEmpty })
        feeder.cancel()
        #expect(h.finals == ["A long request"] && h.controller.status.issue?.code == .timeLimit)
    }

    @Test func aRecogniserThatNeverFinishesTimesOut() async throws {
        let h = VoiceHarness()
        h.recognition.finalOnFinish = nil
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        h.recognition.current?.emit(.volatile("half"))
        _ = await h.controller.stopListening()
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .recognitionFailed && h.finals.isEmpty) // partial text is never promoted to final
    }

    @Test func cancellingDiscardsTheUtteranceAndLateResults() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        let session = try #require(h.recognition.current)
        session.emit(.volatile("never mind"))
        #expect(await h.until { h.events("voice.transcript").count == 1 })
        let status = await h.controller.cancelListening()
        #expect(status.phase == .idle && !status.listening && status.issue == nil)
        #expect(capture.stopped)
        #expect(await h.until { session.cancelled })
        session.emit(.final("late text"))
        try await Task.sleep(for: .milliseconds(40))
        #expect(h.events("voice.transcript").count == 1 && h.finals.isEmpty)
    }

    @Test func aNewListenReplacesTheOldRunAndIgnoresItsEvents() async throws {
        let h = VoiceHarness()
        let first = try await h.listen()
        let firstSession = try #require(h.recognition.current)
        let second = try await h.listen()
        #expect(first.stopped && !second.stopped)
        #expect(await h.until { firstSession.cancelled })
        firstSession.emit(.volatile("stale"))
        first.send(amplitude: 0.2)
        try await Task.sleep(for: .milliseconds(40))
        #expect(h.events("voice.transcript").isEmpty)
        #expect(h.controller.status.utteranceId == h.events("voice.statusChanged").last?["utteranceId"].flatMap { if case .string(let s) = $0 { s } else { nil } })
    }

    @Test func goingInactiveClosesTheMicrophone() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        h.controller.handle(.appInactive)
        #expect(h.controller.status.phase == .interrupted && h.controller.status.issue?.code == .appInactive)
        #expect(capture.stopped)
        h.controller.handle(.systemSleep) // nothing active: no change
        #expect(h.controller.status.issue?.code == .appInactive)
    }
}

// MARK: speaking

@Suite @MainActor struct VoiceSpeakingTests {
    @Test func speechCompletesSentenceBySentence() async throws {
        let h = VoiceHarness()
        try await h.controller.speak("Hello there. How are you today?", interrupt: true)
        #expect(await h.until { h.controller.status.phase == .idle && !h.controller.status.speaking })
        #expect(Set(h.synthesis.rendered) == ["Hello there.", "How are you today?"]) // the next sentence renders while one plays
        #expect(h.events("voice.speechProgress").map { $0["text"] } == [.string("Hello there."), .string("Hello there."), .string("How are you today?"), .string("How are you today?")])
        let progress = h.events("voice.speechProgress").map { [$0["segment"], $0["state"]] }
        #expect(progress == [[.number(0), .string("started")], [.number(0), .string("finished")], [.number(1), .string("started")], [.number(1), .string("finished")]])
        #expect(h.events("voice.speechLevel").last?["level"] == .number(0))
        #expect(h.playback.releases >= 1)
        #expect(h.controller.status.speechId == nil)
    }

    @Test func stoppingSpeechCutsTheCurrentSentenceAndDropsTheRest() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        try await h.controller.speak("One. Two. Three.", interrupt: true)
        #expect(await h.until { h.playback.played == 1 && h.controller.status.phase == .speaking })
        await h.controller.stopSpeaking()
        #expect(await h.until { h.playback.terminated == 1 })
        #expect(h.controller.status.phase == .idle && !h.controller.status.speaking)
        h.playback.finishCurrent()
        try await Task.sleep(for: .milliseconds(40))
        #expect(h.playback.played == 1)
        #expect(!h.events("voice.speechProgress").contains { $0["state"] == .string("finished") })
        await h.controller.stopSpeaking() // idempotent
    }

    @Test func listeningBargesInOnSpeech() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        try await h.controller.speak("A long answer.", interrupt: true)
        #expect(await h.until { h.playback.played == 1 })
        let capture = try await h.listen()
        #expect(!h.controller.status.speaking && h.controller.status.listening)
        #expect(await h.until { h.playback.terminated == 1 })
        _ = capture
    }

    @Test func speakingStopsListeningWithoutAFinalTranscript() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        h.recognition.current?.emit(.volatile("half a sentence"))
        try await h.controller.speak("Answer.", interrupt: true)
        #expect(capture.stopped && h.finals.isEmpty && !h.controller.status.listening)
    }

    @Test func mutedOutputSpeaksNothing() async throws {
        let h = VoiceHarness()
        _ = await h.controller.setOutputMuted(true)
        try await h.controller.speak("Hello.", interrupt: true)
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        h.controller.replyText(streamId: "ai-1", delta: "Muted reply.")
        let status = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1")
        #expect(status.outputMuted && !status.speaking)
        try await Task.sleep(for: .milliseconds(30))
        #expect(h.synthesis.rendered.isEmpty)
        // Muting while speaking stops the speech.
        _ = await h.controller.setOutputMuted(false)
        h.playback.mode = .manual
        try await h.controller.speak("Hello.", interrupt: true)
        #expect(await h.until { h.playback.played == 1 })
        _ = await h.controller.setOutputMuted(true)
        #expect(!h.controller.status.speaking)
        #expect(await h.until { h.playback.terminated == 1 })
    }

    @Test func failuresAndDeviceChangesEndSpeechWithAReason() async throws {
        let h = VoiceHarness()
        h.synthesis.failing = true
        try await h.controller.speak("Hello.", interrupt: true)
        #expect(await h.until { h.controller.status.phase == .error })
        #expect(h.controller.status.issue?.code == .synthesisFailed)

        let device = VoiceHarness()
        device.playback.mode = .deviceChange
        try await device.controller.speak("Hello.", interrupt: true)
        #expect(await device.until { device.controller.status.phase == .interrupted })
        #expect(device.controller.status.issue?.code == .deviceChanged)

        let output = VoiceHarness()
        output.playback.mode = .manual
        _ = try await output.controller.startSession(conversationId: nil)
        try await output.controller.speak("Hello.", interrupt: true)
        #expect(await output.until { output.playback.played == 1 })
        output.devices.continuation.yield(AudioRouteChange(direction: .output, device: VoiceDevice(name: "Headphones", transport: .bluetooth)))
        #expect(await output.until { output.controller.status.phase == .interrupted })
        #expect(output.controller.status.issue?.message.contains("Headphones") == true)
    }

    @Test func rejectsEmptyAndConcurrentSpeech() async throws {
        let h = VoiceHarness()
        await #expect(throws: AuraError.self) { try await h.controller.speak("   ", interrupt: true) }
        h.playback.mode = .manual
        try await h.controller.speak("First.", interrupt: true)
        await #expect(throws: AuraError.invalidRequest("already speaking")) { try await h.controller.speak("Second.", interrupt: false) }
    }
}

// MARK: replies

@Suite @MainActor struct VoiceReplyTests {
    @Test func aStreamingReplyIsSpokenAsSentencesComplete() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        h.controller.replyText(streamId: "ai-1", delta: "Here is")
        let status = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1")
        #expect(status.phase == .thinking && status.speakingStreamId == "ai-1") // no complete sentence yet
        h.controller.replyText(streamId: "ai-1", delta: " the plan. First, open")
        #expect(await h.until { h.synthesis.rendered == ["Here is the plan."] })
        h.controller.replyText(streamId: "ai-1", delta: " the file.\n```swift\nlet secret = 1\n```\n")
        h.controller.replyEnded(streamId: "ai-1", reason: .stop)
        #expect(await h.until(3) {
            h.playback.finishCurrent()
            return !h.controller.status.speaking
        })
        #expect(h.playback.played == 3)
        let spoken = h.events("voice.speechProgress").filter { $0["state"] == .string("started") }.map { $0["text"] }
        #expect(spoken == [.string("Here is the plan."), .string("First, open the file."), .string("I've put the code on screen.")])
        #expect(!h.synthesis.rendered.joined().contains("secret"))
    }

    @Test func approvalsPauseWithANoticeAndAreNeverAnsweredByVoice() async throws {
        let h = VoiceHarness()
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1")
        h.controller.replyState(streamId: "ai-1", state: .waitingForApproval)
        h.controller.replyState(streamId: "ai-1", state: .waitingForApproval) // once per wait
        #expect(await h.until { h.synthesis.rendered == ["I need your approval on screen."] })
        #expect(h.controller.status.speaking) // still waiting for the rest of the reply
        h.controller.replyEnded(streamId: "ai-1", reason: .stop)
        #expect(await h.until { !h.controller.status.speaking })
    }

    @Test func cancellingTheReplyResettingOrANewReplyStopsSpeech() async throws {
        for stopper in ["cancel", "reset", "new reply", "github"] {
            let h = VoiceHarness()
            h.playback.mode = .manual
            h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
            h.controller.replyText(streamId: "ai-1", delta: "One sentence. Another sentence. ")
            _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1")
            #expect(await h.until { h.playback.played == 1 }, "\(stopper)")
            switch stopper {
            case "cancel": h.controller.replyEnded(streamId: "ai-1", reason: .cancelled)
            case "reset": h.controller.conversationChanged(conversationId: "conv-1", reason: .reset)
            case "github": h.controller.conversationChanged(conversationId: "conv-1", reason: .githubAccessChanged)
            default: h.controller.replyStarted(streamId: "ai-2", conversationId: "conv-1")
            }
            #expect(!h.controller.status.speaking, "\(stopper)")
            #expect(await h.until { h.playback.terminated == 1 }, "\(stopper)")
            h.playback.finishCurrent()
            try await Task.sleep(for: .milliseconds(30))
            #expect(h.playback.played == 1, "\(stopper)")
        }
    }

    @Test func clearedConversationsLoseTheirSpokenCopies() async throws {
        let h = VoiceHarness()
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        h.controller.replyText(streamId: "ai-1", delta: "Private details.")
        h.controller.replyEnded(streamId: "ai-1", reason: .stop)
        h.controller.conversationChanged(conversationId: "conv-1", reason: .githubAccessChanged)
        await #expect(throws: AuraError.self) { _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1") }
    }

    @Test func endingTheBoundConversationUnbindsTheSession() async throws {
        let h = VoiceHarness()
        _ = try await h.controller.startSession(conversationId: "conv-1")
        h.controller.conversationChanged(conversationId: "conv-1", reason: .ended)
        #expect(h.controller.status.conversationId == nil && h.controller.status.issue?.code == .conversationEnded)
        h.controller.conversationChanged(conversationId: "conv-2", reason: .repositoryChanged)
    }

    @Test func speakReplyValidatesTheReply() async throws {
        let h = VoiceHarness()
        await #expect(throws: AuraError.self) { _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-unknown") }
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        await #expect(throws: AuraError.self) { _ = try await h.controller.speakReply(conversationId: "conv-2", streamId: "ai-1") }
        h.controller.replyEnded(streamId: "ai-1", reason: .cancelled)
        await #expect(throws: AuraError.self) { _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1") }

        h.playback.mode = .manual
        h.controller.replyStarted(streamId: "ai-2", conversationId: "conv-1")
        h.controller.replyText(streamId: "ai-2", delta: "Once. ")
        let first = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-2")
        let again = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-2") // duplicate call: same speech
        #expect(first.speechId == again.speechId)
    }

    @Test func statusRevisionsOnlyIncreaseAndNeverRepeat() async throws {
        let h = VoiceHarness()
        let capture = try await h.listen()
        await h.speakIntoMic(capture)
        _ = await h.controller.cancelListening()
        _ = await h.controller.cancelListening()
        try await h.controller.speak("Done.", interrupt: true)
        #expect(await h.until { !h.controller.status.speaking })
        await h.controller.stopSpeaking()
        let revisions = h.statuses.compactMap { if case .number(let n)? = $0["revision"] { Int(n) } else { nil } }
        #expect(revisions == Array(1...revisions.count))
        for (a, b) in zip(h.statuses, h.statuses.dropFirst()) {
            var x = a, y = b
            if case .object(var o) = x { o["revision"] = nil; x = .object(o) }
            if case .object(var o) = y { o["revision"] = nil; y = .object(o) }
            #expect(x != y)
        }
    }
}

// MARK: end to end through AppServices

@Suite @MainActor struct VoiceServicesTests {
    func services(_ recorder: EventRecorder, _ harness: VoiceHarness, script: [[MockAIProvider.Step]]) async throws -> AppServices {
        AppServices(
            configuration: AppConfiguration(environment: .development, devServerURL: nil, webRoot: nil,
                                            dataDirectory: URL(fileURLWithPath: "/dev/null"), appVersion: "0.1.0", build: "test"),
            store: try await AppStore(database: Database(path: ":memory:")),
            secrets: InMemorySecretStore(),
            github: MockGitHubService(approvalDelay: .zero),
            aiMock: MockAIProvider(interval: .zero, script: script),
            voice: harness.engines(timing: .fast),
            deliverEvent: { recorder.record($0) }
        )
    }

    @Test func aSpokenRequestGoesThroughTheRealConversationAndToolResultsAreNotSpoken() async throws {
        let h = VoiceHarness()
        let recorder = EventRecorder()
        let services = try await services(recorder, h, script: [
            [.toolCalls([AIToolCall(id: "t1", name: "list_repository_files", arguments: ["fullName": .string("mock-user/sample-web-app")])]), .finish(.stop)],
            [.delta("There are three files. "), .delta("The main one is index."), .finish(.stop)],
        ])
        let started = try await call(services, "ai.startConversation", #"{"repository":{"fullName":"mock-user/sample-web-app"}}"#)
        guard case .string(let conversationId)? = started["result"]?["conversationId"] else { Issue.record("no conversation"); return }
        #expect(try await call(services, "voice.startSession", #"{"conversationId":"\#(conversationId)"}"#)["ok"] == .bool(true))

        // Talk → final transcript (the page then sends it, as it does typed text).
        h.recognition.finalOnFinish = "What files are in it?"
        #expect(try await call(services, "voice.startListening", #"{"mode":"push_to_talk"}"#)["ok"] == .bool(true))
        #expect(await h.until { h.input.current != nil && h.recognition.current != nil })
        let capture = try #require(h.input.current)
        capture.send(amplitude: 0.003)
        capture.send(amplitude: 0.2)
        #expect(await h.until { services.voiceController?.status.phase == .listening })
        _ = try await call(services, "voice.stopListening")
        #expect(await h.until { recorder.events.contains { $0.name == "voice.transcript" && $0.payload["isFinal"] == .bool(true) } })
        guard case .string(let text)? = recorder.events.last(where: { $0.name == "voice.transcript" })?.payload["text"] else { Issue.record("no text"); return }

        let sent = try await call(services, "ai.sendMessage", #"{"conversationId":"\#(conversationId)","text":"\#(text)"}"#)
        guard case .string(let streamId)? = sent["result"]?["streamId"] else { Issue.record("no stream"); return }
        #expect(try await call(services, "voice.speakReply", #"{"conversationId":"\#(conversationId)","streamId":"\#(streamId)"}"#)["ok"] == .bool(true))
        #expect(await h.until(3) { recorder.events.contains { $0.name == "ai.done" } && services.voiceController?.status.speaking == false })
        #expect(h.synthesis.rendered == ["There are three files.", "The main one is index."])
        #expect(recorder.events.contains { $0.name == "ai.toolActivity" })
        // Nothing the tool returned was spoken.
        #expect(!h.synthesis.rendered.joined().contains("src/"))
    }

    @Test func windowInactivityAndEndingTheConversationReachVoice() async throws {
        let h = VoiceHarness()
        let recorder = EventRecorder()
        let services = try await services(recorder, h, script: [[.delta("Hello there."), .finish(.stop)]])
        _ = try await call(services, "voice.startListening")
        #expect(await h.until { h.input.current != nil })
        services.windowState.update(WindowState(active: false, visible: true))
        #expect(await h.until { services.voiceController?.status.phase == .interrupted })
        #expect(await h.until { h.input.current?.stopped == true })

        let started = try await call(services, "ai.startConversation", "{}")
        guard case .string(let conversationId)? = started["result"]?["conversationId"] else { Issue.record("no conversation"); return }
        _ = try await call(services, "voice.startSession", #"{"conversationId":"\#(conversationId)"}"#)
        _ = try await call(services, "ai.endConversation", #"{"conversationId":"\#(conversationId)"}"#)
        #expect(services.voiceController?.status.conversationId == nil)
        #expect(services.voiceController?.status.issue?.code == .conversationEnded)
    }
}

// MARK: pure parts

@Suite struct InputHealthTests {
    let limits = VoiceTiming.Startup(firstAudio: 1.5, silentAudio: 2, stall: 1)

    @Test func waitsDuringStartupThenReportsNoDelivery() {
        let monitor = InputHealthMonitor(startedAt: 10, limits: limits)
        #expect(monitor.evaluate(at: 11) == .waiting)
        #expect(monitor.evaluate(at: 11.6) == .notDelivering)
    }

    @Test func silentStartIsToleratedUntilItIsTooLong() {
        var monitor = InputHealthMonitor(startedAt: 0, limits: limits)
        monitor.observe(peak: 0, at: 0.5)
        monitor.observe(peak: 0, at: 1.5)
        #expect(monitor.evaluate(at: 1.6) == .waiting)
        monitor.observe(peak: 0, at: 2.4)
        #expect(monitor.evaluate(at: 2.6) == .silent)
        monitor.observe(peak: 0.01, at: 2.7)
        #expect(monitor.evaluate(at: 2.8) == .healthy)
    }

    @Test func gapsMeanLostInputAndQuietRoomsAreFine() {
        var monitor = InputHealthMonitor(startedAt: 0, limits: limits)
        for t in stride(from: 0.1, through: 5, by: 0.1) { monitor.observe(peak: 0.0004, at: t) } // a quiet room's noise floor
        #expect(monitor.evaluate(at: 5.05) == .healthy)
        #expect(monitor.evaluate(at: 6.2) == .stalled)
    }
}

@Suite struct SpeechActivityTests {
    @Test func detectsSpeechAboveTheNoiseFloorAndPauses() {
        var activity = SpeechActivity()
        for t in 0..<5 { activity.observe(rms: 0.002, at: Double(t) * 0.1) }
        #expect(!activity.speechStarted)
        activity.observe(rms: 0.1, at: 0.6)
        #expect(activity.speechStarted && activity.lastSpeechAt == 0.6)
        activity.observe(rms: 0.003, at: 0.7)
        #expect(!activity.pauseExceeded(0.5, at: 0.9))
        #expect(activity.pauseExceeded(0.5, at: 1.2))
        activity.heard(at: 1.3)
        #expect(!activity.pauseExceeded(0.5, at: 1.5))
    }
}

@Suite struct SpokenReplyPlannerTests {
    func plan(_ chunks: [String]) -> [String] {
        var planner = SpokenReplyPlanner()
        var out = chunks.flatMap { planner.append($0) }
        out += planner.finish()
        return out.map(\.text)
    }

    @Test func sentencesComeOutWholeWhateverTheChunking() {
        let text = "Hello there. This is AURA, e.g. your studio! Version 2.5 works? Yes.\n\nNext paragraph"
        let whole = plan([text])
        #expect(whole == ["Hello there.", "This is AURA, e.g. your studio!", "Version 2.5 works?", "Yes.", "Next paragraph"])
        #expect(plan(text.map(String.init)) == whole)
        #expect(plan(stride(from: 0, to: text.count, by: 7).map { String(Array(text)[$0..<min($0 + 7, text.count)]) }) == whole)
    }

    @Test func markdownIsSpokenPlainly() {
        let reply = """
        # Setup steps
        1. Install **Xcode** from the [App Store](https://apps.apple.com).
        - Run `npm install`
        > Note: see https://example.com/docs for more.
        ![diagram](img.png)

        | a | b |
        |---|---|
        | 1 | 2 |

        ```sh
        rm -rf build
        export TOKEN=abc
        ```
        ```js
        console.log(1)
        ```
        Done.
        """
        let spoken = plan([reply])
        #expect(spoken == ["Setup steps.", "1. Install Xcode from the App Store.", "Run npm install.", "Note: see for more.", "There's a table on screen.", "I've put the code on screen.", "Done."], "\(spoken)")
        let all = spoken.joined(separator: " ")
        for leaked in ["https", "rm -rf", "TOKEN", "**", "`", "|", "img.png", "console"] { #expect(!all.contains(leaked), "\(leaked)") }
        #expect(plan(reply.map(String.init)) == spoken)
    }

    @Test func nothingUnfinishedIsSpokenEarly() {
        var planner = SpokenReplyPlanner()
        #expect(planner.append("The first sentence is complete. The second is not").map(\.text) == ["The first sentence is complete."])
        #expect(planner.append(" yet").isEmpty)
        #expect(planner.append("\n```").isEmpty)
        #expect(planner.finish().map(\.text) == ["The second is not yet", "I've put the code on screen."])
    }

    @Test func longRepliesAreCapped() {
        let sentence = String(repeating: "word ", count: 40) + "end."
        let spoken = plan(Array(repeating: sentence + " ", count: 40))
        #expect(spoken.last == "The rest is on screen.")
        #expect(spoken.dropLast().joined().count <= SpokenReplyPlanner.maxSpokenCharacters)
    }
}

@Suite struct AudioChunkTests {
    @Test func multiChannelInputBecomesMonoChannelZero() throws {
        let layout = try #require(AVAudioChannelLayout(layoutTag: kAudioChannelLayoutTag_DiscreteInOrder | 3))
        let format = AVAudioFormat(standardFormatWithSampleRate: 16_000, channelLayout: layout)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
        buffer.frameLength = 4
        for i in 0..<4 { buffer.floatChannelData![0][i] = 0.5; buffer.floatChannelData![1][i] = 0.9; buffer.floatChannelData![2][i] = -0.9 }
        let mono = try #require(AudioChunk.mono(buffer))
        #expect(mono.format.channelCount == 1 && mono.frameLength == 4 && mono.floatChannelData![0][3] == 0.5)
        let chunk = AudioChunk(buffer: mono)
        #expect(chunk.peak == 0.5 && abs(chunk.rms - 0.5) < 0.0001)
        #expect(AudioChunk.samples([0, 0], sampleRate: 16_000)?.peak == 0)
    }

    @Test func speechEnvelopeIsThirtyHertz() throws {
        let samples = [Float](repeating: 0.3, count: 22_050) // one second
        let chunk = try #require(AudioChunk.samples(samples, sampleRate: 22_050))
        let speech = SynthesizedSpeech(buffers: [chunk.buffer])
        #expect(speech.envelope.count == 30 || speech.envelope.count == 31)
        #expect(speech.envelope.allSatisfy { abs($0 - 1) < 0.001 })
        #expect(abs(speech.duration - 1) < 0.001)
    }

    @Test func preferencesKeepVoiceDefaultsForOlderStores() throws {
        let old = try JSONDecoder().decode(Preferences.Voice.self, from: Data(#"{"enabled":true,"locale":"en-US","synthesisVoiceId":null}"#.utf8))
        #expect(!old.autoSpeakReplies && old.speechRate == 1 && !old.allowServerRecognition)
        let patched = try JSONDecoder().decode(PreferencesPatch.self, from: Data(#"{"voice":{"speechRate":3,"autoSpeakReplies":true}}"#.utf8)).applied(to: .defaults)
        #expect(patched.voice.speechRate == 1.2 && patched.voice.autoSpeakReplies)
    }
}

// MARK: real on-device recognition with prerecorded speech (no microphone)

@available(macOS 26, *)
enum OnDeviceSpeech {
    /// True when this Mac has the en-US on-device model (D0: installed on the development Mac).
    static func available() async -> Bool {
        guard ProcessInfo.processInfo.environment["AURA_SKIP_SPEECH_INTEGRATION"] == nil, SpeechTranscriber.isAvailable else { return false }
        return await SpeechTranscriber.installedLocales.contains { $0.identifier(.bcp47) == "en-US" }
    }

    /// Synthesized speech as microphone-sized chunks (prerecorded test audio).
    static func recording(_ text: String) async throws -> [AudioChunk] {
        let speech = try await SystemSpeechSynthesis().render(text, voice: SpeechVoiceRequest(locale: "en-US", voiceId: nil, rate: 1))
        let silence = AudioChunk.samples([Float](repeating: 0, count: 2205), sampleRate: 22_050)!
        return [silence] + speech.buffers.compactMap { AudioChunk.mono($0).map(AudioChunk.init(buffer:)) } + Array(repeating: silence, count: 5)
    }

    static func accuracy(_ heard: String, _ expected: String) -> Double {
        func words(_ s: String) -> [String] { s.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty } }
        var have = words(heard)
        let want = words(expected)
        var hits = 0
        for w in want { if let i = have.firstIndex(of: w) { hits += 1; have.remove(at: i) } }
        return Double(hits) / Double(max(want.count, 1))
    }
}

@Suite(.serialized, .timeLimit(.minutes(1))) struct OnDeviceRecognitionTests {
    static let sentence = "Astra, show me the latest commits in the AURA repository."

    @Test func prerecordedSpeechIsTranscribedOnDevice() async throws {
        guard #available(macOS 26, *), await OnDeviceSpeech.available() else { return }
        let chunks = try await OnDeviceSpeech.recording(Self.sentence)
        let session = try await AnalyzerRecognitionEngine().start(locale: "en-US", allowServer: false)
        let collector = Task { () -> String in
            var finals = ""
            for try await result in session.results { if case .final(let text) = result { finals = VoiceController.join(finals, text) } }
            return finals
        }
        for chunk in chunks { session.append(chunk) }
        await session.finish()
        let text = try await collector.value
        #expect(OnDeviceSpeech.accuracy(text, Self.sentence) >= 0.8, "heard: \(text)")
    }

    @Test @MainActor func theWholeListeningPipelineWorksWithPrerecordedAudio() async throws {
        guard #available(macOS 26, *), await OnDeviceSpeech.available() else { return }
        let chunks = try await OnDeviceSpeech.recording(Self.sentence)
        let h = VoiceHarness(timing: VoiceTiming())
        let engines = VoiceEngines(
            permissions: h.permissions, input: h.input, devices: h.devices, recognition: AnalyzerRecognitionEngine(),
            synthesis: h.synthesis, playback: h.playback, timing: VoiceTiming(), openSettings: { _ in true }
        )
        let recorder = EventRecorder()
        let controller = VoiceController(engines: engines, events: BridgeEventEmitter { recorder.record($0) }, preferences: { .defaults })
        _ = try await controller.startListening(mode: .autoEnd)
        #expect(await h.until(10) { h.input.current != nil && controller.status.phase != .starting || h.input.current != nil })
        let capture = try #require(h.input.current)
        for chunk in chunks {
            capture.send(chunk)
            try await Task.sleep(for: .milliseconds(Int(chunk.duration * 1000)))
        }
        // Room noise after speaking, so auto_end sees a pause.
        let feeder = Task { for _ in 0..<60 { capture.send(amplitude: 0.001); try? await Task.sleep(for: .milliseconds(100)) } }
        #expect(await h.until(15) { recorder.events.contains { $0.name == "voice.transcript" && $0.payload["isFinal"] == .bool(true) } })
        feeder.cancel()
        let final = recorder.events.last { $0.name == "voice.transcript" }?.payload["text"]
        guard case .string(let text)? = final else { Issue.record("no final transcript; status \(controller.status.phase)"); return }
        #expect(OnDeviceSpeech.accuracy(text, Self.sentence) >= 0.8, "heard: \(text)")
        #expect(capture.stopped && controller.status.phase == .idle)
        #expect(recorder.events.contains { $0.name == "voice.transcript" && $0.payload["isFinal"] == .bool(false) }) // live transcript
    }
}

// MARK: audible check (opt-in: AURA_AUDIBLE_VOICE_TESTS=1 plays one sentence on the default output)

@Suite(.serialized, .timeLimit(.minutes(1))) struct AudibleVoiceTests {
    @Test @MainActor func systemSpeechPlaysWithLevelsAndFinishes() async throws {
        guard ProcessInfo.processInfo.environment["AURA_AUDIBLE_VOICE_TESTS"] == "1" else { return }
        let h = VoiceHarness(timing: VoiceTiming())
        let playback = EnginePlayback()
        let engines = VoiceEngines(
            permissions: h.permissions, input: h.input, devices: CoreAudioDeviceMonitor(), recognition: h.recognition,
            synthesis: SystemSpeechSynthesis(), playback: playback, openSettings: { _ in true }
        )
        let recorder = EventRecorder()
        let controller = VoiceController(engines: engines, events: BridgeEventEmitter { recorder.record($0) }, preferences: { .defaults })
        let start = ContinuousClock.now
        try await controller.speak("This is Astra checking speech output. A second sentence follows.", interrupt: true)
        #expect(await h.until(20) { !controller.status.speaking })
        let elapsed = ContinuousClock.now - start
        let levels = recorder.events.filter { $0.name == "voice.speechLevel" }.count
        let progress = recorder.events.filter { $0.name == "voice.speechProgress" }.map { $0.payload["state"] }
        print("audible check: \(elapsed) elapsed, \(levels) level events, progress \(progress), final phase \(controller.status.phase), issue \(String(describing: controller.status.issue?.code))")
        #expect(progress == [.string("started"), .string("finished"), .string("started"), .string("finished")])
        #expect(levels > 30) // ~30 Hz over several seconds of speech
        #expect(controller.status.phase == .idle && controller.status.issue == nil)
    }
}
