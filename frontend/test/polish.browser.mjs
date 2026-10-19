// Focused M7 world/layout tests. Native-shaped shared mock; no voice actions or tests.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.AURA_PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AURA_AXE_MODULE||'@axe-core/playwright');
const base=process.env.AURA_BASE_URL||'http://127.0.0.1:5173';
const artifacts=process.env.AURA_ARTIFACTS||'/tmp/aura-polish';await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH||undefined,args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]});
const results=[],errors=[],external=[],scans=[],samples=[];
const check=async(name,fn)=>{if(process.env.AURA_TEST_FILTER&&!new RegExp(process.env.AURA_TEST_FILTER,'i').test(name))return;await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
const settled=(page,room)=>page.waitForFunction(room=>window.__AURA_DIAGNOSTICS__?.world?.room===room&&window.__AURA_DIAGNOSTICS__.world.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled,room,{timeout:45000});
async function open(){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 await page.addInitScript(({module})=>{let ready;const host=()=>ready??=import(module).then(({createMockTransport})=>{const h=createMockTransport();h.onEvent(json=>window.__AURA_BRIDGE__?.dispatch(json));window.__polishTest={emit:(event,payload)=>h.emit(event,payload)};return h;});window.webkit={messageHandlers:{aura:{postMessage:async json=>(await host()).send(json)}}};},{module:`/@fs${path.resolve(import.meta.dirname,'../../shared/bridge/mock.ts')}`});
 return page;
}
async function visit(page,room){if(await page.evaluate(room=>window.__AURA_DIAGNOSTICS__?.world?.room===room&&window.__AURA_DIAGNOSTICS__.world.phase==='idle',room))return;await page.getByRole('button',{name:'World map',exact:false}).click();await page.locator(`article[data-room="${room}"]`).getByRole('button',{name:'Visit',exact:true}).click();await settled(page,room);}
async function scan(page,name){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);scans.push({name,violations:0});}
async function pose(page){await page.waitForTimeout(1200);return page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera);}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
try{
 const page=await open();await page.goto(base);await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__?.status==='loaded');await settled(page,'project-hub');
 await check('Explore starts with focus and WASD without requesting pointer lock',async()=>{
  await page.evaluate(()=>{window.__captureRequests=0;document.querySelector('canvas').requestPointerLock=()=>{window.__captureRequests++;return Promise.reject(new DOMException('Denied','NotAllowedError'));};});
  await page.getByRole('button',{name:'Free Explore',exact:true}).click();await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.mode==='explore'&&document.activeElement===document.querySelector('canvas'));
  assert.equal(await page.evaluate(()=>window.__captureRequests),0);const before=await pose(page);assert.ok(Math.abs(before.position[1]-1.62)<.01);
  await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');const after=await pose(page);assert.ok(distance(after.position,before.position)>.03);
 });
 await check('Mouse drag and keyboard look rotate the camera without activating objects',async()=>{
  const before=await pose(page);await page.mouse.move(690,400);await page.mouse.down();await page.mouse.move(850,440,{steps:8});await page.mouse.up();const after=await pose(page);
  assert.ok(distance(after.target,before.target)>.1);assert.equal(await page.getByRole('complementary',{name:'Workstation equipment'}).count(),0);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(1000);await page.keyboard.up('ArrowRight');const arrows=await pose(page);assert.ok(distance(arrows.target,after.target)>.03);
 });
 await check('Blur and modal focus release movement; typing cannot drive the camera',async()=>{
  await page.keyboard.down('KeyW');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('KeyW');const before=await pose(page);await page.waitForTimeout(1500);const after=await pose(page);assert.ok(distance(after.position,before.position)<.001);
  const draft=page.getByRole('textbox',{name:'Message Astra',exact:true});await draft.fill('M7 keeps this draft');await draft.press('KeyW');const typed=await pose(page);assert.ok(distance(typed.position,after.position)<.001);
  await page.getByRole('button',{name:'World map',exact:false}).click();await page.keyboard.press('KeyW');assert.ok(await page.getByRole('dialog',{name:'Your AURA world'}).isVisible());await page.keyboard.press('Escape');
 });
 await check('Optional pointer-capture denial keeps drag Explore usable, and Esc returns to Inspect',async()=>{
  await page.getByRole('button',{name:'Capture pointer',exact:true}).click();await page.getByText('Pointer capture is unavailable. Drag to look and WASD remain available.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.mode),'explore');await page.getByRole('button',{name:'Dismiss',exact:true}).click();await page.locator('canvas').focus();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.mode==='inspect');
 });
 await check('In-flight camera travel settles on native deactivation and hidden restoration has no delayed jump',async()=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await visit(page,'atrium');
  await page.getByRole('button',{name:'World map',exact:false}).click();await page.locator('article[data-room=project-hub]').getByRole('button',{name:'Visit',exact:true}).click();
  await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.phase==='travelling');
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:false,visible:true}));await settled(page,'project-hub');const arrived=await pose(page);
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:false,visible:false}));await page.waitForTimeout(500);
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:true,visible:true}));await settled(page,'project-hub');const restored=await pose(page);assert.ok(distance(restored.position,arrived.position)<.01);
  await page.emulateMedia({reducedMotion:'reduce'});
 });
 await check('A request started while hidden also completes after readiness, without waiting for render frames',async()=>{
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:false,visible:false}));await visit(page,'atrium');
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:true,visible:true}));await settled(page,'atrium');
 });
 await check('Native deactivation releases an unfinished drag before restoring input',async()=>{
  await page.getByRole('button',{name:'Free Explore',exact:true}).click();await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.mode==='explore');await page.mouse.move(600,390);await page.mouse.down();
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:false,visible:false}));await page.waitForTimeout(250);await page.mouse.up();
  await page.evaluate(()=>window.__polishTest.emit('app.windowStateChanged',{active:true,visible:true}));const before=await pose(page);await page.mouse.move(850,460);const after=await pose(page);assert.ok(distance(after.target,before.target)<.01);assert.equal(await page.locator('.experience').getAttribute('data-room'),'atrium');
  await page.locator('canvas').focus();await page.keyboard.press('Escape');
 });
 await check('Atrium byte warmup never opens another floor, and the Living load reports separate stages',async()=>{
  if(await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.room)!=='atrium')await visit(page,'atrium');
  await page.waitForTimeout(2200);const before=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__);assert.ok(before.world.loadedRooms.length<=2);assert.ok(!before.assets.some(a=>a.owners.includes('living')));
  await visit(page,'living');await page.waitForTimeout(1500);const d=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__);assert.equal(d.world.loadTiming.room,'living');assert.ok(d.world.loadTiming.settledMs>=d.world.loadTiming.readyMs);
  for(const id of ['room-kit','sofa','chair']){const a=d.assets.find(a=>a.id===id);assert.ok(a?.ready);assert.ok(a.downloadMs>=0&&a.decodeMs>=0);assert.equal(a.prefetched,true);}
  samples.push({name:'living-prefetched',diagnostics:d});
 });
 await check('Direct cold Living visit works without a speculative cache and keeps useful load feedback',async()=>{
  const cold=await open();await cold.goto(base);await settled(cold,'project-hub');await visit(cold,'living');await cold.waitForTimeout(1500);
  const d=await cold.evaluate(()=>window.__AURA_DIAGNOSTICS__);assert.ok(d.assets.filter(a=>a.id!=='workstation').every(a=>a.prefetched===false));samples.push({name:'living-direct',diagnostics:d});await cold.close();
 });
 await check('Room controls and companion remain separate at laptop and desktop sizes, with accessible controls',async()=>{
  for(const [width,height] of [[1440,900],[1280,800],[1100,700]]){
   await visit(page,'living');await page.setViewportSize({width,height});await page.getByRole('button',{name:'Room controls',exact:true}).click();
   const panel=await page.getByRole('complementary',{name:'Room controls',exact:true}).boundingBox();const dock=await page.getByRole('region',{name:'Astra conversation',exact:true}).boundingBox();
   assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=width+1&&panel.y+panel.height<=height+1);assert.ok(dock.x+dock.width<=panel.x||dock.x>=panel.x+panel.width);
   const status=await page.locator('.companion-pill').boundingBox();assert.ok(status.y+status.height<=panel.y);
   const tools=await page.locator('.viewport-tools').boundingBox();assert.ok(tools.y+tools.height<=dock.y);
   await scan(page,`living-controls-${width}`);await page.screenshot({path:path.join(artifacts,`living-controls-${width}.png`)});await page.getByRole('button',{name:'Close room controls',exact:true}).click();
  }
  await page.setViewportSize({width:1440,height:900});await scan(page,'living-1440');
 });
 await check('Inspector, equipment panel and companion fit together in the Mac laptop layout',async()=>{
  await page.setViewportSize({width:1100,height:700});await page.getByRole('navigation',{name:'Studio zones',exact:true}).getByRole('button',{name:'Hardware 2',exact:true}).click();await settled(page,'project-hub');
  await page.getByRole('button',{name:'Equipment',exact:true}).click();
  const panel=await page.getByRole('complementary',{name:'Workstation equipment',exact:true}).boundingBox();const dock=await page.getByRole('region',{name:'Astra conversation',exact:true}).boundingBox();
  assert.ok(dock.x+dock.width<=panel.x);await scan(page,'inspector-equipment-1100');await page.screenshot({path:path.join(artifacts,'inspector-equipment-1100.png')});
  await page.getByRole('button',{name:'Return from equipment inspection',exact:true}).click();await page.getByRole('navigation',{name:'Studio zones',exact:true}).getByRole('button',{name:'Studio 1',exact:true}).click();await settled(page,'project-hub');await page.setViewportSize({width:1440,height:900});
 });
 await check('Original room identities, GLBs, scene budgets and project context survive the polished views',async()=>{
  for(const room of ['gaming','atrium','project-hub']){await visit(page,room);await page.waitForTimeout(1500);const d=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__);assert.equal(await page.locator('canvas').count(),1);assert.ok(d.world.loadedRooms.length<=2);assert.ok(d.drawCalls<=(room==='atrium'?75:room==='gaming'?72:80));assert.ok(d.sceneTriangles<=260000);assert.ok(await page.locator('.model-credit').isVisible());samples.push({name:room,diagnostics:d});await scan(page,room);await page.screenshot({path:path.join(artifacts,`${room}-1440.png`)});}
  assert.match(await page.getByRole('textbox',{name:'Message Astra',exact:true}).inputValue(),/M7 keeps this draft/);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(`${results.length} M7 checks, ${scans.length} zero-violation accessibility scans; no page errors or external requests.`);
}catch(e){console.error(e);for(const c of browser.contexts())for(const p of c.pages()){await p.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.log(await p.evaluate(()=>window.__AURA_DIAGNOSTICS__?.world).catch(()=>null));}process.exitCode=1;}
finally{await writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,scans,samples,errors,external},null,2));await browser.close();}
