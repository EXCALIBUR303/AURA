// Measures actual per-zone frames after camera settling. Does not assert a
// hardware-specific FPS threshold; report.meets55Fps records that outcome.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-phase2-audit';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
  args: process.env.AURA_SOFTWARE_GPU === '1' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2 });
  const ids = ['studio', 'hardware', 'software', 'ai-lab', 'github', 'companion'];
  const records = {};
  let renderer;
  for (let i = 0; i < ids.length; i++) {
    // A fresh page resets adaptive DPR to the preference cap for every zone.
    // Keep adaptation enabled and record the actual ratio rather than labelling
    // lower-DPR samples as DPR 2.
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.addInitScript((zone) => localStorage.setItem('aura.mock.lastZone', zone), ids[i]);
    await page.goto(process.env.AURA_BASE_URL || 'http://127.0.0.1:5173');
    await page.waitForFunction((zone) => {
      const d = window.__AURA_DIAGNOSTICS__;
      return d?.status === 'loaded' && d.zone === zone && d.cameraSettled && (d.perZone[zone] || []).length >= 2;
    }, ids[i]);
    records[ids[i]] = await page.evaluate((zone) => window.__AURA_DIAGNOSTICS__.perZone[zone].slice(0, 2), ids[i]);
    console.log(ids[i], JSON.stringify(records[ids[i]]));
    renderer = await page.evaluate(() => window.__AURA_DIAGNOSTICS__.renderer);
    await page.close();
  }
  const result = { viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2, renderer, records,
    allSamplesAtDpr2: Object.values(records).every((samples) => samples.every((sample) => sample.pixelRatio === 2)),
    meets55Fps: Object.values(records).every((samples) => samples.every((sample) => sample.fps >= 55)),
    notes: 'Adaptive DPR remains enabled; each sample records actual DPR. Compare on the target Apple Silicon Mac and in WKWebView before claiming performance acceptance.' };
  await writeFile(path.join(artifacts, 'performance.json'), JSON.stringify(result, null, 2));
} finally { await browser.close(); }
