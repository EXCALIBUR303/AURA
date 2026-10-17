// Native-shaped bridge backed by the existing mock. No live AI/GitHub/keychain claims.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const baseURL = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-astra-integration';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined, args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const outcomes = [], errors = [], external = new Set();
async function check(name, run) { try { await run(); outcomes.push({ name, status: 'passed' }); console.log(`PASS ${name}`); } catch (error) { outcomes.push({ name, status: 'failed', error: String(error) }); throw error; } }
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(baseURL).origin) external.add(url.origin); });
  await page.addInitScript(({ mockModule, options }) => {
    let ready, counter = 0;
    const calls = []; let dropped = false, lostSend = false;
    const request = (host, method, params) => host.send(JSON.stringify({ kind: 'request', v: 1, id: `fixture-${++counter}`, method, params })).then(JSON.parse);
    const hostReady = () => ready ??= import(mockModule).then(async ({ createMockTransport }) => {
      const host = createMockTransport({ streamIntervalMs: options.interval ?? 20 });
      host.onEvent((json) => { const event = JSON.parse(json); if (options.seedApproval && event.event === 'ai.approvalRequested') return; if (options.dropFirstChunk && event.event === 'ai.chunk' && !dropped) { dropped = true; return; } if (options.shortApproval && event.event === 'ai.approvalRequested') event.payload.approval.expiresInSeconds = 1; window.__AURA_BRIDGE__?.dispatch(JSON.stringify(event)); });
      if (options.cloud) {
        await request(host, 'ai.saveProvider', { id: 'mock-cloud', displayName: 'Mock compatible cloud', api: 'openai_compatible', baseUrl: 'https://ai.invalid/v1', models: ['mock-model'], defaultModel: 'mock-model' });
        await request(host, 'ai.requestCredential', { providerId: 'mock-cloud' });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await request(host, 'prefs.update', { ai: { defaultProviderId: 'mock-cloud', privateRepositoryContext: 'all' } });
      }
      if (options.seed || options.seedApproval) {
        const conversation = (await request(host, 'ai.startConversation', options.seedApproval ? { repository: { fullName: 'mock-user/sample-firmware', branch: 'main' } } : {})).result;
        await request(host, 'ai.sendMessage', { conversationId: conversation.conversationId, text: 'Existing host conversation' });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      window.__astraTest = { calls, fail: (method, code) => host.failNext(method, { code, message: 'Test service failure', retryable: true }), emit: (event, payload) => host.emit(event, payload), request: (method, params) => request(host, method, params) };
      return host;
    });
    window.webkit = { messageHandlers: { aura: { postMessage: async (json) => {
      const host = await hostReady(), req = JSON.parse(json); calls.push({ method: req.method, params: req.params });
      if (req.method === 'app.getWindowState') return JSON.stringify({ kind: 'response', v: 1, id: req.id, ok: true, result: { active: false, visible: false } });
      const result = JSON.parse(await host.send(json));
      if (options.noProviders && req.method === 'ai.listProviders') result.result = [];
      if (options.loseSendReply && !lostSend && req.method === 'ai.sendMessage') { lostSend = true; return JSON.stringify({ kind: 'response', v: 1, id: req.id, ok: false, error: { code: 'timeout', message: 'Lost send reply fixture', retryable: true } }); }
      if (options.delaySend && req.method === 'ai.sendMessage') await new Promise((resolve) => setTimeout(resolve, options.delaySend));
      return JSON.stringify(result);
    } } } };
  }, { mockModule: `/@fs${path.resolve(import.meta.dirname, '../../shared/bridge/mock.ts')}`, options });
  await page.goto(baseURL); await page.getByRole('button', { name: 'Expand conversation', exact: true }).click();
  await page.waitForFunction(() => window.__astraTest);
  await page.locator('.conversation-loading').waitFor({ state: 'hidden' });
  return page;
}
async function send(page, text) { await page.getByLabel('Message Astra', { exact: true }).fill(text); await page.getByRole('button', { name: 'Send message', exact: true }).click(); }
async function idle(page) { await page.getByRole('button', { name: 'Send message', exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('.conversation-heading button[aria-label="New conversation"]').disabled); }
async function axe(page, name) { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); await writeFile(path.join(artifacts, `axe-${name}.json`), JSON.stringify(result, null, 2)); assert.deepEqual(result.violations.map((entry) => ({ id: entry.id, targets: entry.nodes.map((node) => node.target) })), []); }
async function chooseRepository(page, fullName) {
  await page.locator('.conversation-context button').click();
  await page.getByRole('combobox', { name: 'Conversation repository', exact: true }).selectOption(fullName);
  await page.getByRole('combobox', { name: 'Conversation branch', exact: true }).selectOption('main');
  await page.getByRole('button', { name: 'Use this repository and branch', exact: true }).click();
  await page.getByRole('button', { name: 'Apply context', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('dialog button.primary').disabled);
}
try {
  const page = await open({ delaySend: 180, interval: 10 });
  await check('Empty conversation is useful, accessible, and truthful about unavailable voice', async () => {
    await page.getByText('Start with the work', { exact: false }).waitFor();
    assert.ok(await page.getByText('Text conversation · Voice unavailable', { exact: true }).isVisible());
    assert.equal(await page.getByRole('button', { name: /start listening|talk with astra|microphone/i }).count(), 0);
    await axe(page, 'empty'); await page.screenshot({ path: path.join(artifacts, 'empty.png') });
  });
  await check('Events preceding the send reply are retained through the existing reply folder', async () => {
    await send(page, 'A response that starts before the bridge send reply resolves.'); await idle(page);
    const text = await page.locator('.assistant-markdown').innerText();
    assert.equal(text, '[mock] You said: A response that starts before the bridge send reply resolves.');
    assert.equal(await page.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.sendMessage').length), 1);
  });
  await check('Stop during the send handshake cancels the eventual stream once', async () => {
    await send(page, 'Keep this long enough to cancel '.repeat(25));
    await page.getByRole('button', { name: 'Stop reply', exact: true }).click(); await idle(page);
    const before = await page.locator('.assistant-markdown').allTextContents();
    await page.waitForTimeout(300); assert.deepEqual(await page.locator('.assistant-markdown').allTextContents(), before);
    assert.ok(await page.getByText('Reply stopped by the host. Partial text is preserved.', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.cancel').length), 1);
  });
  await check('Typed send failures preserve the draft and offer recovery', async () => {
    await page.evaluate(() => window.__astraTest.fail('ai.sendMessage', 'network'));
    await send(page, 'Keep this unsent draft');
    await page.getByText('The service could not be reached. Check the connection and try again.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Message Astra', { exact: true }).inputValue(), 'Keep this unsent draft');
    await page.getByRole('button', { name: 'Refresh conversation', exact: true }).click();
  });
  await check('Public repository binding, branch, explicit files, and preview use only native identifiers', async () => {
    await chooseRepository(page, 'mock-user/sample-web-app');
    await page.getByLabel('Repository metadata', { exact: true }).check();
    await page.getByLabel('README', { exact: true }).check();
    await page.getByLabel('src/index.ts', { exact: true }).check();
    await page.getByLabel('Start line', { exact: true }).fill('2'); await page.getByLabel('End line', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Preview context', exact: true }).click();
    await page.getByRole('heading', { name: 'Exact outgoing context preview', exact: true }).waitFor();
    assert.ok((await page.locator('.context-preview').innerText()).includes('export function main'));
    await axe(page, 'context'); await page.screenshot({ path: path.join(artifacts, 'context.png') });
    await page.getByRole('button', { name: 'Apply context', exact: true }).click();
    await send(page, 'Explain the explicitly selected file.'); await idle(page);
    const params = await page.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.sendMessage').at(-1).params);
    assert.equal('repository' in params.context, false); assert.deepEqual(params.context.files, [{ path: 'src/index.ts', startLine: 2, endLine: 3 }]);
    assert.equal(params.context.include.repository, true);
    assert.ok(await page.getByText('[mock] Read README.md.', { exact: false }).count() > 0);
  });
  await check('Real mock tool results are expandable and source references are preserved', async () => {
    const tool = page.locator('.tool-card').last(); await tool.locator('summary').click();
    assert.ok((await tool.innerText()).includes('README.md'));
    assert.ok((await tool.innerText()).includes('0000000000000000000000000000000000000000'));
    await page.screenshot({ path: path.join(artifacts, 'tool-activity.png') });
  });
  await check('Markdown renders safe code, supports wrap/copy, and makes no remote asset request', async () => {
    const text = 'Markdown safety\n\n```ts\nexport const value: string = "mock";\n```\n\n![Remote image](https://image.invalid/probe.png)\n<script>window.__unsafe = true</script>\n[Unsafe](javascript:alert(1))';
    await send(page, text); await idle(page);
    const block = page.locator('.code-block').last(); assert.ok((await block.locator('code').innerText()).includes('export const value'));
    await block.getByRole('button', { name: 'Wrap', exact: true }).click(); assert.equal(await block.locator('pre').evaluate((node) => getComputedStyle(node).whiteSpace), 'pre-wrap');
    assert.equal(await page.locator('.assistant-markdown img').count(), 0); assert.equal(await page.locator('.assistant-markdown a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__unsafe), undefined);
    await axe(page, 'conversation'); await page.screenshot({ path: path.join(artifacts, 'markdown.png') });
  });
  await check('New conversations isolate history and session restoration uses the host', async () => {
    const old = await page.evaluate(() => window.__astraTest.calls.find((call) => call.method === 'ai.startConversation'));
    assert.ok(old);
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await page.getByText('Start with the work', { exact: false }).waitFor();
    assert.equal(await page.locator('.conversation-turn').count(), 0);
    await page.getByRole('button', { name: 'Conversation history this session', exact: true }).click();
    await page.locator('.session-list button').first().click();
    await page.getByText('A response that starts before the bridge send reply resolves.', { exact: true }).waitFor();
  });
  await check('Provider settings save non-secret configuration and validate through the bridge', async () => {
    await page.locator('.composer-help').getByRole('button', { name: 'Provider settings', exact: true }).click();
    await page.getByRole('button', { name: /Add an OpenAI-compatible provider/ }).click();
    await page.getByLabel('Provider ID', { exact: false }).fill('local-check'); await page.getByLabel('Display name', { exact: true }).fill('Local check');
    await page.getByLabel('Endpoint', { exact: false }).fill('http://127.0.0.1:11434/v1'); await page.getByLabel('Model identifiers', { exact: false }).fill('mock-model');
    await page.getByRole('button', { name: 'Save provider', exact: true }).click();
    const card = page.locator('.provider-card').filter({ hasText: 'Local check' }); await card.getByRole('button', { name: 'Check connection', exact: true }).click();
    await card.getByText('Model-list check passed', { exact: true }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0); await axe(page, 'providers'); await page.screenshot({ path: path.join(artifacts, 'providers.png') });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  });
  await check('Long host histories are bounded and earlier messages are loaded explicitly', async () => {
    await page.evaluate(async () => {
      const request = window.__astraTest.request;
      const info = (await request('ai.startConversation', {})).result;
      for (let index = 1; index <= 12; index++) {
        const text = index === 12 ? 'History turn 12\n\n```ts\n' + Array.from({ length: 80 }, (_, line) => `//line${line}`).join('\n') + '\n```' : `History turn ${index}`;
        await request('ai.sendMessage', { conversationId: info.conversationId, text });
        while ((await request('ai.getConversation', { conversationId: info.conversationId })).result.conversation.activeStreamId) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    await page.getByRole('button', { name: 'Conversation history this session', exact: true }).click();
    await page.locator('.session-list button').filter({ hasText: '12 turns' }).click();
    await page.getByRole('button', { name: 'Show earlier messages · 4 remaining', exact: true }).waitFor();
    assert.equal(await page.locator('.conversation-turn').count(), 8);
    await page.getByRole('button', { name: 'Show earlier messages · 4 remaining', exact: true }).click();
    assert.equal(await page.locator('.conversation-turn').count(), 12);
  });
  await check('Reading older text suspends autoscroll while a real mock reply streams', async () => {
    await send(page, 'Response for scrolling '.repeat(60));
    await page.waitForFunction(() => document.querySelector('.conversation-turn:last-child .assistant-markdown')?.textContent.length > 30);
    await page.locator('.conversation-transcript').evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
    const length = await page.locator('.conversation-turn:last-child .assistant-markdown').evaluate((node) => node.textContent.length);
    await page.waitForFunction((length) => document.querySelector('.conversation-turn:last-child .assistant-markdown')?.textContent.length > length + 40, length);
    assert.ok(await page.locator('.conversation-transcript').evaluate((node) => node.scrollTop < 50));
    await page.getByRole('button', { name: 'Jump to latest', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'streaming.png') });
    await idle(page); await page.getByRole('button', { name: 'Jump to latest', exact: true }).click();
    await page.waitForFunction(() => { const node = document.querySelector('.conversation-transcript'); return node.scrollHeight - node.clientHeight - node.scrollTop < 5; });
  });
  await check('Drafts, focus layout, resizing, and keyboard command navigation remain usable', async () => {
    await page.getByLabel('Message Astra', { exact: true }).fill('Keep this layout draft');
    await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
    await send(page, 'Stay in focus while replying'); await idle(page);
    assert.equal(await page.locator('.experience').getAttribute('data-layout'), 'focus');
    assert.equal(await page.locator('.experience').getAttribute('data-zone'), 'companion');
    await page.getByLabel('Message Astra', { exact: true }).fill('Keep this layout draft');
    for (const [width, height] of [[1100,700],[1280,800],[1440,900],[1728,1117]]) {
      await page.setViewportSize({ width, height });
      const bounds = await page.locator('.conversation-composer').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height - 27);
      assert.equal(await page.getByLabel('Message Astra', { exact: true }).inputValue(), 'Keep this layout draft');
    }
    await page.setViewportSize({ width:1100, height:700 }); await axe(page, 'focus-1100');
    const heading = page.locator('.viewport-heading');
    assert.equal(await heading.locator('.eyebrow').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await heading.locator('p').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.ok(await heading.locator('h1').isVisible());
    assert.ok((await heading.boundingBox()).height <= 100, 'narrow focus heading must clear Astra’s head');
    await page.screenshot({ path: path.join(artifacts, 'focus-1100.png') });
    await page.getByRole('button', { name: 'Open command menu', exact: true }).click();
    await page.getByLabel('Find a command', { exact: true }).fill('provider'); await page.keyboard.press('Tab'); await page.keyboard.press('End');
    assert.ok(await page.getByRole('button', { name: 'AI provider settings', exact: true }).last().evaluate((node) => node === document.activeElement));
    await page.keyboard.press('Escape');
  });
  await check('Compact dock stays inside the room with and without the project inspector', async () => {
    await page.getByRole('button', { name: 'Collapse conversation', exact: true }).click();
    for (const [width, height] of [[1100,700],[1280,800],[1440,900],[1728,1117]]) {
      await page.setViewportSize({ width, height });
      for (const inspector of [false, true]) {
        if (inspector) await page.getByRole('button', { name: 'Project inspector', exact: true }).click();
        const dock = await page.locator('.companion-workspace').boundingBox();
        const room = await page.locator('.viewport').boundingBox();
        assert.ok(dock.x >= room.x && dock.x + dock.width <= room.x + room.width + 1);
        assert.ok(dock.y >= room.y && dock.y + dock.height <= room.y + room.height);
        assert.ok(Math.abs(dock.x + dock.width / 2 - room.x - room.width / 2) <= 1);
        await page.getByLabel('Message Astra', { exact: true }).click();
        assert.equal(await page.getByLabel('Message Astra', { exact: true }).inputValue(), 'Keep this layout draft');
        if (inspector) await page.getByRole('button', { name: 'Hide inspector', exact: true }).click();
      }
    }
    await page.screenshot({ path: path.join(artifacts, 'compact.png') });
  });
  await page.context().close();

  const consent = await open({ cloud: true });
  await chooseRepository(consent, 'mock-user/sample-firmware'); await consent.getByRole('button', { name: 'Apply context', exact: true }).click();
  await check('Private cloud source waits on a host-issued consent with safe initial focus', async () => {
    await send(consent, 'Read the selected repository README.');
    await consent.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor();
    assert.equal(await consent.evaluate(() => document.activeElement?.textContent), 'Deny');
    assert.ok((await consent.locator('.consent-facts').innerText()).includes('Mock compatible cloud'));
    await axe(consent, 'consent'); await consent.screenshot({ path: path.join(artifacts, 'consent.png') });
    await consent.getByRole('button', { name: 'Allow once', exact: true }).click(); await idle(consent);
    assert.ok((await consent.locator('.tool-card').innerText()).includes('Completed'));
    assert.equal(await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').at(-1).params.decision), 'allow_once');
  });
  await check('Allow once does not grant later source requests and Escape submits Deny', async () => {
    await send(consent, 'Read README again.'); await consent.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor();
    await consent.keyboard.press('Escape'); await idle(consent);
    assert.equal(await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').at(-1).params.decision), 'deny');
    assert.ok((await consent.locator('.tool-card').last().innerText()).includes('Denied'));
  });
  await check('Conversation-scoped approval is confirmed natively and reused only within that conversation', async () => {
    await send(consent, 'Read README with conversation approval.'); await consent.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor();
    await consent.getByRole('button', { name: 'Allow for this conversation', exact: true }).click(); await idle(consent);
    const before = await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').length);
    await send(consent, 'Read README using the existing host grant.'); await idle(consent);
    assert.equal(await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').length), before);
    assert.equal(await consent.getByRole('dialog').count(), 0);
  });
  await check('Changing repository clears native grants and frontend file selection', async () => {
    await chooseRepository(consent, 'mock-user/sample-web-app'); await consent.getByRole('button', { name: 'Apply context', exact: true }).click();
    await chooseRepository(consent, 'mock-user/sample-firmware'); await consent.getByRole('button', { name: 'Apply context', exact: true }).click();
    await send(consent, 'Read README after switching back.'); await consent.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor();
    await consent.getByRole('button', { name: 'Deny', exact: true }).click(); await idle(consent);
  });
  await check('Stop inside consent cancels the reply without submitting an approval', async () => {
    const before = await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').length);
    await send(consent, 'Cancel this pending private-source request.'); await consent.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor();
    await consent.getByRole('button', { name: 'Stop this reply', exact: true }).click(); await idle(consent);
    assert.equal(await consent.getByRole('dialog').count(), 0);
    assert.equal(await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').length), before);
    assert.ok(await consent.getByText('Reply stopped by the host. Partial text is preserved.', { exact: true }).isVisible());
  });
  await check('Native credential flow carries providerId only and key removal requires confirmation', async () => {
    await consent.locator('.composer-help').getByRole('button', { name: 'Provider settings', exact: true }).click();
    const card = consent.locator('.provider-card').filter({ hasText: 'Mock compatible cloud' }); await card.getByRole('button', { name: 'Replace API key', exact: true }).click();
    await consent.waitForFunction(() => window.__astraTest.calls.some((call) => call.method === 'ai.requestCredential'));
    assert.deepEqual(await consent.evaluate(() => window.__astraTest.calls.find((call) => call.method === 'ai.requestCredential').params), { providerId: 'mock-cloud' });
    await card.getByRole('button', { name: 'Remove key', exact: true }).click(); await consent.getByRole('button', { name: 'Keep key', exact: true }).click();
    assert.equal(await consent.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.deleteCredential').length), 0);
    await consent.getByRole('button', { name: 'Done', exact: true }).click();
  });
  await check('GitHub access changes immediately remove private conversation content from the view', async () => {
    await consent.evaluate(() => window.__astraTest.emit('github.authChanged', { state: 'disconnected' }));
    await consent.waitForFunction(() => document.querySelectorAll('.conversation-turn').length === 0);
    assert.equal(await consent.getByText('mock-user/sample-firmware', { exact: true }).count(), 0);
    assert.ok(await consent.getByText('GitHub access changed. Private conversation content was removed from this view.', { exact: true }).isVisible());
  });
  await consent.context().close();

  const expired = await open({ cloud: true, shortApproval: true });
  await check('Expired consent declines safely instead of reporting an approval', async () => {
    await chooseRepository(expired, 'mock-user/sample-firmware'); await expired.getByRole('button', { name: 'Apply context', exact: true }).click();
    await send(expired, 'Read README with an expiring request.'); await expired.getByRole('dialog', { name: 'Share selected source?', exact: true }).waitFor(); await idle(expired);
    assert.equal(await expired.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').at(-1).params.decision), 'deny');
    assert.ok((await expired.locator('.tool-card').innerText()).includes('Denied'));
  }); await expired.context().close();
  const empty = await open({ noProviders: true });
  await check('Missing provider state blocks sending and keeps configuration reachable', async () => {
    await empty.getByLabel('Message Astra', { exact: true }).fill('No provider');
    assert.ok(await empty.getByRole('button', { name: 'Send message', exact: true }).isDisabled());
    await empty.getByText('Add a provider to start a conversation.', { exact: true }).waitFor();
    await empty.locator('.composer-help').getByRole('button', { name: 'Provider settings', exact: true }).click(); await empty.getByRole('heading', { name: 'AI providers', exact: true }).waitFor();
  }); await empty.context().close();
  const restored = await open({ seed: true, interval: 10 });
  await check('Launch restores existing host-owned conversation history', async () => {
    await restored.getByText('Existing host conversation', { exact: true }).waitFor();
    assert.ok((await restored.locator('.assistant-markdown').innerText()).includes('[mock] You said: Existing host conversation'));
  }); await restored.context().close();
  const gap = await open({ dropFirstChunk: true });
  await check('A missing event recovers the complete reply from the host snapshot', async () => {
    const text = 'Recover each word from the native snapshot. '.repeat(8);
    await send(gap, text); await gap.getByText('Recovering the reply from the host after a missing event.', { exact: true }).waitFor(); await idle(gap);
    assert.equal((await gap.locator('.assistant-markdown').innerText()).trim(), `[mock] You said: ${text.trim()}`);
  }); await gap.context().close();
  const approvalRestore = await open({ cloud: true, seedApproval: true });
  await check('Restoring an outstanding approval offers safe Stop recovery without inventing consent', async () => {
    await approvalRestore.getByText('An outstanding approval could not be restored. Stop this reply and send again.', { exact: true }).waitFor();
    assert.equal(await approvalRestore.getByRole('dialog').count(), 0);
    await approvalRestore.getByRole('button', { name: 'Stop reply', exact: true }).click(); await idle(approvalRestore);
    assert.equal(await approvalRestore.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.respondToApproval').length), 0);
  }); await approvalRestore.context().close();
  const handshake = await open({ loseSendReply: true, interval: 80 });
  await check('A lost send reply discovers the active host stream and keeps Stop functional', async () => {
    await send(handshake, 'Recover this unknown stream before retrying '.repeat(12));
    await handshake.getByText('The request timed out. Try again when the service is available.', { exact: true }).waitFor();
    await handshake.getByRole('button', { name: 'Stop reply', exact: true }).click(); await idle(handshake);
    assert.equal(await handshake.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.sendMessage').length), 1);
    assert.equal(await handshake.evaluate(() => window.__astraTest.calls.filter((call) => call.method === 'ai.cancel').length), 1);
    assert.ok(await handshake.getByText('Reply stopped by the host. Partial text is preserved.', { exact: true }).isVisible());
  }); await handshake.context().close();
  await check('No page errors or remote asset requests occurred', async () => { assert.deepEqual(errors, []); assert.deepEqual([...external], []); });
} finally {
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'Browser UI through native-shaped transport backed by shared mock; not live/native validation', outcomes, errors, external: [...external] }, null, 2));
  await browser.close();
}
