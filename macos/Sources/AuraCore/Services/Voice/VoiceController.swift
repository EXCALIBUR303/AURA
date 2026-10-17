import Foundation

// The voice host (Phase 3C-D). One owner for the microphone, recognition,
// speech and their states; the page sees it through voice.* methods and events.
//
// Guarantees:
// - Nothing listens until voice.startListening (a user action on the page);
//   never at launch, after a reply, or because a model asked.
// - Half-duplex: listening stops speech first; speaking stops listening.
// - Every listening or speaking run is an object; callbacks from a run that
//   was replaced or stopped are ignored (no stale or duplicate events).
// - The microphone closes as soon as an utterance ends, fails or is interrupted;
//   audio engines are released when idle. Nothing restarts by itself.
// - Status changes are numbered (`revision`) and sent only when something changed.
// - Exactly one final transcript per utterance that heard something; partial
//   text is for display only.
// - Spoken replies come from the same text the page shows; tool results are
//   never spoken, approvals are never answered by voice.

/// The parts voice is built from; AppServices takes one (tests pass fakes).
public struct VoiceEngines: Sendable {
    public var permissions: any VoicePermissions
    public var input: any AudioInputSource
    public var devices: any AudioDeviceMonitoring
    public var recognition: any SpeechRecognitionEngine
    public var synthesis: any SpeechSynthesisEngine
    public var playback: any AudioPlayback
    public var timing: VoiceTiming
    /// Opens a System Settings pane; false when it could not.
    public var openSettings: @MainActor @Sendable (OpenVoiceSettingsParams.Target) -> Bool

    public init(
        permissions: any VoicePermissions, input: any AudioInputSource, devices: any AudioDeviceMonitoring,
        recognition: any SpeechRecognitionEngine, synthesis: any SpeechSynthesisEngine, playback: any AudioPlayback,
        timing: VoiceTiming = VoiceTiming(), openSettings: @escaping @MainActor @Sendable (OpenVoiceSettingsParams.Target) -> Bool
    ) {
        self.permissions = permissions
        self.input = input
        self.devices = devices
        self.recognition = recognition
        self.synthesis = synthesis
        self.playback = playback
        self.timing = timing
        self.openSettings = openSettings
    }

    /// The system implementations used by AURA.app.
    public static func system(openSettings: @escaping @MainActor @Sendable (OpenVoiceSettingsParams.Target) -> Bool) -> VoiceEngines {
        let devices = CoreAudioDeviceMonitor()
        return VoiceEngines(
            permissions: SystemVoicePermissions(), input: EngineAudioInput(devices: devices), devices: devices,
            recognition: SpeechRecognitionEngines.system(), synthesis: SystemSpeechSynthesis(), playback: EnginePlayback(),
            openSettings: openSettings
        )
    }
}

/// System events that stop voice.
public enum VoiceSystemEvent: Sendable {
    /// AURA is no longer the active app, or its window is hidden.
    case appInactive
    /// The Mac is going to sleep or the screen locked.
    case systemSleep
}

@MainActor
public final class VoiceController: VoiceService, AIReplyObserver {
    public private(set) var status: VoiceStatus

    private let engines: VoiceEngines
    private let events: BridgeEventEmitter
    private let preferences: @MainActor () async -> Preferences
    private var timing: VoiceTiming { engines.timing }
    private let origin = ContinuousClock.now
    private var isShutDown = false
    private var deviceTask: Task<Void, Never>?
    private var listening: ListeningRun?
    private var speaking: SpeakingRun?
    private var installingAssets = false
    /// Recent conversation replies, so voice.speakReply can start from the beginning
    /// even when the page asks after the first text arrived. Same text the page shows.
    private var replies: [String: ReplyRecord] = [:]
    private var replyOrder: [String] = []
    static let keptReplies = 6
    static let maxReplyCharacters = 120_000

    public init(engines: VoiceEngines, events: BridgeEventEmitter, preferences: @escaping @MainActor () async -> Preferences) {
        self.engines = engines
        self.events = events
        self.preferences = preferences
        let permissions = engines.permissions.status()
        status = VoiceStatus(microphone: permissions.microphone, speechRecognition: permissions.speechRecognition, phase: .idle)
        status.phase = Self.restingPhase(permissions, needsSpeech: engines.recognition.requiresSpeechPermission)
    }

    // MARK: VoiceService

    public func status() async -> VoiceStatus {
        guard !isShutDown else { return status }
        refreshPermissions()
        return status
    }

    public func capabilities() async -> VoiceCapabilities {
        let prefs = await preferences()
        let availability = await engines.recognition.availability(locale: prefs.voice.locale, allowServer: prefs.voice.allowServerRecognition)
        let permissions = engines.permissions.status()
        let input: VoiceCapabilities.Input
        if engines.devices.currentInput() == nil { input = .unavailable } else if permissions.microphone == .granted { input = .available } else { input = .needsPermission }
        return VoiceCapabilities(
            input: input,
            recognition: availability.recognition,
            engine: availability.recognition == .unavailable ? .none : engines.recognition.engine,
            requiresSpeechRecognitionPermission: engines.recognition.requiresSpeechPermission,
            recognitionAssets: availability.assets,
            locale: prefs.voice.locale,
            liveTranscripts: engines.recognition.liveTranscripts,
            autoEndOfUtterance: true,
            handsFreeBargeIn: false, // not until echo cancellation is validated on real devices
            maxUtteranceSeconds: timing.utteranceLimit
        )
    }

    public func requestPermissions() async throws -> VoiceStatus {
        try ensureRunning()
        let result = await engines.permissions.request(speechRecognition: engines.recognition.requiresSpeechPermission)
        let needsSpeech = engines.recognition.requiresSpeechPermission
        update {
            $0.microphone = result.microphone
            $0.speechRecognition = result.speechRecognition
            if !$0.listening, !$0.speaking { $0.phase = Self.restingPhase(result, needsSpeech: needsSpeech) }
            $0.issue = Self.permissionIssue(result, needsSpeech: needsSpeech)
        }
        events.emit(.voiceCapabilitiesChanged, await capabilities())
        return status
    }

    public func startSession(conversationId: String?) async throws -> VoiceStatus {
        try ensureRunning()
        if let id = conversationId, id.isEmpty || id.count > 200 { throw AuraError.invalidRequest("conversationId must be 1-200 characters") }
        if status.sessionActive, status.conversationId != conversationId {
            stopListeningRun()
            stopSpeech()
        }
        watchDevices()
        update {
            $0.sessionActive = true
            $0.conversationId = conversationId
            $0.inputDevice = engines.devices.currentInput()
            $0.issue = nil
        }
        return status
    }

    public func endSession() async -> VoiceStatus {
        guard !isShutDown else { return status }
        stopListeningRun()
        stopSpeech()
        engines.playback.release()
        deviceTask?.cancel()
        deviceTask = nil
        let permissions = engines.permissions.status()
        let needsSpeech = engines.recognition.requiresSpeechPermission
        update {
            $0 = VoiceStatus(microphone: permissions.microphone, speechRecognition: permissions.speechRecognition,
                             phase: Self.restingPhase(permissions, needsSpeech: needsSpeech), revision: $0.revision)
        }
        return status
    }

    public func startListening(mode: VoiceListenMode) async throws -> VoiceStatus {
        try ensureRunning()
        refreshPermissions()
        let needsSpeech = engines.recognition.requiresSpeechPermission
        let permissions = engines.permissions.status()
        guard permissions.microphone == .granted, !needsSpeech || permissions.speechRecognition == .granted else {
            let issue = Self.permissionIssue(permissions, needsSpeech: needsSpeech)
            update {
                $0.phase = .needsPermission
                $0.issue = issue
            }
            throw AuraError.permissionDenied(issue?.message ?? "microphone access has not been granted; call voice.requestPermissions after the user asks to talk")
        }
        stopSpeech() // barge-in by an explicit user action
        stopListeningRun()
        watchDevices()
        let run = ListeningRun(mode: mode, startedAt: now)
        listening = run
        Log.voice.notice("listening \(run.id, privacy: .public) starting (\(mode.rawValue, privacy: .public))")
        update {
            $0.sessionActive = true
            $0.phase = .starting
            $0.listening = true
            $0.mode = mode
            $0.utteranceId = run.id
            $0.inputDevice = engines.devices.currentInput()
            $0.issue = nil
        }
        run.task = Task { [weak self] in await self?.runListening(run) }
        return status
    }

    public func stopListening() async -> VoiceStatus {
        guard let run = listening, !run.finishing else { return status }
        if run.recognition == nil {
            // Still starting: there is nothing to finalise.
            endListening(run, phase: .idle, issue: nil)
        } else {
            finish(run, issue: nil)
        }
        return status
    }

    public func cancelListening() async -> VoiceStatus {
        if let run = listening { endListening(run, phase: .idle, issue: nil) }
        return status
    }

    public func speak(_ text: String, interrupt: Bool) async throws {
        try ensureRunning()
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw AuraError.invalidRequest("nothing to speak") }
        guard text.count <= Self.maxReplyCharacters else { throw AuraError.invalidRequest("text is too long to speak") }
        guard !status.outputMuted else { return }
        if speaking != nil, !interrupt { throw AuraError.invalidRequest("already speaking") }
        stopListeningRun()
        startSpeech(streamId: nil, conversationId: nil, text: text, ended: true)
    }

    public func speakReply(conversationId: String, streamId: String) async throws -> VoiceStatus {
        try ensureRunning()
        guard let record = replies[streamId], record.conversationId == conversationId else {
            throw AuraError.notFound("no reply \(AIToolPolicy.printable(streamId)) in this conversation")
        }
        if let reason = record.ended, reason == .cancelled || reason == .error {
            throw AuraError.invalidRequest("that reply was \(reason == .cancelled ? "cancelled" : "not completed")")
        }
        guard !status.outputMuted else { return status }
        if speaking?.streamId == streamId { return status } // already speaking it
        stopListeningRun()
        startSpeech(streamId: streamId, conversationId: conversationId, text: record.text, ended: record.ended != nil)
        if record.state == .waitingForApproval, let run = speaking { announceApproval(run) }
        return status
    }

    public func stopSpeaking() async {
        stopSpeech()
    }

    public func setOutputMuted(_ muted: Bool) async -> VoiceStatus {
        if muted { stopSpeech() }
        update { $0.outputMuted = muted }
        return status
    }

    public func voices(locale: String?) async -> [VoiceOption] {
        let resolved: String
        if let locale { resolved = locale } else { resolved = await preferences().voice.locale }
        return engines.synthesis.voices(locale: resolved)
    }

    public func openSettings(_ target: OpenVoiceSettingsParams.Target) async throws {
        guard engines.openSettings(target) else { throw AuraError.unavailable("System Settings could not be opened") }
    }

    public func installRecognitionAssets() async throws {
        try ensureRunning()
        guard !installingAssets else { return }
        installingAssets = true
        let locale = await preferences().voice.locale
        let recognition = engines.recognition
        Task { [weak self] in
            var failure: String?
            do { try await recognition.installAssets(locale: locale) } catch { failure = String(describing: error) }
            guard let self else { return }
            self.installingAssets = false
            if let failure { Log.voice.error("speech model install failed: \(failure, privacy: .public)") }
            guard !self.isShutDown else { return }
            self.events.emit(.voiceCapabilitiesChanged, await self.capabilities())
        }
    }

    public func handleSystemEvent(_ event: VoiceSystemEvent) async {
        handle(event)
    }

    public func shutdown() async {
        shutdownNow()
    }

    // MARK: synchronous entry points (app lifecycle)

    /// Stops listening and speaking after a system event. Nothing restarts by itself.
    public func handle(_ event: VoiceSystemEvent) {
        guard !isShutDown, listening != nil || speaking != nil else { return }
        let issue: VoiceIssue
        switch event {
        case .appInactive: issue = VoiceIssue(.appInactive, "Voice stopped because AURA is no longer in front.", recovery: [.retry])
        case .systemSleep: issue = VoiceIssue(.systemSleep, "Voice stopped because the Mac went to sleep or locked.", recovery: [.retry])
        }
        Log.voice.notice("voice interrupted (\(issue.code.rawValue, privacy: .public))")
        if let run = listening { endListening(run, phase: .interrupted, issue: issue) }
        if speaking != nil { stopSpeech(phase: .interrupted, issue: issue) }
    }

    /// App termination: closes the microphone, stops speech and sends nothing more.
    public func shutdownNow() {
        guard !isShutDown else { return }
        if let run = listening { endListening(run, phase: .idle, issue: nil) }
        stopSpeech()
        engines.playback.release()
        deviceTask?.cancel()
        deviceTask = nil
        replies.removeAll()
        replyOrder.removeAll()
        isShutDown = true
        Log.voice.notice("voice shut down")
    }

    // MARK: listening

    private func runListening(_ run: ListeningRun) async {
        let prefs = await preferences()
        let recognition = engines.recognition, input = engines.input
        let limit = timing.recognizerStart
        let locale = prefs.voice.locale, allowServer = prefs.voice.allowServerRecognition
        async let pendingSession = Self.attempt(seconds: limit, late: { (late: any RecognitionSession) in Task { await late.cancel() } }) {
            try await recognition.start(locale: locale, allowServer: allowServer)
        }
        async let pendingCapture = Self.attempt(seconds: limit, late: { (late: any AudioCapture) in late.stop() }) {
            try await input.start()
        }
        let (recognitionResult, captureResult) = await (pendingSession, pendingCapture)
        guard isCurrent(run) else {
            if case .success(let session) = recognitionResult { Task { await session.cancel() } }
            if case .success(let capture) = captureResult { capture.stop() }
            return
        }
        let capture: any AudioCapture
        switch captureResult {
        case .success(let value): capture = value
        case .failure(let error):
            if case .success(let session) = recognitionResult { Task { await session.cancel() } }
            return endListening(run, phase: .error, issue: inputIssue(error))
        }
        let session: any RecognitionSession
        switch recognitionResult {
        case .success(let value): session = value
        case .failure(let error):
            capture.stop()
            return endListening(run, phase: .error, issue: Self.recognitionIssue(error, locale: locale))
        }
        run.capture = capture
        run.recognition = session
        run.device = capture.device ?? status.inputDevice
        run.health = InputHealthMonitor(startedAt: now, limits: timing.startup(for: run.device?.transport))
        update { $0.inputDevice = run.device }
        Log.voice.notice("listening \(run.id, privacy: .public) open on \(run.device?.transport.rawValue ?? "unknown", privacy: .public) input")

        run.audioTask = Task { [weak self] in
            for await event in capture.events {
                guard let self, self.isCurrent(run) else { return }
                self.receive(event, run)
            }
            self?.audioEnded(run)
        }
        run.resultsTask = Task { [weak self] in
            do {
                for try await result in session.results {
                    guard let self, self.isCurrent(run) else { return }
                    self.receive(result, run)
                }
                self?.recognitionEnded(run, error: nil)
            } catch {
                self?.recognitionEnded(run, error: error)
            }
        }
        let tick = timing.tick
        run.watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: tick)
                guard let self, self.isCurrent(run) else { return }
                self.check(run)
            }
        }
    }

    private func receive(_ event: AudioInputEvent, _ run: ListeningRun) {
        guard !run.finishing else { return }
        switch event {
        case .configurationChanged:
            let name = engines.devices.currentInput()?.name
            endListening(run, phase: .interrupted, issue: VoiceIssue(
                .deviceChanged, name.map { "The microphone changed to \($0). Press Talk to continue." } ?? "The audio device changed. Press Talk to continue.",
                recovery: [.retry], transport: run.device?.transport
            ))
        case .chunk(let chunk):
            let time = now
            run.health?.observe(peak: chunk.peak, at: time)
            run.activity.observe(rms: chunk.rms, at: time)
            run.recognition?.append(chunk)
            if run.audioReadyAt == nil, run.health?.hasUsableAudio == true {
                run.audioReadyAt = time
                update { $0.phase = .listening }
            }
            if time - run.lastLevelAt >= 0.05 {
                run.lastLevelAt = time
                events.emit(.voiceInputLevel, VoiceInputLevelPayload(utteranceId: run.id, level: normalizedLevel(chunk.rms)))
            }
        }
    }

    private func audioEnded(_ run: ListeningRun) {
        guard isCurrent(run), !run.finishing else { return }
        endListening(run, phase: .interrupted, issue: lostIssue(run))
    }

    private func receive(_ result: RecognitionResult, _ run: ListeningRun) {
        switch result {
        case .volatile(let text): run.volatile = text
        case .final(let text):
            run.finalized = Self.join(run.finalized, text)
            run.volatile = ""
        }
        let hypothesis = run.hypothesis
        guard hypothesis != run.lastSentText, !hypothesis.isEmpty else { return }
        run.lastSentText = hypothesis
        if !run.finishing { run.activity.heard(at: now) }
        run.seq += 1
        events.emit(.voiceTranscript, VoiceTranscriptPayload(utteranceId: run.id, seq: run.seq, text: hypothesis, isFinal: false))
    }

    private func recognitionEnded(_ run: ListeningRun, error: (any Error)?) {
        guard isCurrent(run) else { return }
        if let error {
            Log.voice.error("recognition failed: \(String(describing: error), privacy: .public)")
            return endListening(run, phase: .error, issue: VoiceIssue(.recognitionFailed, "Speech recognition stopped unexpectedly. Try again.", recovery: [.retry]))
        }
        if !run.finishing {
            // The recogniser finished on its own (it heard the end of speech): close the microphone.
            run.finishing = true
            run.capture?.stop()
        }
        deliverFinal(run)
    }

    /// Periodic checks: input health, end of utterance, limits.
    private func check(_ run: ListeningRun) {
        let time = now
        if run.finishing {
            if let started = run.finishStartedAt, time - started > timing.finalize {
                endListening(run, phase: .error, issue: VoiceIssue(.recognitionFailed, "Speech recognition took too long to finish. Try again.", recovery: [.retry]))
            }
            return
        }
        guard let health = run.health else {
            // Engines still starting; their own time limits apply.
            return
        }
        switch health.evaluate(at: time) {
        case .notDelivering: return endListening(run, phase: .error, issue: noAudioIssue(run, silent: false))
        case .silent: return endListening(run, phase: .error, issue: noAudioIssue(run, silent: true))
        case .stalled: return endListening(run, phase: .error, issue: lostIssue(run))
        case .waiting, .healthy: break
        }
        if time - run.startedAt > timing.utteranceLimit {
            return finish(run, issue: VoiceIssue(.timeLimit, "Listening stops after \(Int(timing.utteranceLimit)) seconds.", recovery: []))
        }
        guard let ready = run.audioReadyAt else { return }
        if !run.activity.speechStarted {
            if time - ready > timing.noSpeech {
                endListening(run, phase: .idle, issue: VoiceIssue(.noSpeech, "I didn't hear anything. Press Talk to try again.", recovery: [.retry]))
            }
            return
        }
        if run.mode == .autoEnd {
            let hasText = !run.hypothesis.isEmpty
            if run.activity.pauseExceeded(timing.endOfUtterance, at: time), hasText || run.activity.pauseExceeded(timing.endOfUtterance * 3, at: time) {
                finish(run, issue: nil)
            }
        }
    }

    /// Closes the microphone and asks for the final transcript.
    private func finish(_ run: ListeningRun, issue: VoiceIssue?) {
        guard isCurrent(run), !run.finishing else { return }
        run.finishing = true
        run.finishStartedAt = now
        run.pendingIssue = issue
        run.capture?.stop()
        update {
            $0.phase = .recognizing
            $0.listening = false
        }
        if let session = run.recognition { Task { await session.finish() } } else { deliverFinal(run) }
    }

    private func deliverFinal(_ run: ListeningRun) {
        guard isCurrent(run), !run.delivered else { return }
        run.delivered = true
        let text = run.hypothesis.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            run.seq += 1
            events.emit(.voiceTranscript, VoiceTranscriptPayload(utteranceId: run.id, seq: run.seq, text: text, isFinal: true))
        }
        let issue = text.isEmpty ? (run.pendingIssue ?? VoiceIssue(.noSpeech, "I didn't catch that. Press Talk to try again.", recovery: [.retry])) : run.pendingIssue
        Log.voice.notice("listening \(run.id, privacy: .public) finished (\(text.isEmpty ? "nothing heard" : "transcript", privacy: .public))")
        endListening(run, phase: .idle, issue: issue)
    }

    /// Ends a run: microphone closed, recogniser released, tasks stopped.
    private func endListening(_ run: ListeningRun, phase: VoicePhase, issue: VoiceIssue?) {
        guard isCurrent(run) else { return }
        listening = nil
        run.tearDown()
        if let issue, issue.code != .noSpeech, issue.code != .timeLimit {
            Log.voice.notice("listening \(run.id, privacy: .public) ended: \(issue.code.rawValue, privacy: .public)")
        }
        update {
            $0.phase = speaking != nil ? $0.phase : phase
            $0.listening = false
            $0.mode = nil
            $0.issue = issue
        }
    }

    private func stopListeningRun() {
        if let run = listening { endListening(run, phase: .idle, issue: nil) }
    }

    private func isCurrent(_ run: ListeningRun) -> Bool { listening === run }

    // MARK: speaking

    private func startSpeech(streamId: String?, conversationId: String?, text: String, ended: Bool) {
        stopSpeech()
        let run = SpeakingRun(streamId: streamId, conversationId: conversationId)
        speaking = run
        run.enqueue(run.planner.append(text))
        if ended {
            run.enqueue(run.planner.finish())
            run.ended = true
        }
        update {
            $0.sessionActive = true
            $0.speaking = true
            $0.phase = run.segments.isEmpty && !run.ended ? .thinking : .speaking
            $0.speechId = run.id
            $0.speakingStreamId = streamId
            $0.issue = nil
        }
        Log.voice.notice("speech \(run.id, privacy: .public) started\(streamId == nil ? "" : " for a reply", privacy: .public)")
        run.pump = Task { [weak self] in await self?.pump(run) }
    }

    private func pump(_ run: SpeakingRun) async {
        let prefs = await preferences()
        let voice = SpeechVoiceRequest(locale: prefs.voice.locale, voiceId: prefs.voice.synthesisVoiceId, rate: prefs.voice.speechRate)
        let synthesis = engines.synthesis, playback = engines.playback
        while isCurrent(run), !Task.isCancelled {
            guard run.played < run.segments.count else {
                if run.ended { return finishSpeech(run) }
                if status.phase == .speaking { events.emit(.voiceSpeechLevel, VoiceSpeechLevelPayload(level: 0)) }
                update { $0.phase = .thinking }
                await run.waitForMore()
                continue
            }
            let index = run.played
            let render = run.render(index, synthesis, voice)
            if index + 1 < run.segments.count { _ = run.render(index + 1, synthesis, voice) } // prefetch the next sentence
            let speech: SynthesizedSpeech
            do {
                speech = try await render.value
            } catch {
                guard isCurrent(run), !(error is CancellationError) else { return }
                Log.voice.error("speech synthesis failed: \(String(describing: error), privacy: .public)")
                return stopSpeech(phase: .error, issue: VoiceIssue(.synthesisFailed, "Astra's voice could not be produced. Try again.", recovery: [.retry]))
            }
            guard isCurrent(run) else { return }
            run.renders[index] = nil
            let text = run.segments[index].text
            events.emit(.voiceSpeechProgress, VoiceSpeechProgressPayload(speechId: run.id, streamId: run.streamId, segment: index, text: text, state: .started))
            do {
                for try await event in playback.play(speech) {
                    guard isCurrent(run) else { return }
                    switch event {
                    case .started: update { $0.phase = .speaking }
                    case .level(let level): events.emit(.voiceSpeechLevel, VoiceSpeechLevelPayload(level: level))
                    case .finished: break
                    }
                }
            } catch PlaybackError.deviceChanged {
                guard isCurrent(run) else { return }
                let name = engines.devices.currentOutput()?.name
                return stopSpeech(phase: .interrupted, issue: VoiceIssue(
                    .deviceChanged, name.map { "The speaker changed to \($0). Astra stopped talking." } ?? "The speaker changed. Astra stopped talking.", recovery: [.retry]
                ))
            } catch {
                guard isCurrent(run), !(error is CancellationError) else { return }
                Log.voice.error("speech playback failed: \(String(describing: error), privacy: .public)")
                return stopSpeech(phase: .error, issue: VoiceIssue(.playbackFailed, "Astra's voice could not be played. Try again.", recovery: [.retry]))
            }
            guard isCurrent(run) else { return }
            events.emit(.voiceSpeechProgress, VoiceSpeechProgressPayload(speechId: run.id, streamId: run.streamId, segment: index, text: text, state: .finished))
            run.played += 1
        }
    }

    private func finishSpeech(_ run: SpeakingRun) {
        guard isCurrent(run) else { return }
        speaking = nil
        run.tearDown()
        engines.playback.release()
        events.emit(.voiceSpeechLevel, VoiceSpeechLevelPayload(level: 0))
        Log.voice.notice("speech \(run.id, privacy: .public) finished")
        update {
            $0.speaking = false
            $0.speechId = nil
            $0.speakingStreamId = nil
            if !$0.listening { $0.phase = .idle }
        }
    }

    /// Stops any speech now. `phase`/`issue` describe why (nil: the user or a new action stopped it).
    private func stopSpeech(phase: VoicePhase = .idle, issue: VoiceIssue? = nil) {
        guard let run = speaking else { return }
        speaking = nil
        run.tearDown()
        engines.playback.release()
        if !isShutDown { events.emit(.voiceSpeechLevel, VoiceSpeechLevelPayload(level: 0)) }
        update {
            $0.speaking = false
            $0.speechId = nil
            $0.speakingStreamId = nil
            if !$0.listening { $0.phase = phase }
            if issue != nil || phase == .idle { $0.issue = issue }
        }
    }

    private func isCurrent(_ run: SpeakingRun) -> Bool { speaking === run }

    private func announceApproval(_ run: SpeakingRun) {
        guard !run.announcedApproval else { return }
        run.announcedApproval = true
        run.enqueue([SpokenSegment("I need your approval on screen.")])
    }

    // MARK: AIReplyObserver

    public func replyStarted(streamId: String, conversationId: String) {
        guard !isShutDown else { return }
        // A new reply supersedes speech of an older one in the same conversation.
        if let run = speaking, run.conversationId == conversationId, run.streamId != streamId { stopSpeech() }
        replies[streamId] = ReplyRecord(conversationId: conversationId)
        replyOrder.append(streamId)
        while replyOrder.count > Self.keptReplies { replies[replyOrder.removeFirst()] = nil }
    }

    public func replyText(streamId: String, delta: String) {
        guard let record = replies[streamId], record.text.count < Self.maxReplyCharacters else { return }
        record.text += delta
        guard let run = speaking, run.streamId == streamId else { return }
        if run.enqueue(run.planner.append(delta)), status.phase == .thinking, run.played == 0 { update { $0.phase = .speaking } }
    }

    public func replyState(streamId: String, state: AITurnState) {
        guard let record = replies[streamId] else { return }
        record.state = state
        guard let run = speaking, run.streamId == streamId else { return }
        if state == .waitingForApproval { announceApproval(run) } else { run.announcedApproval = false }
    }

    public func replyEnded(streamId: String, reason: FinishReason) {
        guard let record = replies[streamId] else { return }
        record.ended = reason
        guard let run = speaking, run.streamId == streamId else { return }
        switch reason {
        case .stop, .length:
            run.enqueue(run.planner.finish())
            run.ended = true
            run.wake()
        case .cancelled, .error:
            stopSpeech()
        }
    }

    public func conversationChanged(conversationId: String, reason: AIConversationChangeReason) {
        switch reason {
        case .repositoryChanged, .toolsUnavailable: return
        case .reset, .ended, .evicted, .githubAccessChanged, .providerChanged: break
        }
        // Drop voice's copies of that conversation's replies (private content may have been cleared).
        for (id, record) in replies where record.conversationId == conversationId { replies[id] = nil }
        replyOrder.removeAll { replies[$0] == nil }
        if let run = speaking, run.conversationId == conversationId { stopSpeech() }
        if status.conversationId == conversationId, reason == .ended || reason == .evicted {
            update {
                $0.conversationId = nil
                $0.issue = VoiceIssue(.conversationEnded, "The conversation this voice session used has ended.", recovery: [])
            }
        }
    }

    // MARK: devices

    private func watchDevices() {
        guard deviceTask == nil, !isShutDown else { return }
        let changes = engines.devices.changes()
        deviceTask = Task { [weak self] in
            for await change in changes {
                guard let self else { return }
                self.routeChanged(change)
            }
        }
    }

    private func routeChanged(_ change: AudioRouteChange) {
        guard !isShutDown else { return }
        switch change.direction {
        case .input:
            update { $0.inputDevice = change.device }
            guard let run = listening, !run.finishing else { return }
            if change.kind == .deviceLost {
                Log.voice.notice("input device lost while listening")
                endListening(run, phase: .interrupted, issue: lostIssue(run))
            } else if change.device != run.device {
                // The same device re-announcing itself (Bluetooth profile switch) is not a change.
                Log.voice.notice("input device changed while listening")
                endListening(run, phase: .interrupted, issue: VoiceIssue(
                    .deviceChanged, change.device.map { "The microphone changed to \($0.name). Press Talk to continue." } ?? "The microphone was disconnected.",
                    recovery: change.device == nil ? [.chooseInput] : [.retry], transport: run.device?.transport
                ))
            }
        case .output:
            guard speaking != nil else { return }
            Log.voice.notice("output device changed while speaking")
            stopSpeech(phase: .interrupted, issue: VoiceIssue(
                .deviceChanged, change.device.map { "The speaker changed to \($0.name). Astra stopped talking." } ?? "The speaker was disconnected. Astra stopped talking.",
                recovery: [.retry]
            ))
        }
    }

    // MARK: helpers

    private var now: Double {
        let elapsed = ContinuousClock.now - origin
        return Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18
    }

    private func ensureRunning() throws {
        if isShutDown { throw AuraError.unavailable("voice has shut down") }
    }

    private func refreshPermissions() {
        let permissions = engines.permissions.status()
        guard permissions.microphone != status.microphone || permissions.speechRecognition != status.speechRecognition else { return }
        let needsSpeech = engines.recognition.requiresSpeechPermission
        update {
            $0.microphone = permissions.microphone
            $0.speechRecognition = permissions.speechRecognition
            if !$0.listening, !$0.speaking, $0.phase == .needsPermission || $0.phase == .idle {
                $0.phase = Self.restingPhase(permissions, needsSpeech: needsSpeech)
                if $0.phase == .idle, $0.issue?.code == .permissionDenied { $0.issue = nil }
            }
        }
    }

    private func update(_ change: (inout VoiceStatus) -> Void) {
        var next = status
        change(&next)
        guard !next.sameContent(as: status) else { return }
        next.revision = status.revision + 1
        status = next
        guard !isShutDown else { return }
        events.emit(.voiceStatusChanged, status)
    }

    static func restingPhase(_ permissions: VoicePermissionStatus, needsSpeech: Bool) -> VoicePhase {
        permissions.microphone == .granted && (!needsSpeech || permissions.speechRecognition == .granted) ? .idle : .needsPermission
    }

    static func permissionIssue(_ permissions: VoicePermissionStatus, needsSpeech: Bool) -> VoiceIssue? {
        switch permissions.microphone {
        case .denied:
            return VoiceIssue(.permissionDenied, "Microphone access is off for AURA. Turn it on in System Settings › Privacy & Security › Microphone.", recovery: [.openMicrophoneSettings])
        case .restricted:
            return VoiceIssue(.permissionRestricted, "Microphone access is restricted on this Mac.", recovery: [])
        case .notDetermined, .granted: break
        }
        guard needsSpeech else { return nil }
        switch permissions.speechRecognition {
        case .denied:
            return VoiceIssue(.permissionDenied, "Speech recognition is off for AURA. Turn it on in System Settings › Privacy & Security › Speech Recognition.", recovery: [.openSpeechSettings])
        case .restricted:
            return VoiceIssue(.permissionRestricted, "Speech recognition is restricted on this Mac.", recovery: [])
        case .notDetermined, .granted: return nil
        }
    }

    private func inputIssue(_ error: any Error) -> VoiceIssue {
        let device = engines.devices.currentInput()
        switch error {
        case VoiceAudioError.noInputDevice:
            return VoiceIssue(.noInputDevice, "No microphone is available. Connect one or choose an input in Sound settings.", recovery: [.chooseInput])
        case VoiceAudioError.engineFailed(let code, let transport):
            let what = transport == .bluetooth ? "The Bluetooth headset's microphone" : "The microphone"
            return VoiceIssue(.inputFailed, "\(what) could not start (error \(code)). Try again, or choose another microphone.", recovery: [.retry, .chooseInput], transport: transport ?? device?.transport)
        case is VoiceTimeoutError:
            return VoiceIssue(.inputFailed, "The microphone did not start in time. Try again, or choose another microphone.", recovery: [.retry, .chooseInput], transport: device?.transport)
        default:
            return VoiceIssue(.inputFailed, "The microphone could not start. Try again, or choose another microphone.", recovery: [.retry, .chooseInput], transport: device?.transport)
        }
    }

    static func recognitionIssue(_ error: any Error, locale: String) -> VoiceIssue {
        switch error {
        case RecognitionError.assetsMissing:
            return VoiceIssue(.recognitionUnavailable, "The on-device speech model for \(locale) isn't installed yet.", recovery: [.installSpeechAssets])
        case RecognitionError.unavailable(let reason):
            return VoiceIssue(.recognitionUnavailable, "Speech recognition isn't available: \(reason).", recovery: [])
        case is VoiceTimeoutError:
            return VoiceIssue(.recognitionFailed, "Speech recognition took too long to start. Try again.", recovery: [.retry])
        default:
            return VoiceIssue(.recognitionFailed, "Speech recognition could not start. Try again.", recovery: [.retry])
        }
    }

    private func noAudioIssue(_ run: ListeningRun, silent: Bool) -> VoiceIssue {
        let name = run.device?.name ?? "the microphone"
        let bluetooth = run.device?.transport == .bluetooth
        let message = silent
            ? "\(name) is sending only silence; it may be muted. Try again, or choose another microphone."
            : "No audio is arriving from \(name). " + (bluetooth ? "Bluetooth headsets sometimes need reconnecting. " : "") + "Try again, or choose another microphone."
        return VoiceIssue(.noAudio, message, recovery: [.retry, .chooseInput], transport: run.device?.transport)
    }

    private func lostIssue(_ run: ListeningRun) -> VoiceIssue {
        let name = run.device?.name ?? "the microphone"
        return VoiceIssue(.inputLost, "Audio from \(name) stopped; it may have been disconnected. Try again, or choose another microphone.",
                          recovery: [.retry, .chooseInput], transport: run.device?.transport)
    }

    nonisolated static func join(_ first: String, _ second: String) -> String {
        guard !first.isEmpty else { return second }
        guard !second.isEmpty else { return first }
        if first.last!.isWhitespace || second.first!.isWhitespace { return first + second }
        return first + " " + second
    }

    /// Runs `body` with a time limit. A result that arrives after the limit goes to `late` (to be released).
    nonisolated static func attempt<T: Sendable>(
        seconds: Double, late: @escaping @Sendable (T) -> Void, _ body: @escaping @Sendable () async throws -> T
    ) async -> Result<T, Error> {
        await withCheckedContinuation { (done: CheckedContinuation<Result<T, Error>, Never>) in
            let once = OnceFlag()
            let work = Task {
                do {
                    let value = try await body()
                    if once.set() { done.resume(returning: .success(value)) } else { late(value) }
                } catch {
                    if once.set() { done.resume(returning: .failure(error)) }
                }
            }
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                if once.set() {
                    work.cancel()
                    done.resume(returning: .failure(VoiceTimeoutError()))
                }
            }
        }
    }
}

struct VoiceTimeoutError: Error {}

// MARK: runs

@MainActor
final class ListeningRun {
    let id = "utt-\(UUID().uuidString.lowercased())"
    let mode: VoiceListenMode
    let startedAt: Double
    var capture: (any AudioCapture)?
    var recognition: (any RecognitionSession)?
    var device: VoiceDevice?
    var health: InputHealthMonitor?
    var activity = SpeechActivity()
    var audioReadyAt: Double?
    var lastLevelAt: Double = -1
    var finalized = ""
    var volatile = ""
    var lastSentText = ""
    var seq = 0
    var finishing = false
    var finishStartedAt: Double?
    var pendingIssue: VoiceIssue?
    var delivered = false
    var task: Task<Void, Never>?
    var audioTask: Task<Void, Never>?
    var resultsTask: Task<Void, Never>?
    var watchdog: Task<Void, Never>?

    init(mode: VoiceListenMode, startedAt: Double) {
        self.mode = mode
        self.startedAt = startedAt
    }

    var hypothesis: String { VoiceController.join(finalized, volatile) }

    func tearDown() {
        capture?.stop()
        if let recognition { Task { await recognition.cancel() } }
        capture = nil
        recognition = nil
        task?.cancel()
        audioTask?.cancel()
        resultsTask?.cancel()
        watchdog?.cancel()
    }
}

@MainActor
final class SpeakingRun {
    let id = "speech-\(UUID().uuidString.lowercased())"
    let streamId: String?
    let conversationId: String?
    var planner = SpokenReplyPlanner()
    var segments: [SpokenSegment] = []
    var played = 0
    var ended = false
    var announcedApproval = false
    var renders: [Int: Task<SynthesizedSpeech, Error>] = [:]
    var pump: Task<Void, Never>?
    private var waiter: CheckedContinuation<Void, Never>?

    init(streamId: String?, conversationId: String?) {
        self.streamId = streamId
        self.conversationId = conversationId
    }

    /// Adds segments; true when any were added.
    @discardableResult
    func enqueue(_ new: [SpokenSegment]) -> Bool {
        guard !new.isEmpty else { return false }
        segments += new
        wake()
        return true
    }

    func render(_ index: Int, _ synthesis: any SpeechSynthesisEngine, _ voice: SpeechVoiceRequest) -> Task<SynthesizedSpeech, Error> {
        if let existing = renders[index] { return existing }
        let text = segments[index].text
        let task = Task.detached { try await synthesis.render(text, voice: voice) }
        renders[index] = task
        return task
    }

    func waitForMore() async {
        await withCheckedContinuation { waiter = $0 }
    }

    func wake() {
        waiter?.resume()
        waiter = nil
    }

    func tearDown() {
        pump?.cancel()
        renders.values.forEach { $0.cancel() }
        renders.removeAll()
        wake()
    }
}

@MainActor
final class ReplyRecord {
    let conversationId: String
    var text = ""
    var state: AITurnState = .idle
    var ended: FinishReason?
    init(conversationId: String) { self.conversationId = conversationId }
}
