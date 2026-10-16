import AppKit
import AuraCore
import Foundation
import os
import WebKit

/// Opt-in validation probe (`AURA_DEV_PROBE=1`; works for dev-server and aura:// builds).
/// Drives every zone through the same native `app.command` path the Studio menu
/// uses, samples requestAnimationFrame intervals inside WKWebView, and logs one
/// `probe …` notice per zone. Read results with:
///   /usr/bin/log show --last 5m --info --predicate 'subsystem == "com.aura.app" AND category == "probe"'
@MainActor
enum DevProbe {
    private static let log = Logger(subsystem: Log.subsystem, category: "probe")

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["AURA_DEV_PROBE"] == "1"
    }

    /// Round-trips a throwaway Keychain item through the real SecretStore, to
    /// show Keychain access works for this build (sandbox, signing). Never logs the value.
    static func keychainSelfTest(_ secrets: any SecretStore) {
        let key = SecretKey(rawValue: "probe.selftest")
        let value = UUID().uuidString
        do {
            try secrets.write(value, for: key)
            let readBack = try secrets.read(key) == value
            try secrets.delete(key)
            let gone = try secrets.read(key) == nil
            log.notice("probe keychain write+read=\(readBack, privacy: .public) delete=\(gone, privacy: .public)")
        } catch {
            log.error("probe keychain failed: \(String(describing: error), privacy: .public)")
        }
    }

    static func run(webView: WKWebView, model: AppModel) async {
        if let secrets = model.services?.secrets { keychainSelfTest(secrets) }
        let sampleMs = Int(ProcessInfo.processInfo.environment["AURA_DEV_PROBE_SAMPLE_MS"] ?? "") ?? 5000
        log.notice("probe start sampleMs=\(sampleMs, privacy: .public)")

        guard await waitFor(webView, "d?.status === 'loaded' && d.cameraSettled", timeout: .seconds(60)) else {
            let state = await evaluate(webView, "return JSON.stringify(window.__AURA_DIAGNOSTICS__ ?? null)") ?? "nil"
            log.error("probe timeout waiting for initial load: \(state, privacy: .public)")
            return
        }
        let initial = await evaluate(webView, """
            const d = window.__AURA_DIAGNOSTICS__;
            return JSON.stringify({ zone: d.zone, loadMs: d.loadMs, heightMeters: d.heightMeters, clip: d.playingClip,
              renderer: d.renderer, window: [innerWidth, innerHeight, devicePixelRatio],
              href: location.href, transport: document.querySelector('.connection-chip')?.textContent,
              media: Object.fromEntries(['prefers-reduced-motion: reduce', 'prefers-reduced-transparency: reduce',
                'prefers-contrast: more'].map((q) => [q, matchMedia(`(${q})`).matches])) });
            """) ?? "nil"
        log.notice("probe initial \(initial, privacy: .public)")
        let workspace = NSWorkspace.shared
        log.notice("probe system reduceMotion=\(workspace.accessibilityDisplayShouldReduceMotion, privacy: .public) reduceTransparency=\(workspace.accessibilityDisplayShouldReduceTransparency, privacy: .public) increaseContrast=\(workspace.accessibilityDisplayShouldIncreaseContrast, privacy: .public) voiceOver=\(workspace.isVoiceOverEnabled, privacy: .public)")

        for zone in ZoneID.allCases {
            model.send(.navigate(zone))
            guard await waitFor(webView, "d?.zone === '\(zone.rawValue)' && d.cameraSettled", timeout: .seconds(20)) else {
                log.error("probe zone \(zone.rawValue, privacy: .public) did not settle")
                continue
            }
            try? await Task.sleep(for: .milliseconds(1500))
            let sample = await evaluate(webView, sampler(ms: sampleMs)) ?? "nil"
            log.notice("probe zone=\(zone.rawValue, privacy: .public) \(sample, privacy: .public)")
        }
        log.notice("probe done")
        if let minutes = Int(ProcessInfo.processInfo.environment["AURA_DEV_SOAK_MINUTES"] ?? ""), minutes > 0 {
            await soak(webView: webView, model: model, minutes: minutes)
        }
    }

    /// `AURA_DEV_SOAK_MINUTES=N`: after the zone pass, keeps using the studio
    /// for N minutes without posting any real input: every zone in turn, one
    /// mock chat per cycle, and every other cycle a synthetic visible-inactive
    /// and hidden period (WindowStateStore, so the next real window event
    /// overrides it). Logs page-side counters per cycle; sample process
    /// memory from outside with `footprint`.
    static func soak(webView: WKWebView, model: AppModel, minutes: Int) async {
        guard let services = model.services else { return }
        let deadline = ContinuousClock.now + .seconds(minutes * 60)
        let started = ContinuousClock.now
        var cycle = 0
        log.notice("soak start minutes=\(minutes, privacy: .public)")
        while ContinuousClock.now < deadline {
            cycle += 1
            for zone in ZoneID.allCases {
                model.send(.navigate(zone))
                _ = await waitFor(webView, "d?.zone === '\(zone.rawValue)' && d.cameraSettled", timeout: .seconds(10))
                try? await Task.sleep(for: .milliseconds(1200))
            }
            _ = await evaluate(webView, """
                const input = document.getElementById('companion-prompt');
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'soak message \(cycle)');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.form.requestSubmit();
                return 'sent';
                """)
            try? await Task.sleep(for: .seconds(3))
            if cycle.isMultiple(of: 2) {
                services.windowState.update(WindowState(active: false, visible: true))
                try? await Task.sleep(for: .seconds(5))
                services.windowState.update(WindowState(active: false, visible: false))
                try? await Task.sleep(for: .seconds(3))
                services.windowState.update(WindowState(active: true, visible: true))
                try? await Task.sleep(for: .seconds(2))
            }
            let counters = await evaluate(webView, """
                const d = window.__AURA_DIAGNOSTICS__;
                return JSON.stringify({ dom: document.getElementsByTagName('*').length,
                  replies: document.querySelectorAll('.reply, [data-reply], .companion-reply').length,
                  fps: d?.fps, drawCalls: d?.drawCalls, triangles: d?.sceneTriangles, status: d?.status });
                """) ?? "nil"
            let elapsed = Int((ContinuousClock.now - started).components.seconds)
            log.notice("soak cycle=\(cycle, privacy: .public) elapsedS=\(elapsed, privacy: .public) \(counters, privacy: .public)")
        }
        log.notice("soak done cycles=\(cycle, privacy: .public)")
    }

    private static func sampler(ms: Int) -> String {
        """
        const longTasks = []; let po;
        try { po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration)))); po.observe({ type: 'longtask' }); } catch {}
        const out = []; let last = performance.now(); const end = last + \(ms);
        await new Promise((resolve) => { const tick = (t) => { out.push(t - last); last = t; t < end ? requestAnimationFrame(tick) : resolve(); }; requestAnimationFrame(tick); setTimeout(resolve, \(ms) + 3000); }); // rAF pauses while the window is occluded
        po?.disconnect();
        if (out.length < 2) return JSON.stringify({ frames: 0, note: 'no frames: window hidden or occluded' });
        const s = out.slice(1).sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        const mean = s.reduce((a, b) => a + b, 0) / s.length; const d = window.__AURA_DIAGNOSTICS__;
        return JSON.stringify({ frames: s.length, fps: +(1000 / mean).toFixed(1), meanMs: +mean.toFixed(2), p50Ms: +q(0.5).toFixed(2),
          p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), maxMs: +s[s.length - 1].toFixed(2),
          missed: s.filter((x) => x > 20.9).length, longTasks, drawCalls: d.drawCalls, triangles: d.sceneTriangles,
          pixelRatio: d.renderer?.pixelRatio, appFps: d.fps, window: [innerWidth, innerHeight, devicePixelRatio] });
        """
    }

    private static func waitFor(_ webView: WKWebView, _ condition: String, timeout: Duration) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if await evaluate(webView, "const d = window.__AURA_DIAGNOSTICS__; return String(Boolean(\(condition)));") == "true" { return true }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }

    private static func evaluate(_ webView: WKWebView, _ body: String) async -> String? {
        do {
            return try await webView.callAsyncJavaScript(body, contentWorld: .page) as? String
        } catch {
            log.error("probe js error: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
