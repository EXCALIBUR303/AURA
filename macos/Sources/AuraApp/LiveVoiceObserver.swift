import AppKit
import AuraCore
import Foundation
import WebKit
import os

/// Owner-present real-audio validation (`AURA_DEV_VOICE_LIVE=1`, development only).
/// Voice uses the real system engines (microphone, recogniser, synthesis, speakers);
/// nothing is scripted. The observer only records what happens: voice.* events,
/// UI clicks and voice keys, input/speech level summaries and periodic frame
/// samples, as JSON lines in the app container's temporary folder
/// (`~/Library/Containers/com.aura.app/Data/tmp/aura-voice-live.jsonl`). The file
/// holds the transcripts of what was said during the test; delete it afterwards.
@MainActor
enum LiveVoiceObserver {
    static let log = Logger(subsystem: Log.subsystem, category: "voice-live")
    static var isEnabled: Bool { ProcessInfo.processInfo.environment["AURA_DEV_VOICE_LIVE"] == "1" }
    static let fileURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("aura-voice-live.jsonl")

    private static let install = """
        if (!window.__vpLive) {
          window.__vpLive = { cursor: 0 };
          const push = (e, p) => window.__vp.events.push({ t: Math.round(performance.now()), e, p });
          document.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('button'); if (b) push('ui.click', { label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 60) }); }, true);
          for (const type of ['keydown', 'keyup']) window.addEventListener(type, (ev) => { if (ev.key === 'Escape' || (ev.code === 'Space' && (ev.altKey || type === 'keyup'))) push('ui.' + type, { code: ev.code, alt: ev.altKey, repeat: ev.repeat }); }, true);
        }
        return 'ok';
        """

    private static let drain = """
        const vp = window.__vp, live = window.__vpLive; const batch = vp.events.slice(live.cursor); live.cursor = vp.events.length;
        const out = []; const lv = { input: { n: 0, max: 0, sum: 0 }, speech: { n: 0, max: 0, sum: 0 } };
        for (const x of batch) {
          if (x.e === 'voice.inputLevel' || x.e === 'voice.speechLevel') { const s = x.e === 'voice.inputLevel' ? lv.input : lv.speech; s.n++; s.sum += x.p.level; s.max = Math.max(s.max, x.p.level); continue; }
          if (x.e === 'ai.chunk') continue;
          if (x.e === 'voice.statusChanged') { const p = x.p; out.push({ t: x.t, e: 'status', phase: p.phase, rev: p.revision, listening: p.listening, speaking: p.speaking, mode: p.mode, muted: p.outputMuted, mic: p.microphone, input: p.inputDevice, issue: p.issue && { code: p.issue.code, message: p.issue.message, transport: p.issue.transport, recovery: p.issue.recovery } }); continue; }
          out.push({ t: x.t, e: x.e.replace(/^voice\\./, ''), p: x.e.startsWith('ai.') ? undefined : x.p });
        }
        const now = Math.round(performance.now());
        for (const [k, s] of Object.entries(lv)) if (s.n) out.push({ t: now, e: k + 'Levels', n: s.n, max: +s.max.toFixed(3), mean: +(s.sum / s.n).toFixed(3) });
        return JSON.stringify(out);
        """

    static func run(webView: WKWebView) async {
        for _ in 0..<100 where await VoiceProbe.js(webView, "return String(!!(window.__AURA_BRIDGE__ && document.querySelector('.voice-rail')))") != "true" {
            try? await Task.sleep(for: .milliseconds(300))
        }
        guard await VoiceProbe.js(webView, "\(VoiceProbe.prelude); \(install)") == "ok" else { return log.error("live observer: page not ready") }
        FileManager.default.createFile(atPath: fileURL.path, contents: nil)
        guard let handle = try? FileHandle(forWritingTo: fileURL) else { return log.error("live observer: cannot open output file") }
        log.notice("live observer recording to \(fileURL.path, privacy: .public)")
        write(handle, ["t": 0, "e": "observer.start", "at": ISO8601DateFormatter().string(from: Date())])
        var tick = 0
        while true {
            try? await Task.sleep(for: .milliseconds(400))
            if let json = await VoiceProbe.js(webView, drain), let data = json.data(using: .utf8),
               let rows = try? JSONSerialization.jsonObject(with: data) as? [Any] {
                for row in rows { write(handle, row) }
            }
            tick += 1
            if tick % 15 == 0, let frames = await VoiceProbe.js(webView, "const f = await __vp.fps(1000); f.phase = __vp.phase(); f.t = Math.round(performance.now()); f.e = 'frames'; return JSON.stringify(f);"),
               let data = frames.data(using: .utf8), let row = try? JSONSerialization.jsonObject(with: data) {
                write(handle, row)
            }
        }
    }

    private static func write(_ handle: FileHandle, _ row: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        handle.write(data + Data("\n".utf8))
    }
}
