// Phases 0–2 only: design snapshots/interaction previews, not native voice acceptance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const base = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-voice-design';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
  args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const checks = [], scans = [], errors = [], networkErrors = [], external = new Set();
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) networkErrors.push(`${r.status()} ${r.url()}`); });
page.on('request', r => { const url = new URL(r.url()); if (/^https?:$/.test(url.protocol) && url.origin !== new URL(base).origin) external.add(url.origin); });
await page.addInitScript(() => {
  window.__voiceCaptureCalls = 0;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__voiceCaptureCalls++; throw new Error('Design must not capture audio'); };
});
async function check(name, run) { await run(); checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
async function state(value) { await page.getByRole('combobox', { name: 'Voice design state' }).selectOption(value); }
async function layout(value) { await page.getByRole('button', { name: `${value} layout`, exact: true }).click(); }
async function axe(name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile(path.join(artifacts, `axe-${name}.json`), JSON.stringify(result, null, 2));
  assert.deepEqual(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  scans.push({ name, violations: 0 });
}
async function shot(name) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas && Math.abs(canvas.width / canvas.clientWidth - canvas.height / canvas.clientHeight) < 0.015;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(artifacts, `${name}.png`) });
}
try {
  await page.goto(`${base}/voice-design.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__AURA_DIAGNOSTICS__?.status === 'loaded' && window.__AURA_DIAGNOSTICS__.cameraSettled, {}, { timeout: 60000 });
  await page.evaluate(async () => {
    const { bridge } = await import('/src/platform/bridge.ts');
    window.__voiceDesignCalls = [];
    const call = bridge.call.bind(bridge);
    bridge.call = (...args) => { window.__voiceDesignCalls.push(args[0]); return call(...args); };
    document.querySelector('canvas').dataset.designIdentity = 'original';
  });
  await check('Original avatar and attribution are visible in a clearly labelled design study', async () => {
    const d = await page.evaluate(() => window.__AURA_DIAGNOSTICS__);
    assert.equal(d.bones, 72); assert.equal(d.morphTargets, 0); assert.equal(d.heightMeters, 1.75); assert.equal(d.playingClip, 'Idle02_F');
    assert.ok(await page.getByText('Design prototype', { exact: true }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'CC BY 4.0', exact: true }).isVisible());
    await shot('idle-1440'); await axe('idle');
  });
  await check('All 17 design states have distinct text and no fake microphone activation', async () => {
    const select = page.getByRole('combobox', { name: 'Voice design state' });
    const values = await select.locator('option').evaluateAll(items => items.map(item => item.value));
    assert.equal(values.length, 17);
    const titles = new Set();
    for (const value of values) { await state(value); titles.add(await page.locator('.vd-rail-top strong').textContent()); }
    assert.equal(titles.size, 17); assert.equal(await page.evaluate(() => window.__voiceCaptureCalls), 0);
  });
  await check('Talk, Finish and Cancel preview different actions while preserving a typed draft', async () => {
    await state('idle'); await page.getByRole('textbox', { name: 'Message Astra design draft' }).fill('Design draft');
    await page.getByRole('button', { name: 'Talk with Astra', exact: true }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'listening');
    await shot('listening-1440'); await axe('listening');
    await page.getByRole('button', { name: 'Finish listening', exact: true }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'recognizing');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Message Astra design draft' }).inputValue(), 'Design draft');
  });
  await check('Push-to-talk previews one hold/release and Escape discards without submitting', async () => {
    await state('idle'); await page.keyboard.down('Alt'); await page.keyboard.down('Space');
    assert.ok(await page.getByText('Release ⌥Space to finish · Esc to cancel', { exact: true }).isVisible());
    await page.keyboard.up('Space'); await page.keyboard.up('Alt');
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'recognizing');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'idle');
  });
  await check('Final transcript fixture requires explicit draft replacement and send remains a preview', async () => {
    await state('review'); await page.getByRole('button', { name: 'Use transcript in draft' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Message Astra design draft' }).inputValue(), 'Design draft');
    await page.getByRole('textbox', { name: 'Message Astra design draft' }).fill('');
    await page.getByRole('button', { name: 'Use transcript in draft' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Message Astra design draft' }).inputValue(), 'Show me the open pull requests');
    await page.getByRole('button', { name: 'Preview send action' }).click();
    assert.ok(await page.getByText('Draft retained. Production sending is implemented after the model checkpoint.').isVisible());
  });
  await check('Output state uses fixture captions and offers stop/mute without mutating preferences', async () => {
    await state('speaking'); assert.ok(await page.getByText('Here are the open pull requests.', { exact: true }).isVisible());
    await shot('speaking-1440'); await axe('speaking');
    await page.getByRole('button', { name: 'Mute speech', exact: true }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'idle');
    await page.getByRole('button', { name: 'Unmute speech', exact: true }).click();
    await state('thinking'); await page.getByRole('button', { name: 'Stop speaking', exact: true }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'idle');
  });
  await check('Permission dialog has safe focus and does not start capture after a grant preview', async () => {
    await state('needs_permission'); await page.getByRole('button', { name: 'Talk with Astra', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Not now');
    await shot('permission-1440'); await axe('permission');
    // A Space press on the focused Not now button correctly activates it; move
    // focus to the dialog when testing that the voice shortcut is suppressed.
    await page.getByRole('dialog').focus();
    await page.keyboard.down('Alt'); await page.keyboard.press('Space'); await page.keyboard.up('Alt');
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'needs_permission');
    await page.getByRole('button', { name: 'Preview access granted' }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'idle');
  });
  await check('Recovery states and native-unavailable gate show honest controls', async () => {
    for (const [value, action] of [['denied', 'Microphone settings'], ['no_device', 'Choose microphone'], ['model_missing', 'Download speech model']]) {
      await state(value); assert.equal(await page.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
      await page.getByRole('button', { name: action, exact: true }).click();
      assert.ok(await page.locator('.vd-notice').isVisible()); await axe(value);
    }
    await state('error'); await shot('no-audio-1440'); await axe('error');
    await state('bluetooth'); assert.ok(await page.getByRole('button', { name: 'Choose microphone' }).isVisible());
    await state('unavailable'); assert.equal(await page.getByRole('button', { name: 'Talk with Astra', exact: true }).count(), 0);
    await state('restricted'); assert.equal(await page.locator('.vd-recovery button').count(), 0);
  });
  await check('Settings are keyboard operable, labelled as fixtures, and restore trigger focus', async () => {
    await state('idle'); await page.getByRole('button', { name: 'Voice settings preview' }).click();
    await page.getByRole('slider', { name: 'Speech rate' }).focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('slider', { name: 'Speech rate' }).inputValue(), '1.1');
    await shot('settings-1440'); await axe('settings');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Voice settings preview');
  });
  await check('All layouts fit four desktop window sizes and retain a single original canvas', async () => {
    await state('listening');
    for (const [width, height] of [[1100, 700], [1280, 800], [1440, 900], [1728, 1117]]) {
      await page.setViewportSize({ width, height });
      for (const size of ['compact', 'expanded', 'focus']) {
        await layout(size);
        const bounds = await page.evaluate(() => {
          const draft = document.querySelector('.vd-draft').getBoundingClientRect();
          const credit = document.querySelector('.vd-credit').getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth > innerWidth, draft: { right: draft.right, bottom: draft.bottom }, credit: credit.bottom, width: innerWidth, height: innerHeight };
        });
        assert.equal(bounds.overflow, false); assert.ok(bounds.draft.right <= bounds.width); assert.ok(bounds.draft.bottom <= bounds.height); assert.ok(bounds.credit <= bounds.height + 1);
        assert.equal(await page.locator('canvas').count(), 1); assert.equal(await page.locator('canvas').getAttribute('data-design-identity'), 'original');
        if (width === 1100 || width === 1440) await shot(`${size}-${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 }); await layout('expanded');
  });
  await check('Reduced motion uses static levels and no active decorative animations', async () => {
    await state('listening');
    assert.equal(await page.locator('.vd-level').getAttribute('data-fixed'), 'true');
    assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('.vd-level')?.getAttribute('data-fixed') === 'false');
    assert.equal(await page.locator('.vd-level').getAttribute('data-fixed'), 'false');
    assert.ok(await page.getByText('Input · fixture level sample', { exact: true }).isVisible());
    await shot('level-sample-1440'); await page.emulateMedia({ reducedMotion: 'reduce' });
  });
  await check('End voice preserves draft and clears preview state', async () => {
    const draft = await page.getByRole('textbox', { name: 'Message Astra design draft' }).inputValue();
    await page.getByRole('button', { name: 'End voice', exact: true }).click();
    assert.equal(await page.locator('.vd-voice-rail').getAttribute('data-state'), 'idle');
    assert.equal(await page.getByRole('textbox', { name: 'Message Astra design draft' }).inputValue(), draft);
  });
  await check('Prototype performs no voice/AI/preference mutation and loads no external resources', async () => {
    const calls = await page.evaluate(() => window.__voiceDesignCalls);
    assert.deepEqual(calls.filter(call => /^(voice\.|ai\.|prefs\.update)/.test(call)), []);
    assert.equal(await page.evaluate(() => window.__voiceCaptureCalls), 0);
    assert.deepEqual(errors, []); assert.deepEqual(networkErrors, []); assert.deepEqual([...external], []);
  });
} catch (error) {
  checks.push({ status: 'failed', error: String(error) }); console.error(error); process.exitCode = 1;
  await shot('failure').catch(() => {});
} finally {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'design prototype only; no native hardware acceptance', checks, scans, errors, networkErrors, external: [...external], diagnostics: await page.evaluate(() => window.__AURA_DIAGNOSTICS__).catch(() => null) }, null, 2));
  await browser.close();
}
