// Phase 7 spatial journeys: every room-to-room transition in both directions, Hub station moves,
// arrival/journey UI, doorway prompts, cancellation mid-walk. Shared browser mock; no voice, no native claims.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const base = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173', artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-journeys';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined, args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const results = [], errors = [], external = [], transitions = [];
const check = async (name, fn) => { if (process.env.AURA_TEST_FILTER && !new RegExp(process.env.AURA_TEST_FILTER, 'i').test(name)) return; await fn(); results.push(name); console.log('PASS ' + name); };
async function open(reducedMotion = 'no-preference') {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion })).newPage(); page.setDefaultTimeout(40000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(base).origin) external.push(r.url()); });
  await page.goto(base); await settled(page, 'project-hub'); return page;
}
const diag = (page) => page.evaluate(() => window.__AURA_DIAGNOSTICS__);
const settled = (page, room) => page.waitForFunction((room) => { const d = window.__AURA_DIAGNOSTICS__; return (!room || d?.world?.room === room) && d?.world?.phase === 'idle' && d.cameraSettled; }, room, { timeout: 45000 });
async function chooseRoom(page, room) { await page.getByRole('button', { name: 'World map', exact: false }).click(); await page.locator(`article[data-room="${room}"]`).getByRole('button', { name: 'Visit', exact: true }).click(); }
async function travel(page, room) {
  await page.evaluate(() => { const log = window.__j = { veil: 0, loaded: 0, bar: false }; const step = () => { const v = Number(document.querySelector('.travel-veil')?.style.opacity || 0); log.veil = Math.max(log.veil, v); log.loaded = Math.max(log.loaded, window.__AURA_DIAGNOSTICS__?.world?.loadedRooms?.length ?? 0); log.bar ||= !!document.querySelector('.journey-bar'); if (!log.done) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  await chooseRoom(page, room); await settled(page, room);
  const log = await page.evaluate(() => { window.__j.done = true; return window.__j; }); const d = await diag(page);
  return { ...log, travel: d.travel, loadedAfter: d.world.loadedRooms };
}
const ADJ = new Set(['project-hub|atrium', 'atrium|project-hub', 'atrium|living', 'living|atrium', 'atrium|gaming', 'gaming|atrium']);
try {
  const page = await open();
  await check('All twelve room transitions walk through real doorways without a veil, in both directions', async () => {
    const order = ['living', 'gaming', 'project-hub', 'gaming', 'living', 'project-hub', 'atrium', 'living', 'atrium', 'gaming', 'atrium', 'project-hub'];
    let from = 'project-hub';
    for (const to of order) {
      const r = await travel(page, to); transitions.push({ from, to, ...r });
      const kind = ADJ.has(`${from}|${to}`) ? 'route' : 'journey';
      assert.equal(r.travel.kind, kind, `${from}→${to}`); assert.equal(r.travel.outcome, 'arrived');
      assert.equal(r.veil, 0, `${from}→${to}: veiled`); assert.ok(r.bar, `${from}→${to}: no journey bar`);
      assert.ok(r.loaded <= (kind === 'journey' ? 3 : 2), `${from}→${to}: ${r.loaded} rooms`); assert.ok(r.loadedAfter.length <= 2 && r.loadedAfter.includes(to));
      if (kind === 'journey') assert.ok(r.travel.plannedMs >= 2200 && r.travel.plannedMs <= 3200);
      from = to;
    }
  });
  await check('Arriving in a different room shows a short establishing title that clears itself', async () => {
    await page.evaluate(() => { const log = window.__titles = []; const step = () => { const t = document.querySelector('.arrival-title')?.textContent ?? ''; const d = window.__AURA_DIAGNOSTICS__.world; if (log.at(-1)?.[0] !== t + d.room + d.phase) log.push([t + d.room + d.phase]); if (log.length < 400 && !window.__titlesDone) requestAnimationFrame(step); }; requestAnimationFrame(step); });
    await chooseRoom(page, 'living'); await settled(page, 'living'); await page.waitForTimeout(300);
    const seen = await page.evaluate(() => { window.__titlesDone = true; return window.__titles.map((x) => x[0]); });
    assert.ok(seen.some((x) => x.includes('Personal Living Space')), JSON.stringify(seen));
    const title = page.locator('.arrival-title');
    await title.waitFor({ state: 'detached', timeout: 5000 });
  });
  await check('Hub station moves stay inside the Hub, name the station and keep Astra centred on return', async () => {
    await chooseRoom(page, 'project-hub'); await settled(page, 'project-hub');
    const nav = page.getByRole('navigation', { name: 'Studio zones', exact: true });
    await nav.getByRole('button', { name: 'AI Lab 4', exact: true }).click();
    await page.locator('.journey-bar').filter({ hasText: 'Within Project Hub' }).filter({ hasText: 'AI / LLM Lab' }).waitFor({ timeout: 5000 });
    await settled(page, 'project-hub'); assert.equal((await diag(page)).travel.kind, 'route');
    await nav.getByRole('button', { name: 'Studio 1', exact: true }).click(); await settled(page, 'project-hub');
    const cam = (await diag(page)).camera; assert.deepEqual(cam.target.map((v) => +v.toFixed(2)), [0, 1.08, -12.5]);
  });
  await check('Escape in the middle of a journey stops in a safe room with at most two rooms loaded', async () => {
    await chooseRoom(page, 'gaming'); await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__.world.phase === 'travelling');
    await page.waitForTimeout(1300); await page.keyboard.press('Escape'); await settled(page);
    const d = await diag(page); assert.ok(d.world.loadedRooms.length <= 2 && d.world.loadedRooms.includes(d.world.room), String(d.world.loadedRooms));
    assert.equal(await page.locator('.journey-bar').count(), 0);
  });
  await check('In Free Explore, standing at a doorway names where it leads', async () => {
    await chooseRoom(page, 'atrium'); await settled(page, 'atrium');
    await page.getByRole('button', { name: 'Free Explore', exact: true }).click(); await page.locator('canvas').focus();
    await page.keyboard.down('KeyW'); let prompt = '';
    for (let i = 0; i < 40 && !prompt; i++) { await page.waitForTimeout(100); prompt = await page.locator('.explore-hint strong').innerText().catch(() => ''); }
    await page.keyboard.up('KeyW');
    assert.match(prompt, /Project Hub/, 'the north doorway leads to the Project Hub');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); assert.deepEqual(r.violations.map((v) => v.id), []);
    await page.keyboard.press('Escape'); await settled(page);
  });
  await check('Reduced motion: room changes cut directly, with no journey bar left behind', async () => {
    const p = await open('reduce'); const r = await travel(p, 'gaming');
    assert.equal(r.travel.kind, 'cut'); assert.equal(r.veil, 0); assert.ok(r.loadedAfter.length <= 2);
    await p.context().close();
  });
  await check('no page errors or external runtime requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(external, []); });
  console.log(`${results.length} journey checks passed.`);
} finally { await writeFile(path.join(artifacts, 'transitions.json'), JSON.stringify(transitions, null, 2)); await browser.close(); }
