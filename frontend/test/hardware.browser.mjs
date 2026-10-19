// Interactive hardware inspection, run against the production UI with the shared mock bridge. No native acceptance.
// Env: AURA_BASE_URL, AURA_PLAYWRIGHT_MODULE, AURA_AXE_MODULE, AURA_CHROMIUM_PATH, AURA_ARTIFACTS, AURA_SOFTWARE_GPU=1 (cloud only).
// If the gitignored Astra GLB is absent (cloud checkouts) the "Astra could not load" card is hidden so it cannot cover the scene;
// the world itself does not depend on Astra.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {HARDWARE_ORIGIN,SELECTABLE,componentById,focusPose} from '../src/world/hardware/catalog.ts';
const {chromium}=await import(process.env.AURA_PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AURA_AXE_MODULE||'@axe-core/playwright');
const base=process.env.AURA_BASE_URL||'http://127.0.0.1:5173',artifacts=process.env.AURA_ARTIFACTS||'/tmp/aura-hardware';await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH||undefined,args:process.env.AURA_SOFTWARE_GPU==='1'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--ignore-gpu-blocklist']:[]});
const results=[],errors=[],external=[],scans=[],measured={};
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
async function open({reduced=false,viewport={width:1440,height:900}}={}){
  const context=await browser.newContext({viewport,reducedMotion:reduced?'reduce':'no-preference'});const page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>{if(!/astra|avatar/i.test(e.message))errors.push(e.message);});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
  await page.goto(base);await page.addStyleTag({content:'.scene-message{display:none!important}'});
  await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__?.world?.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled&&window.__AURA_HARDWARE__,null,{timeout:120000});
  return page;
}
const camera=page=>page.evaluate(()=>window.__AURA_DIAGNOSTICS__.camera);
const hw=page=>page.evaluate(()=>window.__AURA_HARDWARE__.state());
const resources=page=>page.evaluate(()=>window.__AURA_HARDWARE__.resources());
/** Waits until the camera has arrived at `target` (world) and the world is idle. */
const arrived=(page,target,tolerance=0.04)=>page.waitForFunction(({target,tolerance})=>{const d=window.__AURA_DIAGNOSTICS__;return d.world?.phase==='idle'&&d.cameraSettled&&Math.hypot(...d.camera.target.map((v,i)=>v-target[i]))<tolerance;},{target,tolerance},{timeout:120000});
async function scan(page,name){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await writeFile(path.join(artifacts,`axe-${name}.json`),JSON.stringify(r,null,2));assert.deepEqual(r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);scans.push({name,violations:0});}
/** Screen position of a world point from the diagnostics camera (plain look-at maths, no three import). */
async function screenOf(page,world){return page.evaluate((world)=>{const d=window.__AURA_DIAGNOSTICS__.camera,rect=document.querySelector('canvas').getBoundingClientRect();
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const f=norm(sub(d.target,d.position)),r=norm(cross(f,[0,1,0])),u=cross(r,f),p=sub(world,d.position),z=dot(p,f),t=Math.tan(d.fov*Math.PI/360);
  return {x:rect.x+(dot(p,r)/(z*t*(rect.width/rect.height))+1)*rect.width/2,y:rect.y+(1-dot(p,u)/(z*t))*rect.height/2};},world);}
const world=(local)=>HARDWARE_ORIGIN.map((v,i)=>v+local[i]);
const panel=page=>page.getByRole('complementary',{name:'Workstation equipment'});
const openInspector=async page=>{await page.getByRole('button',{name:'Equipment',exact:true}).click();await page.getByLabel('Choose equipment',{exact:true}).selectOption('hardware.pc');await panel(page).getByRole('button',{name:'Explode view',exact:true}).waitFor();await arrived(page,focusPose(null,false).target);};
const pressed=(page,name)=>panel(page).getByRole('button',{name,exact:true}).getAttribute('aria-pressed');
let page;
try{
  page=await open();
  const hub=await camera(page);
  await check('The assembled tower is part of the Hub at rest: merged geometry, no inspector, measured draw calls',async()=>{
    const s=await hw(page);assert.equal(s.detailMounted,false);assert.equal(s.progress,0);
    await page.waitForTimeout(1200);const r=await resources(page);measured.hubIdle=r;assert.ok(r.calls<=90,'Hub draw calls '+r.calls);
    await page.screenshot({path:path.join(artifacts,'hub-1440.png')});
  });
  const baseline=await resources(page);
  await check('Opening the Hardware PC frames the whole tower and shows the inspector with truthful, generic copy',async()=>{
    await openInspector(page);const p=panel(page);
    assert.equal(await page.locator('.experience').getAttribute('data-zone'),'studio','the logical workspace does not change');
    for(const c of SELECTABLE)await p.getByRole('button',{name:c.label,exact:true}).waitFor();
    assert.ok(await p.getByText('decorative and simulated',{exact:false}).isVisible());
    assert.equal((await hw(page)).detailMounted,true);
    const cam=await camera(page);assert.ok(dist(cam.target,focusPose(null,false).target)<0.05);assert.ok(dist(cam.position,cam.target)<1.4);
    await page.screenshot({path:path.join(artifacts,'inspect-overview-1440.png')});
  });
  await check('Selecting a component from the list frames it, names it and shows its five information fields',async()=>{
    for(const id of ['gpu','ram','psu']){
      const def=componentById(id);await panel(page).getByRole('button',{name:def.label,exact:true}).click();
      await arrived(page,focusPose(id,false).target);assert.equal(await pressed(page,def.label),'true');
      await panel(page).getByRole('heading',{name:def.label,exact:true}).waitFor();
      for(const term of ['Type','Purpose','Connections','Cooling','How it works'])await panel(page).locator('dt',{hasText:term}).waitFor();
      const cam=await camera(page);assert.ok(dist(cam.position,cam.target)>=Math.max(...def.size)*1.1,id+' fits in frame');
      if(id==='gpu')await page.screenshot({path:path.join(artifacts,'inspect-gpu-1440.png')});
    }
  });
  await check('Clicking a part in the scene selects it (real hit proxies, not the list)',async()=>{
    await panel(page).getByRole('button',{name:'Reset view',exact:true}).click();await arrived(page,focusPose(null,false).target);
    assert.equal(await pressed(page,'Graphics card'),'false');
    const at=await screenOf(page,world([0.075,0.19,-0.05]));await page.mouse.move(at.x,at.y);await page.mouse.click(at.x,at.y);
    await page.waitForFunction(()=>[...document.querySelectorAll('.equipment-panel [aria-pressed=true]')].some(b=>b.textContent==='Graphics card'));
    await arrived(page,focusPose('gpu',false).target);
    // The memory modules sit behind nothing: clicking them selects them, not the GPU in front of the board.
    await panel(page).getByRole('button',{name:'Reset view',exact:true}).click();await arrived(page,focusPose(null,false).target);
    const ram=await screenOf(page,world([-0.07,0.39,0.035]));await page.mouse.click(ram.x,ram.y);
    await page.waitForFunction(()=>[...document.querySelectorAll('.equipment-panel [aria-pressed=true]')].some(b=>b.textContent==='Memory modules'));
  });
  await check('Zoom and rotate stay bounded around the part; the camera never enters the case or the desk',async()=>{
    await panel(page).getByRole('button',{name:'Graphics card',exact:true}).click();await arrived(page,focusPose('gpu',false).target);
    const canvas=page.locator('canvas');const box=await canvas.boundingBox();const cx=box.x+box.width/2,cy=box.y+box.height/2;
    const before=await camera(page),d0=dist(before.position,before.target);
    await page.mouse.move(cx,cy);for(let i=0;i<6;i++){await page.mouse.wheel(0,-240);await page.waitForTimeout(120);}
    await page.waitForTimeout(400);const near=await camera(page),d1=dist(near.position,near.target);assert.ok(d1<d0-0.05,'zoom in moves closer');assert.ok(d1>=0.159,'minimum zoom distance respected: '+d1);
    for(let i=0;i<14;i++){await page.mouse.wheel(0,400);await page.waitForTimeout(80);}
    await page.waitForTimeout(400);const far=await camera(page);assert.ok(dist(far.position,far.target)<=1.31,'maximum zoom distance respected');
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-160,cy-40,{steps:12});await page.mouse.up();await page.waitForTimeout(500);
    const turned=await camera(page);assert.ok(dist(turned.position,far.position)>0.05,'drag rotates the view');
    assert.ok(dist(turned.target,far.target)<0.01,'rotation orbits the same part');
    assert.ok(turned.position[1]>0.9,'stays above the desk');
    await page.screenshot({path:path.join(artifacts,'inspect-rotated-1440.png')});
  });
  await check('Exploded view separates the parts, is reversible mid-way, and reassembles exactly',async()=>{
    await panel(page).getByRole('button',{name:'Reset view',exact:true}).click();await arrived(page,focusPose(null,false).target);
    await panel(page).getByRole('button',{name:'Explode view',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress>0.25);
    const mid=(await hw(page)).progress;assert.ok(mid>0&&mid<1);
    await panel(page).getByRole('button',{name:'Reassemble',exact:true}).click();                       // reverse mid-flight
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress<0.05,null,{timeout:60000});
    await panel(page).getByRole('button',{name:'Explode view',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===1,null,{timeout:60000});
    assert.equal(await pressed(page,'Reassemble'),'true');await arrived(page,focusPose(null,true).target);
    await page.screenshot({path:path.join(artifacts,'inspect-exploded-1440.png')});
    // The processor is hidden under the cooler until exploded: framing it while exploded is valid and clickable.
    await panel(page).getByRole('button',{name:'Processor',exact:true}).click();await arrived(page,focusPose('cpu',true).target);
    await page.screenshot({path:path.join(artifacts,'inspect-cpu-exploded-1440.png')});
    await panel(page).getByRole('button',{name:'Reassemble',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===0,null,{timeout:60000});
    await arrived(page,focusPose('cpu',false).target);
  });
  await check('Reset view returns to the overview, deselects and reassembles',async()=>{
    await panel(page).getByRole('button',{name:'Explode view',exact:true}).click();
    await panel(page).getByRole('button',{name:'Reset view',exact:true}).click();
    await arrived(page,focusPose(null,false).target);assert.equal(await pressed(page,'Explode view'),'false');
    assert.equal(await panel(page).locator('.hw-group [aria-pressed=true]').count(),0);
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===0,null,{timeout:60000});
  });
  await check('Controls are accessible: names, keyboard operation, no automated WCAG violations',async()=>{
    await panel(page).getByRole('button',{name:'CPU air cooler',exact:true}).focus();await page.keyboard.press('Enter');
    await arrived(page,focusPose('cooler',false).target);assert.equal(await pressed(page,'CPU air cooler'),'true');
    await scan(page,'inspector-1440');
  });
  await check('Escape peels back one level: the selected part first, then the whole inspection',async()=>{
    await panel(page).getByRole('button',{name:'CPU air cooler',exact:true}).focus();await page.keyboard.press('Escape');
    assert.equal(await pressed(page,'CPU air cooler'),'false');assert.equal(await panel(page).count(),1);
    await panel(page).getByRole('button',{name:'Graphics card',exact:true}).click();await arrived(page,focusPose('gpu',false).target);
    await page.locator('canvas').focus();await page.keyboard.press('Escape'); // focus on the 3D view
    assert.equal(await pressed(page,'Graphics card'),'false');
    await panel(page).getByRole('button',{name:'Reset view',exact:true}).focus();await page.keyboard.press('Escape');
    await panel(page).waitFor({state:'detached'});
  });
  await check('Exit restores the exact previous camera view and releases the per-part geometry',async()=>{
    await arrived(page,hub.target,0.02);await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled);
    const after=await camera(page);assert.ok(dist(after.position,hub.position)<0.02,'position '+dist(after.position,hub.position));assert.ok(dist(after.target,hub.target)<0.02);
    await page.waitForFunction(()=>!window.__AURA_HARDWARE__.state().detailMounted,null,{timeout:30000});
  });
  await check('Repeated open/close cycles do not leak GPU resources',async()=>{
    await page.waitForTimeout(800);const start=await resources(page);
    for(let i=0;i<3;i++){await openInspector(page);await panel(page).getByRole('button',{name:'Explode view',exact:true}).click();await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===1,null,{timeout:60000});
      await panel(page).getByRole('button',{name:'Return from equipment inspection',exact:true}).click();
      await page.waitForFunction(()=>!window.__AURA_HARDWARE__.state().detailMounted,null,{timeout:60000});await arrived(page,hub.target,0.02);}
    await page.waitForTimeout(1200);const end=await resources(page);measured.leak={baseline,start,end};
    assert.equal(end.geometries,start.geometries,'geometries');assert.equal(end.textures,start.textures,'textures');assert.equal(end.programs,start.programs,'programs');
  });
  await check('Other equipment keeps its original behaviour and closes hardware inspection',async()=>{
    await openInspector(page);await page.getByLabel('Choose equipment',{exact:true}).selectOption('software.pc');
    await panel(page).getByRole('button',{name:'Chassis & airflow',exact:true}).waitFor();
    assert.equal(await panel(page).getByRole('button',{name:'Explode view'}).count(),0);
    await page.waitForFunction(()=>!window.__AURA_HARDWARE__.state().detailMounted,null,{timeout:60000});
    await panel(page).getByRole('button',{name:'Return from equipment inspection',exact:true}).click();await arrived(page,hub.target,0.02);
  });
  await check('Laptop width: inspector fits without overflow and keeps the unsent draft',async()=>{
    await page.setViewportSize({width:1100,height:700});await page.getByRole('button',{name:'Restore Astra conversation',exact:true}).click();
    const draft=page.locator('#companion-prompt');await draft.fill('Hardware inspection keeps my draft');
    await openInspector(page);const b=await panel(page).boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1101&&b.y+b.height<=701);
    await panel(page).getByRole('button',{name:'Graphics card',exact:true}).click();await arrived(page,focusPose('gpu',false).target);
    await scan(page,'inspector-1100');await page.screenshot({path:path.join(artifacts,'inspect-gpu-1100.png')});
    await panel(page).getByRole('button',{name:'Return from equipment inspection',exact:true}).click();await arrived(page,hub.target,0.03);
    assert.equal(await draft.inputValue(),'Hardware inspection keeps my draft');
  });
  await check('Leaving through "Open hardware workspace" restores ordinary camera limits (regression: the inspection zoom cap must not outlive inspection)',async()=>{
    await openInspector(page);await panel(page).getByRole('button',{name:'Graphics card',exact:true}).click();await arrived(page,focusPose('gpu',false).target);
    await panel(page).getByRole('button',{name:'Open hardware workspace',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_DIAGNOSTICS__.world.phase==='idle'&&window.__AURA_DIAGNOSTICS__.cameraSettled&&document.querySelector('.experience').dataset.zone==='hardware',null,{timeout:120000});
    await page.waitForTimeout(800);const cam=await camera(page);
    assert.ok(dist(cam.position,cam.target)>1.6,'workspace framing is not clamped to the 1.3 m inspection maximum: '+dist(cam.position,cam.target));
  });
  await page.context().close();

  await check('Reduced motion: view changes apply at once, fans and lighting hold still',async()=>{
    page=await open({reduced:true});await openInspector(page);
    const a=await hw(page);await page.waitForTimeout(700);const b=await hw(page);assert.equal(a.spin,b.spin,'no spin under reduced motion');
    await panel(page).getByRole('button',{name:'Explode view',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===1,null,{timeout:8000});
    await panel(page).getByRole('button',{name:'Reassemble',exact:true}).click();
    await page.waitForFunction(()=>window.__AURA_HARDWARE__.state().progress===0,null,{timeout:8000});
    assert.ok(await panel(page).getByText('Reduced motion',{exact:false}).isVisible());
    await page.context().close();
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS no page errors or external runtime requests');
}catch(e){console.error(e);for(const context of browser.contexts())for(const p of context.pages())await p.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,scans,errors,external,measured},null,2));await browser.close();}
