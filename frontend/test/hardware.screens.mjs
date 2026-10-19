// Reproducible screenshots of the procedural hardware kit from the dev-only preview page (no room assets needed).
// Usage: npm --prefix frontend run dev, then AURA_PLAYWRIGHT_MODULE=... AURA_CHROMIUM_PATH=... AURA_SOFTWARE_GPU=1 AURA_ARTIFACTS=/some/dir node frontend/test/hardware.screens.mjs
// Also records the preview's renderer counters; on a software renderer these are not native performance.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.AURA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.AURA_BASE_URL||'http://127.0.0.1:5173',out=process.env.AURA_ARTIFACTS||'/tmp/aura-hardware-screens';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH||undefined,args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--ignore-gpu-blocklist']:[]});
const shots=[['assembled','?assembled=1'],['gpu','?select=gpu'],['exploded','?explode=1'],['cpu-exploded','?select=cpu&explode=1'],['cooler','?select=cooler']],measured={};
for(const [name,query] of shots){
  const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(`${base}/hardware-preview.html${query}`);
  await page.waitForFunction(()=>window.__PREVIEW__,null,{timeout:90000});await page.waitForTimeout(4500);await page.evaluate(()=>document.querySelector('canvas').width);await page.waitForTimeout(400);
  await page.screenshot({path:path.join(out,`${name}.png`)});measured[name]=await page.evaluate(()=>window.__PREVIEW__.info());await page.close();
}
await writeFile(path.join(out,'screens.json'),JSON.stringify(measured,null,2));console.log(JSON.stringify(measured,null,2));await browser.close();
