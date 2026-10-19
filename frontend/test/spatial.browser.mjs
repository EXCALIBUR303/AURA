// Focused Phase 5 UI regression. Native-shaped transport uses only the shared mock.
// No microphone/audio suites or live-service claims. Screenshots are captured separately.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.AURA_PLAYWRIGHT_MODULE || 'playwright');
const { default: AxeBuilder } = await import(process.env.AURA_AXE_MODULE || '@axe-core/playwright');
const base = process.env.AURA_BASE_URL || 'http://127.0.0.1:5173';
const artifacts = process.env.AURA_ARTIFACTS || '/tmp/aura-spatial-foundation';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath:process.env.AURA_CHROMIUM_PATH || undefined, args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[] });
const results=[], scans=[], errors=[], external=[];
async function check(name,run){try{await run();results.push({name,status:'passed'});console.log('PASS',name);}catch(e){results.push({name,status:'failed',error:String(e)});throw e;}}
async function scan(page,name){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await writeFile(path.join(artifacts,`axe-${name}.json`),JSON.stringify(r,null,2));scans.push({name,violations:r.violations.length});assert.deepEqual(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[]);}
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(/^https?:$/.test(u.protocol)&&u.origin!==new URL(base).origin)external.push(u.origin);});
await page.addInitScript(({module})=>{
 let ready;const calls=[];let counter=0;
 const host=()=>ready??=import(module).then(({createMockTransport})=>{const h=createMockTransport({streamIntervalMs:12});h.onEvent(json=>window.__AURA_BRIDGE__?.dispatch(json));window.__spatialTest={calls,fail:(method,code)=>h.failNext(method,{code,message:'Fixture failure',retryable:true}),emit:(event,payload)=>h.emit(event,payload),request:(method,params)=>h.send(JSON.stringify({kind:'request',v:1,id:`setup-${++counter}`,method,params})).then(JSON.parse)};return h;});
 window.webkit={messageHandlers:{aura:{postMessage:async json=>{const h=await host(),request=JSON.parse(json);calls.push({method:request.method,params:request.params});if(request.method==='app.getWindowState')return JSON.stringify({kind:'response',v:1,id:request.id,ok:true,result:{active:false,visible:false}});return h.send(json);}}}};
},{module:`/@fs${path.resolve(import.meta.dirname,'../../shared/bridge/mock.ts')}`});
const button=name=>page.getByRole('button',{name,exact:true});
async function restore(){await button('Restore Astra conversation').click();await page.getByLabel('Message Astra',{exact:true}).waitFor();}
async function expand(){if(await button('Expand conversation').isVisible())await button('Expand conversation').click();}
async function idle(){await button('Send message').waitFor();await page.waitForFunction(()=>!document.querySelector('.conversation-heading button[aria-label="New conversation"]').disabled);}
try{
 await page.goto(base);await page.waitForFunction(()=>window.__spatialTest);await page.waitForFunction(()=>document.querySelector('.companion-workspace')?.getAttribute('data-state')==='idle');
 await check('Immersive startup retains one canvas, an accessible minimized console and original credits',async()=>{
  assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('.spatial-os').getAttribute('data-console-minimized'),'true');
  assert.ok(await button('Restore Astra conversation').isVisible());assert.equal(await page.getByLabel('Message Astra',{exact:true}).isVisible(),false);assert.match(await page.locator('.model-credit').innerText(),/XRProfXR.*CC BY 4.0/);await scan(page,'immersive');
 });
 await check('Room selection exposes four working destinations, current location and keyboard return',async()=>{
  const opener=page.getByRole('button',{name:'World map',exact:false});await opener.click();assert.equal(await page.locator('.world-room-list article').count(),4);assert.equal(await page.locator('.world-room-list button:not(:disabled)').count(),3);await scan(page,'room-selector');await page.keyboard.press('Escape');assert.ok(await opener.evaluate(n=>n===document.activeElement));
 });
 await check('Minimize and restore preserve the exact textarea, unsent draft, focus and AI lifetime',async()=>{
  await restore();await page.getByLabel('Message Astra',{exact:true}).fill('Preserve this spatial draft.');await page.evaluate(()=>{window.__draftElement=document.getElementById('companion-prompt');});
  await button('Minimize conversation').click();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Restore Astra conversation');assert.match(await button('Restore Astra conversation').innerText(),/Draft preserved/);await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Message Astra',{exact:true}).inputValue(),'Preserve this spatial draft.');assert.ok(await page.evaluate(()=>window.__draftElement===document.getElementById('companion-prompt')));await page.waitForFunction(()=>document.activeElement?.id==='companion-prompt');
  assert.equal(await page.evaluate(()=>window.__spatialTest.calls.filter(x=>['ai.cancel','ai.resetConversation','ai.endConversation'].includes(x.method)).length),0);
  await scan(page,'compact');
 });
 await check('Conversation expansion, focus and edge docking retain draft and fit the viewport',async()=>{
  await button('Dock conversation on the left').click();assert.equal(await page.locator('.companion-workspace').getAttribute('data-edge'),'left');await button('Dock conversation on the right').click();await expand();await button('Enter focus mode').click();await scan(page,'focused');await button('Leave focus mode').click();await button('Collapse conversation').click();assert.equal(await page.getByLabel('Message Astra',{exact:true}).inputValue(),'Preserve this spatial draft.');
 });
 await check('An active reply completes while minimized, with unread feedback and no cancellation',async()=>{
  await expand();await page.getByLabel('Message Astra',{exact:true}).fill('Keep the stream running while the console is minimized. '.repeat(14));await button('Send message').click();await button('Stop reply').waitFor();await button('Minimize conversation').click();
  await page.waitForFunction(()=>document.querySelector('.companion-workspace')?.getAttribute('data-state')==='completed');assert.match(await button('Restore Astra conversation').innerText(),/New response/);await restore();await idle();assert.match(await page.locator('.assistant-markdown').last().innerText(),/Keep the stream running/);assert.equal(await page.evaluate(()=>window.__spatialTest.calls.filter(x=>x.method==='ai.cancel').length),0);
  await button('Minimize conversation').click();assert.doesNotMatch(await button('Restore Astra conversation').innerText(),/New response/);await restore();await scan(page,'reply');
 });
 await check('AI failure keeps the draft and exposes recovery after minimizing',async()=>{
  await page.evaluate(()=>window.__spatialTest.fail('ai.sendMessage','network'));await page.getByLabel('Message Astra',{exact:true}).fill('Keep this failed draft.');await button('Send message').click();await page.getByText('The service could not be reached. Check the connection and try again.',{exact:true}).waitFor();await button('Minimize conversation').click();await restore();assert.equal(await page.getByLabel('Message Astra',{exact:true}).inputValue(),'Keep this failed draft.');await scan(page,'ai-error');await button('Refresh conversation').click();
 });
 await check('Workspace navigation keeps the conversation and opens real shared-mock GitHub projects',async()=>{
  await button('Minimize conversation').click();await page.getByRole('navigation',{name:'Studio zones'}).getByRole('button',{name:'Projects 5',exact:true}).click();await page.locator('.repository-card').first().waitFor();assert.ok(await page.locator('.repository-card').count()>0);await scan(page,'github');
  for(const [width,height] of [[1440,900],[1100,700]]){
   await page.setViewportSize({width,height});
   // The responsive resize effect closes the inspector on laptop widths.
   // Wait for that state transition before reopening it for the overlap check.
   if(width<=1250)await page.waitForFunction(()=>document.querySelector('.spatial-os')?.getAttribute('data-inspector')==='false');
   if(await page.locator('.spatial-os').getAttribute('data-inspector')!=='true')await button('Project inspector').click();
   const pane=await page.locator('.inspector').boundingBox(),beacon=await button('Restore Astra conversation').boundingBox();
   assert.ok(pane.y+pane.height<=beacon.y,'the companion must not cover inspector controls');
   await page.screenshot({path:path.join(artifacts,`project-layout-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('navigation',{name:'Studio zones'}).getByRole('button',{name:'Studio 1',exact:true}).click();await restore();assert.equal(await page.getByLabel('Message Astra',{exact:true}).inputValue(),'Keep this failed draft.');
 });
 await check('Laptop console and room selector remain bounded, keyboard accessible and reduced-motion aware',async()=>{
  if(await button('Collapse conversation').isVisible())await button('Collapse conversation').click();await page.setViewportSize({width:1100,height:700});const b=await page.locator('.companion-workspace').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1101&&b.y+b.height<=701);await scan(page,'laptop-compact');
  await button('Minimize conversation').click();await page.getByRole('button',{name:'World map',exact:false}).click();await scan(page,'laptop-map');assert.equal(await page.locator('.spatial-os').getAttribute('data-reduced-motion'),'true');await page.keyboard.press('Escape');
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(e){console.error(e);await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,scans,errors,external},null,2));await browser.close();}
