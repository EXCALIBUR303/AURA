// Optional integration audit: install Playwright outside the checkout and pass
// AURA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs. See PHASE2_HANDOFF.md.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getZone } from '../src/studio/zones.ts';
import { PerspectiveCamera, Vector3 } from 'three';
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
  if (process.env.AURA_STUDIO_TEST && !process.env.AURA_STUDIO_TEST.split('|').some((pattern) => name.includes(pattern)) && !name.startsWith('Scene loading') && !name.startsWith('Licensed avatar')) { outcomes.push({ name, status: 'skipped' }); return; }
  await action(); outcomes.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
const ids = ['studio', 'hardware', 'software', 'ai-lab', 'github', 'companion'];
const labels = ['Studio', 'Hardware', 'Software', 'AI Lab', 'Projects', 'Companion'];
async function navigate(page, index) {
  const previous = await page.evaluate(() => window.__AURA_DIAGNOSTICS__?.cameraRevision ?? -1);
  await page.getByRole('navigation', { name: 'Studio zones' }).getByRole('button', { name: `${labels[index]} ${index + 1}`, exact: true }).click();
  await page.waitForFunction(({zone,previous}) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled && window.__AURA_DIAGNOSTICS__.cameraRevision > previous, { zone: ids[index], previous });
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page);
  await page.addInitScript(() => {
    window.__testGpuStringReads = 0;
    const original = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (parameter) {
      if ([0x9245, 0x9246, 0x1f00, 0x1f01].includes(parameter)) window.__testGpuStringReads++;
      return original.call(this, parameter);
    };
  });
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
  await check('GPU renderer strings stay cached across diagnostic samples', async () => {
    const reads = await page.evaluate(() => window.__testGpuStringReads);
    assert.ok(reads >= 2);
    await page.waitForTimeout(3200);
    assert.equal(await page.evaluate(() => window.__testGpuStringReads), reads);
  });
  await check('Detail views hide the active card and limit nearby destinations', async () => {
    for (let i = 1; i < ids.length; i++) {
      await navigate(page, i);
      await page.waitForFunction(() => document.querySelector('.hotspot.selected').style.visibility === 'hidden');
      assert.ok(await page.locator('.hotspot:visible').count() <= (ids[i] === 'companion' ? 1 : 2));
    }
  });
  await check('Actual 3D workstation and Astra clicks navigate and focus the prompt', async () => {
    async function clickWorld(point) {
      // Use the real diagnostic pose rather than fixed screenshot coordinates.
      await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.camera?.fov);
      const d = await page.evaluate(() => window.__AURA_DIAGNOSTICS__);
      const box = await page.locator('canvas').boundingBox();
      const camera = new PerspectiveCamera(d.camera.fov, box.width / box.height, 0.05, 250);
      camera.position.fromArray(d.camera.position);
      camera.lookAt(new Vector3().fromArray(d.camera.target)); camera.updateMatrixWorld();
      const projected = new Vector3(...point).project(camera);
      const at = { x: box.x + (projected.x + 1) * box.width / 2, y: box.y + (1 - projected.y) * box.height / 2 };
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, at), 'CANVAS');
      await page.mouse.click(at.x, at.y);
    }
    await navigate(page, 0);
    await page.waitForFunction((pose) => window.__AURA_DIAGNOSTICS__.camera.position.every((v, i) => Math.abs(v - pose[i]) < 0.03), getZone('studio').camera);
    await clickWorld([-2.7, 0.8225, -13.15]);
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.zone === 'hardware' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    await navigate(page, 0);
    await page.waitForFunction((pose) => window.__AURA_DIAGNOSTICS__.camera.position.every((v, i) => Math.abs(v - pose[i]) < 0.03), getZone('studio').camera);
    await clickWorld([-1.25, 1, -12.5]);
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.zone === 'companion' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    assert.ok(await page.getByLabel('Message Astra').evaluate((el) => el === document.activeElement));
    await navigate(page, 1);
    await page.getByRole('button', { name: 'Focus Astra companion', exact: true }).click();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.zone === 'companion' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    assert.ok(await page.getByLabel('Message Astra').evaluate((el) => el === document.activeElement));
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
    // The prior orbit can face a desk or wall. Restore a known clear route before
    // measuring zoom so collision protection is not mistaken for broken controls.
    await page.getByRole('button', { name: 'Reset overview', exact: true }).click();
    await page.waitForFunction((pose) => window.__AURA_DIAGNOSTICS__.camera.position.every((value, i) => Math.abs(value - pose[i]) < 0.03), getZone('studio').camera);
    const distance = () => page.evaluate(() => { const c = window.__AURA_DIAGNOSTICS__.camera; return Math.hypot(...c.position.map((value, i) => value - c.target[i])); });
    const originalDistance = await distance();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.wheel(0, 350);
    await page.waitForFunction((start) => { const c = window.__AURA_DIAGNOSTICS__.camera; return Math.abs(Math.hypot(...c.position.map((value, i) => value - c.target[i])) - start) > 0.1; }, originalDistance);
    const zoomed = await distance(); assert.ok(zoomed >= 0.65 - 0.01 && zoomed <= 7 + 0.01);
    const bounded = await page.evaluate(() => window.__AURA_DIAGNOSTICS__.camera.position);
    assert.ok(bounded[0] > -6 && bounded[0] < 6 && bounded[2] > -15.5 && bounded[2] < -6.5);
    assert.ok(bounded[1] >= 0.3 && bounded[1] <= 3.44 + 0.001);
    await page.getByRole('button', { name: 'Reset overview', exact: true }).click();
    await page.waitForFunction((pose) => window.__AURA_DIAGNOSTICS__.camera.position.every((value, i) => Math.abs(value - pose[i]) < 0.03), getZone('studio').camera);
  });
  await check('Focus mode restores the exact prior camera and preserves the draft and one canvas', async () => {
    if (await page.getByRole('button', { name: 'Expand conversation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
    await navigate(page, 0);
    const canvas = page.locator('canvas');
    await canvas.evaluate((node) => { node.dataset.identity = 'persistent-studio'; });
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
    await page.mouse.move(box.x + 75, box.y + 35, { steps: 8 }); await page.mouse.up();
    const ended = await page.evaluate(() => Date.now());
    await page.waitForFunction((ended) => window.__AURA_DIAGNOSTICS__.cameraSampledAt >= ended, ended);
    const before = await page.evaluate(() => window.__AURA_DIAGNOSTICS__.camera);
    await page.evaluate((pose) => { window.__previousCameraTest = pose; }, before);
    await page.getByLabel('Message Astra').fill('A draft kept across focus modes');
    await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.zone === 'companion' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    await page.getByRole('button', { name: 'Leave focus mode', exact: true }).click();
    await page.waitForFunction((pose) => window.__AURA_DIAGNOSTICS__.zone === 'studio' && window.__AURA_DIAGNOSTICS__.camera.position.every((v, i) => Math.abs(v - pose.position[i]) < 0.04) && window.__AURA_DIAGNOSTICS__.camera.target.every((v, i) => Math.abs(v - pose.target[i]) < 0.04), before);
    assert.equal(await page.getByLabel('Message Astra').inputValue(), 'A draft kept across focus modes');
    assert.equal(await canvas.getAttribute('data-identity'), 'persistent-studio');
    assert.equal(await page.locator('canvas').count(), 1);
  });
  await check('Browser shortcuts navigate; typing retains ordinary editing behavior', async () => {
    for (let i = 0; i < ids.length; i++) {
      await page.getByRole('navigation', { name: 'Studio zones' }).locator('button').first().focus(); await page.keyboard.press(`Control+${i + 1}`);
      await page.waitForFunction((zone) => window.__AURA_DIAGNOSTICS__?.zone === zone && window.__AURA_DIAGNOSTICS__.cameraSettled, ids[i]);
    }
    for (let i = 0; i < ids.length; i++) {
      await page.getByRole('navigation', { name: 'Studio zones' }).locator('button').first().focus(); await page.keyboard.press(`Meta+${i + 1}`);
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
    await page.locator('.assistant-markdown').filter({ hasText: '[mock] You said: A browser integration check' }).waitFor();
    await page.getByRole('button', { name: 'Copy reply', exact: false }).last().waitFor();
    await page.getByLabel('Message Astra').fill('A longer prompt '.repeat(15));
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
    await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  });
  await check('Typed replies stay silent and do not invent speech metering', async () => {
    await page.getByLabel('Message Astra').fill('Text response check');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.locator('.assistant-markdown').filter({ hasText: '[mock] You said: Text response check' }).waitFor();
    assert.equal(await page.evaluate(() => window.__AURA_DIAGNOSTICS__.rig.jawAngle), 0);
    assert.ok(await page.getByRole('button', { name: 'Talk with Astra', exact: true }).isVisible());
    assert.ok(await page.getByText('Microphone access needed', { exact: true }).isVisible());
  });
  await check('Project notes, pinning, and zone assignment round-trip through the bridge', async () => {
    await page.getByRole('button', { name: 'Project inspector', exact: true }).click();
    await page.getByLabel('Notes', { exact: true }).fill('Integration test note');
    await page.getByLabel('Studio zone', { exact: true }).selectOption('hardware');
    await page.getByLabel('Pin this project', { exact: true }).check();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByText('Saved to the project store.', { exact: true }).waitFor();
    await page.locator('.repo-list').getByRole('button', { name: /sample-web-app/ }).click();
    await page.locator('.repo-list').getByRole('button', { name: /sample-firmware/ }).click();
    await page.waitForFunction(() => document.querySelector('#project-notes').value === 'Integration test note' && document.querySelector('#project-zone').value === 'hardware');
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'Integration test note');
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), 'hardware');
    assert.equal(await page.getByLabel('Pin this project', { exact: true }).isChecked(), true);
  });
  await check('Workstation scope uses saved assignments and selection preserves unsaved drafts', async () => {
    await navigate(page, 1);
    await page.getByLabel('Notes', { exact: true }).fill('A draft to preserve');
    await page.locator('.repo-list').getByRole('button', { name: /sample-web-app/ }).click();
    await page.getByLabel('Notes', { exact: true }).fill('A separate draft');
    await page.locator('.repo-list').getByRole('button', { name: /sample-firmware/ }).click();
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'A draft to preserve');
    await page.getByRole('button', { name: 'This workstation 1', exact: true }).click();
    assert.equal(await page.locator('.repo-list .repo-row').count(), 1);
    await navigate(page, 3);
    await page.getByText('No projects assigned here yet.', { exact: false }).waitFor();
    assert.equal(await page.locator('.repo-list .repo-row').count(), 0);
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'A draft to preserve');
    await page.getByRole('button', { name: 'Assign to AI / LLM Lab', exact: true }).click();
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), 'ai-lab');
    assert.equal(await page.locator('.repo-list .repo-row').count(), 0); // No implicit write.
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByText('Saved to the project store.', { exact: true }).waitFor();
    assert.equal(await page.locator('.repo-list .repo-row').count(), 1);
    await page.getByRole('button', { name: 'All projects', exact: true }).click();
    await page.locator('.repo-list').getByRole('button', { name: /sample-web-app/ }).click();
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'A separate draft');
    await page.locator('.repo-list').getByRole('button', { name: /sample-firmware/ }).click();
    await navigate(page, 0);
    await page.getByRole('button', { name: 'Project inspector', exact: true }).click();
    await page.getByRole('button', { name: 'Visit AI / LLM Lab', exact: true }).click();
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.zone === 'ai-lab' && window.__AURA_DIAGNOSTICS__.cameraSettled);
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
  await check('Minimum-window workstation heading has an opaque backing and accessible controls', async () => {
    await navigate(page, 1);
    assert.equal(await page.locator('.viewport-heading').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(248, 249, 246)');
    if (process.env.AURA_AXE_MODULE) {
      const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      await writeFile(path.join(artifacts, 'accessibility-1100.json'), JSON.stringify(scan, null, 2));
      assert.deepEqual(scan.violations.map((v) => v.id), []);
    }
    await page.screenshot({ path: path.join(artifacts, 'hardware-1100.png') });
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
    await broken.getByRole('button', { name: 'Project inspector', exact: true }).click();
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
    await unavailable.getByRole('button', { name: 'Project inspector', exact: true }).click();
    await unavailable.getByRole('heading', { name: 'Workstation inspector', exact: true }).waitFor();
    assert.equal(await unavailable.evaluate(() => window.__AURA_DIAGNOSTICS__.status), 'error');
    await unavailable.getByRole('button',{name:'World map',exact:false}).click();
    await unavailable.locator('article[data-room=atrium]').getByRole('button',{name:'Visit',exact:true}).click();
    await unavailable.waitForFunction(()=>document.querySelector('.experience').dataset.room==='atrium');
    await unavailable.getByRole('heading',{name:'Central Atrium',exact:true}).waitFor();
    await unavailable.close();
  });

  // Native transport simulation only: this does not substitute for WKWebView testing.
  const native = await browser.newPage({ viewport: { width: 1100, height: 700 }, reducedMotion: 'reduce' });
  observe(native);
  await native.addInitScript((mockModule) => {
    let pending;
    const ready = () => pending ??= import(mockModule).then((mod) => {
      const transport = mod.createMockTransport();
      transport.onEvent((json) => { const message = JSON.parse(json); if (message.payload?.seq) window.__testSeq = message.payload.seq; window.__AURA_BRIDGE__?.dispatch(json); });
      window.__testHost = transport;
      return transport;
    });
    window.webkit = { messageHandlers: { aura: { postMessage: async (json) => {
      const request = JSON.parse(json);
      if (request.method.startsWith('voice.')) return JSON.stringify({ kind: 'response', v: 1, id: request.id, ok: false, error: { code: 'unavailable', message: 'Phase 3', retryable: false } });
      const reply = await (await ready()).send(json);
      if (request.method === 'ai.sendMessage') window.__testStreamId = JSON.parse(reply).result?.streamId;
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
    assert.equal(await native.getByRole('button', { name: /Talk with Astra|Start listening/ }).count(), 0);
    await native.getByText('Voice unavailable', { exact: true }).waitFor();
    assert.equal(await native.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
  });
  await check('AI start failures and streamed errors show recoverable companion state', async () => {
    await native.evaluate(() => window.__testHost.failNext('ai.sendMessage', { code: 'unavailable', message: 'Intentional test failure', retryable: true }));
    await native.getByLabel('Message Astra').fill('Error handling check');
    await native.getByRole('button', { name: 'Send message', exact: true }).click();
    await native.getByText('The service is unavailable or not configured. Review provider settings.', { exact: true }).waitFor();
    await native.getByLabel('Message Astra').fill('Keep streaming '.repeat(40));
    await native.getByRole('button', { name: 'Send message', exact: true }).click();
    await native.waitForFunction(() => window.__testStreamId);
    await native.evaluate(() => window.__testHost.emit('ai.error', { streamId: window.__testStreamId, seq: (window.__testSeq ?? 0) + 1, error: { code: 'internal', message: 'Intentional stream failure', retryable: true } }));
    await native.getByText('The action could not be completed. Please try again.', { exact: true }).waitFor();
    assert.ok(await native.locator('.companion-pill').evaluate((pill) => pill.classList.contains('error')));
  });
  await native.close();
  assert.deepEqual(errors, []); assert.equal(external.size, 0);
  outcomes.push({ name: 'No uncaught browser errors or external runtime requests', status: 'passed' });
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ outcomes, errors, external: [...external], nativeValidation: 'Simulated transport only; AuraApp not run on Linux.' }, null, 2));
  console.log(`${outcomes.filter((item) => item.status === 'passed').length} integration checks passed; ${outcomes.filter((item) => item.status === 'skipped').length} skipped. Artifacts: ${artifacts}`);
} catch (error) {
  for (const context of browser.contexts()) for (const debugPage of context.pages()) { try { console.log(JSON.stringify(await debugPage.evaluate(() => ({ previous: window.__previousCameraTest, camera: window.__AURA_DIAGNOSTICS__?.camera, zone: window.__AURA_DIAGNOSTICS__?.zone, layout: document.querySelector('.experience')?.dataset.layout })))); } catch {} }
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ outcomes, errors, external: [...external], failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
