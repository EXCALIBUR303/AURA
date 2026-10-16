// Optional integration audit: install Playwright outside the checkout and pass
// AURA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs. See PHASE2_HANDOFF.md.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-phase2-audit';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
  args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
});
const outcomes = [];
const errors = [];
const external = new Set();
function observe(page) {
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(`Request failed: ${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname !== new URL(baseURL).hostname) external.add(url.href);
  });
}
async function check(name, action) {
  await action(); outcomes.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
const ids = ['studio', 'hardware', 'software', 'ai-lab', 'github', 'companion'];
const labels = ['Studio', 'Hardware', 'Software', 'AI Lab', 'Projects', 'Companion'];
async function navigate(page, index) {
  await page.getByRole('navigation', { name: 'Studio zones' }).getByRole('button', { name: `${labels[index]} ${index + 1}`, exact: true }).click();
  await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[index]);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page);
  let releaseModel;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  await page.route('**/avatar/astra-lumen/*.glb', async (route) => { await modelGate; await route.continue(); });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await check('Scene loading is visible and excluded from per-zone performance samples', async () => {
    await page.getByText('Loading Astra…', { exact: true }).waitFor();
    await page.waitForTimeout(2400);
    assert.deepEqual(await page.evaluate(() => Object.keys(window.__AURA_DIAGNOSTICS__.perZone)), []);
    releaseModel();
  });
  await check('Licensed avatar loads at human scale with the documented idle and rig', async () => {
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.status === 'loaded' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    const d = await page.evaluate(() => window.__AURA_DIAGNOSTICS__);
    assert.equal(d.heightMeters, 1.75); assert.equal(d.bones, 72); assert.equal(d.triangles, 36508); assert.equal(d.playingClip, 'Idle02_F');
    assert.ok(d.rig.head && d.rig.eyes && d.rig.jaw);
    const response = await page.request.get(`${baseURL}/avatar/astra-lumen/astra_lumen_ii_a_rigged_companion_android.glb`);
    assert.equal((await response.body()).subarray(0, 4).toString(), 'glTF');
  });
  await check('Model author, source and CC BY 4.0 attribution stay visible', async () => {
    const credit = page.locator('.model-credit');
    await credit.getByRole('link', { name: 'XRProfXR', exact: true }).waitFor();
    assert.equal(await credit.getByRole('link', { name: 'CC BY 4.0', exact: true }).getAttribute('href'), 'https://creativecommons.org/licenses/by/4.0/');
    assert.ok((await credit.getByRole('link', { name: 'Source', exact: true }).getAttribute('href')).includes('84761f55aa17493d9b226bb1f7101428'));
  });
  if (process.env.AURA_AXE_MODULE) {
    await check('Automated WCAG A/AA scan has no violations', async () => {
      const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE);
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      await writeFile(path.join(artifacts, 'accessibility.json'), JSON.stringify(accessibility, null, 2));
      assert.deepEqual(accessibility.violations.map((item) => item.id), []);
    });
  }
  await page.screenshot({ path: path.join(artifacts, 'overview.png') });
  await check('All six zone buttons reach settled camera poses', async () => {
    for (let i = 0; i < ids.length; i++) await navigate(page, i);
    await page.screenshot({ path: path.join(artifacts, 'companion.png') });
  });
  await check('Idle animation advances and procedural look-at follows the camera', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.animationTime > 0.1);
    await navigate(page, 1);
    const hardware = await page.evaluate(() => ({ time: window.__AURA_DIAGNOSTICS__.animationTime, ...window.__AURA_DIAGNOSTICS__.rig }));
    await navigate(page, 2);
    const software = await page.evaluate(() => ({ time: window.__AURA_DIAGNOSTICS__.animationTime, ...window.__AURA_DIAGNOSTICS__.rig }));
    assert.ok(software.time > hardware.time);
    assert.ok(Math.abs(software.headYaw - hardware.headYaw) > 0.005 || Math.abs(software.headPitch - hardware.headPitch) > 0.005);
    assert.ok(Math.abs(software.headYaw) <= 0.32 && Math.abs(software.headPitch) <= 0.13);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
  await check('All six projected hotspots navigate from overview', async () => {
    for (let i = 0; i < ids.length; i++) {
      await navigate(page, 0);
      const hotspot = page.getByRole('button', { name: `Travel to ${['Studio overview','Hardware Lab','Software Studio','AI / LLM Lab','GitHub projects','Astra Lumen II'][i]}`, exact: true });
      await hotspot.click();
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
  });
  await check('Mouse orbit, wheel zoom and reset change and restore the actual camera', async () => {
    await navigate(page, 0);
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.camera);
    const before = await page.evaluate(() => window.__AURA_DIAGNOSTICS__.camera.position);
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
    await page.mouse.move(box.x + 148, box.y + 58, { steps: 12 }); await page.mouse.up();
    await page.waitForFunction((start) => window.__AURA_DIAGNOSTICS__.camera.position.some((value, index) => Math.abs(value - start[index]) > 0.1), before);
    const distance = () => page.evaluate(() => { const c = window.__AURA_DIAGNOSTICS__.camera; return Math.hypot(...c.position.map((value, i) => value - c.target[i])); });
    const originalDistance = await distance();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.wheel(0, 350);
    await page.waitForFunction((start) => { const c = window.__AURA_DIAGNOSTICS__.camera; return Math.abs(Math.hypot(...c.position.map((value, i) => value - c.target[i])) - start) > 0.1; }, originalDistance);
    const zoomed = await distance(); assert.ok(zoomed >= 7 - 0.01 && zoomed <= 22 + 0.01);
    await page.getByRole('button', { name: 'Reset overview', exact: true }).click();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.camera.position.every((value, i) => Math.abs(value - [9, 8, 12][i]) < 0.03));
  });
  await check('Browser shortcuts navigate; typing retains ordinary editing behavior', async () => {
    for (let i = 0; i < ids.length; i++) {
      await page.locator('canvas').click({ position: { x: 8, y: 8 } }); await page.keyboard.press(`Control+${i + 1}`);
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
    for (let i = 0; i < ids.length; i++) {
      await page.locator('canvas').click({ position: { x: 8, y: 8 } }); await page.keyboard.press(`Meta+${i + 1}`);
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
    await page.getByLabel('Message Astra').focus(); await page.keyboard.press('Control+2');
    assert.equal(await page.evaluate(() => window.__AURA_DIAGNOSTICS__.zone), 'companion');
  });
  await check('Last zone survives a browser reload', async () => {
    await navigate(page, 2); await page.reload();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.zone === 'software' && window.__AURA_DIAGNOSTICS__.cameraSettled);
  });
  await check('Mock streaming completes and can be cancelled', async () => {
    await page.getByLabel('Message Astra').fill('A browser integration check');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('log').filter({ hasText: '[mock] You said: A browser integration check' }).waitFor();
    await page.getByRole('button', { name: 'Animate mock speech', exact: true }).waitFor();
    await page.getByLabel('Message Astra').fill('A longer prompt '.repeat(15));
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
    await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  });
  await check('Speech levels move the jaw and listening surfaces the mock transcript', async () => {
    await page.getByLabel('Message Astra').fill('Speech check'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'Animate mock speech', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Animate mock speech', exact: true }).click();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.rig?.jawAngle > 0.001, null, { polling: 20 });
    await page.getByRole('button', { name: 'Talk with Astra', exact: false }).click();
    await page.getByText('Transcript: mock transcript complete', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Stop listening', exact: false }).click();
  });
  await check('Project notes, pinning, and zone assignment round-trip through the bridge', async () => {
    await page.getByLabel('Notes', { exact: true }).fill('Integration test note');
    await page.getByLabel('Studio zone', { exact: true }).selectOption('hardware');
    await page.getByLabel('Pin this project', { exact: true }).check();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByText('Saved to the project store.', { exact: true }).waitFor();
    await page.getByRole('button', { name: /sample-web-app/ }).click();
    await page.getByRole('button', { name: /sample-firmware/ }).click();
    await page.waitForFunction(() => document.querySelector('#project-notes').value === 'Integration test note' && document.querySelector('#project-zone').value === 'hardware');
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'Integration test note');
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), 'hardware');
    assert.equal(await page.getByLabel('Pin this project', { exact: true }).isChecked(), true);
  });
  await check('Keyboard focus is visible and layout fits the minimum target window', async () => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.getByLabel('Message Astra').focus(); await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.aura-app').getAttribute('data-reduced-motion'), 'true');
    const targets = await page.locator('.zone-nav button').evaluateAll((buttons) => buttons.map((b) => ({ left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right })));
    assert.ok(targets.every((b) => b.left >= 80 && b.right <= 1100));
  });
  await check('All six hotspots remain reachable without dock overlap at 1100×700', async () => {
    for (let i = 0; i < ids.length; i++) {
      await navigate(page, 0);
      const hotspot = page.locator('.hotspot').nth(i);
      await hotspot.click();
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
  });
  await check('Keyboard-only tab navigation reaches all six zones with visible focus', async () => {
    await page.locator('.skip-link').focus();
    for (let i = 0; i < ids.length; i++) {
      await page.keyboard.press('Tab');
      const button = page.getByRole('navigation', { name: 'Studio zones', exact: true }).locator('button').nth(i);
      assert.ok(await button.evaluate((element) => element === document.activeElement && element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none'));
      await page.keyboard.press('Enter');
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
  });
  await check('WebGL context loss shows recovery and restoration reloads the scene', async () => {
    await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      window.__testContext = gl.getExtension('WEBGL_lose_context');
      window.__testContext.loseContext();
    });
    await page.getByText('The graphics connection was interrupted.', { exact: true }).waitFor();
    await page.evaluate(() => window.__testContext.restoreContext());
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.context === 'ready' && window.__AURA_DIAGNOSTICS__.status === 'loaded');
  });
  await page.close();

  await check('Missing GLB shows recovery UI and retry succeeds', async () => {
    const broken = await browser.newPage({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
    await broken.route('**/avatar/astra-lumen/*.glb', (route) => route.fulfill({ status: 404, body: 'Intentional test failure' }));
    await broken.goto(baseURL);
    await broken.getByRole('button', { name: 'Retry scene', exact: true }).waitFor();
    await broken.getByRole('heading', { name: 'Workstation inspector', exact: true }).waitFor();
    await broken.unroute('**/avatar/astra-lumen/*.glb');
    await broken.getByRole('button', { name: 'Retry scene', exact: true }).click();
    await broken.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.status === 'loaded');
    await broken.close();
  });
  await check('Unavailable WebGL shows a useful error with the workstation still usable', async () => {
    const unavailable = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await unavailable.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (name, ...args) {
        return /webgl/.test(name) ? null : original.call(this, name, ...args);
      };
    });
    await unavailable.goto(baseURL);
    await unavailable.getByRole('alert').waitFor();
    await unavailable.getByRole('heading', { name: 'Workstation inspector', exact: true }).waitFor();
    assert.equal(await unavailable.evaluate(() => window.__AURA_DIAGNOSTICS__.status), 'error');
    await unavailable.close();
  });

  // Native transport simulation only: this does not substitute for WKWebView testing.
  const native = await browser.newPage({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
  observe(native);
  await native.addInitScript((mockModule) => {
    let pending;
    const ready = () => pending ??= import(mockModule).then((mod) => {
      const transport = mod.createMockTransport();
      transport.onEvent((json) => window.__AURA_BRIDGE__?.dispatch(json));
      window.__testHost = transport;
      return transport;
    });
    window.webkit = { messageHandlers: { aura: { postMessage: async (json) => {
      const request = JSON.parse(json);
      if (request.method.startsWith('voice.')) return JSON.stringify({ kind: 'response', v: 1, id: request.id, ok: false, error: { code: 'unavailable', message: 'Phase 3', retryable: false } });
      const reply = await (await ready()).send(json);
      if (request.method === 'ai.chat') window.__testStreamId = JSON.parse(reply).result?.streamId;
      return reply;
    } } } };
  }, `/@fs${path.resolve(import.meta.dirname, '../../shared/bridge/mock.ts')}`);
  await native.goto(baseURL);
  await native.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.status === 'loaded' && window.__testHost);
  await check('Simulated native commands navigate and unavailable voice degrades gracefully', async () => {
    for (const zone of ids) {
      await native.evaluate((next) => window.__testHost.emit('app.command', { command: 'navigate', zone: next }), zone);
      await native.waitForFunction((next) => window.__AURA_DIAGNOSTICS__?.zone === next && window.__AURA_DIAGNOSTICS__.cameraSettled, zone);
    }
    await native.locator('canvas').click({ position: { x: 8, y: 8 } }); await native.keyboard.press('Control+2');
    assert.equal(await native.evaluate(() => window.__AURA_DIAGNOSTICS__.zone), 'companion');
    assert.equal(await native.getByRole('button', { name: 'Talk with Astra', exact: false }).isDisabled(), true);
  });
  await check('AI start failures and streamed errors show recoverable companion state', async () => {
    await native.evaluate(() => window.__testHost.failNext('ai.chat', { code: 'unavailable', message: 'Intentional test failure', retryable: true }));
    await native.getByLabel('Message Astra').fill('Error handling check');
    await native.getByRole('button', { name: 'Send message', exact: true }).click();
    await native.getByText('AI unavailable (unavailable).', { exact: true }).waitFor();
    await native.getByLabel('Message Astra').fill('Keep streaming '.repeat(40));
    await native.getByRole('button', { name: 'Send message', exact: true }).click();
    await native.waitForFunction(() => window.__testStreamId);
    await native.evaluate(() => window.__testHost.emit('ai.error', { streamId: window.__testStreamId, error: { code: 'internal', message: 'Intentional stream failure', retryable: true } }));
    await native.getByText('Reply unavailable (internal). Try again.', { exact: true }).waitFor();
    assert.ok(await native.locator('.companion-pill').evaluate((pill) => pill.classList.contains('error')));
  });
  await native.close();
  assert.deepEqual(errors, []); assert.equal(external.size, 0);
  outcomes.push({ name: 'No uncaught browser errors or external runtime requests', status: 'passed' });
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ outcomes, errors, external: [...external], nativeValidation: 'Simulated transport only; AuraApp not run on Linux.' }, null, 2));
  console.log(`${outcomes.length} integration checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ outcomes, errors, external: [...external], failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
