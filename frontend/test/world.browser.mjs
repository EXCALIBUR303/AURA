// Shared native-shaped mock only; never a live native or M5 acceptance claim.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium }=await import(process.env.AURA_PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AURA_AXE_MODULE||'@axe-core/playwright');
const base=process.env.AURA_BASE_URL||'http://127.0.0.1:5173';const artifacts=process.env.AURA_ARTIFACTS||'/tmp/aura-world';await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH||undefined,args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]});
const results=[],errors=[],external=[],scans=[];let finalDiagnostics;
const check=async(name,fn)=>{if(process.env.AURA_SKIP_TESTS&&new RegExp(process.env.AURA_SKIP_TESTS,'i').test(name)){results.push({name,status:'skipped',reason:'Explicit test freeze'});console.log('SKIP '+name);return;}await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
const settled=async(page,room)=>page.waitForFunction(room=>window.__AURA_DIAGNOSTICS__?.world?.room===room&&window.__AURA_DIAGNOSTICS__.world.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled,room,{timeout:30000});
async function open(options={}){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(25000);
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 await page.addInitScript(({module})=>{
  let ready;const calls=[];window.__worldMicCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__worldMicCalls++;throw Error('Forbidden browser capture');};
  const getHost=()=>ready??=import(module).then(({createMockTransport})=>{const host=createMockTransport({voiceGranted:true,streamIntervalMs:250});host.onEvent(json=>window.__AURA_BRIDGE__?.dispatch(json));window.__worldTest={calls,emit:(event,payload)=>host.emit(event,payload)};return host;});
  window.webkit={messageHandlers:{aura:{postMessage:async json=>{const host=await getHost();const req=JSON.parse(json);calls.push({method:req.method,params:req.params});return host.send(json);}}}};
 },{module:`/@fs${path.resolve(import.meta.dirname,'../../shared/bridge/mock.ts')}`});
 if(options.holdAtrium)await page.route("**/src/world/rooms/Atrium.tsx*",async route=>{await options.holdAtrium;await route.continue();});
 await page.goto(base);return page;
}
async function visit(page,room){await page.getByRole('button',{name:'World map',exact:false}).click();await page.locator(`.world-room-list article[data-room="${room}"]`).getByRole('button',{name:'Visit',exact:true}).click();await settled(page,room);}
async function axe(page,name){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await writeFile(path.join(artifacts,`axe-${name}.json`),JSON.stringify(result,null,2));assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);scans.push({name,violations:0});}
try{
 const page=await open();
 await check('Original Astra and one Canvas load with the spatial Hub',async()=>{await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__?.status==='loaded');await settled(page,'project-hub');assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.locator('.model-credit').getByRole('link',{name:'CC BY 4.0',exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.heightMeters),1.75);});
 await page.screenshot({path:path.join(artifacts,'hub-1440.png')});
 await check('A nearby passage opens with E and supports continuous walking between physical rooms',async()=>{
  await page.getByRole('button',{name:'Free Explore',exact:true}).click();await page.waitForFunction(()=>!document.pointerLockElement&&window.__AURA_DIAGNOSTICS__.world.mode==='explore'&&Math.abs(window.__AURA_DIAGNOSTICS__.camera.position[1]-1.62)<.01);
  const before=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera.position);await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.loadedRooms.includes('atrium')&&window.__AURA_DIAGNOSTICS__.world.phase==='idle');
  const same=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera.position);assert.ok(Math.hypot(...same.map((v,i)=>v-before[i]))<.05);
  await page.keyboard.down('KeyS');try{await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.room==='atrium',{},{timeout:45000});}finally{await page.keyboard.up('KeyS');}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement&&window.__AURA_DIAGNOSTICS__.world.mode==='inspect');assert.equal(await page.locator('.experience').getAttribute('data-zone'),'studio');await visit(page,'project-hub');
 });
 await check('Accessible map exposes the three physically separate destinations',async()=>{await page.getByRole('button',{name:'World map',exact:false}).click();await page.getByRole('dialog',{name:'Your AURA world'}).waitFor();assert.ok(await page.locator('article[data-room=living]').getByRole('button',{name:'Visit',exact:true}).isEnabled());assert.ok(await page.locator('article[data-room=gaming]').getByRole('button',{name:'Visit',exact:true}).isEnabled());await axe(page,'map-1440');await page.screenshot({path:path.join(artifacts,'map-1440.png')});await page.keyboard.press('Escape');});
 await check('Room travel preserves drafts, conversation, selected workspace and native privacy state',async()=>{
  const draft=page.getByRole('textbox',{name:'Message Astra',exact:true});await draft.fill('Keep this unsent world draft');const node=await draft.elementHandle();const before=await page.evaluate(()=>window.__worldTest.calls.length);await visit(page,'atrium');assert.equal(await draft.inputValue(),'Keep this unsent world draft');assert.equal(await node.evaluate(el=>el===document.querySelector('#companion-prompt')),true);assert.equal(await page.locator('.experience').getAttribute('data-zone'),'studio');
  const calls=await page.evaluate(start=>window.__worldTest.calls.slice(start),before);assert.ok(!calls.some(c=>['prefs.update','ai.sendMessage','ai.setConversationRepository','voice.startListening','voice.requestPermissions'].includes(c.method)));assert.equal(await page.evaluate(()=>window.__worldMicCalls),0);await axe(page,'atrium-1440');
 });
 await page.screenshot({path:path.join(artifacts,'atrium-1440.png')});
 await check('Native workspace shortcut returns from Atrium to the original Hub tool',async()=>{await page.evaluate(()=>window.__worldTest.emit('app.command',{command:'navigate',zone:'hardware'}));await settled(page,'project-hub');assert.equal(await page.locator('.experience').getAttribute('data-zone'),'hardware');});
 await check('All six workspace commands retain a single settled camera',async()=>{const names=['Studio 1','Hardware 2','Software 3','AI Lab 4','Projects 5','Companion 6'];for(const name of names){await page.getByRole('navigation',{name:'Studio zones',exact:true}).getByRole('button',{name,exact:true}).click();await settled(page,'project-hub');assert.equal(await page.locator('canvas').count(),1);}});
 await check('Repository search survives a physical room visit without changing the selected tool',async()=>{
  await page.getByRole('navigation',{name:'Studio zones',exact:true}).getByRole('button',{name:'Projects 5',exact:true}).click();await settled(page,'project-hub');await page.getByRole('searchbox',{name:'Search repositories',exact:true}).fill('firmware');
  await visit(page,'atrium');assert.equal(await page.locator('.experience').getAttribute('data-zone'),'github');await visit(page,'project-hub');assert.equal(await page.getByRole('searchbox',{name:'Search repositories',exact:true}).inputValue(),'firmware');
  await page.getByRole('navigation',{name:'Studio zones',exact:true}).getByRole('button',{name:'Companion 6',exact:true}).click();await settled(page,'project-hub');
 });
 await check('Map and room view fit 1100 by 700 with visible attribution',async()=>{await page.setViewportSize({width:1100,height:700});await visit(page,'atrium');await page.getByRole('button',{name:'World map',exact:false}).click();await axe(page,'map-1100');const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1101&&box.y+box.height<=701);await page.screenshot({path:path.join(artifacts,'map-1100.png')});await page.keyboard.press('Escape');await page.screenshot({path:path.join(artifacts,'atrium-1100.png')});assert.ok(await page.locator('.model-credit').isVisible());});
 await check('Twenty room visits keep a bounded scene and the same composer',async()=>{const node=await page.locator('#companion-prompt').elementHandle();const resources=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.resources);for(let i=0;i<20;i++){await visit(page,i%2?'atrium':'project-hub');const rooms=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.loadedRooms);assert.ok(rooms.length<=2);assert.equal(await page.locator('canvas').count(),1);}assert.ok(await node.evaluate(el=>el===document.querySelector('#companion-prompt')));await page.waitForTimeout(1200);const after=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.resources);assert.ok(after.geometries<=resources.geometries+2);assert.ok(after.textures<=resources.textures+1);assert.ok(after.programs<=resources.programs+1);});
 await check('Drag Explore enables WASD without capture and Esc restores safe Inspect input',async()=>{
  await page.getByRole('button',{name:'Free Explore',exact:true}).click();await page.waitForFunction(()=>!document.pointerLockElement&&window.__AURA_DIAGNOSTICS__.world.mode==='explore');
  const before=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera.position);await page.keyboard.down('KeyW');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');await page.waitForTimeout(1100);
  const after=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera.position);assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>.03);assert.ok(Math.abs(after[1]-1.62)<.01);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement&&window.__AURA_DIAGNOSTICS__.world.mode==='inspect');
 });
 await check('Denied optional capture preserves Explore and the keyboard map remains available',async()=>{await page.evaluate(()=>{const canvas=document.querySelector('canvas');canvas.requestPointerLock=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));});await page.getByRole('button',{name:'Free Explore',exact:true}).click();await page.getByRole('button',{name:'Capture pointer',exact:true}).click();await page.getByText('Pointer capture is unavailable. Drag to look and WASD remain available.',{exact:true}).waitFor();await page.getByRole('button',{name:'World map',exact:false}).click();await page.keyboard.press('Escape');});
 await check('Opening the world map cancels microphone capture without sending or replacing a typed draft',async()=>{
  const draft=page.getByRole('textbox',{name:'Message Astra',exact:true});const beforeDraft=await draft.inputValue();await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  const before=await page.evaluate(()=>window.__worldTest.calls.filter(c=>c.method==='voice.cancelListening').length);
  await page.getByRole('button',{name:'Talk with Astra',exact:true}).click();await page.getByRole('button',{name:'Cancel listening',exact:true}).waitFor();await page.getByRole('button',{name:'World map',exact:false}).click();
  await page.waitForFunction(before=>window.__worldTest.calls.filter(c=>c.method==='voice.cancelListening').length>before,before);
  await page.keyboard.press('Escape');assert.equal(await draft.inputValue(),beforeDraft);assert.equal(await page.evaluate(()=>window.__worldTest.calls.filter(c=>c.method==='ai.sendMessage').length),0);
 });
 await check('Cancelling a delayed room load keeps the original safe room and ignores late completion',async()=>{
  let release;const gate=new Promise(r=>{release=r;});const delayed=await open({holdAtrium:gate});await settled(delayed,'project-hub');
  await delayed.getByRole('button',{name:'World map',exact:false}).click();await delayed.locator('article[data-room=atrium]').getByRole('button',{name:'Visit',exact:true}).click();await delayed.getByText('Preparing Central Atrium…',{exact:true}).waitFor();
  await delayed.getByRole('button',{name:'Cancel travel',exact:true}).click();await settled(delayed,'project-hub');const response=delayed.waitForResponse(r=>r.url().includes('/src/world/rooms/Atrium.tsx'));release();await response;await delayed.waitForTimeout(300);
  assert.equal(await delayed.locator('.experience').getAttribute('data-room'),'project-hub');assert.equal(await delayed.evaluate(()=>window.__AURA_DIAGNOSTICS__.world.phase),'idle');await delayed.close();
 });
 finalDiagnostics=await page.evaluate(()=>window.__AURA_DIAGNOSTICS__);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({tests:results.length,scans,measurements:{fps:finalDiagnostics.fps,drawCalls:finalDiagnostics.drawCalls,triangles:finalDiagnostics.sceneTriangles,resources:finalDiagnostics.resources}},null,2));
}catch(error){console.error(error);for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.log(await page.evaluate(()=>({diagnostics:window.__AURA_DIAGNOSTICS__,body:document.body.innerText.slice(0,1300)})).catch(()=>null));}process.exitCode=1;
}finally{await writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,scans,errors,external,diagnostics:finalDiagnostics},null,2));await browser.close();}
