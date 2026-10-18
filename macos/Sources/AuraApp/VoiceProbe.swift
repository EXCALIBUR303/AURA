import AppKit
import AuraCore
import Foundation
import WebKit
import os

/// In-app voice validation without audio hardware (`AURA_DEV_VOICE_PROBE=<scenario>`,
/// development only; see VoiceFixture). Drives the real page UI (Talk, ⌥Space,
/// Esc, Send, Read aloud, Mute, End voice, recovery buttons) through the real
/// bridge and native VoiceController, records every voice.* event, and logs
/// outcomes, timings and frame samples. Logs only the fixture sentence and
/// mock-provider text. Preferences it changes (default provider, auto-speak,
/// reduced motion, last zone) are restored at the end, so let a run finish:
/// a probe that is killed midway leaves them changed.
///   /usr/bin/log show --last 10m --info --predicate 'subsystem == "com.aura.app" AND category == "voice-probe"'
@MainActor
enum VoiceProbe {
    static let log = VoiceFixture.log
    static var scenario: VoiceFixture.Scenario? {
        ProcessInfo.processInfo.environment["AURA_DEV_VOICE_PROBE"].flatMap(VoiceFixture.Scenario.init(rawValue:))
    }
    static var isEnabled: Bool { scenario != nil }

    private static let prelude = """
        if (!window.__vp) {
          const events = []; const counts = {};
          const bridge = window.__AURA_BRIDGE__;
          const original = bridge.dispatch.bind(bridge);
          bridge.dispatch = (json) => { try { const m = JSON.parse(json); if (m.event && (m.event.startsWith('voice.') || m.event.startsWith('ai.'))) { counts[m.event] = (counts[m.event] || 0) + 1; events.push({ t: Math.round(performance.now()), e: m.event, p: m.payload }); } } catch {} original(json); };
          let n = 0;
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const vp = {
            events, counts, sleep,
            call: async (method, params) => JSON.parse(await window.webkit.messageHandlers.aura.postMessage(JSON.stringify({ kind: 'request', v: 1, id: 'vp-' + (++n), method, params }))),
            until: async (fn, ms) => { const end = performance.now() + ms; while (performance.now() < end) { try { if (fn()) return true; } catch {} await sleep(40); } return false; },
            rail: () => document.querySelector('.voice-rail'),
            phase: () => document.querySelector('.voice-rail')?.dataset.phase ?? 'none',
            label: () => document.querySelector('.voice-rail [role=status]')?.textContent ?? '',
            button: (text) => [...document.querySelectorAll('button')].find((b) => (b.textContent.trim().includes(text) || b.getAttribute('aria-label') === text) && !b.disabled && b.offsetParent !== null),
            draft: () => document.querySelector('#companion-prompt')?.value ?? '',
            lit: () => document.querySelectorAll('.voice-level i[data-on="true"]').length,
            since: (t, name) => events.filter((x) => x.t >= t && x.e === name),
            key: (type, init) => window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })),
            accuracy: (heard, expected) => { const w = (s) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean); const have = w(heard); let hits = 0; for (const x of w(expected)) { const i = have.indexOf(x); if (i >= 0) { hits++; have.splice(i, 1); } } return +(hits / w(expected).length).toFixed(2); },
            fps: async (ms) => {
              const out = []; let last = performance.now(); const end = last + ms;
              await new Promise((resolve) => { const tick = (t) => { out.push(t - last); last = t; t < end ? requestAnimationFrame(tick) : resolve(); }; requestAnimationFrame(tick); setTimeout(resolve, ms + 3000); });
              if (out.length < 2) return { frames: 0 };
              const s = out.slice(1).sort((a, b) => a - b); const mean = s.reduce((a, b) => a + b, 0) / s.length; const d = window.__AURA_DIAGNOSTICS__ || {};
              return { frames: s.length, fps: +(1000 / mean).toFixed(1), p95Ms: +s[Math.floor(0.95 * s.length)].toFixed(1), missed: s.filter((x) => x > 20.9).length, drawCalls: d.drawCalls, triangles: d.sceneTriangles, dpr: devicePixelRatio, zone: d.zone };
            },
          };
          window.__vp = vp;
        }
        """

    static func run(webView: WKWebView) async {
        guard let scenario else { return }
        log.notice("voice probe start scenario=\(scenario.rawValue, privacy: .public)")
        for _ in 0..<100 where await js(webView, "return String(!!(window.__AURA_BRIDGE__ && document.querySelector('.voice-rail')))") != "true" {
            try? await Task.sleep(for: .milliseconds(300))
        }
        guard await js(webView, "\(prelude); return 'ok'") == "ok" else { return log.error("voice probe: page not ready") }
        // Use the built-in mock provider (no network, no cost); remember preferences to restore.
        let saved = await js(webView, """
            const prefs = (await __vp.call('prefs.get', {})).result;
            await __vp.call('prefs.update', { ai: { defaultProviderId: 'mock' }, voice: { autoSpeakReplies: false }, reduceMotion: \(scenario == .reducedMotion) });
            await __vp.sleep(600);
            return JSON.stringify({ ai: { defaultProviderId: prefs.ai.defaultProviderId }, voice: { autoSpeakReplies: prefs.voice.autoSpeakReplies }, reduceMotion: prefs.reduceMotion, lastZone: prefs.lastZone });
            """) ?? "{}"
        await step(webView, "initial", """
            const caps = (await __vp.call('voice.getCapabilities', {})).result; const status = (await __vp.call('voice.getStatus', {})).result;
            return { label: __vp.label(), phase: __vp.phase(), caps, microphone: status.microphone, speech: status.speechRecognition, talk: !!__vp.button('Talk with Astra'), idleFrames: await __vp.fps(2000) };
            """)
        switch scenario {
        case .flow: await flow(webView)
        case .reducedMotion: await reducedMotion(webView)
        case .notDetermined: await permissionFirstRun(webView)
        case .denied: await denied(webView)
        case .model: await model(webView)
        case .interruptions: await interruptions(webView)
        case .manual:
            // Fixture engines only, for a person (or computer use) to drive; preferences are left as they are.
            return log.notice("voice probe manual mode: fixture engines active, no scripted steps")
        default: await failure(webView, scenario)
        }
        await step(webView, "event-census", "return { counts: __vp.counts };")
        await step(webView, "restore", "await __vp.call('voice.endSession', {}); const r = await __vp.call('prefs.update', \(saved)); return { restored: r.ok, prefs: { ai: r.result.ai.defaultProviderId, autoSpeak: r.result.voice.autoSpeakReplies, reduceMotion: r.result.reduceMotion, lastZone: r.result.lastZone } };")
        log.notice("voice probe done scenario=\(scenario.rawValue, privacy: .public)")
    }

    // MARK: scenarios

    private static func flow(_ w: WKWebView) async {
        let sentence = VoiceFixture.sentence
        // A. Defaults: auto-speak off, Edit before sending on. A final becomes an editable draft; nothing is sent.
        await step(w, "A-talk-to-draft", """
            const t = performance.now(); __vp.button('Talk with Astra').click();
            const starting = await __vp.until(() => ['starting', 'listening'].includes(__vp.phase()), 3000); const startMs = Math.round(performance.now() - t);
            const listening = await __vp.until(() => __vp.phase() === 'listening', 8000); const listenMs = Math.round(performance.now() - t);
            const frames = await __vp.fps(2000); const lit = __vp.lit();
            const drafted = await __vp.until(() => __vp.draft().length > 0, 20000);
            const transcripts = __vp.since(t, 'voice.transcript'); const finals = transcripts.filter((x) => x.p.isFinal);
            await __vp.sleep(300);
            return { starting, startMs, listening, listenMs, framesWhileListening: frames, inputSegmentsLit: lit, drafted, draft: __vp.draft(), accuracy: __vp.accuracy(__vp.draft(), \(json(sentence))),
              partials: transcripts.length - finals.length, finals: finals.length, aiSends: __vp.since(t, 'ai.turnState').length, inputLevels: __vp.since(t, 'voice.inputLevel').length, phase: __vp.phase(), micOff: __vp.rail().textContent.includes('Microphone off') };
            """)
        await step(w, "A-send-typed-path-silent", """
            const t = performance.now(); document.querySelector('.send-message').click();
            const done = await __vp.until(() => __vp.since(t, 'ai.done').length > 0, 15000); await __vp.sleep(800);
            return { done, spoken: __vp.since(t, 'voice.speechProgress').length, speakingStatus: __vp.since(t, 'voice.statusChanged').some((x) => x.p.speaking) };
            """)
        // B. Auto-speak on, Edit before sending off: one final → one send → speakReply of that stream.
        await step(w, "B-auto-speak", """
            await __vp.call('prefs.update', { voice: { autoSpeakReplies: true } });
            const edit = [...document.querySelectorAll('.voice-draft-options input[type=checkbox]')][0]; if (edit?.checked) edit.click();
            await __vp.sleep(500);
            const t = performance.now(); __vp.button('Talk with Astra').click();
            const turn = await __vp.until(() => __vp.since(t, 'ai.done').length > 0, 25000);
            const speaking = await __vp.until(() => __vp.rail().dataset.output === 'true', 8000);
            const frames = await __vp.fps(2500);
            const caption = document.querySelector('.voice-caption p')?.textContent ?? ''; const lit = __vp.lit();
            const ended = await __vp.until(() => __vp.rail().dataset.output === 'false', 30000);
            const finals = __vp.since(t, 'voice.transcript').filter((x) => x.p.isFinal);
            const sends = __vp.since(t, 'ai.turnState').filter((x) => x.p.state === 'preparing_context');
            const progress = __vp.since(t, 'voice.speechProgress'); const statuses = __vp.since(t, 'voice.statusChanged').map((x) => x.p);
            const streamIds = [...new Set(sends.map((x) => x.p.streamId))]; const spokenStreams = [...new Set(progress.map((x) => x.p.streamId))];
            const levels = __vp.since(t, 'voice.speechLevel');
            const revisions = statuses.map((s) => s.revision); const ordered = revisions.every((r, i) => i === 0 || r > revisions[i - 1]);
            return { turn, speaking, ended, finals: finals.length, sends: sends.length, streamIds, spokenStreams, sameStream: streamIds.length === 1 && spokenStreams[0] === streamIds[0],
              sentences: progress.filter((x) => x.p.state === 'started').map((x) => x.p.text), speechLevels: levels.length, lastLevel: levels.at(-1)?.p.level, outputSegmentsLit: lit, caption,
              framesWhileSpeaking: frames, phases: [...new Set(statuses.map((s) => s.phase))], revisionsOrdered: ordered };
            """)
        // C. Read aloud, then Esc stops speech; text and conversation stay.
        await step(w, "C-read-aloud-esc", """
            const t = performance.now(); const read = __vp.button('Read aloud'); read?.click();
            const speaking = await __vp.until(() => __vp.rail().dataset.output === 'true', 8000); await __vp.sleep(400);
            __vp.key('keydown', { key: 'Escape', code: 'Escape' }); const te = performance.now();
            const stopped = await __vp.until(() => __vp.rail().dataset.output === 'false', 3000);
            await __vp.sleep(600); const late = __vp.since(te + 300, 'voice.speechProgress').filter((x) => x.p.state === 'started').length;
            return { readAloud: !!read, speaking, stopped, stopMs: Math.round(performance.now() - te - 600), lateSentences: late, lastLevel: __vp.since(t, 'voice.speechLevel').at(-1)?.p.level, turns: document.querySelectorAll('.conversation-turn').length };
            """)
        // D. Mute: Read aloud does nothing; unmuting does not resume.
        await step(w, "D-mute", """
            const mute = __vp.button('Mute speech'); mute?.click(); await __vp.sleep(400);
            const t = performance.now(); __vp.button('Read aloud')?.click(); await __vp.sleep(1500);
            const silent = __vp.since(t, 'voice.speechProgress').length === 0;
            __vp.button('Unmute speech')?.click(); await __vp.sleep(1200);
            return { muteButton: !!mute, silentWhileMuted: silent, resumedAfterUnmute: __vp.since(t, 'voice.speechProgress').length > 0, pressed: document.querySelector('[aria-label="Mute speech"]')?.getAttribute('aria-pressed') };
            """)
        // E. Hold ⌥Space (push-to-talk), release after the sentence → one final (auto-sent: editing is off).
        await step(w, "E-push-to-talk", """
            await __vp.call('prefs.update', { voice: { autoSpeakReplies: false } }); await __vp.sleep(300);
            const t = performance.now(); __vp.key('keydown', { key: ' ', code: 'Space', altKey: true });
            const listening = await __vp.until(() => __vp.phase() === 'listening', 8000);
            const mode = __vp.since(t, 'voice.statusChanged').map((x) => x.p.mode).find(Boolean);
            await __vp.sleep(6000); const stillListening = __vp.phase() === 'listening'; // push-to-talk does not end on a pause
            __vp.key('keyup', { key: ' ', code: 'Space', altKey: true });
            const final = await __vp.until(() => __vp.since(t, 'voice.transcript').some((x) => x.p.isFinal), 8000);
            const text = __vp.since(t, 'voice.transcript').find((x) => x.p.isFinal)?.p.text ?? '';
            await __vp.until(() => __vp.since(t, 'ai.done').length > 0, 15000);
            return { listening, mode, stillListeningAfterPause: stillListening, final, accuracy: __vp.accuracy(text, \(json(sentence))), finals: __vp.since(t, 'voice.transcript').filter((x) => x.p.isFinal).length, spoken: __vp.since(t, 'voice.speechProgress').length };
            """)
        // F. Esc while listening cancels: no final transcript, nothing sent.
        await step(w, "F-esc-cancels-listening", """
            const t = performance.now(); __vp.button('Talk with Astra').click();
            await __vp.until(() => __vp.phase() === 'listening', 8000); await __vp.sleep(1200);
            __vp.key('keydown', { key: 'Escape', code: 'Escape' });
            const idle = await __vp.until(() => __vp.phase() === 'idle', 3000); await __vp.sleep(4000);
            return { idle, finals: __vp.since(t, 'voice.transcript').filter((x) => x.p.isFinal).length, sends: __vp.since(t, 'ai.turnState').length, micOff: __vp.rail().textContent.includes('Microphone off') };
            """)
        // G. Cancel button and End voice.
        await step(w, "G-cancel-and-end", """
            const t = performance.now(); __vp.button('Talk with Astra').click();
            await __vp.until(() => ['starting', 'listening'].includes(__vp.phase()), 5000);
            __vp.button('Cancel listening')?.click(); const cancelled = await __vp.until(() => __vp.phase() === 'idle', 3000);
            const end = __vp.button('End voice'); end?.click(); await __vp.sleep(800);
            const status = (await __vp.call('voice.getStatus', {})).result;
            return { cancelled, endButton: !!end, sessionActive: status.sessionActive, listening: status.listening, speaking: status.speaking, finals: __vp.since(t, 'voice.transcript').filter((x) => x.p.isFinal).length };
            """)
        // H. Every voice method answers through the real bridge (no unknown_method).
        await step(w, "H-method-census", """
            const calls = [['voice.getStatus', {}], ['voice.getCapabilities', {}], ['voice.requestPermissions', {}], ['voice.startSession', { conversationId: null }], ['voice.startListening', { mode: 'push_to_talk' }],
              ['voice.stopListening', {}], ['voice.cancelListening', {}], ['voice.speak', { text: 'Census.' }], ['voice.stopSpeaking', {}], ['voice.speakReply', { conversationId: 'conv-none', streamId: 'ai-none' }],
              ['voice.setOutputMuted', { muted: false }], ['voice.listVoices', {}], ['voice.openSettings', { target: 'sound_input' }], ['voice.installRecognitionAssets', {}], ['voice.endSession', {}]];
            const out = {}; for (const [m, p] of calls) { const r = await __vp.call(m, p); out[m] = r.ok ? 'ok' : r.error.code; await __vp.sleep(m === 'voice.startListening' ? 300 : 50); }
            const voices = (await __vp.call('voice.listVoices', {})).result; return { results: out, methods: calls.length, voices: voices.length, bestQuality: voices[0]?.quality };
            """)
        // I. Scene performance with voice controls visible, idle, per zone.
        await step(w, "I-zone-frames", """
            const out = {}; for (const zone of ['studio', 'hardware', 'software', 'ai-lab', 'github', 'companion']) { await __vp.call('prefs.update', { lastZone: zone }); window.__AURA_BRIDGE__.dispatch(JSON.stringify({ kind: 'event', v: 1, event: 'app.command', payload: { command: 'navigate', zone } })); await __vp.sleep(2500); out[zone] = await __vp.fps(2000); }
            return out;
            """)
    }

    /// Real AppKit/NSWorkspace signals and conversation changes reach voice.
    private static func interruptions(_ w: WKWebView) async {
        let listen = """
            window.__vpT = performance.now(); __vp.button('Talk with Astra')?.click();
            return { listening: await __vp.until(() => __vp.phase() === 'listening', 8000) };
            """
        let check = """
            await __vp.sleep(400); const status = (await __vp.call('voice.getStatus', {})).result;
            const later = __vp.since(window.__vpT, 'voice.statusChanged').map((x) => x.p);
            return { phase: status.phase, issue: status.issue?.code, listening: status.listening, micOff: __vp.rail().textContent.includes('Microphone off'), finals: __vp.since(window.__vpT, 'voice.transcript').filter((x) => x.p.isFinal).length, phases: [...new Set(later.map((s) => s.phase))] };
            """
        // 2. The Mac going to sleep while listening (the real workspace notification AURA observes).
        await step(w, "sleep-listen", listen)
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.willSleepNotification, object: NSWorkspace.shared)
        await step(w, "sleep-result", check)
        // 1. AURA hidden (⌘H) while listening.
        await step(w, "inactive-listen", listen)
        NSApp.hide(nil)
        try? await Task.sleep(for: .seconds(2))
        NSApp.unhide(nil)
        NSApp.activate()
        try? await Task.sleep(for: .seconds(2))
        await step(w, "inactive-result", check + "")
        // 3. A typed request stays silent even with auto-speak on; a reset stops speech.
        await step(w, "typed-silent-and-reset", """
            await __vp.call('prefs.update', { voice: { autoSpeakReplies: true } }); await __vp.sleep(300);
            const ta = document.querySelector('#companion-prompt'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Typed hello. This is a typed request.'); ta.dispatchEvent(new Event('input', { bubbles: true }));
            await __vp.sleep(200); const t = performance.now(); document.querySelector('.send-message')?.click();
            const done = await __vp.until(() => __vp.since(t, 'ai.done').length > 0, 15000); await __vp.sleep(1500);
            const typedSpoken = __vp.since(t, 'voice.speechProgress').length + __vp.since(t, 'voice.statusChanged').filter((x) => x.p.speaking).length;
            const conv = (await __vp.call('ai.listConversations', {})).result.at(-1)?.conversationId;
            __vp.button('Read aloud')?.click(); const speaking = await __vp.until(() => __vp.rail().dataset.output === 'true', 8000);
            const tr = performance.now(); const reset = await __vp.call('ai.resetConversation', { conversationId: conv });
            const stopped = await __vp.until(() => __vp.rail().dataset.output === 'false', 3000); await __vp.sleep(800);
            const status = (await __vp.call('voice.getStatus', {})).result;
            return { done, typedSpoken, speaking, reset: reset.ok, stoppedMs: Math.round(performance.now() - tr - 800), stopped, sessionActiveAfterReset: status.sessionActive, speakingAfter: status.speaking, lateProgress: __vp.since(tr + 200, 'voice.speechProgress').filter((x) => x.p.state === 'started').length };
            """)
    }

    private static func reducedMotion(_ w: WKWebView) async {
        await step(w, "reduced-motion", """
            const t = performance.now(); await __vp.call('prefs.update', { voice: { autoSpeakReplies: false } });
            __vp.button('Talk with Astra').click(); const listening = await __vp.until(() => __vp.phase() === 'listening', 8000);
            await __vp.sleep(800); const staticMeter = document.querySelector('.voice-level')?.dataset.static; const lit = __vp.lit(); const label = document.querySelector('.voice-level-line span')?.textContent;
            __vp.button('Cancel listening')?.click(); await __vp.until(() => __vp.phase() === 'idle', 3000);
            await __vp.call('voice.speak', { text: 'Reduced motion check. A second sentence.' }); await __vp.until(() => __vp.rail().dataset.output === 'true', 5000); await __vp.sleep(500);
            const speakingLit = __vp.lit(); const speakingLabel = document.querySelector('.voice-level-line span')?.textContent;
            await __vp.until(() => __vp.rail().dataset.output === 'false', 15000);
            return { listening, staticMeter, segmentsLitListening: lit, listeningLabel: label, segmentsLitSpeaking: speakingLit, speakingLabel, reduceMotionPref: (await __vp.call('prefs.get', {})).result.reduceMotion };
            """)
    }

    private static func permissionFirstRun(_ w: WKWebView) async {
        await step(w, "permission-first-run", """
            const t = performance.now(); __vp.button('Talk with Astra').click(); await __vp.sleep(500);
            const explainer = !!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').textContent.includes('Talk with Astra');
            const capturedBefore = __vp.since(t, 'voice.statusChanged').some((x) => x.p.listening);
            __vp.button('Continue to microphone access')?.click(); await __vp.sleep(1500);
            const status = (await __vp.call('voice.getStatus', {})).result;
            const capturedAfterGrant = __vp.since(t, 'voice.statusChanged').some((x) => x.p.listening);
            __vp.button('Talk with Astra')?.click(); const listening = await __vp.until(() => __vp.phase() === 'listening', 8000);
            __vp.button('Cancel listening')?.click(); await __vp.until(() => __vp.phase() === 'idle', 3000);
            return { explainer, capturedBeforeGrant: capturedBefore, microphone: status.microphone, speechRecognition: status.speechRecognition, capturedAfterGrantWithoutTalk: capturedAfterGrant, freshTalkListens: listening };
            """)
    }

    private static func denied(_ w: WKWebView) async {
        await step(w, "permission-denied", """
            const t = performance.now(); const talk = __vp.button('Talk with Astra'); talk?.click(); await __vp.sleep(800);
            const r = await __vp.call('voice.startListening', {}); await __vp.sleep(400);
            const settings = __vp.button('Microphone settings'); settings?.click(); await __vp.sleep(300);
            return { talkShown: !!talk, label: __vp.label(), startError: r.ok ? 'ok' : r.error.code, issue: (await __vp.call('voice.getStatus', {})).result.issue, settingsButton: !!settings, prompts: 0, captured: __vp.since(t, 'voice.statusChanged').some((x) => x.p.listening) };
            """)
    }

    private static func model(_ w: WKWebView) async {
        await step(w, "model-missing", """
            const t = performance.now(); __vp.button('Talk with Astra')?.click();
            await __vp.until(() => __vp.phase() === 'error', 8000); const issue = (await __vp.call('voice.getStatus', {})).result.issue;
            const download = __vp.button('Download speech model'); download?.click();
            const installed = await __vp.until(() => __vp.since(t, 'voice.capabilitiesChanged').some((x) => x.p.recognitionAssets === 'installed'), 8000);
            await __vp.sleep(500); __vp.button('Talk with Astra')?.click(); const listening = await __vp.until(() => __vp.phase() === 'listening', 8000);
            __vp.button('Cancel listening')?.click(); await __vp.until(() => __vp.phase() === 'idle', 3000);
            return { issue, downloadButton: !!download, installed, listensAfterInstall: listening };
            """)
    }

    private static func failure(_ w: WKWebView, _ scenario: VoiceFixture.Scenario) async {
        await step(w, "failure-\(scenario.rawValue)", """
            const t = performance.now(); __vp.button('Talk with Astra')?.click();
            const settled = await __vp.until(() => ['error', 'interrupted'].includes(__vp.phase()), 15000); const ms = Math.round(performance.now() - t);
            await __vp.sleep(300); const status = (await __vp.call('voice.getStatus', {})).result;
            const buttons = [...document.querySelectorAll('.voice-recovery button')].map((b) => b.textContent.trim());
            const choose = __vp.button('Choose microphone'); choose?.click(); await __vp.sleep(300);
            const finals = __vp.since(t, 'voice.transcript').filter((x) => x.p.isFinal).length;
            const phasesSeen = [...new Set(__vp.since(t, 'voice.statusChanged').map((x) => x.p.phase))];
            await __vp.sleep(2500); const restarted = __vp.since(t + ms + 400, 'voice.statusChanged').some((x) => x.p.listening);
            return { settled, ms, phase: status.phase, listening: status.listening, issue: status.issue, label: __vp.label(), recoveryButtons: buttons, finals, phasesSeen, autoRestarted: restarted, micOff: __vp.rail().textContent.includes('Microphone off') };
            """)
    }

    // MARK: helpers

    private static func step(_ w: WKWebView, _ name: String, _ body: String) async {
        let result = await js(w, "try { return JSON.stringify(await (async () => { \(body) })()); } catch (e) { return JSON.stringify({ error: String(e) }); }") ?? "nil"
        log.notice("voice probe \(name, privacy: .public): \(result, privacy: .public)")
    }

    private static func json(_ text: String) -> String {
        (try? String(data: JSONEncoder().encode(text), encoding: .utf8)) ?? "\"\""
    }

    private static func js(_ w: WKWebView, _ body: String) async -> String? {
        do { return try await w.callAsyncJavaScript(body, contentWorld: .page) as? String } catch {
            log.error("voice probe js error: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
