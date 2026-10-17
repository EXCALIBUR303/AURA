// Phase 3C-C Phases 1–2: design prototype checks, not native AI integration tests.
// Same external Playwright/axe setup as the existing studio browser suite.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const baseURL = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-astra-design';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
  args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
});
const outcomes = [], errors = [], failures = [], external = new Set();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
page.on('request', (request) => {
  const url = new URL(request.url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(baseURL).origin) external.add(url.origin);
});
async function check(name, action) {
  await action(); outcomes.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
async function view(name) {
  const control = page.getByRole('combobox', { name: 'Design scenario', exact: true });
  await control.focus(); await control.selectOption(name);
}
async function settled() {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return window.__AURA_DIAGNOSTICS__?.status === 'loaded' && window.__AURA_DIAGNOSTICS__.cameraSettled && canvas &&
      Math.abs(canvas.width / canvas.clientWidth - canvas.height / canvas.clientHeight) < 0.015;
  }, {}, { timeout: 60000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function shot(name) { await settled(); await page.screenshot({ path: path.join(artifacts, `${name}.png`) }); }
async function axe(name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile(path.join(artifacts, `axe-${name}.json`), JSON.stringify(result, null, 2));
  assert.deepEqual(result.violations.map((value) => ({ id: value.id, targets: value.nodes.map((node) => node.target) })), []);
}
try {
  await page.goto(`${baseURL}/astra-design.html`, { waitUntil: 'domcontentloaded' });
  await settled();
  await page.evaluate(async () => {
    window.__designCalls = [];
    const { bridge } = await import('/src/platform/bridge.ts');
    const call = bridge.call.bind(bridge);
    bridge.call = (...args) => { window.__designCalls.push(args[0]); return call(...args); };
    document.querySelector('canvas').dataset.testIdentity = 'original-canvas';
  });
  await check('Original avatar and visible attribution load in the isolated design page', async () => {
    const d = await page.evaluate(() => window.__AURA_DIAGNOSTICS__);
    assert.equal(d.bones, 72); assert.equal(d.playingClip, 'Idle02_F'); assert.equal(d.heightMeters, 1.75);
    assert.ok(await page.getByRole('link', { name: 'CC BY 4.0', exact: true }).isVisible());
    assert.ok(await page.getByText('Prototype only · no AI requests', { exact: true }).isVisible());
    await shot('compact-1440');
  });
  await check('Compact, expanded and focus layouts preserve the draft and one canvas', async () => {
    const draft = page.getByRole('textbox', { name: 'Message Astra design draft' });
    await draft.fill('Keep this draft through a layout change.');
    await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
    assert.equal(await draft.inputValue(), 'Keep this draft through a layout change.');
    await shot('expanded-1440');
    await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
    assert.equal(await draft.inputValue(), 'Keep this draft through a layout change.');
    await shot('focus-1440');
    await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
    assert.equal(await draft.inputValue(), 'Keep this draft through a layout change.');
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.locator('canvas').getAttribute('data-test-identity'), 'original-canvas');
  });
  await check('Preview send retains the draft and explicitly avoids sending a message', async () => {
    await page.getByRole('button', { name: 'Preview send action', exact: true }).click();
    assert.ok(await page.getByText('Draft retained. Sending to Astra begins in the Phase 3 implementation.', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Focus layout keeps controls within all four desktop window sizes', async () => {
    await view('focus');
    for (const [width, height] of [[1100, 700], [1280, 800], [1440, 900], [1728, 1117]]) {
      await page.setViewportSize({ width, height }); await settled();
      const bounds = await page.evaluate(() => {
        const scene = document.querySelector('.d-scene').getBoundingClientRect();
        const pane = document.querySelector('.d-conversation').getBoundingClientRect();
        const composer = document.querySelector('.d-composer').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, sceneRight: scene.right, paneLeft: pane.left, paneRight: pane.right, composerBottom: composer.bottom, height: innerHeight };
      });
      assert.equal(bounds.overflow, false); assert.ok(Math.abs(bounds.sceneRight - bounds.paneLeft) < 1);
      assert.ok(bounds.paneRight <= width + 1); assert.ok(bounds.composerBottom < bounds.height - 60);
      await shot(`focus-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('Code example wraps and copies the exact visible source', async () => {
    await page.getByRole('button', { name: 'Wrap', exact: true }).click();
    assert.equal(await page.locator('.d-code pre').evaluate((node) => getComputedStyle(node).whiteSpace), 'pre-wrap');
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('.d-code code').textContent());
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
    await shot('code-focus-1440');
  });
  await check('Context dialog loads actual mock paths and applies an explicit preview selection', async () => {
    await view('context');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('README.md', { exact: true }).check();
    await shot('context-1440');
    await axe('context');
    await dialog.getByRole('button', { name: 'Apply preview' }).click();
    assert.ok(await page.locator('.d-pane-composer .d-context-button').textContent().then((text) => text.includes('1 file')));
    assert.ok(await page.getByText('Context selection previewed. No data sent.', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Consent starts on Deny, contains keyboard focus, and Escape previews denial', async () => {
    await view('approval');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Deny');
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement?.closest('dialog'))); }
    await shot('approval-1440'); await axe('approval');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.ok(await page.getByText('Deny choice previewed. No approval was sent.', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Design scenario');
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Allow once remains a labelled preview and never reports native approval', async () => {
    await view('compact'); await view('approval');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    assert.ok(await page.getByText('Allow once choice previewed. No approval was sent.', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Provider study uses mock registry data and has no key field or service writes', async () => {
    await view('providers');
    await shot('providers-1440'); await axe('providers');
    await page.getByRole('button', { name: /Add an OpenAI-compatible provider/ }).click();
    await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Local preview');
    await page.getByRole('textbox', { name: 'Endpoint', exact: true }).fill('http://127.0.0.1:11434/v1');
    await page.getByRole('textbox', { name: 'Model', exact: true }).fill('design-specimen');
    await page.getByRole('button', { name: 'Preview configuration' }).click();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.ok(await page.getByText('Form preview complete. Nothing was saved or checked.', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Tool disclosure and recovery states have working local actions', async () => {
    await view('tools'); await page.locator('.d-tool summary').click();
    assert.ok(await page.locator('.d-tool-detail').isVisible()); await shot('tools-1440');
    await view('error'); await page.locator('.d-transcript').evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await shot('error-1440');
    await page.getByRole('button', { name: 'Preview recovery', exact: true }).click();
    assert.ok(await page.getByRole('button', { name: 'Help me understand this project', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Dismiss notice' }).click(); await shot('empty-1440');
  });
  await check('Projects at 1100×700 expose complete cards, filters, and a context action', async () => {
    await page.setViewportSize({ width: 1100, height: 700 }); await view('projects');
    const cards = page.locator('.d-project-card'); assert.equal(await cards.count(), 3);
    const main = await page.locator('.d-project-main').boundingBox();
    for (const card of await cards.all()) { const box = await card.boundingBox(); assert.ok(box.y >= main.y && box.y + box.height <= main.y + main.height); }
    assert.equal(await page.locator('.d-compact-dock').count(), 0);
    await shot('projects-1100'); await axe('projects');
    await page.getByRole('textbox', { name: 'Search sample repositories' }).fill('firmware');
    assert.equal(await cards.count(), 1); await cards.first().click();
    assert.ok((await page.locator('.d-project-chip').textContent()).includes('sample-web-app'));
    await page.locator('.d-inline-project-context').getByRole('button', { name: 'Use in conversation' }).click();
    assert.ok((await page.locator('.d-project-chip').textContent()).includes('sample-firmware'));
    await page.getByRole('button', { name: 'Dismiss notice' }).click();
  });
  await check('Keyboard resizing is bounded and reduced motion follows the system', async () => {
    await view('expanded');
    const separator = page.getByRole('separator');
    await separator.focus(); await page.keyboard.press('End');
    assert.equal(await separator.getAttribute('aria-valuenow'), '500');
    await page.keyboard.press('Home'); assert.equal(await separator.getAttribute('aria-valuenow'), '440');
    assert.equal(await page.locator('.d-app').getAttribute('data-reduced-motion'), 'true');
    await axe('expanded');
  });
  await check('The prototype has no AI, credential, consent, or GitHub mutation calls', async () => {
    const calls = await page.evaluate(() => window.__designCalls);
    assert.ok(calls.includes('github.listFiles'));
    const allowed = new Set(['github.listRepositories', 'github.listFiles', 'ai.listProviders', 'prefs.get', 'app.getWindowState']);
    assert.deepEqual(calls.filter((method) => !allowed.has(method)), []);
    assert.deepEqual([...external], []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  });
} finally {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Design prototype only; browser mock and software GPU when configured', outcomes, errors, failures, external: [...external] }, null, 2));
  await browser.close();
}
