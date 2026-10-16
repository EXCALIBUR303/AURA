// GitHub UI against the typed native transport boundary, backed only by the
// existing shared mock. This is NOT live GitHub or WKWebView validation.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-phase3b-audit';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
  args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const outcomes = [], errors = [], external = new Set();
const fixtures = JSON.parse(await readFile(new URL('../../shared/fixtures/bridge-messages.json', import.meta.url), 'utf8'));
const branchFixture = fixtures.valid.find((entry) => entry.name === 'response ok github.listBranches').message.result;
async function check(name, fn) { await fn(); outcomes.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) && u.hostname !== new URL(baseURL).hostname) external.add(u.href); });
  await page.addInitScript(({ mockModule, options }) => {
    let pending, forced = null;
    const calls = [], gates = new Map();
    const ready = () => pending ??= import(mockModule).then(async (module) => {
      const host = module.createMockTransport({ githubApprovalMs: 5000 });
      host.onEvent((json) => window.__AURA_BRIDGE__?.dispatch(json));
      if (options.disconnected) await host.send(JSON.stringify({ kind: 'request', v: 1, id: 'initial-disconnect', method: 'github.disconnect', params: {} }));
      window.__githubTest = {
        calls, failNext: (method, error) => host.failNext(method, error),
        setAuth: (auth) => { forced = auth; host.emit('github.authChanged', auth); },
        clearAuthOverride: () => { forced = null; },
        gate: (method) => { let release; const promise = new Promise((resolve) => { release = resolve; }); gates.set(method, { promise, release }); },
        release: (method) => { const gate = gates.get(method); gates.delete(method); gate?.release(); },
      };
      if (options.holdStatus) window.__githubTest.gate('github.getAuthStatus');
      if (options.holdCommits) window.__githubTest.gate('github.listCommits');
      return host;
    });
    window.webkit = { messageHandlers: { aura: { postMessage: async (json) => {
      const host = await ready(), request = JSON.parse(json);
      calls.push({ method: request.method, params: request.params });
      let result;
      if (request.method === 'app.getWindowState') result = { kind: 'response', v: 1, id: request.id, ok: true, result: { active: false, visible: false } };
      else if (forced && ['github.getAuthStatus', 'github.refresh'].includes(request.method)) result = { kind: 'response', v: 1, id: request.id, ok: true, result: forced };
      else {
        if (['github.connect', 'github.disconnect'].includes(request.method)) forced = null;
        if (options.paging && ['github.listRepositories', 'github.listBranches'].includes(request.method)) request.params.perPage = 1;
        result = JSON.parse(await host.send(JSON.stringify(request)));
        if (options.branchPages && request.method === 'github.listBranches') result.result = request.params.cursor ? { items: [], nextCursor: null } : options.branchFixture;
        if (options.emptyCommits && request.method === 'github.listCommits') result.result = [];
        if (options.empty && request.method === 'github.listRepositories') result.result = { items: [], nextCursor: null };
        if (options.noInstallations && request.method === 'github.getAuthStatus') result.result.installations = [];
      }
      const gate = gates.get(request.method); if (gate) await gate.promise;
      return JSON.stringify(result);
    } } } };
  }, { mockModule: `/@fs${path.resolve(import.meta.dirname, '../../shared/bridge/mock.ts')}`, options: { ...options, branchFixture } });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Projects 5', exact: true }).click();
  await page.waitForFunction(() => window.__githubTest);
  return page;
}
async function axe(page, name) {
  if (!process.env.AURA_AXE_MODULE) return;
  const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile(path.join(artifacts, `accessibility-${name}.json`), JSON.stringify(scan, null, 2));
  assert.deepEqual(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(';')}`), []);
}
async function auth(page, value) { await page.evaluate((value) => window.__githubTest.setAuth(value), value); }
const inspectFirmware = (page) => page.getByRole('button', { name: 'Inspect mock-user/sample-firmware', exact: true });
try {
  const page = await open({ disconnected: true });
  await check('Disconnected native status never fetches GitHub data or fakes sign-in', async () => {
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
    assert.equal(await page.locator('.repository-card').count(), 0);
    assert.equal(await page.evaluate(() => window.__githubTest.calls.filter((c) => ['github.listRepositories', 'github.getRepository', 'github.listCommits'].includes(c.method)).length), 0);
    await axe(page, 'disconnected'); await page.screenshot({ path: path.join(artifacts, 'mock-native-disconnected.png') });
  });
  await check('Device flow shows copyable code, safe authorization link, countdown, and waiting state', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await page.getByLabel('Authorization code MOCK-0000', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open GitHub authorization', exact: true }).getAttribute('href'), 'https://github.invalid/login/device');
    await page.getByRole('button', { name: 'Copy code', exact: true }).click();
    await page.getByText('Code copied.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'MOCK-0000');
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('Mock clipboard refusal', 'NotAllowedError')); });
    await page.getByRole('button', { name: 'Copy code', exact: true }).click();
    await page.getByText('Select the code and copy it manually.', { exact: true }).waitFor();
    await axe(page, 'authorizing'); await page.screenshot({ path: path.join(artifacts, 'mock-native-authorizing.png') });
    await inspectFirmware(page).waitFor();
  });
  await check('Connected account, read-only installation and real bridge repository metadata render', async () => {
    await page.locator('.installation-details summary').click();
    await page.getByText('Read-only', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Change repository access', exact: true }).waitFor();
    assert.equal(await page.locator('.repository-card').count(), 3);
    await page.getByText('Mock commit 1 in sample-firmware', { exact: true }).waitFor();
    await page.getByText('100.0%', { exact: true }).waitFor();
    await axe(page, 'connected'); await page.screenshot({ path: path.join(artifacts, 'mock-native-connected.png') });
  });
  await check('Repository search, language filter, activity/name/update sorts use source data', async () => {
    await page.getByLabel('Search repositories', { exact: true }).fill('embedded'); assert.equal(await page.locator('.repository-card').count(), 1);
    await page.getByLabel('Search repositories', { exact: true }).fill('nothing-matches'); await page.getByRole('heading', { name: 'No matching repositories' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByLabel('Primary language', { exact: true }).selectOption('Python'); assert.equal(await page.locator('.repository-card').count(), 1);
    await page.getByLabel('Primary language', { exact: true }).selectOption('');
    await page.getByLabel('Sort repositories', { exact: true }).selectOption('name');
    assert.deepEqual(await page.locator('.repository-select strong').allTextContents(), ['sample-firmware', 'sample-llm-eval', 'sample-web-app']);
    await page.getByLabel('Sort repositories', { exact: true }).selectOption('updated');
    await page.waitForFunction(() => [...document.querySelectorAll('.repository-card-meta')].every((node) => !node.textContent.includes('Not available')));
    await page.getByLabel('Sort repositories', { exact: true }).selectOption('activity');
  });
  await check('Suggestions require acceptance, persist through projects.update, and select the matching workstation', async () => {
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: 'Accept suggested workspace', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.aura-app').dataset.zone === 'hardware');
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), 'hardware');
    assert.equal(await page.locator('.repo-row.active strong').innerText(), 'sample-firmware');
    await page.getByRole('button', { name: /sample-web-app/ }).click();
    await page.getByRole('button', { name: 'Dismiss suggestion', exact: true }).click();
    assert.equal(await page.getByLabel('Studio zone', { exact: true }).inputValue(), '');
    assert.equal(await page.locator('.zone-suggestion').count(), 0);
    await page.getByLabel('Studio zone', { exact: true }).selectOption('software'); await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByText('Saved to the project store.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Software 3', exact: true }).click();
    assert.equal(await page.locator('.repo-row.active strong').innerText(), 'sample-web-app');
    await page.getByRole('button', { name: 'Hardware 2', exact: true }).click();
    assert.equal(await page.locator('.repo-row.active strong').innerText(), 'sample-firmware');
    await page.getByRole('button', { name: 'Projects 5', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect mock-user/sample-web-app', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.aura-app').dataset.zone === 'software');
    assert.equal(await page.locator('.repo-row.active strong').innerText(), 'sample-web-app');
  });
  await check('Connection rate limit keeps loaded repositories and suppresses new data calls', async () => {
    await page.getByRole('button', { name: 'Projects 5', exact: true }).click();
    const connected = { state: 'rate_limited', account: { login: 'mock-user', name: 'Mock User', htmlUrl: 'https://github.invalid/mock-user' }, installations: [], resetAt: new Date(Date.now() + 60000).toISOString() };
    await auth(page, connected); await page.getByText('GitHub limit reached; resumes at', { exact: false }).waitFor();
    assert.equal(await page.locator('.repository-card').count(), 3);
    assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(), true);
    const before = await page.evaluate(() => window.__githubTest.calls.filter((c) => c.method.startsWith('github.list') || c.method === 'github.getRepository').length);
    await inspectFirmware(page).click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__githubTest.calls.filter((c) => c.method.startsWith('github.list') || c.method === 'github.getRepository').length), before);
    await page.getByRole('button', { name: 'Projects 5', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'mock-native-rate-limited.png') }); await axe(page, 'rate-limited');
    const calls = await page.evaluate(() => window.__githubTest.calls.filter((c) => c.method === 'github.listRepositories').length);
    await page.evaluate(() => window.__githubTest.clearAuthOverride());
    await auth(page, { state: 'connected', account: connected.account, installations: [] });
    await page.waitForFunction((before) => window.__githubTest.calls.filter((c) => c.method === 'github.listRepositories').length > before, calls);
    await page.waitForFunction(() => !document.querySelector('.refresh-repositories').disabled);
  });
  await check('API errors preserve useful UI and refresh retries through github.refresh', async () => {
    await page.evaluate(() => window.__githubTest.failNext('github.listRepositories', { code: 'network', message: 'test network failure', retryable: true }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'GitHub could not be reached.' }).waitFor();
    await page.getByRole('button', { name: 'Retry GitHub data', exact: true }).click();
    await inspectFirmware(page).waitFor();
    await page.waitForFunction(() => !document.querySelector('.github-feedback'));
  });
  await check('Expired and revoked sessions clear repository data and offer reconnection', async () => {
    await auth(page, { state: 'expired', login: 'mock-user', reason: 'revoked' });
    await page.getByRole('heading', { name: 'GitHub access was revoked', exact: true }).waitFor();
    assert.equal(await page.locator('.repository-card').count(), 0); assert.equal(await page.locator('.repo-row').count(), 0);
    await page.getByRole('button', { name: 'Reconnect GitHub', exact: true }).waitFor();
    await auth(page, { state: 'expired', login: 'mock-user', reason: 'expired' });
    await page.getByRole('heading', { name: 'GitHub session expired', exact: true }).waitFor();
  });
  await check('Denied, code-expired, offline and configuration states show appropriate recovery', async () => {
    for (const [reason, title, retryable] of [['denied', 'Authorization was declined', true], ['code_expired', 'Authorization code expired', true], ['network', 'GitHub connection interrupted', true], ['configuration', 'GitHub sign-in is misconfigured', false]]) {
      await auth(page, { state: 'error', reason, message: 'Mock diagnostic message', retryable });
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Retry GitHub connection', exact: true }).count(), retryable ? 1 : 0);
    }
    await page.screenshot({ path: path.join(artifacts, 'mock-native-configuration.png') });
  });
  await page.close();

  const paging = await open({ paging: true });
  await check('Repository pagination appends distinct existing mock records; selection and branch requests are typed', async () => {
    await inspectFirmware(paging).waitFor(); assert.equal(await paging.locator('.repository-card').count(), 1);
    await paging.getByRole('button', { name: 'Load more repositories', exact: true }).click();
    await paging.waitForFunction(() => document.querySelectorAll('.repository-card').length === 2);
    await paging.getByRole('button', { name: 'Load more repositories', exact: true }).click();
    await paging.waitForFunction(() => document.querySelectorAll('.repository-card').length === 3);
    assert.equal(await paging.getByRole('button', { name: 'Load more repositories', exact: true }).count(), 0);
    await paging.getByRole('button', { name: 'Inspect mock-user/sample-llm-eval', exact: true }).click();
    await paging.getByText('Mock commit 1 in sample-llm-eval', { exact: true }).waitFor();
    assert.ok(await paging.evaluate(() => window.__githubTest.calls.some((c) => c.method === 'github.listCommits' && c.params.fullName === 'mock-user/sample-llm-eval' && c.params.branch === 'main')));
  });
  await check('Refresh loading state, keyboard focus, and minimum-window layout remain usable', async () => {
    await paging.evaluate(() => window.__githubTest.gate('github.listRepositories'));
    await paging.getByRole('button', { name: 'Refresh', exact: true }).click();
    await paging.getByText('Loading repositories…', { exact: true }).first().waitFor();
    await paging.screenshot({ path: path.join(artifacts, 'mock-native-loading.png') });
    await paging.evaluate(() => window.__githubTest.release('github.listRepositories'));
    await inspectFirmware(paging).waitFor();
    await paging.setViewportSize({ width: 1100, height: 700 });
    await paging.getByLabel('Search repositories', { exact: true }).focus(); await paging.keyboard.press('Tab');
    assert.ok(await paging.evaluate(() => document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    assert.ok(await paging.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await axe(paging, '1100'); await paging.screenshot({ path: path.join(artifacts, 'mock-native-1100.png') });
  });
  await check('Disconnect confirmation can be cancelled and confirmed with keyboard; late data cannot return', async () => {
    await paging.getByRole('button', { name: 'Disconnect GitHub', exact: true }).click();
    const dialog = paging.getByRole('dialog', { name: 'Disconnect GitHub from AURA?', exact: true }); await dialog.waitFor();
    assert.ok(await paging.getByRole('button', { name: 'Keep connected', exact: true }).evaluate((el) => el === document.activeElement));
    await paging.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); await inspectFirmware(paging).waitFor();
    await paging.evaluate(() => window.__githubTest.gate('github.listRepositories'));
    await paging.getByRole('button', { name: 'Refresh', exact: true }).click();
    await paging.getByText('Loading repositories…', { exact: true }).first().waitFor();
    await paging.getByRole('button', { name: 'Disconnect GitHub', exact: true }).click(); await axe(paging, 'disconnect-dialog');
    await paging.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await paging.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
    await paging.evaluate(() => window.__githubTest.release('github.listRepositories'));
    await paging.waitForTimeout(300); assert.equal(await paging.locator('.repository-card').count(), 0); assert.equal(await paging.locator('.repo-row').count(), 0);
  });
  await paging.close();
  for (const noInstallations of [false, true]) {
    const empty = await open({ empty: true, noInstallations });
    await check(`Empty repositories explain ${noInstallations ? 'missing installation' : 'repository access'}`, async () => {
      await empty.getByRole('heading', { name: noInstallations ? 'Install AURA Developer Companion on GitHub' : 'No repositories are shared with AURA', exact: true }).waitFor();
      await empty.screenshot({ path: path.join(artifacts, `mock-native-empty-${noInstallations}.png`) });
      assert.equal(await empty.locator('.repository-card').count(), 0);
    }); await empty.close();
  }
  for (const code of ['not_found', 'permission_denied']) {
    const denied = await open();
    await check(`Repository ${code} stays local to access feedback and can be retried`, async () => {
      await inspectFirmware(denied).waitFor();
      await denied.getByText('Mock commit 1 in sample-firmware', { exact: true }).waitFor();
      await denied.evaluate((code) => window.__githubTest.failNext('github.getRepository', { code, message: 'Mock access failure', retryable: false }), code);
      await denied.getByRole('button', { name: 'Refresh', exact: true }).click();
      await denied.locator('.repository-detail .inline-error').filter({ hasText: 'AURA can’t access this repository.' }).waitFor();
      assert.equal(await denied.locator('.repository-card').count(), 3);
      await denied.locator('.repository-detail').getByRole('link', { name: 'Change repository access', exact: true }).waitFor();
      if (code === 'permission_denied') await denied.screenshot({ path: path.join(artifacts, 'mock-native-api-error.png') });
      await denied.getByRole('button', { name: 'Retry repository details', exact: true }).click();
      await denied.waitForFunction(() => !document.querySelector('.repository-detail .inline-error'));
      assert.equal(await denied.locator('.github-feedback').count(), 0);
    }); await denied.close();
  }
  for (const code of ['rate_limited', 'not_authenticated']) {
    const failed = await open();
    await check(`Bridge ${code} pauses requests until explicit recovery`, async () => {
      await inspectFirmware(failed).waitFor();
      await failed.getByText('Mock commit 1 in sample-firmware', { exact: true }).waitFor();
      await failed.evaluate((code) => window.__githubTest.failNext('github.listRepositories', { code, message: 'Mock API refusal', retryable: true }), code);
      await failed.getByRole('button', { name: 'Refresh', exact: true }).click();
      await failed.getByRole('alert').filter({ hasText: code === 'rate_limited' ? 'GitHub limit reached.' : 'Sign in to GitHub to continue.' }).waitFor();
      const before = await failed.evaluate(() => window.__githubTest.calls.filter((c) => c.method === 'github.listRepositories').length);
      await failed.waitForTimeout(400);
      assert.equal(await failed.evaluate(() => window.__githubTest.calls.filter((c) => c.method === 'github.listRepositories').length), before);
      assert.equal(await failed.locator('.repository-card').count(), code === 'rate_limited' ? 3 : 0);
      if (code === 'not_authenticated') await failed.getByRole('button', { name: 'Reconnect GitHub', exact: true }).waitFor();
      else {
        await failed.getByRole('button', { name: 'Retry GitHub data', exact: true }).click();
        await failed.waitForFunction(() => !document.querySelector('.github-feedback'));
      }
    }); await failed.close();
  }
  const branches = await open({ branchPages: true, emptyCommits: true });
  await check('Branch pagination follows the canonical cursor only on demand; empty history stays useful', async () => {
    await inspectFirmware(branches).waitFor();
    await branches.getByText('Protected branch', { exact: true }).waitFor();
    await branches.getByText('No commits available on this branch.', { exact: true }).waitFor();
    assert.ok(await branches.evaluate(() => window.__githubTest.calls.filter((c) => c.method === 'github.listBranches').every((c) => !c.params.cursor))); // StrictMode may replay the initial effect; no next page is automatic.
    await branches.getByRole('button', { name: 'Load more branches', exact: true }).click();
    await branches.waitForFunction(() => window.__githubTest.calls.some((c) => c.method === 'github.listBranches' && c.params.cursor === 'page:3'));
    await branches.getByRole('button', { name: 'Load more branches', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await branches.getByLabel('Commit branch', { exact: true }).inputValue(), 'main');
  }); await branches.close();
  const stale = await open({ holdCommits: true });
  await check('Delayed commits never overwrite the newly selected repository', async () => {
    await inspectFirmware(stale).waitFor();
    await stale.getByRole('button', { name: 'Inspect mock-user/sample-web-app', exact: true }).click();
    await stale.waitForFunction(() => window.__githubTest.calls.some((c) => c.method === 'github.listCommits' && c.params.fullName === 'mock-user/sample-web-app'));
    await stale.evaluate(() => window.__githubTest.release('github.listCommits'));
    await stale.getByText('Mock commit 1 in sample-web-app', { exact: true }).waitFor();
    assert.equal(await stale.getByText('Mock commit 1 in sample-firmware', { exact: true }).count(), 0);
  }); await stale.close();
  const cancelAuth = await open({ disconnected: true });
  await check('Pending device authorization can be cancelled without a connected state', async () => {
    await cancelAuth.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await cancelAuth.getByLabel('Authorization code MOCK-0000', { exact: true }).waitFor();
    assert.ok(await cancelAuth.getByLabel('Authorization code MOCK-0000', { exact: true }).evaluate((el) => el === document.activeElement));
    await cancelAuth.getByRole('button', { name: 'Cancel authorization', exact: true }).click();
    await cancelAuth.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
    assert.equal(await cancelAuth.locator('.repository-card').count(), 0);
  }); await cancelAuth.close();
  const race = await open({ holdStatus: true });
  await check('Newer native auth events win over delayed launch-restore replies', async () => {
    await auth(race, { state: 'disconnected' });
    await race.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
    await race.evaluate(() => window.__githubTest.release('github.getAuthStatus'));
    await race.waitForTimeout(300); assert.equal(await race.locator('.repository-card').count(), 0);
    await race.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
  }); await race.close();
  assert.deepEqual(errors, []); assert.equal(external.size, 0);
  outcomes.push({ name: 'No uncaught errors or external runtime requests', status: 'passed' });
  await writeFile(path.join(artifacts, 'github-results.json'), JSON.stringify({ outcomes, errors, external: [...external], nativeValidation: 'Simulated typed native transport using shared mock records only; real AURA.app not run in Linux.' }, null, 2));
  console.log(`${outcomes.length} GitHub UI checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
    const debug = await page.evaluate(() => ({ connection: document.querySelector('.github-connection')?.textContent, calls: window.__githubTest?.calls.slice(-40) })).catch(() => null);
    await writeFile(path.join(artifacts, 'failure-debug.json'), JSON.stringify(debug, null, 2));
  }
  await writeFile(path.join(artifacts, 'github-results.json'), JSON.stringify({ outcomes, errors, external: [...external], failure: String(error) }, null, 2)); throw error;
} finally { await browser.close(); }
