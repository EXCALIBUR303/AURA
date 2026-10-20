// Phase 6: Astra/desk composition on the real production UI at supported desktop sizes, and the Software station.
// Shared labelled browser fixtures only (mock GitHub); no native acceptance.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PerspectiveCamera,Vector3} from 'three';
const {chromium}=await import(process.env.AURA_PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AURA_AXE_MODULE||'@axe-core/playwright');
const base=process.env.AURA_BASE_URL||'http://127.0.0.1:5173',artifacts=process.env.AURA_ARTIFACTS||'/tmp/aura-composition';await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH||undefined,args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]});
const errors=[],external=[];let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const settled=page=>page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__?.world?.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled,null,{timeout:40000});
async function open(width,height,reduced=true){const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});const page=await context.newPage();page.setDefaultTimeout(35000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url());});await page.goto(base);await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__?.status==='loaded');await settled(page);await page.waitForTimeout(600);return page;}
/** Pixel x of a world point from the camera the app actually reports. */
async function projectX(page,point){const {camera}=await page.evaluate(()=>({camera:window.__AURA_DIAGNOSTICS__.camera}));const {w,h}=await page.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {w:r.width,h:r.height};});const c=new PerspectiveCamera(camera.fov,w/h,.05,80);c.position.set(...camera.position);c.lookAt(...camera.target);c.updateMatrixWorld();c.updateProjectionMatrix();return {x:(new Vector3(...point).project(c).x*.5+.5)*w,w};}
const ASTRA=[0,1,-12.5],PEDESTAL_L=[-.72,.12,-12.5],PEDESTAL_R=[.72,.12,-12.5];
const centred=async(page,label,tol=2)=>{const l=await projectX(page,PEDESTAL_L),r=await projectX(page,PEDESTAL_R),a=await projectX(page,ASTRA);const mid=(l.x+r.x)/2;assert.ok(Math.abs(mid-l.w/2)<=tol,`${label}: pedestal ${mid.toFixed(1)} vs ${l.w/2}`);assert.ok(Math.abs(a.x-l.w/2)<=tol,`${label}: Astra ${a.x.toFixed(1)} vs ${l.w/2}`);};
const SIZES=[[1100,700],[1280,800],[1440,900],[1728,1117]];
try{
 await check('Astra and her pedestal are centred in the hub overview at every supported desktop size',async()=>{
  for(const [w,h] of SIZES){const page=await open(w,h);await centred(page,`${w}x${h}`);await page.screenshot({path:path.join(artifacts,`hub-${w}.png`)});await page.context().close();}
 });
 const page=await open(1440,900);
 await check('Alignment survives camera reset, room re-entry and inspection exit',async()=>{
  const nav=page.getByRole('navigation',{name:'Studio zones',exact:true});
  await nav.getByRole('button',{name:'Hardware 2',exact:true}).click();await settled(page);
  await nav.getByRole('button',{name:'Studio 1',exact:true}).click();await settled(page);await centred(page,'after reset');
  await page.getByRole('button',{name:/World map/}).click();await page.locator('article[data-room="living"]').getByRole('button',{name:'Visit',exact:true}).click();await settled(page);
  assert.equal(await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.room),'living');
  await page.getByRole('button',{name:'Return to Project Hub',exact:true}).click();await settled(page);
  assert.equal(await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.room),'project-hub');await centred(page,'after room re-entry');
  await page.getByRole('button',{name:'Equipment',exact:true}).click();await page.getByLabel('Choose equipment',{exact:true}).selectOption('hardware.pc');await settled(page);
  await page.getByRole('button',{name:'Return to room',exact:true}).click().catch(async()=>{await page.keyboard.press('Escape');await page.keyboard.press('Escape');});await settled(page);await centred(page,'after hardware inspection exit');
 });
 await check('Software station shows real workspace state, selects a project and stays honest about mock data',async()=>{
  const p=await open(1440,900);
  await p.getByRole('button',{name:'Equipment',exact:true}).click();await p.getByLabel('Choose equipment',{exact:true}).selectOption('software.screen');await settled(p);
  const station=p.getByRole('region',{name:'Software development station'});await station.waitFor();
  assert.match(await station.innerText(),/Browser mock data/);
  const list=station.getByRole('list',{name:'Recently pushed repositories'});assert.ok(await list.getByRole('button').count()>=2);
  const second=list.getByRole('button').nth(1);const name=(await second.locator('span').innerText()).trim();await second.click();
  await station.getByText(name,{exact:true}).first().waitFor();assert.equal(await second.getAttribute('aria-pressed'),'true');
  const r=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await writeFile(path.join(artifacts,'axe-software-station.json'),JSON.stringify(r,null,2));assert.deepEqual(r.violations.map(v=>v.id),[]);
  await p.screenshot({path:path.join(artifacts,'software-station-1440.png')});
  await station.getByRole('button',{name:'Open project workspace'}).click();await settled(p);assert.equal(await p.locator('.experience').getAttribute('data-zone'),'software');
  await p.context().close();
 });
 await check('Software station: Return to room restores the previous camera and alignment',async()=>{
  const p=await open(1440,900);const before=await p.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera);
  await p.getByRole('button',{name:'Equipment',exact:true}).click();await p.getByLabel('Choose equipment',{exact:true}).selectOption('software.pc');await settled(p);
  await p.getByRole('button',{name:'Return to room',exact:true}).click();await settled(p);const after=await p.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera);
  assert.ok(Math.hypot(...after.position.map((v,i)=>v-before.position[i]))<.02);await centred(p,'after station return');await p.context().close();
 });
 await check('no page errors or external runtime requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
 console.log(`${passed} composition checks passed. Artifacts: ${artifacts}`);
}finally{await browser.close();}
