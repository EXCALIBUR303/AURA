// Phase 5 cinematic navigation. Shared browser mock; motion enabled unless stated. No voice/audio, no native claims.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const base = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173', artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-navigation';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined, args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const results = [], errors = [], external = [], scans = [], travels = [];
const check = async (name, fn) => { if (process.env.AURA_TEST_FILTER && !new RegExp(process.env.AURA_TEST_FILTER, 'i').test(name)) return; await fn(); results.push({ name, status: 'passed' }); console.log('PASS ' + name); };
async function open(reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await context.newPage(); page.setDefaultTimeout(40000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(base).origin) external.push(r.url()); });
  await page.goto(base); await settled(page, 'project-hub'); await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.status === 'loaded');
  return page;
}
const diag = (page) => page.evaluate(() => window.__AURA_DIAGNOSTICS__);
const settled = (page, room) => page.waitForFunction((room) => { const d = window.__AURA_DIAGNOSTICS__; return d?.world?.room === room && d.world.phase === 'idle' && d.cameraSettled; }, room, { timeout: 45000 });
async function chooseRoom(page, room) { await page.getByRole('button', { name: 'World map', exact: false }).click(); await page.locator(`article[data-room="${room}"]`).getByRole('button', { name: 'Visit', exact: true }).click(); }
/** Records veil opacity, loaded rooms and wall-clock from the click to camera settlement. */
async function recordTravel(page, start, room) {
  await page.evaluate(() => { const log = window.__travelLog = { veil: [], loaded: [], t0: performance.now() }; const step = () => { const v = document.querySelector('.travel-veil'); log.veil.push(Number(v?.style.opacity || 0)); log.loaded.push(window.__AURA_DIAGNOSTICS__?.world?.loadedRooms?.length ?? 0); if (!log.done) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  await start(); await settled(page, room);
  return page.evaluate(() => { const log = window.__travelLog; log.done = true; return { ms: performance.now() - log.t0, maxVeil: Math.max(...log.veil), lastVeil: log.veil.at(-1), maxLoaded: Math.max(...log.loaded), travel: window.__AURA_DIAGNOSTICS__.travel }; });
}
async function pose(page) { return (await diag(page)).camera; }
async function scan(page, name) { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); await writeFile(path.join(artifacts, `axe-${name}.json`), JSON.stringify(r, null, 2)); assert.deepEqual(r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), []); scans.push(name); }

try {
  const page = await open();
  await check('Hub to Gaming crosses unconnected rooms behind a veil and arrives framed in about 1.4 s', async () => {
    const r = await recordTravel(page, () => chooseRoom(page, 'gaming'), 'gaming'); travels.push({ to: 'gaming', ...r });
    assert.equal(r.travel.kind, 'bridge'); assert.equal(r.travel.outcome, 'arrived'); assert.ok(r.maxVeil >= 0.95, `veil ${r.maxVeil}`); assert.equal(r.lastVeil, 0);
    assert.ok(r.maxLoaded <= 2); assert.deepEqual((await diag(page)).world.loadedRooms, ['gaming'], 'the departed Hub is released on arrival');
    // Wall-clock includes the first (cold) asset load; the cinematic itself is bounded.
    assert.equal(r.travel.plannedMs, 1350); assert.ok(r.travel.elapsedMs >= 1350 && r.travel.elapsedMs < 1700, `${r.travel.elapsedMs} ms`);
  });
  await check('Gaming to Atrium walks the real passage without a veil and lands on the room framing', async () => {
    const r = await recordTravel(page, () => chooseRoom(page, 'atrium'), 'atrium'); travels.push({ to: 'atrium', ...r });
    assert.equal(r.travel.kind, 'route'); assert.equal(r.maxVeil, 0); assert.ok(r.travel.plannedMs >= 900 && r.travel.plannedMs <= 1900);
    const camera = await pose(page); assert.deepEqual(camera.target.map((v) => +v.toFixed(2)), [0, 1.5, -0.9]);
  });
  await check('Skip and Enter finish travel at the arrival framing; nothing is left half-veiled', async () => {
    await chooseRoom(page, 'living');
    await page.getByRole('button', { name: 'Skip', exact: true }).click({ timeout: 10000 });
    await settled(page, 'living'); let d = await diag(page);
    assert.equal(d.travel.outcome, 'skipped'); assert.ok(d.travel.elapsedMs < d.travel.plannedMs);
    assert.equal(await page.locator('.travel-veil').evaluate((v) => Number(v.style.opacity || 0)), 0);
    await chooseRoom(page, 'gaming'); await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.world.phase === 'travelling');
    await page.locator('canvas').focus(); await page.keyboard.press('Enter');
    await settled(page, 'gaming'); d = await diag(page); assert.equal(d.travel.outcome, 'skipped');
  });
  await check('Escape cancels mid-transition into a safe, idle, usable room', async () => {
    await chooseRoom(page, 'project-hub'); await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.world.phase === 'travelling');
    await page.waitForTimeout(250); await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.world.phase === 'idle' && window.__AURA_DIAGNOSTICS__.cameraSettled);
    const d = await diag(page); assert.ok(d.world.loadedRooms.length >= 1 && d.world.loadedRooms.length <= 2); assert.ok(d.world.loadedRooms.includes(d.world.room));
    assert.equal(await page.locator('.travel-veil').evaluate((v) => Number(v.style.opacity || 0)), 0);
    assert.ok(await page.getByRole('button', { name: 'Free Explore', exact: true }).isEnabled());
  });
  await check('Rapid repeated destinations settle once on the last choice with at most two rooms', async () => {
    const before = (await diag(page)).world.room; const order = ['living', 'gaming', 'atrium'].filter((r) => r !== before);
    for (const room of order) { await chooseRoom(page, room); await page.waitForTimeout(120); }
    await settled(page, order.at(-1)); const d = await diag(page);
    assert.ok(d.world.loadedRooms.length <= 2); assert.equal(await page.locator('canvas').count(), 1);
  });
  await check('Explore look sensitivity scales drag-to-look and is offered in World settings', async () => {
    await chooseRoom(page, 'project-hub').catch(() => {}); await settled(page, 'project-hub');
    const turnFor = async (value) => {
      await page.getByRole('button', { name: 'World settings', exact: true }).click();
      await page.getByLabel('Look sensitivity', { exact: true }).fill(String(value));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Free Explore', exact: true }).click();
      const a = await pose(page); await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(820, 450, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
      const b = await pose(page); await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.world.mode === 'inspect');
      const yaw = (c) => Math.atan2(c.target[0] - c.position[0], c.target[2] - c.position[2]);
      let d = yaw(b) - yaw(a); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d);
    };
    const slow = await turnFor(0.5), fast = await turnFor(2);
    assert.ok(fast > slow * 2.5, `slow ${slow} fast ${fast}`);
    await page.getByRole('button', { name: 'World settings', exact: true }).click(); await scan(page, 'world-settings'); await page.keyboard.press('Escape');
  });
  await check('Selecting a Living object frames it and closing returns the exact previous view', async () => {
    await chooseRoom(page, 'living'); await settled(page, 'living'); const before = await pose(page);
    await page.getByRole('button', { name: 'Room controls', exact: true }).click();
    await page.getByRole('button', { name: 'AURA / Spatial Notes', exact: true }).click(); await settled(page, 'living');
    const focused = await pose(page); assert.deepEqual(focused.target.map((v) => +v.toFixed(2)), [-15, 1.15, -0.8]);
    await page.getByRole('button', { name: 'Media display', exact: true }).click(); await settled(page, 'living');
    await page.getByRole('button', { name: 'Close room controls', exact: true }).click(); await settled(page, 'living');
    const after = await pose(page);
    assert.deepEqual(after.position.map((v) => +v.toFixed(3)), before.position.map((v) => +v.toFixed(3)));
    assert.deepEqual(after.target.map((v) => +v.toFixed(3)), before.target.map((v) => +v.toFixed(3)));
    assert.ok(await page.getByRole('button', { name: 'Room controls', exact: true }).evaluate((n) => n === document.activeElement));
  });
  await page.screenshot({ path: path.join(artifacts, 'living-1440.png') });
  await page.context().close();

  const reduced = await open('reduce');
  await check('System reduced motion cuts directly without camera travel or veil', async () => {
    const r = await recordTravel(reduced, () => chooseRoom(reduced, 'gaming'), 'gaming');
    assert.equal(r.travel.kind, 'cut'); assert.equal(r.maxVeil, 0);
  });
  await reduced.context().close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ results, travels, scans }, null, 2));
  console.log(`${results.length} navigation checks, ${scans.length} axe scans; no page errors or external requests.`);
} finally { await browser.close(); }
