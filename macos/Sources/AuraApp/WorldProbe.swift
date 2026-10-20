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

    /// "1" = M6 baseline pass; "m9" = full M9 pass; "relaunch" = persistence check; "failure" = failed model + context loss;
    /// "p2" = Phase 5 cinematic travel pacing, skip/cancel/rapid/hide; "p7" = every room-to-room and Hub station transition in both directions; "p7t" = the same with the frame tracer (long frames and their marks; AURA_DEV_TRACE_SYNC=1 also waits for the GPU each frame); "p7v" = in-app snapshots (web content only) of transitions, the Free Explore doorway prompt and doorway hover glow; "leak" = memory bisect stages (sample `footprint` externally).
    static var scenario: String? { ProcessInfo.processInfo.environment["AURA_DEV_WORLD_PROBE"] }
    static var isEnabled: Bool { ["1", "m9", "relaunch", "failure", "leak", "p2", "p7", "p7t", "p7v"].contains(scenario ?? "") }

    private static let counters = """
        const d = window.__AURA_DIAGNOSTICS__;
        const snap = { room: d.world?.room, mode: d.world?.mode, phase: d.world?.phase, loaded: d.world?.loadedRooms, status: d.status, context: d.context,
          appFps: d.fps, drawCalls: d.drawCalls, triangles: d.sceneTriangles, resources: d.resources,
          assets: d.assets?.map((a) => a.id + ':' + a.owners.join('+') + (a.ready ? '' : '!not-ready')),
          dpr: d.renderer?.pixelRatio, gpu: d.renderer?.renderer, sampledAgeMs: Date.now() - (d.cameraSampledAt ?? 0),
          loadTiming: d.world?.loadTiming ? { room: d.world.loadTiming.room, readyMs: d.world.loadTiming.readyMs, settledMs: d.world.loadTiming.settledMs } : null,
          travel: d.travel ?? null,
          settings: d.settings ? { p: d.settings.presentation, f: d.settings.floatIntensity, l: d.settings.lightingPreset, rm: d.settings.reduceMotion } : null };
        """

    static func run(webView: WKWebView, model: AppModel) async {
        let sampleMs = Int(ProcessInfo.processInfo.environment["AURA_DEV_PROBE_SAMPLE_MS"] ?? "") ?? 5000
        let visits = Int(ProcessInfo.processInfo.environment["AURA_DEV_WORLD_VISITS"] ?? "") ?? 4
        log.notice("world probe start pid=\(ProcessInfo.processInfo.processIdentifier, privacy: .public) sampleMs=\(sampleMs, privacy: .public) visits=\(visits, privacy: .public)")
        // Dev-only: the WebContent process to sample with `footprint` (WKWebView SPI, read by key).
        let webPid = (webView.value(forKey: "_webProcessIdentifier") as? Int32) ?? -1
        log.notice("world probe webcontent pid=\(webPid, privacy: .public)")

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

        switch scenario {
        case "m9": await m9(webView: webView, model: model, sampleMs: sampleMs, visits: visits); return
        case "relaunch": await relaunch(webView: webView, model: model); return
        case "failure": await failure(webView: webView); return
        case "leak": await leak(webView: webView); return
        case "p2": await cinematic(webView: webView); return
        case "p7": await journeys(webView: webView); return
        case "p7t": await journeys(webView: webView, traced: true); return
        case "p7v": await visuals(webView: webView); return
        default: break
        }
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

    private static func js(_ webView: WKWebView, _ body: String) async -> String { await DevProbe.evaluate(webView, body) ?? "nil" }
    private static func state(_ webView: WKWebView) async -> String { await js(webView, "\(counters) return JSON.stringify(snap)") }

    /// Sets a World settings control the way the dialog does (React value setter + events), then closes the dialog.
    private static func setSetting(_ webView: WKWebView, _ label: String, _ value: String) async -> String {
        await js(webView, """
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            if (!document.querySelector('[aria-label="World presentation"]')) { document.querySelector('button[aria-label="World settings"]')?.click(); await sleep(350); }
            const el = document.querySelector('[aria-label="\(label)"]');
            if (!el) return 'no-control';
            const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '\(value)');
            el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(150);
            const status = document.querySelector('.world-settings [role="status"]')?.textContent ?? '';
            const close = [...document.querySelectorAll('dialog[open] button')].find((b) => /close/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
            close?.click(); await sleep(250);
            return (el.disabled ? 'disabled:' : 'set:') + status.slice(0, 40);
            """)
    }

    /// Phase 5 navigation: frame pacing during each travel kind, then skip, cancel, rapid retarget and hide mid-travel.
    private static func cinematic(webView: WKWebView) async {
        let openMap = "const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const go = async (room) => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'))?.click(); await sleep(350); document.querySelector(`[data-room=\"${room}\"] button`)?.click(); };"
        let settledJS = "const settled = (room) => new Promise((resolve) => { const t0 = performance.now(); const poll = () => { const d = window.__AURA_DIAGNOSTICS__; if (d.world.room === room && d.world.phase === 'idle' && d.cameraSettled) resolve(true); else if (performance.now() - t0 > 20000) resolve(false); else setTimeout(poll, 30); }; poll(); });"
        // Warm every room once so frame pacing below measures the transition, not a cold model load.
        for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] { await visit(room, webView: webView, sampleMs: 500, label: "p2-warm") }
        for room in ["gaming", "atrium", "living", "project-hub", "atrium", "project-hub"] {
            let r = await js(webView, """
                \(openMap) \(settledJS)
                const frames = []; let last = performance.now(), on = true; const tick = (t) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
                const t0 = performance.now(); await go('\(room)'); const ok = await settled('\(room)'); on = false;
                const s = frames.slice(1).sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
                const d = window.__AURA_DIAGNOSTICS__;
                return JSON.stringify({ to: '\(room)', ok, wallMs: Math.round(performance.now() - t0), travel: d.travel, frames: s.length, p50Ms: +q(0.5).toFixed(1), p95Ms: +q(0.95).toFixed(1), maxMs: +s.at(-1).toFixed(1), over20: s.filter((x) => x > 20.9).length, loaded: d.world.loadedRooms, calls: d.drawCalls });
                """)
            log.notice("world probe p2 travel \(r, privacy: .public)")
        }
        let skip = await js(webView, """
            \(openMap) \(settledJS)
            await go('living'); while (window.__AURA_DIAGNOSTICS__.world.phase !== 'travelling') await sleep(20); await sleep(300);
            [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Skip')?.click();
            const ok = await settled('living'); return JSON.stringify({ ok, travel: window.__AURA_DIAGNOSTICS__.travel, veil: document.querySelector('.travel-veil')?.style.opacity });
            """)
        log.notice("world probe p2 skip \(skip, privacy: .public)")
        let cancel = await js(webView, """
            \(openMap)
            await go('gaming'); while (window.__AURA_DIAGNOSTICS__.world.phase !== 'travelling') await sleep(20); await sleep(300);
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            for (let i = 0; i < 100 && !(window.__AURA_DIAGNOSTICS__.world.phase === 'idle' && window.__AURA_DIAGNOSTICS__.cameraSettled); i++) await sleep(30);
            const d = window.__AURA_DIAGNOSTICS__; return JSON.stringify({ phase: d.world.phase, room: d.world.room, loaded: d.world.loadedRooms, settled: d.cameraSettled, veil: document.querySelector('.travel-veil')?.style.opacity });
            """)
        log.notice("world probe p2 cancel \(cancel, privacy: .public)")
        let rapid = await js(webView, """
            \(openMap) \(settledJS)
            const here = window.__AURA_DIAGNOSTICS__.world.room; const order = ['atrium', 'gaming', 'project-hub', 'living'].filter((r) => r !== here).slice(0, 3);
            for (const r of order) { await go(r); await sleep(150); }
            const ok = await settled(order.at(-1)); const d = window.__AURA_DIAGNOSTICS__;
            return JSON.stringify({ order, ok, room: d.world.room, loaded: d.world.loadedRooms, travel: d.travel, canvases: document.querySelectorAll('canvas').length });
            """)
        log.notice("world probe p2 rapid \(rapid, privacy: .public)")
        // Hide the app in the middle of a bridge; travel must settle without frames and stay correct on return.
        _ = await js(webView, "\(openMap) await go('gaming'); while (window.__AURA_DIAGNOSTICS__.world.phase !== 'travelling') await sleep(20); await sleep(200); return 'started';")
        NSApp.hide(nil)
        try? await Task.sleep(for: .seconds(2))
        let hidden = await js(webView, "const d = window.__AURA_DIAGNOSTICS__; return JSON.stringify({ hidden: document.hidden, phase: d.world.phase, room: d.world.room, travel: d.travel });")
        NSApp.unhide(nil); NSApp.activate(); webView.window?.makeKeyAndOrderFront(nil)
        try? await Task.sleep(for: .seconds(2))
        let back = await js(webView, "const d = window.__AURA_DIAGNOSTICS__; return JSON.stringify({ hidden: document.hidden, phase: d.world.phase, room: d.world.room, settled: d.cameraSettled, loaded: d.world.loadedRooms, veil: document.querySelector('.travel-veil')?.style.opacity, explore: !document.querySelector('.world-hud button[aria-pressed]')?.disabled });")
        log.notice("world probe p2 hide-mid-travel hidden=\(hidden, privacy: .public) restored=\(back, privacy: .public)")
        await sample(webView, "p2-after", ms: 3000)
        log.notice("world probe done")
    }

    /// Phase 7: frame pacing for every directed room transition and the Hub station moves, after one warm pass.
    /// Sample WebContent memory with `footprint` externally; the probe logs markers.
    private static func journeys(webView: WKWebView, traced: Bool = false) async {
        let sync = ProcessInfo.processInfo.environment["AURA_DEV_TRACE_SYNC"] == "1"
        let helpers = """
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const go = async (room) => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'))?.click(); await sleep(350); document.querySelector(`[data-room="${room}"] button`)?.click(); };
            const station = async (label) => { [...document.querySelectorAll('nav[aria-label="Studio zones"] button')].find((b) => b.textContent.trim().startsWith(label))?.click(); };
            const idle = () => { const d = window.__AURA_DIAGNOSTICS__; return d.world.phase === 'idle' && d.cameraSettled; };
            const measure = async (start, done) => {
              const frames = [], calls = []; let last = performance.now(), on = true;
              const tick = (t) => { frames.push(t - last); last = t; calls.push(window.__AURA_DIAGNOSTICS__.drawCalls ?? 0); if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
              if (\(traced)) window.__AURA_TRACE__?.start({ sync: \(sync) });
              const t0 = performance.now(); await start(); await sleep(60);
              for (let i = 0; i < 400 && !done(); i++) await sleep(25); on = false;
              // Long frames: start-to-start gap over 25 ms, with this frame's callback/render time, the time spent
              // outside the frame before the next one, resource deltas, and every mark in between.
              const long = [];
              if (\(traced)) { const tr = window.__AURA_TRACE__.stop(), f = tr.frames;
                for (let i = 0; i + 1 < f.length; i++) { const a = f[i], b = f[i + 1], gap = b.start - a.start; if (gap <= 25) continue;
                  const prev = f[i - 1] ?? a;
                  long.push({ atMs: Math.round(a.start - f[0].start), gapMs: +gap.toFixed(1), callbacksMs: +a.callbacksMs.toFixed(1), renderMs: +a.renderMs.toFixed(1), syncMs: a.syncMs === undefined ? undefined : +a.syncMs.toFixed(1), outsideMs: +(gap - a.callbacksMs - a.renderMs - (a.syncMs ?? 0)).toFixed(1), programs: a.programs - prev.programs, textures: a.textures - prev.textures, geometries: a.geometries - prev.geometries, calls: a.calls,
                    marks: tr.marks.filter((m) => m.t >= a.start - 1 && m.t < b.start).map((m) => `${Math.round(m.t - a.start)}:${m.label}${m.ms === undefined ? '' : '=' + m.ms.toFixed(1)}`) }); }
              }
              const s = frames.slice(1).sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
              const d = window.__AURA_DIAGNOSTICS__;
              if (!s.length) return { ok: done(), frames: 0, note: 'no frames: window hidden or occluded', long };
              return { ok: done(), wallMs: Math.round(performance.now() - t0), travel: d.travel, loaded: d.world.loadedRooms, frames: s.length, p50Ms: +q(0.5).toFixed(1), p95Ms: +q(0.95).toFixed(1), maxMs: +(s.at(-1) ?? 0).toFixed(1), over20: s.filter((x) => x > 20.9).length, peakDrawCalls: Math.max(...calls), long };
            };
            """
        for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] { await visit(room, webView: webView, sampleMs: 500, label: "p7-warm") }
        log.notice("world probe p7 marker warm-done")
        let order = ["living", "gaming", "project-hub", "gaming", "living", "project-hub", "atrium", "living", "atrium", "gaming", "atrium", "project-hub"]
        var from = "project-hub"
        for room in order {
            front(webView)
            let r = await js(webView, "\(helpers) const m = await measure(() => go('\(room)'), () => idle() && window.__AURA_DIAGNOSTICS__.world.room === '\(room)'); const { long, ...rest } = m; window.__AURA_LONG__ = long; return JSON.stringify({ from: '\(from)', to: '\(room)', ...rest });")
            log.notice("world probe p7 room \(r, privacy: .public)")
            if traced { await logLong(webView, "\(from)>\(room)") }
            from = room
            try? await Task.sleep(for: .milliseconds(600))
        }
        for label in ["AI Lab", "Studio", "Software", "Studio", "Hardware", "Projects", "Studio"] {
            front(webView)
            let r = await js(webView, "\(helpers) const m = await measure(() => station('\(label)'), idle); const { long, ...rest } = m; window.__AURA_LONG__ = long; return JSON.stringify({ station: '\(label)', ...rest });")
            log.notice("world probe p7 station \(r, privacy: .public)")
            if traced { await logLong(webView, "station \(label)") }
            try? await Task.sleep(for: .milliseconds(600))
        }
        log.notice("world probe p7 marker transitions-done")
        await sample(webView, "p7-after", ms: 3000)
        let end = await js(webView, "\(counters) return JSON.stringify({ resources: snap.resources, loaded: snap.loaded, canvases: document.querySelectorAll('canvas').length });")
        log.notice("world probe p7 end \(end, privacy: .public)")
        log.notice("world probe done")
    }

    /// Phase 7 visual review: WKWebView snapshots (the app's web content only, never the desktop) written to the
    /// app container's temporary folder, plus DOM/diagnostic checks of the Explore doorway prompt and doorway hover.
    private static func visuals(webView: WKWebView) async {
        let helpers = """
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const go = async (room) => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'))?.click(); await sleep(350); document.querySelector(`[data-room="${room}"] button`)?.click(); };
            const idle = () => { const d = window.__AURA_DIAGNOSTICS__; return d.world.phase === 'idle' && d.cameraSettled; };
            /** Screen position of a world point for the current camera (diagnostics pose and FOV). */
            const screen = (p) => { const c = window.__AURA_DIAGNOSTICS__.camera, canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect();
              const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
              const f = n(c.target.map((v, i) => v - c.position[i])), right = n([-f[2], 0, f[0]]), up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
              const v = p.map((x, i) => x - c.position[i]), z = dot(v, f), t = Math.tan(c.fov * Math.PI / 360);
              return [r.left + (dot(v, right) / (z * t * r.width / r.height) + 1) / 2 * r.width, r.top + (1 - dot(v, up) / (z * t)) / 2 * r.height]; };
            const pointer = (type, [x, y]) => document.querySelector('canvas').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
            """
        func settle(_ room: String) async { for _ in 0..<200 { if await js(webView, "\(helpers) return String(idle() && window.__AURA_DIAGNOSTICS__.world.room === '\(room)');") == "true" { return }; try? await Task.sleep(for: .milliseconds(50)) } }
        for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] { await visit(room, webView: webView, sampleMs: 300, label: "p7v-warm") }
        // Filmstrips: Living → Hub (the reported wall frames), Hub → Gaming, Atrium → Living.
        for (from, to) in [("project-hub", "living"), ("living", "project-hub"), ("project-hub", "gaming"), ("gaming", "atrium"), ("atrium", "living")] {
            front(webView)
            _ = await js(webView, "\(helpers) await go('\(to)'); return 'ok';")
            for i in 0..<14 { await snapshot(webView, "film-\(from)-\(to)-\(String(format: "%02d", i))"); try? await Task.sleep(for: .milliseconds(240)) }
            await settle(to)
            let travel = await js(webView, "return JSON.stringify(window.__AURA_DIAGNOSTICS__.travel);")
            log.notice("world probe p7v film \(from, privacy: .public)>\(to, privacy: .public) \(travel, privacy: .public)")
            try? await Task.sleep(for: .milliseconds(500))
        }
        // Doorway hover glow, seen from the Atrium framing: the Hub doorway's hit area, then away.
        front(webView)
        _ = await js(webView, "\(helpers) await go('atrium'); return 'ok';"); await settle("atrium"); try? await Task.sleep(for: .milliseconds(1200))
        await snapshot(webView, "hover-0-before")
        let hover = await js(webView, "\(helpers) const at = screen([0, 1.4, -3.95]); pointer('pointermove', at); await sleep(700); const cursor = document.querySelector('canvas').style.cursor; return JSON.stringify({ at: at.map(Math.round), cursor });")
        log.notice("world probe p7v hover \(hover, privacy: .public)")
        await snapshot(webView, "hover-1-hub-door")
        let away = await js(webView, "\(helpers) pointer('pointermove', [5, 5]); await sleep(700); return document.querySelector('canvas').style.cursor || 'default';")
        log.notice("world probe p7v hover-away cursor=\(away, privacy: .public)")
        await snapshot(webView, "hover-2-after")
        // Free Explore doorway prompt: in the Hub the explore position is beside the Atrium doorway.
        _ = await js(webView, "\(helpers) await go('project-hub'); return 'ok';"); await settle("project-hub"); try? await Task.sleep(for: .milliseconds(800))
        let explore = await js(webView, "\(helpers) [...document.querySelectorAll('.world-hud button')].find((b) => b.textContent.trim() === 'Free Explore')?.click(); await sleep(1000); const hint = document.querySelector('.explore-hint'); return JSON.stringify({ mode: window.__AURA_DIAGNOSTICS__.world.mode, prompt: hint?.textContent?.trim() ?? null, visible: !!hint && hint.getBoundingClientRect().height > 0 });")
        log.notice("world probe p7v explore \(explore, privacy: .public)")
        await snapshot(webView, "explore-hub-prompt")
        _ = await js(webView, "\(helpers) [...document.querySelectorAll('.world-hud button')].find((b) => b.textContent.trim() === 'Inspect')?.click(); await sleep(600); return 'ok';")
        log.notice("world probe done")
    }

    private static func snapshot(_ webView: WKWebView, _ name: String) async {
        guard let image = try? await webView.takeSnapshot(configuration: WKSnapshotConfiguration()), let tiff = image.tiffRepresentation,
              let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { log.notice("world probe p7v snapshot failed \(name, privacy: .public)"); return }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("aura-p7v", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? png.write(to: folder.appendingPathComponent("\(name).png"))
    }

    /// Brings the probe window forward and records whether it is actually visible (an occluded window settles travel instantly).
    private static func front(_ webView: WKWebView) {
        if !NSApp.isActive { NSApp.activate() }
        webView.window?.makeKeyAndOrderFront(nil)
        if !(webView.window?.occlusionState.contains(.visible) ?? false) || !NSApp.isActive { log.notice("world probe p7 window not frontmost active=\(NSApp.isActive, privacy: .public)") }
    }

    /// One log line per traced long frame (unified logging truncates long messages).
    private static func logLong(_ webView: WKWebView, _ label: String) async {
        let count = Int(await js(webView, "return String((window.__AURA_LONG__ ?? []).length);")) ?? 0
        for i in 0..<min(count, 16) {
            let line = await js(webView, "return JSON.stringify(window.__AURA_LONG__[\(i)]);")
            log.notice("world probe p7t long \(label, privacy: .public) \(line, privacy: .public)")
        }
    }

    /// Memory bisect: each stage repeats one interaction 30 times; sample WebContent with `footprint` between the logged markers.
    private static func leak(webView: WKWebView) async {
        let stages: [(String, String)] = [
            ("dialog", """
                const open = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'));
                open?.click(); await new Promise((r) => setTimeout(r, 450));
                document.querySelector('dialog[open] button[aria-label*="lose"]')?.click(); await new Promise((r) => setTimeout(r, 450));
                return document.querySelectorAll('dialog[open]').length;
                """),
            ("workspace", """
                const rail = [...document.querySelectorAll('.spatial-rail button')];
                rail[(window.__leakIndex = ((window.__leakIndex ?? 0) + 1) % 5)]?.click(); await new Promise((r) => setTimeout(r, 1300));
                return window.__AURA_DIAGNOSTICS__?.world?.phase;
                """),
            ("console", """
                document.querySelector('.astra-beacon:not([hidden])')?.click(); await new Promise((r) => setTimeout(r, 400));
                document.querySelector('.minimize-conversation')?.click(); await new Promise((r) => setTimeout(r, 400));
                return document.querySelector('.spatial-os')?.dataset.consoleMinimized;
                """),
        ]
        for (name, body) in stages {
            try? await Task.sleep(for: .seconds(8))
            log.notice("world probe leak begin \(name, privacy: .public)")
            for _ in 0..<30 { _ = await js(webView, body) }
            let after = await state(webView)
            log.notice("world probe leak end \(name, privacy: .public) \(after, privacy: .public)")
        }
        try? await Task.sleep(for: .seconds(8))
        log.notice("world probe leak begin travel")
        for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] + ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] {
            await visit(room, webView: webView, sampleMs: 500, label: "leak")
        }
        log.notice("world probe leak end travel")
        try? await Task.sleep(for: .seconds(8))
        log.notice("world probe done")
    }

    private static func sample(_ webView: WKWebView, _ label: String, ms: Int) async {
        let s = await js(webView, appFpsSeries(ms: ms) + DevProbe.sampler(ms: ms).replacingOccurrences(of: "return JSON.stringify({", with: "return JSON.stringify({ appFpsSeries: series, appFpsMin: Math.min(...series), appFpsMedian: [...series].sort((a,b)=>a-b)[Math.floor(series.length/2)],"))
        let v1 = await state(webView)
        log.notice("world probe sample \(label, privacy: .public) \(s, privacy: .public) state=\(v1, privacy: .public)")
    }

    private static func storedWorld(_ model: AppModel, _ label: String) async {
        guard let store = model.services?.store, let prefs = try? await store.loadPreferences() else { return }
        let w = prefs.world
        log.notice("world probe stored \(label, privacy: .public): v\(w.schemaVersion, privacy: .public) \(w.presentation.rawValue, privacy: .public) f=\(w.floatIntensity, privacy: .public) \(w.lightingPreset.rawValue, privacy: .public) \(w.cameraMode.rawValue, privacy: .public) room=\(w.lastRoomId, privacy: .public) zone=\(prefs.lastZone.rawValue, privacy: .public) reduceMotion=\(prefs.reduceMotion, privacy: .public) voice=\(prefs.voice.synthesisVoiceId ?? "default", privacy: .public)@\(prefs.voice.speechRate, privacy: .public) ai=\(prefs.ai.defaultProviderId ?? "none", privacy: .public)/\(prefs.ai.privateRepositoryContext.rawValue, privacy: .public)")
    }

    /// Full M9 pass. Writes world preferences through the real settings dialog (back up the database first).
    private static func m9(webView: WKWebView, model: AppModel, sampleMs: Int, visits: Int) async {
        // First Living visit the way a person reaches it: Hub → Atrium (byte warm-up after 700 ms idle) → Living.
        await visit("atrium", webView: webView, sampleMs: sampleMs, label: "pass1")
        await visit("living", webView: webView, sampleMs: sampleMs, label: "pass1-cold-living")
        for room in ["atrium", "gaming", "atrium", "project-hub"] {
            await visit(room, webView: webView, sampleMs: sampleMs, label: "pass1")
        }
        for cycle in 1...visits {
            for room in ["atrium", "living", "atrium", "gaming", "atrium", "project-hub"] {
                await visit(room, webView: webView, sampleMs: 1500, label: "repeat\(cycle)")
            }
            let v2 = await js(webView, "\(counters) return JSON.stringify({ cycle: \(cycle), resources: snap.resources, loaded: snap.loaded, dom: document.getElementsByTagName('*').length });")
            log.notice("world probe cycle-end \(v2, privacy: .public)")
        }
        // Lighting presets and presentation modes, measured in every room.
        for room in ["project-hub", "living", "gaming", "atrium"] {
            await visit(room, webView: webView, sampleMs: 1000, label: "presets")
            for preset in ["daylight", "sunset", "night"] {
                let v3 = await setSetting(webView, "World lighting", preset)
                log.notice("world probe set lighting=\(preset, privacy: .public) \(v3, privacy: .public)")
                try? await Task.sleep(for: .milliseconds(1200))
                await sample(webView, "\(room)-\(preset)-static", ms: 2500)
            }
            for mode in ["floating", "hybrid"] {
                let v4 = await setSetting(webView, "World presentation", mode)
                log.notice("world probe set presentation=\(mode, privacy: .public) \(v4, privacy: .public)")
                try? await Task.sleep(for: .milliseconds(1200))
                await sample(webView, "\(room)-night-\(mode)", ms: 2500)
            }
            _ = await setSetting(webView, "World presentation", "static")
        }
        await windowLifecycle(webView: webView, model: model)

        // Persistence: choose distinctive values through the dialog, end in Gaming, then quit normally.
        _ = await setSetting(webView, "World lighting", "sunset")
        _ = await setSetting(webView, "World presentation", "hybrid")
        _ = await setSetting(webView, "Float intensity", "0.6")
        await visit("gaming", webView: webView, sampleMs: 500, label: "persist")
        try? await Task.sleep(for: .milliseconds(800))
        await storedWorld(model, "before-quit")
        log.notice("world probe done; quitting for the relaunch check")
        NSApp.terminate(nil)
    }

    /// Relaunch: the world must come back in the saved room with the saved settings and no extra writes.
    private static func relaunch(webView: WKWebView, model: AppModel) async {
        await storedWorld(model, "at-launch")
        _ = await DevProbe.waitFor(webView, "d.world?.room === 'gaming' && d.world.phase === 'idle' && d.cameraSettled", timeout: .seconds(30))
        try? await Task.sleep(for: .milliseconds(1500))
        let restored = await js(webView, """
            \(counters)
            document.querySelector('button[aria-label="World settings"]')?.click(); await new Promise((r) => setTimeout(r, 350));
            const status = document.querySelector('.world-settings [role="status"]')?.textContent ?? '';
            const ui = { presentation: document.querySelector('[aria-label="World presentation"]')?.value, lighting: document.querySelector('[aria-label="World lighting"]')?.value,
              float: document.querySelector('[aria-label="Float intensity"]')?.value };
            [...document.querySelectorAll('dialog[open] button')].find((b) => /close/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))?.click();
            return JSON.stringify({ ...snap, ui, status: status.slice(0, 60) });
            """)
        log.notice("world probe relaunch restored \(restored, privacy: .public)")
        await storedWorld(model, "after-restore")
        await sample(webView, "relaunch-gaming", ms: 3000)
        log.notice("world probe done")
    }

    /// A failed model load (one rejected fetch) must show Retry and recover; then WebGL context loss and restore.
    private static func failure(webView: WKWebView) async {
        let armed = await js(webView, """
            const original = window.fetch; let failures = 0;
            window.fetch = (input, init) => { const url = String(input?.url ?? input);
              if (url.includes('SheenChair') && failures === 0) { failures++; window.fetch = original; return Promise.reject(new TypeError('probe: injected network failure')); }
              return original(input, init); };
            return 'armed';
            """)
        log.notice("world probe failure \(armed, privacy: .public)")
        _ = await js(webView, """
            [...document.querySelectorAll('button')].find((b) => b.textContent.includes('World map'))?.click();
            await new Promise((r) => setTimeout(r, 400));
            document.querySelector('[data-room="living"] button')?.click(); return 'visit';
            """)
        let failed = await DevProbe.waitFor(webView, "d.world?.phase === 'error'", timeout: .seconds(30))
        let errorUI = await js(webView, "\(counters) return JSON.stringify({ ...snap, feedback: document.querySelector('.world-feedback')?.textContent, retry: !![...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry room') })")
        log.notice("world probe failure shown=\(failed, privacy: .public) \(errorUI, privacy: .public)")
        _ = await js(webView, "[...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry room')?.click(); return 'retry'")
        let recovered = await DevProbe.waitFor(webView, "d.world?.room === 'living' && d.world.phase === 'idle' && d.cameraSettled", timeout: .seconds(45))
        let v5 = await state(webView)
        log.notice("world probe failure recovered=\(recovered, privacy: .public) \(v5, privacy: .public)")
        await sample(webView, "after-retry-living", ms: 3000)

        let lost = await js(webView, """
            const canvas = document.querySelector('.scene-canvas canvas');
            const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
            const ext = gl?.getExtension('WEBGL_lose_context');
            if (!ext) return 'no-extension';
            window.__probeLose = ext; ext.loseContext(); return 'lost';
            """)
        try? await Task.sleep(for: .seconds(2))
        let v6 = await state(webView)
        log.notice("world probe context \(lost, privacy: .public) during=\(v6, privacy: .public)")
        _ = await js(webView, "window.__probeLose?.restoreContext(); return 'restore'")
        let back = await DevProbe.waitFor(webView, "d.context === 'ready' && d.status === 'loaded'", timeout: .seconds(30))
        try? await Task.sleep(for: .seconds(2))
        let v7 = await state(webView)
        log.notice("world probe context restored=\(back, privacy: .public) \(v7, privacy: .public)")
        await sample(webView, "after-context-restore", ms: 3000)
        await visit("atrium", webView: webView, sampleMs: 1500, label: "after-context")
        await visit("project-hub", webView: webView, sampleMs: 1500, label: "after-context")
        log.notice("world probe done")
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
