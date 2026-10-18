@preconcurrency import AVFoundation
import Foundation
import Testing
@testable import AuraCore

// Real-audio phase: speaking pace, pauses, pronunciation, pause/resume and replay.

@Suite struct SpeechPaceTests {
    @Test func paceMapsThroughTheMeasuredCurveNotAMultiplier() {
        let natural = SpeechPace.utteranceRate(pace: 1, voiceIdentifier: nil)
        #expect(abs(natural - 0.5) < 0.001)
        let calm = SpeechPace.utteranceRate(pace: 0.85, voiceIdentifier: nil)
        #expect(calm > 0.33 && calm < 0.37) // ≈0.35, not 0.5 × 0.85 = 0.425
        #expect(abs(SpeechPace.utteranceRate(pace: 0.7, voiceIdentifier: nil) - 0.155) < 0.01)
        #expect(abs(SpeechPace.utteranceRate(pace: 1.3, voiceIdentifier: nil) - 0.55) < 0.001)
        // The steep part above 0.5 keeps 1.2 well below the old 0.6 (≈310 words a minute).
        #expect(SpeechPace.utteranceRate(pace: 1.2, voiceIdentifier: nil) < 0.54)
    }

    @Test func paceIsMonotonicAndClamped() {
        var previous: Float = -1
        for step in 0...60 {
            let rate = SpeechPace.utteranceRate(pace: 0.7 + Double(step) * 0.01, voiceIdentifier: nil)
            #expect(rate >= previous)
            previous = rate
        }
        #expect(SpeechPace.utteranceRate(pace: 0.2, voiceIdentifier: nil) == SpeechPace.utteranceRate(pace: 0.7, voiceIdentifier: nil))
        #expect(SpeechPace.utteranceRate(pace: 5, voiceIdentifier: nil) == SpeechPace.utteranceRate(pace: 1.3, voiceIdentifier: nil))
        #expect(SpeechPace.utteranceRate(pace: .nan, voiceIdentifier: nil) == SpeechPace.utteranceRate(pace: 0.85, voiceIdentifier: nil))
    }

    @Test func eloquenceVoicesUseTheirOwnCurve() {
        let apple = SpeechPace.utteranceRate(pace: 0.85, voiceIdentifier: "com.apple.voice.compact.en-US.Samantha")
        let eloquence = SpeechPace.utteranceRate(pace: 0.85, voiceIdentifier: "com.apple.eloquence.en-US.Reed")
        #expect(eloquence > apple) // eloquence slows faster below 0.5, so it needs a higher native rate
    }

    @Test func pausesGrowAtSlowerPaces() {
        #expect(SpeechPace.pause(after: .none, pace: 0.85) == 0)
        #expect(SpeechPace.pause(after: .paragraph, pace: 1) > SpeechPace.pause(after: .sentence, pace: 1))
        #expect(SpeechPace.pause(after: .sentence, pace: 0.7) > SpeechPace.pause(after: .sentence, pace: 1.3))
        #expect(abs(SpeechPace.pause(after: .sentence, pace: 1) - 0.36) < 0.001)
    }
}

@Suite struct SpeechPronunciationTests {
    @Test func developerTermsAreRewrittenForTheVoiceOnly() {
        #expect(SpeechPronunciation.spoken("Open GitHub on macOS.") == "Open Git Hub on mac O S.")
        #expect(SpeechPronunciation.spoken("Check GitHub's JSON in the README.") == "Check Git Hub's JSON in the read me.")
        #expect(SpeechPronunciation.spoken("Run npm install, then open Xcode.") == "Run N P M install, then open X code.")
        #expect(SpeechPronunciation.spoken("Edit src/app/main.swift and package.json.") == "Edit src slash app slash main dot swift and package dot Jason.")
        #expect(SpeechPronunciation.spoken("Call fetchUserData with user_id.") == "Call fetch User Data with user I D.")
        #expect(SpeechPronunciation.spoken("Bump to v1.2.3 and close #42.") == "Bump to version 1 point 2 point 3 and close number 42.")
        #expect(SpeechPronunciation.spoken("Avoid git push --force here.") == "Avoid git push dash dash force here.")
        #expect(SpeechPronunciation.spoken("Commit 6aed294 fixed it.") == "Commit 6 a e d 2 9 4 fixed it.")
        #expect(SpeechPronunciation.spoken("The AURA app uses SwiftUI and WKWebView.") == "The Aura app uses Swift U I and W K web view.")
        #expect(SpeechPronunciation.spoken("Use tools, e.g. linters.") == "Use tools, for example linters.")
    }

    @Test func ordinaryProseAndNumbersAreLeftAlone() {
        for text in ["It took 3.5 seconds.", "Two APIs and three IDs.", "Visit example.com today.", "Use JavaScript and TypeScript.",
                     "I found three pull requests waiting for review.", "Yes, and/or no.", "Is it 10:30 a.m. already?"] {
            let spoken = SpeechPronunciation.spoken(text)
            if text == "Yes, and/or no." { #expect(spoken == "Yes, and or no.") } else { #expect(spoken == text) }
        }
    }
}

@Suite struct SpokenPauseTests {
    @Test func paragraphEndsGetALongerPause() {
        var planner = SpokenReplyPlanner()
        let segments = planner.append("First point. Second point.\n\nNew paragraph here.\n- A list item\n- Another") + planner.finish()
        #expect(segments.map(\.text) == ["First point.", "Second point.", "New paragraph here.", "A list item.", "Another."])
        #expect(segments.map(\.pause) == [.sentence, .paragraph, .paragraph, .paragraph, .paragraph])
    }

    @Test func notesForCodeAndTablesArePausedAfter() {
        var planner = SpokenReplyPlanner()
        let segments = planner.append("Here it is.\n```swift\nlet x = 1\n```\nDone.") + planner.finish()
        #expect(segments.first { $0.text == "I've put the code on screen." }?.pause == .paragraph)
    }
}

@Suite @MainActor struct VoiceSpeechControlTests {
    @Test func captionsKeepTheOriginalTextWhileTheVoiceGetsThePronunciation() async throws {
        let h = VoiceHarness()
        try await h.controller.speak("Open GitHub on macOS.", interrupt: true)
        #expect(await h.until { !h.controller.status.speaking })
        #expect(h.synthesis.rendered == ["Open Git Hub on mac O S."])
        #expect(h.events("voice.speechProgress").first?["text"] == .string("Open GitHub on macOS."))
    }

    @Test func sentencesGetAPauseAfterThemButTheLastDoesNot() async throws {
        let h = VoiceHarness()
        try await h.controller.speak("One here. Two here.\n\nThree here.", interrupt: true)
        #expect(await h.until { !h.controller.status.speaking })
        let base = 0.1 // FakeSynthesis renders 2205 samples at 22.05 kHz
        let durations = h.playback.durations
        #expect(durations.count == 3)
        let pace = Preferences.Voice.defaultSpeechRate
        #expect(abs(durations[0] - base - SpeechPace.pause(after: .sentence, pace: pace)) < 0.01)
        #expect(abs(durations[1] - base - SpeechPace.pause(after: .paragraph, pace: pace)) < 0.01)
        #expect(abs(durations[2] - base) < 0.001)
    }

    @Test func pauseHoldsSpeechAndResumeContinuesFromThere() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        try await h.controller.speak("One. Two. Three.", interrupt: true)
        #expect(await h.until { h.playback.played == 1 && h.controller.status.phase == .speaking })
        let paused = await h.controller.pauseSpeaking()
        #expect(paused.speechPaused && paused.speaking && paused.phase == .speaking)
        #expect(h.playback.pauses == 1)
        #expect(h.events("voice.speechLevel").last?["level"] == .number(0))
        // The playing sentence ends while paused: the next one must not start.
        h.playback.finishCurrent()
        try await Task.sleep(for: .milliseconds(60))
        #expect(h.playback.played == 1)
        _ = await h.controller.pauseSpeaking() // idempotent
        #expect(h.playback.pauses == 1)
        let resumed = await h.controller.resumeSpeaking()
        #expect(!resumed.speechPaused && h.playback.resumes == 1)
        #expect(await h.until { h.playback.played == 2 })
        h.playback.finishCurrent()
        #expect(await h.until { h.playback.played == 3 })
        h.playback.finishCurrent()
        #expect(await h.until { !h.controller.status.speaking })
        #expect(!h.controller.status.speechPaused)
    }

    @Test func stoppingOrListeningEndsAPausedSpeech() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        try await h.controller.speak("One. Two.", interrupt: true)
        #expect(await h.until { h.playback.played == 1 })
        _ = await h.controller.pauseSpeaking()
        _ = try await h.listen()
        #expect(!h.controller.status.speaking && !h.controller.status.speechPaused)
        _ = await h.controller.cancelListening()
        // Sleep stops a paused speech too and leaves nothing paused.
        try await h.controller.speak("Again. And again.", interrupt: true)
        #expect(await h.until { h.controller.status.phase == .speaking })
        _ = await h.controller.pauseSpeaking()
        h.controller.handle(.systemSleep)
        #expect(!h.controller.status.speaking && !h.controller.status.speechPaused && h.controller.status.phase == .interrupted)
    }

    @Test func replaySpeaksTheLastResponseAgain() async throws {
        let h = VoiceHarness()
        #expect(!h.controller.status.canReplay)
        await #expect(throws: AuraError.self) { _ = try await h.controller.replay() }
        try await h.controller.speak("Hello there. All done.", interrupt: true)
        #expect(await h.until { !h.controller.status.speaking })
        #expect(h.controller.status.canReplay)
        _ = try await h.controller.replay()
        #expect(await h.until { !h.controller.status.speaking && h.playback.played == 4 })
        #expect(h.synthesis.rendered.filter { $0 == "Hello there." }.count == 2)
        // Muted: replay does nothing.
        _ = await h.controller.setOutputMuted(true)
        _ = try await h.controller.replay()
        try await Task.sleep(for: .milliseconds(40))
        #expect(h.playback.played == 4)
    }

    @Test func aReplyStoppedEarlyIsReplayedInFullAndForgottenWithItsConversation() async throws {
        let h = VoiceHarness()
        h.playback.mode = .manual
        h.controller.replyStarted(streamId: "ai-1", conversationId: "conv-1")
        h.controller.replyText(streamId: "ai-1", delta: "First sentence. Second")
        _ = try await h.controller.speakReply(conversationId: "conv-1", streamId: "ai-1")
        #expect(await h.until { h.playback.played == 1 })
        await h.controller.stopSpeaking()
        h.controller.replyText(streamId: "ai-1", delta: " sentence is here.")
        h.controller.replyEnded(streamId: "ai-1", reason: .stop)
        #expect(h.controller.status.canReplay)
        h.playback.mode = .automatic
        let replaying = try await h.controller.replay()
        #expect(replaying.speakingStreamId == "ai-1")
        #expect(await h.until { !h.controller.status.speaking })
        #expect(h.synthesis.rendered.contains("Second sentence is here."))
        h.controller.conversationChanged(conversationId: "conv-1", reason: .reset)
        #expect(!h.controller.status.canReplay)
        await #expect(throws: AuraError.self) { _ = try await h.controller.replay() }
    }
}

// MARK: real synthesis and recognition (no microphone, no speakers)

@Suite(.serialized, .timeLimit(.minutes(2))) struct RealSpeechClarityTests {
    static let passage = "I found three pull requests waiting for review. The first one updates the build script, and the second one fixes a crash when the window closes."

    /// Seconds of audio between the first and last non-silent sample.
    static func spokenSeconds(_ speech: SynthesizedSpeech) -> Double {
        var samples: [Float] = []
        for buffer in speech.buffers { if let data = buffer.floatChannelData { samples += UnsafeBufferPointer(start: data[0], count: Int(buffer.frameLength)) } }
        guard let first = samples.firstIndex(where: { abs($0) > 0.01 }), let last = samples.lastIndex(where: { abs($0) > 0.01 }) else { return 0 }
        return Double(last - first) / (speech.format?.sampleRate ?? 22_050)
    }

    @Test func theDefaultPaceIsAboutFifteenPercentSlowerThanNatural() async throws {
        guard ProcessInfo.processInfo.environment["AURA_SKIP_SPEECH_INTEGRATION"] == nil else { return }
        let synthesis = SystemSpeechSynthesis()
        let natural = try await synthesis.render(Self.passage, voice: SpeechVoiceRequest(locale: "en-US", voiceId: nil, rate: 1))
        let calm = try await synthesis.render(Self.passage, voice: SpeechVoiceRequest(locale: "en-US", voiceId: nil, rate: 0.85))
        let ratio = Self.spokenSeconds(natural) / Self.spokenSeconds(calm) // pace = 1 / duration
        #expect(ratio > 0.80 && ratio < 0.90, "measured pace \(ratio)")
        // No clipping in the rendered audio.
        let peak = calm.buffers.compactMap { b in b.floatChannelData.map { d in (0..<Int(b.frameLength)).map { abs(d[0][$0]) }.max() ?? 0 } }.max() ?? 0
        #expect(peak < 1.0, "peak \(peak)")
    }

    @Test func noveltyVoicesAreNeverOffered() {
        let voices = SystemSpeechSynthesis().voices(locale: "en-US")
        for name in ["Bells", "Bubbles", "Zarvox", "Bad News", "Whisper", "Trinoids"] { #expect(!voices.contains { $0.name == name }) }
        let fallback = SystemSpeechSynthesis.voice(for: SpeechVoiceRequest(locale: "en-US", voiceId: "com.example.missing.voice", rate: 1))
        #expect(fallback != nil && fallback?.voiceTraits.contains(.isNoveltyVoice) == false)
    }

    /// Opt-in report (AURA_VOICE_PRONUNCIATION_REPORT=1): each phrase is synthesised as
    /// written and as rewritten, then recognised on device without AURA's vocabulary.
    @Test func pronunciationReport() async throws {
        guard ProcessInfo.processInfo.environment["AURA_VOICE_PRONUNCIATION_REPORT"] == "1", #available(macOS 26, *), await OnDeviceSpeech.available() else { return }
        let phrases = [
            "Open the GitHub repository on macOS.", "Run npm install and open Xcode.", "Update the JSON in the README.",
            "Edit package.json and main.swift.", "The SwiftUI view uses WKWebView.", "Call fetchUserData with the user_id.",
            "Release v1.2.3 closes #42.", "Never run git push --force.", "Check the YAML file and the OAuth token.",
        ]
        for phrase in phrases {
            var line = "pronunciation: \(phrase)"
            for (label, text) in [("as written", phrase), ("rewritten", SpeechPronunciation.spoken(phrase))] {
                let speech = try await SystemSpeechSynthesis().render(text, voice: SpeechVoiceRequest(locale: "en-US", voiceId: nil, rate: 0.85))
                let silence = AudioChunk.samples([Float](repeating: 0, count: 2205), sampleRate: speech.format?.sampleRate ?? 22_050)!
                let chunks = [silence] + speech.buffers.compactMap { AudioChunk.mono($0).map(AudioChunk.init(buffer:)) } + Array(repeating: silence, count: 5)
                let session = try await AnalyzerRecognitionEngine(useVocabulary: false).start(locale: "en-US", allowServer: false)
                let collector = Task { () -> String in
                    var finals = ""
                    for try await result in session.results { if case .final(let t) = result { finals = VoiceController.join(finals, t) } }
                    return finals
                }
                for chunk in chunks { session.append(chunk) }
                await session.finish()
                line += " | \(label): \(try await collector.value)"
            }
            print(line)
        }
    }
}
