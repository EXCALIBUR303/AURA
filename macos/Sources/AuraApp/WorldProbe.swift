import AppKit
import AuraCore
import Foundation
import os
import WebKit

/// Opt-in Phase 4 world validation (`AURA_DEV_WORLD_PROBE=1`, development only).
/// Reads the stored preferences (read-only), then moves through the four rooms with the
/// page's own World-map controls, samples frames and renderer counters in each room,
/// repeats visits to watch GPU resource counts, and exercises minimize/hide/restore.
/// It writes no preferences and sends no voice, AI or GitHub requests. Read results with:
///   /usr/bin/log show --last 10m --info --predicate 'subsystem == "com.aura.app" AND category == "world-probe"'
@MainActor
enum WorldProbe {
    private static let log = Logger(subsystem: Log.subsystem, category: "world-probe")

    static var isEnabled: Bool { ProcessInfo.processInfo.environment["AURA_DEV_WORLD_PROBE"] == "1" }

    private static let counters = """
        const d = window.__AURA_DIAGNOSTICS__;
        const snap = { room: d.world?.room, mode: d.world?.mode, phase: d.world?.phase, loaded: d.world?.loadedRooms, status: d.status, context: d.context,
          appFps: d.fps, drawCalls: d.drawCalls, triangles: d.sceneTriangles, resources: d.resources,
          assets: d.assets?.map((a) => a.id + ':' + a.owners.join('+') + (a.ready ? '' : '!not-ready')),
          dpr: d.renderer?.pixelRatio, gpu: d.renderer?.renderer, sampledAgeMs: Date.now() - (d.cameraSampledAt ?? 0) };
        """

    static func run(webView: WKWebView, model: AppModel) async {
        let sampleMs = Int(ProcessInfo.processInfo.environment["AURA_DEV_PROBE_SAMPLE_MS"] ?? "") ?? 5000
        let visits = Int(ProcessInfo.processInfo.environment["AURA_DEV_WORLD_VISITS"] ?? "") ?? 4
        log.notice("world probe start pid=\(ProcessInfo.processInfo.processIdentifier, privacy: .public) sampleMs=\(sampleMs, privacy: .public) visits=\(visits, privacy: .public)")

        // Frame rates are only meaningful while AURA is visible and frontmost (it throttles otherwise).
        NSApp.activate()
        webView.window?.makeKeyAndOrderFront(nil)
        try? await Task.sleep(for: .milliseconds(500))
        log.notice("world probe window active=\(NSApp.isActive, privacy: .public) visible=\(webView.window?.isVisible ?? false, privacy: .public) occlusionVisible=\(webView.window?.occlusionState.contains(.visible) ?? false, privacy: .public)")

        if let store = model.services?.store, let prefs = try? await store.loadPreferences() {
            let w = prefs.world
            log.notice("world probe stored preferences decode: world v\(w.schemaVersion, privacy: .public) \(w.presentation.rawValue, privacy: .public) intensity=\(w.floatIntensity, privacy: .public) \(w.lightingPreset.rawValue, privacy: .public) \(w.cameraMode.rawValue, privacy: .public) room=\(w.lastRoomId, privacy: .public); voice \(prefs.voice.synthesisVoiceId ?? "default", privacy: .public) rate=\(prefs.voice.speechRate, privacy: .public)")
        }

        guard await DevProbe.waitFor(webView, "d?.status === 'loaded' && d.cameraSettled && d.world?.phase === 'idle'", timeout: .seconds(90)) else {
            let state = await DevProbe.evaluate(webView, "return JSON.stringify(window.__AURA_DIAGNOSTICS__ ?? null)") ?? "nil"
            log.error("world probe timeout waiting for the world: \(state.prefix(600), privacy: .public)")
            return
        }
        let initial = await DevProbe.evaluate(webView, """
            \(counters)
            const canvas = document.querySelector('.scene-canvas canvas');
            return JSON.stringify({ ...snap, href: location.href, window: [innerWidth, innerHeight, devicePixelRatio],
              pointerLockApi: typeof canvas?.requestPointerLock, canvases: document.querySelectorAll('canvas').length,
              chip: document.querySelector('.connection-chip')?.textContent, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
            """) ?? "nil"
        log.notice("world probe initial \(initial, privacy: .public)")

        // One pass through all four rooms (cold loads), then repeated visits.
        for room in ["project-hub", "atrium", "living", "atrium", "gaming", "atrium", "project-hub"] {
            await visit(room, webView: webView, sampleMs: sampleMs, label: "pass1")
        }
        for cycle in 1...visits {
            for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] {
                await visit(room, webView: webView, sampleMs: 1500, label: "repeat\(cycle)")
            }
            let after = await DevProbe.evaluate(webView, "\(counters) return JSON.stringify({ cycle: \(cycle), resources: snap.resources, loaded: snap.loaded, assets: snap.assets, dom: document.getElementsByTagName('*').length });") ?? "nil"
            log.notice("world probe cycle-end \(after, privacy: .public)")
        }

        await windowLifecycle(webView: webView, model: model)
        log.notice("world probe done")
    }

    /// Records the app's own once-per-second render fps (not the page's rAF rate) while the sampler runs.
    private static func appFpsSeries(ms: Int) -> String {
        """
        const series = []; let lastAt = 0;
        const poll = setInterval(() => { const d = window.__AURA_DIAGNOSTICS__; if (d && d.cameraSampledAt !== lastAt) { lastAt = d.cameraSampledAt; series.push(d.fps); } }, 250);
        setTimeout(() => clearInterval(poll), \(ms) + 500);
        """
    }

    private static func visit(_ room: String, webView: WKWebView, sampleMs: Int, label: String) async {
        let started = ContinuousClock.now
        let clicked = await DevProbe.evaluate(webView, """
            const here = window.__AURA_DIAGNOSTICS__?.world?.room;
            if (here === '\(room)') return 'already';
            const open = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'));
            if (!open) return 'no-map-button';
            open.click();
            await new Promise((r) => setTimeout(r, 400));
            const visit = document.querySelector('[data-room="\(room)"] button');
            if (!visit || visit.disabled) { document.querySelector('dialog[open] button[aria-label*="lose"]')?.click(); return 'no-visit-button:' + (visit?.textContent ?? 'none'); }
            visit.click();
            return 'visit';
            """) ?? "nil"
        guard await DevProbe.waitFor(webView, "d.world?.room === '\(room)' && d.world.phase === 'idle' && d.cameraSettled", timeout: .seconds(45)) else {
            let state = await DevProbe.evaluate(webView, "\(counters) return JSON.stringify(snap)") ?? "nil"
            log.error("world probe \(label, privacy: .public) \(room, privacy: .public) did not arrive (click=\(clicked, privacy: .public)) \(state, privacy: .public)")
            return
        }
        let travelMs = Int((ContinuousClock.now - started).components.seconds * 1000 + (ContinuousClock.now - started).components.attoseconds / 1_000_000_000_000_000)
        try? await Task.sleep(for: .milliseconds(1500))
        if NSApp.isActive == false { NSApp.activate() }
        let sample = await DevProbe.evaluate(webView, appFpsSeries(ms: sampleMs) + DevProbe.sampler(ms: sampleMs).replacingOccurrences(of: "return JSON.stringify({", with: "return JSON.stringify({ appFpsSeries: series, appFpsMin: Math.min(...series), appFpsMedian: [...series].sort((a,b)=>a-b)[Math.floor(series.length/2)],")) ?? "nil"
        let state = await DevProbe.evaluate(webView, "\(counters) return JSON.stringify(snap)") ?? "nil"
        log.notice("world probe \(label, privacy: .public) room=\(room, privacy: .public) travelMs=\(travelMs, privacy: .public) \(sample, privacy: .public) state=\(state, privacy: .public)")
    }

    /// Real window miniaturize and hide, then restore. Watches whether the page's
    /// render counters stop while the window is not visible and resume afterwards.
    private static func windowLifecycle(webView: WKWebView, model: AppModel) async {
        guard let window = webView.window else { log.error("world probe lifecycle: no window"); return }
        func state(_ label: String) async {
            let s = await DevProbe.evaluate(webView, "\(counters) return JSON.stringify({ label: '\(label)', hidden: document.hidden, vis: document.visibilityState, appFps: snap.appFps, ageMs: snap.sampledAgeMs, room: snap.room, context: snap.context })") ?? "nil"
            log.notice("world probe lifecycle \(s, privacy: .public) windowVisible=\(window.isVisible, privacy: .public) miniaturized=\(window.isMiniaturized, privacy: .public) occluded=\(!window.occlusionState.contains(.visible), privacy: .public) appHidden=\(NSApp.isHidden, privacy: .public) active=\(NSApp.isActive, privacy: .public)")
        }
        await state("before")
        window.miniaturize(nil)
        try? await Task.sleep(for: .seconds(4))
        await state("minimized-4s")
        window.deminiaturize(nil)
        try? await Task.sleep(for: .seconds(3))
        await state("restored-3s")
        NSApp.hide(nil)
        try? await Task.sleep(for: .seconds(4))
        await state("app-hidden-4s")
        NSApp.unhide(nil)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate()
        try? await Task.sleep(for: .seconds(3))
        await state("unhidden-3s")
        let after = await DevProbe.evaluate(webView, DevProbe.sampler(ms: 3000)) ?? "nil"
        log.notice("world probe lifecycle after-restore sample \(after, privacy: .public)")
    }
}
