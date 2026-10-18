// Native-shaped shared mock only. No microphone, speaker or M5 acceptance claims.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const base = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-voice';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined, args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const results = [], scans = [], errors = [], requests = [];
let sceneDiagnostics;
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) requests.push(request.url()); });
  await page.addInitScript(({ module, options }) => {
    let ready;
    const calls = [];
    window.__micCalls = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__micCalls++; throw new Error('No browser capture allowed'); };
    const request = async (host, method, params = {}) => JSON.parse(await host.send(JSON.stringify({ kind: 'request', v: 1, id: `test-${Math.random()}`, method, params })));
    const getHost = () => ready ??= import(module).then(async ({ createMockTransport }) => {
      const host = createMockTransport({ voiceGranted: options.granted ?? true, voiceIssue: options.issue, streamIntervalMs: options.interval ?? 25 });
      host.onEvent(json => window.__AURA_BRIDGE__?.dispatch(json));
      if (options.autoSpeak) await request(host, 'prefs.update', { voice: { autoSpeakReplies: true } });
      window.__voiceTest = { calls, emit: (name, payload) => host.emit(name, payload), request: (method, params) => request(host, method, params) };
      return host;
    });
    window.webkit = { messageHandlers: { aura: { postMessage: async json => {
      const host = await getHost(), req = JSON.parse(json); calls.push({ method: req.method, params: req.params });
      if (options.unavailableError && req.method.startsWith('voice.')) return JSON.stringify({ kind: 'response', v: 1, id: req.id, ok: false, error: { code: 'unavailable', message: 'Unavailable host fixture', retryable: false } });
      if (req.method === 'app.getWindowState' && !options.scene) return JSON.stringify({ kind: 'response', v: 1, id: req.id, ok: true, result: { active: false, visible: false } });
      const reply = JSON.parse(await host.send(json));
      if (options.unavailable && req.method === 'voice.getStatus') reply.result = { ...reply.result, phase: 'unavailable', sessionActive: false };
      if (options.unavailable && req.method === 'voice.getCapabilities') reply.result = { ...reply.result, recognition: 'unavailable', input: 'unavailable', engine: 'none' };
      if (options.delayStart && req.method === 'voice.startListening') await new Promise(resolve => setTimeout(resolve, options.delayStart));
      return JSON.stringify(reply);
    } } } };
  }, { module: `/@fs${path.resolve(import.meta.dirname, '../../shared/bridge/mock.ts')}`, options });
  await page.goto(base); await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  await page.waitForFunction(() => window.__voiceTest && !document.querySelector('.conversation-loading') && !document.querySelector('.voice-talk')?.disabled);
  return page;
}
async function check(name, run) { await run(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
async function calls(page, method) { return page.evaluate(method => window.__voiceTest.calls.filter(call => call.method === method), method); }
async function axe(page, name) { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); await writeFile(path.join(artifacts, `axe-${name}.json`), JSON.stringify(result, null, 2)); assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []); scans.push({ name, violations: 0 }); }
const draft = page => page.getByRole('textbox', { name: 'Message Astra', exact: true });
async function talk(page) { await page.getByRole('button', { name: 'Talk with Astra', exact: true }).click(); }
async function reviewed(page) { await page.waitForFunction(() => document.querySelector('#companion-prompt')?.value === 'mock transcript complete'); }
async function status(page, patch) { await page.evaluate(async patch => { const { result } = await window.__voiceTest.request('voice.getStatus'); window.__voiceTest.emit('voice.statusChanged', { ...result, revision: result.revision + 100, ...patch }); }, patch); }
try {
  const permission = await open({ granted: false });
  await check('No capture or permission prompt on load; permission explainer requires a second explicit action', async () => {
    assert.equal((await calls(permission, 'voice.startListening')).length, 0); assert.equal((await calls(permission, 'voice.requestPermissions')).length, 0);
    await talk(permission); await permission.getByRole('dialog').waitFor();
    assert.equal(await permission.evaluate(() => document.activeElement.textContent), 'Not now');
    await axe(permission, 'permission'); await permission.screenshot({ path: path.join(artifacts, 'permission.png') });
    await permission.getByRole('button', { name: 'Continue to microphone access' }).click();
    await permission.waitForFunction(() => document.querySelector('.voice-rail-heading strong')?.textContent === 'Ready when you are');
    assert.equal((await calls(permission, 'voice.requestPermissions')).length, 1); assert.equal((await calls(permission, 'voice.startListening')).length, 0);
  });
  await check('First Talk binds a conversation and final speech becomes an editable unsent draft', async () => {
    await talk(permission); await reviewed(permission);
    assert.equal((await calls(permission, 'voice.startSession')).length, 1); assert.equal((await calls(permission, 'voice.startListening')).length, 1);
    assert.equal((await calls(permission, 'ai.sendMessage')).length, 0);
    await axe(permission, 'review'); await permission.screenshot({ path: path.join(artifacts, 'transcript-review.png') });
    await permission.setViewportSize({ width: 1100, height: 700 });
    assert.ok(await permission.getByText('VOICE DRAFT · NOT SENT', { exact: true }).isVisible(), 'short windows keep final-draft guidance visible');
    await permission.screenshot({ path: path.join(artifacts, 'transcript-review-1100.png') });
    await permission.setViewportSize({ width: 1440, height: 900 });
    await permission.getByRole('button', { name: 'Send message', exact: true }).click();
    await permission.locator('.assistant-markdown').waitFor();
    assert.equal((await calls(permission, 'ai.sendMessage')).length, 1); assert.equal((await calls(permission, 'voice.speakReply')).length, 0);
  });
  await check('Speech mute is visible in compact and expanded layouts and prevents a silent Read aloud action', async () => {
    await permission.getByRole('button', { name: 'Mute speech', exact: true }).click();
    assert.ok(await permission.getByText('· Speech muted', { exact: true }).isVisible());
    assert.ok(await permission.getByRole('button', { name: 'Read aloud', exact: true }).isDisabled());
    await permission.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
    assert.ok(await permission.getByText('· Speech muted', { exact: true }).isVisible());
    await axe(permission, 'muted-compact'); await permission.screenshot({ path: path.join(artifacts, 'muted-compact.png') });
    await permission.getByRole('button', { name: 'Unmute speech', exact: true }).click();
    await permission.getByRole('button', { name: 'Expand conversation', exact: true }).click();
    assert.ok(await permission.getByRole('button', { name: 'Read aloud', exact: true }).isEnabled());
    assert.equal((await calls(permission, 'voice.speakReply')).length, 0);
  });
  const automatic = await open({ autoSpeak: true, delayStart: 350 });
  await check('Automatic spoken send happens once despite events preceding the start reply, and uses the accepted stream id', async () => {
    await automatic.getByRole('checkbox', { name: 'Edit before sending', exact: true }).uncheck();
    await talk(automatic); await automatic.locator('.assistant-markdown').waitFor();
    await automatic.waitForFunction(() => window.__voiceTest.calls.some(call => call.method === 'voice.speakReply'));
    const send = await calls(automatic, 'ai.sendMessage'), speak = await calls(automatic, 'voice.speakReply');
    assert.equal(send.length, 1); assert.equal(speak.length, 1); assert.equal(speak[0].params.conversationId, send[0].params.conversationId);
    assert.equal(send[0].params.text, 'mock transcript complete');
  });
  const held = await open({ interval: 60 });
  await check('Hold Option-Space finalises on release; Escape cancels a subsequent utterance', async () => {
    await held.getByRole('button', { name: 'Talk with Astra', exact: true }).focus();
    await held.keyboard.down('Alt'); await held.keyboard.down('Space');
    await held.getByRole('textbox', { name: 'Live speech transcript, not yet sent' }).waitFor();
    assert.equal((await calls(held, 'ai.sendMessage')).length, 0);
    await held.keyboard.up('Space'); await held.keyboard.up('Alt'); await reviewed(held);
    assert.equal((await calls(held, 'voice.stopListening')).length, 1);
    await draft(held).fill('Keep my draft'); await talk(held); await held.getByRole('button', { name: 'Cancel listening' }).waitFor(); await held.keyboard.press('Escape');
    await held.waitForFunction(() => document.querySelector('.voice-rail').dataset.phase === 'idle');
    assert.equal(await draft(held).inputValue(), 'Keep my draft'); assert.equal((await calls(held, 'ai.sendMessage')).length, 0);
  });
  await check('Existing typed draft is not overwritten or automatically sent by a final transcript', async () => {
    await talk(held); await held.locator('.voice-final-review').waitFor();
    assert.equal(await draft(held).inputValue(), 'Keep my draft');
    assert.ok(await held.getByRole('button', { name: 'Use transcript', exact: true }).isDisabled());
    await draft(held).fill(''); await held.getByRole('button', { name: 'Use transcript', exact: true }).click();
    assert.equal(await draft(held).inputValue(), 'mock transcript complete');
  });
  await check('Opening settings cancels capture without sending text into a dialog', async () => {
    await draft(held).fill('Preserve this draft'); await talk(held);
    await held.getByRole('button', { name: 'Cancel listening', exact: true }).waitFor();
    const cancels = (await calls(held, 'voice.cancelListening')).length;
    await held.getByRole('button', { name: 'Voice settings', exact: true }).click();
    await held.waitForFunction(() => document.querySelector('.voice-rail').dataset.phase === 'idle');
    assert.equal((await calls(held, 'voice.cancelListening')).length, cancels + 1);
    assert.equal((await calls(held, 'ai.sendMessage')).length, 0);
    await held.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await draft(held).inputValue(), 'Preserve this draft');
  });
  await check('End voice stays ended across draft edits, and does not end the text conversation', async () => {
    await held.getByRole('button', { name: 'End voice', exact: true }).click();
    await held.getByRole('button', { name: 'End voice', exact: true }).waitFor({ state: 'hidden' });
    await held.waitForFunction(() => document.activeElement?.classList.contains('voice-talk'));
    const binds = (await calls(held, 'voice.startSession')).length;
    await draft(held).fill('Continue in text');
    assert.equal((await calls(held, 'voice.startSession')).length, binds); assert.equal((await calls(held, 'ai.endConversation')).length, 0);
    assert.equal(await draft(held).inputValue(), 'Continue in text');
  });
  await check('Voice settings save native preferences and list actual shared-mock options', async () => {
    await held.getByRole('button', { name: 'Voice settings', exact: true }).click();
    await held.getByRole('option', { name: /Mock voice/ }).waitFor({ state: 'attached' });
    await held.getByRole('checkbox', { name: /Speak replies to spoken requests/ }).check();
    await held.waitForFunction(() => window.__voiceTest.calls.some(call => call.method === 'prefs.update' && call.params.voice?.autoSpeakReplies === true));
    assert.equal(await held.getByText('Allow Apple server recognition', { exact: true }).count(), 0);
    await axe(held, 'settings'); await held.screenshot({ path: path.join(artifacts, 'settings.png') });
    await held.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await held.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Voice settings');
  });
  const noAudio = await open({ issue: 'no_audio' });
  await check('No-audio failure exposes the host reason and exact recovery methods', async () => {
    await talk(noAudio); await noAudio.getByRole('button', { name: 'Choose microphone', exact: true }).waitFor();
    assert.ok(await noAudio.getByText(/No audio is arriving/).isVisible());
    await noAudio.getByRole('button', { name: 'Choose microphone', exact: true }).click();
    assert.deepEqual((await calls(noAudio, 'voice.openSettings'))[0].params, { target: 'sound_input' });
    assert.equal((await calls(noAudio, 'voice.startListening')).length, 1);
    await axe(noAudio, 'no-audio'); await noAudio.screenshot({ path: path.join(artifacts, 'no-audio.png') });
  });
  const lost = await open({ issue: 'input_lost' });
  await check('Bluetooth disconnection is recoverable and never restarts capture by itself', async () => {
    await talk(lost); await lost.getByRole('button', { name: 'Talk again', exact: true }).waitFor();
    assert.ok(await lost.getByText(/Audio from Mock headset stopped/).isVisible());
    assert.equal((await calls(lost, 'voice.startListening')).length, 1);
    await lost.getByRole('button', { name: 'Talk again', exact: true }).click();
    assert.equal((await calls(lost, 'voice.startListening')).length, 2);
  });
  const silence = await open({ issue: 'no_speech' });
  await check('No speech is a gentle idle hint without a final message or automatic retry', async () => {
    await talk(silence); await silence.getByText('No speech heard', { exact: true }).waitFor();
    assert.equal(await silence.locator('.voice-rail').getAttribute('data-phase'), 'idle');
    assert.equal((await calls(silence, 'ai.sendMessage')).length, 0); assert.equal((await calls(silence, 'voice.startListening')).length, 1);
  });
  const model = await open({ issue: 'recognition_unavailable' });
  await check('Missing recognition model uses the native install action without opening capture again', async () => {
    await talk(model); await model.getByRole('button', { name: 'Download speech model', exact: true }).click();
    assert.equal((await calls(model, 'voice.installRecognitionAssets')).length, 1);
    await model.getByText('Speech model is ready. Choose Talk when you are ready.', { exact: true }).waitFor();
    assert.equal((await calls(model, 'voice.startListening')).length, 1);
  });
  const unavailable = await open({ unavailable: true });
  await check('Unavailable native build hides Talk and keeps text controls usable', async () => {
    assert.equal(await unavailable.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
    assert.ok(await unavailable.getByText('Text conversation · Voice unavailable', { exact: true }).isVisible());
    await draft(unavailable).fill('Still text'); assert.ok(await unavailable.getByRole('button', { name: 'Send message', exact: true }).isEnabled());
    await axe(unavailable, 'unavailable');
  });
  const older = await open({ unavailableError: true });
  await check('An older host that rejects every voice method still completes text replies without a binding retry loop', async () => {
    await draft(older).fill('Text on an older host');
    await older.getByRole('button', { name: 'Send message', exact: true }).click();
    await older.locator('.assistant-markdown').waitFor();
    assert.equal((await calls(older, 'voice.startSession')).length, 0);
    assert.equal((await calls(older, 'ai.sendMessage')).length, 1);
    assert.equal(await older.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
  });
  await check('Permission denial opens the native settings target without repeated prompts', async () => {
    await status(noAudio, { phase: 'needs_permission', microphone: 'denied', issue: { code: 'permission_denied', message: 'Microphone access was denied.', recovery: ['open_microphone_settings'], transport: null } });
    assert.equal(await noAudio.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
    await noAudio.getByRole('button', { name: 'Microphone settings', exact: true }).click();
    assert.deepEqual((await calls(noAudio, 'voice.openSettings')).at(-1).params, { target: 'microphone' });
    assert.equal((await calls(noAudio, 'voice.requestPermissions')).length, 0); await axe(noAudio, 'denied');
  });
  await check('Voice layouts resize without document overflow and preserve attribution', async () => {
    for (const [width, height] of [[1100, 700], [1280, 800], [1440, 900], [1728, 1117]]) {
      await held.setViewportSize({ width, height });
      assert.equal(await held.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await held.getByRole('link', { name: 'CC BY 4.0', exact: true }).isVisible());
      if (width === 1100) { await held.screenshot({ path: path.join(artifacts, 'voice-1100.png') }); await axe(held, 'voice-1100'); }
    }
    assert.equal(await held.locator('.voice-level').getAttribute('data-static'), 'true');
  });
  await check('Keyboard Cancel and long spoken captions stay usable in all three layouts and four desktop sizes', async () => {
    const captions = await open({ interval: 1000 });
    await talk(captions);
    await captions.getByRole('button', { name: 'Cancel listening', exact: true }).focus();
    await captions.keyboard.press('Enter');
    await captions.waitForFunction(() => document.activeElement?.classList.contains('voice-talk'));
    // Shared-mock playback supplies actual progress events; repeated sentences
    // keep the same long caption on screen while the window layouts are checked.
    await captions.evaluate(() => window.__voiceTest.request('voice.speak', { text: ('Mock caption for keyboard scrolling '.repeat(10) + '. ').repeat(10) }));
    const caption = captions.getByRole('region', { name: 'Current spoken sentence', exact: true });
    await caption.focus(); await captions.keyboard.press('End');
    await captions.waitForFunction(() => document.querySelector('.voice-caption')?.scrollTop > 0);
    assert.notEqual(await caption.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    await axe(captions, 'long-caption');
    for (const [width, height] of [[1100, 700], [1280, 800], [1440, 900], [1728, 1117]]) {
      await captions.setViewportSize({ width, height });
      for (const layout of ['expanded', 'focus', 'compact']) {
        if (layout === 'expanded' && await captions.getByRole('button', { name: 'Expand conversation', exact: true }).isVisible()) await captions.getByRole('button', { name: 'Expand conversation', exact: true }).click();
        if (layout === 'focus') await captions.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
        if (layout === 'compact') await captions.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
        assert.equal(await captions.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await captions.locator('.voice-rail').evaluate(node => node.scrollWidth > node.clientWidth), false);
        assert.ok(await caption.isVisible());
        if (layout !== 'compact') assert.ok(await captions.locator('.conversation-transcript').evaluate(node => node.clientHeight >= 96), `${layout} ${width} keeps readable conversation space`);
        if (width === 1100 || width === 1440) await captions.locator('.companion-workspace').screenshot({ path: path.join(artifacts, `long-caption-${layout}-${width}.png`) });
      }
    }
    await captions.getByRole('button', { name: 'Stop speaking', exact: true }).click();
    assert.equal((await calls(captions, 'ai.sendMessage')).length, 0);
  });
  const scene = await open({ scene: true, interval: 160 });
  await check('Actual GLB responds to shared-mock TTS levels; Stop and Reduce Motion settle the jaw without adding scene complexity', async () => {
    await scene.emulateMedia({ reducedMotion: 'no-preference' });
    await scene.evaluate(() => window.__voiceTest.request('prefs.update', { reduceMotion: false }));
    await scene.locator('.zone-nav').getByRole('button', { name: /Companion/ }).click();
    await scene.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.status === 'loaded' && window.__AURA_DIAGNOSTICS__.cameraSettled, {}, { timeout: 60000 });
    assert.equal(await scene.evaluate(() => window.__AURA_DIAGNOSTICS__.bones), 72);
    // Many short sentences keep mock playback alive while SwiftShader captures
    // a frame, without lengthening word-by-word mock inference excessively.
    await draft(scene).fill('Mock. '.repeat(24));
    await scene.getByRole('button', { name: 'Send message', exact: true }).click();
    await scene.getByRole('button', { name: 'Read aloud', exact: true }).waitFor();
    assert.equal(await scene.evaluate(() => window.__AURA_DIAGNOSTICS__.rig.jawAngle), 0);
    await scene.getByRole('button', { name: 'Read aloud', exact: true }).click();
    await scene.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.rig?.jawAngle > .005);
    assert.ok(await scene.getByRole('region', { name: 'Current spoken sentence', exact: true }).isVisible());
    await scene.screenshot({ path: path.join(artifacts, 'scene-speaking.png') });
    await scene.getByRole('button', { name: 'Stop speaking', exact: true }).focus();
    await scene.keyboard.press('Enter');
    await scene.waitForFunction(() => document.activeElement?.classList.contains('voice-talk'));
    await scene.waitForFunction(() => window.__AURA_DIAGNOSTICS__.rig.jawAngle < .003);
    await scene.emulateMedia({ reducedMotion: 'reduce' });
    await scene.getByRole('button', { name: 'Read aloud', exact: true }).click();
    await scene.getByRole('button', { name: 'Stop speaking', exact: true }).waitFor();
    await scene.waitForFunction(() => window.__AURA_DIAGNOSTICS__.rig.jawAngle === 0);
    await scene.setViewportSize({ width: 1100, height: 700 });
    assert.ok(await scene.locator('.conversation-transcript').evaluate(node => node.clientHeight >= 96), 'short windows retain a readable message area');
    await scene.screenshot({ path: path.join(artifacts, 'scene-1100.png') });
    assert.equal(await scene.locator('canvas').count(), 1);
    sceneDiagnostics = await scene.evaluate(() => window.__AURA_DIAGNOSTICS__);
    assert.equal(sceneDiagnostics.drawCalls, 14); assert.equal(sceneDiagnostics.sceneTriangles, 79802);
  });
  await check('No browser microphone capture, external asset request or page error occurred', async () => {
    for (const context of browser.contexts()) for (const page of context.pages()) assert.equal(await page.evaluate(() => window.__micCalls), 0);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  });
} catch (error) { results.push({ status: 'failed', error: String(error) }); console.error(error); process.exitCode = 1;
  for (const context of browser.contexts()) for (const [i, page] of context.pages().entries()) await page.screenshot({ path: path.join(artifacts, `failure-${browser.contexts().indexOf(context)}-${i}.png`) }).catch(() => {});
} finally { await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'shared mock only; no native hardware or M5 acceptance', results, scans, errors, external: requests, sceneDiagnostics }, null, 2)); await browser.close(); }
