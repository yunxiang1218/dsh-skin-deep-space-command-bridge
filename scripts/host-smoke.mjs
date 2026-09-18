// Run the installed DSH runtime against an isolated workspace-owned profile.
// The existing desktop profile, credentials and original skin are never edited.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, symlink, access, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {installPerformanceProbe,startPerformanceSample,finishPerformanceSample} from './performance-smoke.mjs';
import {startFrameTrace} from './trace-performance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultsRoot = join(root, 'test-results');
const hardware=process.argv.includes('--hardware'),uncapped=process.argv.includes('--uncapped'),headed=process.argv.includes('--headed');
const browserArgs=[...(hardware?['--use-angle=d3d11','--enable-gpu']:[]),...(uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[])];
const resources = process.env.DSH_DESKTOP_RESOURCES || join(process.env.LOCALAPPDATA, 'Programs', 'DSH Desktop', 'resources');
const bundledModules = join(resources, 'app', 'node_modules');
const runtime = join(bundledModules, 'node', 'bin', 'node.exe');
const cli = join(bundledModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const skin = JSON.parse(await readFile(join(root, 'skin.json'), 'utf8'));
const sceneCatalog=JSON.parse(await readFile(join(root,'assets','resource','scenes','manifest.json'),'utf8')).scenes;
assert.equal(sceneCatalog.length,4,'Four distinct universe scenes are supplied');
assert.equal(new Set(sceneCatalog.map(scene=>scene.id)).size,4);
const sceneImages=await Promise.all(sceneCatalog.map(async scene=>{
  const bytes=await readFile(join(root,'assets','resource',scene.detailFile || scene.file));
  return {id:scene.id,suffix:bytes.toString('base64').slice(-128),width:scene.detailWidth || scene.width,height:scene.detailHeight || scene.height};
}));
const artImages=await Promise.all(sceneCatalog.map(async scene=>({id:scene.id,
  suffix:(await readFile(join(root,'assets','resource',scene.file))).toString('base64').slice(-128),width:scene.width,height:scene.height})));
await access(join(root, 'lib', 'client.js'));
await access(runtime);
await mkdir(resultsRoot, { recursive: true });
const runDir = await mkdtemp(join(resultsRoot, 'real-host-'));
const isolatedHome = join(runDir, 'harness');
const profileDir = join(isolatedHome, 'profiles', 'web');
const packageLink = join(profileDir, 'node_modules', ...manifest.name.split('/'));
await mkdir(dirname(packageLink), { recursive: true });
await symlink(root, packageLink, 'junction');
await writeFile(join(profileDir, 'package.json'), JSON.stringify({
  name: 'dsh-isolated-theme-smoke', private: true,
  dependencies: { [manifest.name]: `file:${root.replaceAll('\\', '/')}` },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', manifest.name], patchReload: 'live' } },
}, null, 2));
await writeFile(join(profileDir, 'cordis.yml'), '[]\n');
const patchPath = join(profileDir, 'cordis.patch.yml');
await writeFile(patchPath, '[]\n');
const browserPatch = join(runDir, 'browser-preview.patch.yml');
await writeFile(browserPatch, `- id: directory-picker
  disabled: true
- insert:
    - id: preview-directory-picker-browse-host
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: preview-directory-picker-browse-client
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
`);

let rawLog = '';
let authenticatedUrl;
const pageErrors = [];
const failedRequests = [];
const redact = (value) => String(value).replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, '$1?[redacted]');
const child = spawn(runtime, ['--expose-internals', cli, 'web', '--patch', browserPatch, '--no-open', '--host', '127.0.0.1', '--port', '0'], {
  cwd: root,
  env: { ...process.env, DSH_HOME: isolatedHome, DSH_TELEMETRY_DISABLED: '1' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const ingest = (chunk) => {
  rawLog += chunk.toString();
  const match = rawLog.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+[^\s]*)/);
  if (match) authenticatedUrl = match[1];
};
child.stdout.on('data', ingest);
child.stderr.on('data', ingest);
let browser;
let page;
let report = { package: manifest.name, version:manifest.version,isolatedHome, installedRuntime: runtime, success: false,browserRun:{headless:!headed,hardwareRequested:hardware,uncappedThroughput:uncapped,args:browserArgs,physical144HzVerified:false} };
try {
  const deadline = Date.now() + 45000;
  while (!authenticatedUrl) {
    if (child.exitCode !== null) throw new Error(`Isolated DSH host exited ${child.exitCode}: ${redact(rawLog).slice(-5000)}`);
    if (Date.now() > deadline) throw new Error(`Isolated DSH host did not become ready: ${redact(rawLog).slice(-5000)}`);
    await new Promise((done) => setTimeout(done, 150));
  }
  browser = await chromium.launch({ headless: !headed,args:browserArgs });
  page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  await installPerformanceProbe(page,{headless:!headed});
  await page.addInitScript(()=>{
    window.__dscDecodedImages=[];
    window.__dscWorkerEvents=[];
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);this.addEventListener('message',({data})=>this.record('received',data));}
      record(direction,data){
        const {type,id,key,y,rows,width,height,message}=data||{};
        window.__dscWorkerEvents.push({at:performance.now(),direction,type,id,key,y,rows,width,height,message});
        if(window.__dscWorkerEvents.length>80)window.__dscWorkerEvents.shift();
      }
      postMessage(data,...rest){this.record('sent',data);return super.postMessage(data,...rest);}
    };
    const decode=HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode=function(){return decode.call(this).then(()=>{
      if(this.src.startsWith('data:'))window.__dscDecodedImages.push({suffix:this.src.slice(-128),width:this.naturalWidth,height:this.naturalHeight});
    });};
  });
  page.on('pageerror', (error) => pageErrors.push(redact(error.message)));
  page.on('requestfailed', (request) => failedRequests.push({ url: redact(request.url()), error: request.failure()?.errorText }));
  await page.goto(authenticatedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction((attr) => document.body.hasAttribute(attr), skin.bodyAttr, { timeout: 30000 });
  await page.waitForSelector('[data-composer-input]', {timeout:30000});
  await page.waitForSelector('.dsc-space-controls',{state:'attached'});
  report.gpu=await page.locator('.dsc-space-environment').evaluate(environment=>{
    const canvas=environment.querySelector('.dsc-space-canvas-gpu');
    const context=canvas?.getContext('webgl2');
    const debug=context?.getExtension('WEBGL_debug_renderer_info');
    return {themeRenderer:environment.dataset.renderer,contextAvailable:Boolean(context),
      renderer:debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      vendor:debug?context.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,
      version:context?.getParameter(context.VERSION)||null};
  });
  await page.waitForFunction(expected=>expected.every(scene=>window.__dscDecodedImages.some(image=>image.suffix===scene.suffix&&image.width===scene.width&&image.height===scene.height)),sceneImages,{timeout:30000});
  const decodedSceneIds=sceneImages.map(scene=>scene.id);
  if(hardware) {
    await page.waitForFunction(()=>document.querySelector('.dsc-space-environment')?.dataset.backgroundRenderer==='webgl2',{},{timeout:30000});
    report.backgroundRenderer='webgl2-worker-strip-upload';
  }
  assert.equal(await page.locator('details.dsc-signature').count(),1,'There is one theme signature');
  assert.match(await page.locator('details.dsc-signature>summary').innerText(),/yunxiang/);
  assert.equal(await page.locator('.dsc-header,.dsc-viewport-caption,.dsc-bottom,.dsc-image-credit').count(),0,'Old repeated title and watermark layers are removed');
  const notice = page.getByRole('dialog').filter({hasText:'内测声明'});
  await notice.waitFor({state:'visible',timeout:15000});
  await notice.getByRole('button',{name:'继续',exact:true}).click();
  const setup = page.getByRole('dialog').filter({hasText:'接入模型提供方'});
  await setup.waitFor({state:'visible',timeout:15000});
  await setup.getByRole('button',{name:'稍后配置',exact:true}).click();
  await setup.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));

  // Adopt a real workspace through the official browser directory picker.
  await page.getByRole('button',{name:'添加工作区',exact:true}).click();
  const directoryDialog = page.getByRole('dialog').filter({hasText:'选择工作区目录'});
  await directoryDialog.waitFor({state:'visible'});
  await directoryDialog.getByRole('button',{name:'编辑路径',exact:true}).click();
  await directoryDialog.getByRole('textbox',{name:'编辑路径',exact:true}).fill(root);
  await directoryDialog.getByRole('textbox',{name:'编辑路径',exact:true}).press('Enter');
  await directoryDialog.getByRole('button',{name:'打开',exact:true}).click();
  await directoryDialog.waitFor({state:'hidden'});
  await page.waitForFunction((workspace) => document.querySelector('[data-dsc-mission="workspace"]')?.textContent?.toLowerCase().includes(workspace.toLowerCase()), root);
  await page.getByRole('button',{name:'新建会话',exact:true}).filter({hasText:'新会话'}).click();
  await page.waitForFunction(() => ['blank','ready'].includes(document.querySelector('[data-dsc-status="agent"]')?.dataset.value), undefined, {timeout:20000});
  const editor = page.locator('[data-composer-input]');
  const draft = '梳理当前工作区的目录结构，并列出需要优先检查的模块。';
  await editor.fill(draft);
  assert.equal(await editor.innerText(), draft, 'The real native composer accepts an unsent draft');
  const nativeEditor = await editor.elementHandle();
  const commandPanel=page.locator('[data-dsc-screen="command"]');
  const originalRootHeight = await commandPanel.evaluate(node=>node.getBoundingClientRect().height);
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  assert.ok(await commandPanel.evaluate(node=>node.getBoundingClientRect().height)>originalRootHeight+150, 'Floating the main screen expands the actual conversation area');
  assert.equal(await nativeEditor.evaluate(node=>node===document.querySelector('[data-composer-input]')),true, 'Work view retains the same native editor node');
  assert.equal(await editor.innerText(),draft);
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  for(const id of ['mission','command','core']) {
    const button=page.locator(`[data-dsc-dock-toggle="${id}"]`),panel=page.locator(`[data-dsc-screen="${id}"]`);
    await button.click();
    assert.equal(await panel.getAttribute('data-dsc-floating'),'true');
    assert.match(await panel.evaluate(node=>getComputedStyle(node).transform),/^matrix\(1, 0, 0, 1, /,'A detached screen is flat and translated');
    assert.equal(await nativeEditor.evaluate(node=>node===document.querySelector('[data-composer-input]')),true);
    if(id==='command')await page.screenshot({path:join(runDir,'host-floating.png'),animations:'disabled'});
    await button.click();
    assert.equal(await panel.getAttribute('data-dsc-floating'),'false');
    assert.match(await panel.evaluate(node=>getComputedStyle(node).transform),/^matrix/);
    assert.equal(await editor.innerText(),draft);
  }

  const floatingLayouts=[];
  const screenBounds=()=>page.locator('[data-dsc-screen]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>{
    const r=node.getBoundingClientRect();return [node.dataset.dscScreen,{x:r.x,y:r.y,width:r.width,height:r.height}];
  })));
  for(const id of ['mission','command','core'])await page.locator(`[data-dsc-dock-toggle="${id}"]`).click();
  for(const [width,height] of [[1100,700],[1366,768],[1536,960],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const panels=await screenBounds(),rows=Object.values(panels);
    for(const r of rows)assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`All floated screens fit at ${width}px`);
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++) {
      const a=rows[i],b=rows[j];assert.ok(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1,`Three floated screens never overlap by default at ${width}px`);
    }
    floatingLayouts.push({width,height,panels});
  }
  await page.setViewportSize({width:1536,height:960});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:join(runDir,'host-three-floating.png'),animations:'disabled'});
  const performanceSamples=[],dragSample=await startPerformanceSample(page,'three-floating-screen-drag');
  const handle=await commandPanel.locator('.dsc-screen-toolbar').boundingBox(),beforeDrag=await commandPanel.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  for(let i=1;i<=60;i++)await page.mouse.move(handle.x+handle.width/2+60*i/60,handle.y+handle.height/2+25*i/60);
  await page.mouse.up();
  performanceSamples.push(await finishPerformanceSample(page,dragSample));
  const afterDrag=await commandPanel.boundingBox();
  assert.ok(Math.abs(afterDrag.x-beforeDrag.x-60)<1&&Math.abs(afterDrag.y-beforeDrag.y-25)<1,'A native DSH window follows its dragged toolbar');
  assert.equal(await nativeEditor.evaluate(node=>node===document.querySelector('[data-composer-input]')),true);
  assert.equal(await editor.innerText(),draft,'Floating-window movement preserves the native draft');
  for(const id of ['mission','command','core'])await page.locator(`[data-dsc-dock-toggle="${id}"]`).click();

  const modeControl = page.locator('[data-dsc-control="mode"]');
  let modeCheck = { available: await modeControl.isEnabled(), switched: false };
  if (modeCheck.available) {
    await modeControl.selectOption('plan');
    await page.waitForFunction(() => document.querySelector('[data-dsc-control="mode"]')?.value === 'plan' && !document.querySelector('[data-dsc-control="mode"]')?.disabled);
    await modeControl.selectOption('agent');
    await page.waitForFunction(() => document.querySelector('[data-dsc-control="mode"]')?.value === 'agent' && !document.querySelector('[data-dsc-control="mode"]')?.disabled);
    modeCheck.switched = true;
  } else {
    modeCheck.reason = await modeControl.innerText();
    assert.ok(modeCheck.reason.trim(), 'Unavailable Plan/Agent control must explain its state');
  }
  const modelControl = page.locator('[data-dsc-control="model"]');
  const modelUnavailable = await modelControl.innerText();
  const modelUnavailableDetail = await modelControl.getAttribute('title');
  assert.ok(!modelUnavailableDetail?.includes('without inject'), 'Model directory must resolve inside the real Cordis caller context');
  assert.ok(modelUnavailable.trim(), 'Unconfigured models must have a visible unavailable label');
  const modelCheck = {enabled:await modelControl.isEnabled(), options:await modelControl.locator('option').count(), changed:false, thinkingChanged:false};
  if(modelCheck.enabled) {
    const original = await modelControl.inputValue();
    const alternative = await modelControl.locator('option').evaluateAll((nodes,current)=>nodes.map(node=>node.value).find(value=>value!==current),original);
    if(alternative) {
      await modelControl.selectOption(alternative);
      await page.waitForFunction(value=>document.querySelector('[data-dsc-control="model"]')?.value===value && !document.querySelector('[data-dsc-control="model"]')?.disabled,alternative);
      await modelControl.selectOption(original);
      await page.waitForFunction(value=>document.querySelector('[data-dsc-control="model"]')?.value===value && !document.querySelector('[data-dsc-control="model"]')?.disabled,original);
      modelCheck.changed=true;
    }
    const thinking=page.locator('[data-dsc-control="thinking"]');
    if(await thinking.isEnabled()) {
      const originalEffort=await thinking.inputValue();
      const alternativeEffort=await thinking.locator('option').evaluateAll((nodes,current)=>nodes.map(node=>node.value).find(value=>value!==current),originalEffort);
      if(alternativeEffort) {
        await thinking.selectOption(alternativeEffort);
        await page.waitForFunction(value=>document.querySelector('[data-dsc-control="thinking"]')?.value===value && !document.querySelector('[data-dsc-control="thinking"]')?.disabled,alternativeEffort);
        await thinking.selectOption(originalEffort);
        await page.waitForFunction(value=>document.querySelector('[data-dsc-control="thinking"]')?.value===value && !document.querySelector('[data-dsc-control="thinking"]')?.disabled,originalEffort);
        modelCheck.thinkingChanged=true;
      }
    }
  }
  assert.equal(await page.locator('.dsc-action-error').isVisible(),false,'Dashboard actions must be acknowledged without error');

  // Open and close the native settings panel, preserving the actual draft.
  await page.getByRole('button',{name:'设置',exact:true}).click();
  const settingsDialog = page.getByRole('dialog');
  await settingsDialog.waitFor({state:'visible'});
  const settingsBounds=await settingsDialog.boundingBox();
  assert.ok(settingsBounds.width>500,'Native settings is not trapped inside the perspective monitor');
  await page.keyboard.press('Escape');
  await settingsDialog.waitFor({state:'hidden'});
  assert.equal(await editor.innerText(), draft, 'Settings must preserve the unsent native draft');

  const flight = page.locator('.dsc-space-controls');
  assert.equal(await flight.isVisible(),false,'Flight controls start collapsed to keep the window clear');
  await page.getByRole('button',{name:'展开飞行控制',exact:true}).click();
  const imagery = flight.getByRole('combobox',{name:'舷窗影像',exact:true});
  assert.equal(await imagery.inputValue(),'photo','High-resolution originals are selected by default');
  await imagery.selectOption('art');
  await page.waitForFunction(()=>document.querySelector('.dsc-space-environment').dataset.skyQuality==='art');
  await page.waitForFunction(expected=>expected.every(scene=>window.__dscDecodedImages.some(image=>image.suffix===scene.suffix&&image.width===scene.width&&image.height===scene.height)),artImages);
  await page.screenshot({path:join(runDir,'host-artwork.png'),animations:'disabled'});
  await imagery.selectOption('photo');
  await page.waitForFunction(()=>document.querySelector('.dsc-space-environment').dataset.skyQuality==='photo');
  report.hdImagery={default:'photo',artworkSwitch:true,decodedPhotos:sceneImages.map(({id,width,height})=>({id,width,height})),continuousPanorama:true};
  await flight.getByRole('button',{name:'巡航',exact:true}).click();
  assert.equal(await flight.getByRole('button',{name:'巡航',exact:true}).getAttribute('aria-pressed'), 'true');
  const throttle=flight.getByRole('slider',{name:'航行速度',exact:true});
  const setThrottle=value=>throttle.evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);
  assert.equal(await flight.locator('.dsc-space-speed-button,.dsc-distance-slider').count(),0,'Old speed buttons and distance slider are removed');
  for(const [value,speed] of [[.12,'slow'],[.56,'fast'],[1,'warp'],[.12,'slow']]) {
    await setThrottle(value);
    assert.equal(await page.locator('.dsc-space-environment').getAttribute('data-speed'),speed);
  }
  const stopWarpTrace=process.argv.includes('--trace') ? await startFrameTrace(page) : null;
  const warpSample=await startPerformanceSample(page,'warp-and-random-scene-crossfade');
  const jumpEvidence=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const environment=document.querySelector('.dsc-space-environment'),slider=document.querySelector('.dsc-speed-slider');
    const from=environment.dataset.scene,start=performance.now();let firstFadeAt=null,minimumCoverage=1,frames=0;
    slider.value='1';slider.dispatchEvent(new Event('input',{bubbles:true}));
    const frame=()=>{
      const elapsed=performance.now()-start,opacity=[...document.querySelectorAll('.dsc-space-nebula')].map(node=>Number(getComputedStyle(node).opacity));
      minimumCoverage=Math.min(minimumCoverage,Math.max(...opacity));frames++;
      if(firstFadeAt===null&&opacity.some(value=>value>.001&&value<.999))firstFadeAt=elapsed;
      if(environment.dataset.scene!==from&&environment.dataset.speed==='fast')return resolve({from,to:environment.dataset.scene,firstFadeAt,finishedAt:elapsed,minimumCoverage,frames,returnedTo:'fast'});
      if(elapsed>18000)return reject(Error(`Warp did not advance scene: ${environment.dataset.scene}, ${environment.dataset.speed}; visibility=${document.visibilityState}; worker=${JSON.stringify(window.__dscWorkerEvents)}`));
      requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  }));
  performanceSamples.push(await finishPerformanceSample(page,warpSample));
  if(stopWarpTrace) await writeFile(join(runDir,'warp-trace.json'),JSON.stringify(await stopWarpTrace()));
  assert.ok(jumpEvidence.firstFadeAt>=4950,'A continuous warp dwell must last five seconds before the transition starts');
  assert.ok(jumpEvidence.finishedAt-jumpEvidence.firstFadeAt>=1400,'The sky change is a gradual crossfade');
  assert.ok(jumpEvidence.minimumCoverage>=.999,'The transition never exposes a black background between images');
  assert.notEqual(jumpEvidence.to,jumpEvidence.from,'Random travel excludes the current scene');
  assert.ok(sceneCatalog.some(scene=>scene.id===jumpEvidence.from)&&sceneCatalog.some(scene=>scene.id===jumpEvidence.to),'Warp uses one of the actual four packaged scenes');
  await writeFile(join(runDir,'warp-transition.json'),JSON.stringify(jumpEvidence,null,2));
  assert.equal(await throttle.inputValue(),'0.56','A completed warp returns the throttle to fast');
  await page.screenshot({path:join(runDir,'host-arrival.png'),animations:'disabled'});
  // Capture the tunnel before its five-second trigger without changing the timer.
  await setThrottle(1);await page.waitForTimeout(2200);
  await page.screenshot({path:join(runDir,'host-warp.png'),animations:'disabled'});await setThrottle(.12);
  await flight.getByRole('button',{name:'停泊',exact:true}).click();
  await page.waitForTimeout(9000);
  assert.equal(await flight.getByRole('button',{name:'停泊',exact:true}).getAttribute('aria-pressed'), 'true');
  const lookPad = flight.getByRole('button',{name:/拖动观察整个船舱/});
  const initialView=await flight.locator('.dsc-space-readout').innerText();
  await lookPad.focus();
  await lookPad.press('ArrowRight');
  const changedView = await flight.locator('.dsc-space-readout').innerText();
  assert.notEqual(changedView,initialView,'Viewport direction keys change the visual camera');
  const padBox = await lookPad.boundingBox();
  assert.ok(padBox.width<=100&&padBox.height<=50,'The cabin-view button stays compact');
  const traceCamera=process.argv.includes('--trace-camera');
  const stopCabinTrace=traceCamera ? await startFrameTrace(page) : null;
  const cabinSample=await startPerformanceSample(page,'cabin-look-drag');
  await page.mouse.move(padBox.x+padBox.width/2,padBox.y+padBox.height/2);
  await page.mouse.down();
  const dragStart=Date.now();
  for(let i=1;i<=120||(traceCamera&&Date.now()-dragStart<5000);i++)await page.mouse.move(padBox.x+padBox.width/2+Math.sin(i/20)*50,padBox.y+padBox.height/2-Math.sin(i/27)*15);
  await page.mouse.up();
  performanceSamples.push(await finishPerformanceSample(page,cabinSample));
  if(stopCabinTrace) await writeFile(join(runDir,'cabin-trace.json'),JSON.stringify(await stopCabinTrace()));
  assert.notEqual(await flight.locator('.dsc-space-readout').innerText(),changedView,'Pointer dragging changes the visual camera');
  await flight.getByRole('button',{name:'复位',exact:true}).click();
  const panorama=page.locator('.dsc-space-panorama');
  const beforeDistance={screen:await commandPanel.evaluate(node=>getComputedStyle(node).transform),space:await panorama.evaluate(node=>node.style.transform)};
  await lookPad.hover();for(let i=0;i<6;i++)await page.mouse.wheel(0,160);
  await page.waitForFunction(()=>document.querySelector('.dsc-distance-value')?.textContent==='1.60×');
  assert.notEqual(await commandPanel.evaluate(node=>getComputedStyle(node).transform),beforeDistance.screen,'Distance moves the cockpit display');
  assert.equal(await panorama.evaluate(node=>node.style.transform),beforeDistance.space,'Distance does not zoom the external galaxy');
  await page.screenshot({path:join(runDir,'host-cabin-far.png'),animations:'disabled'});
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  const floatingBounds=await commandPanel.boundingBox();
  await lookPad.hover();for(let i=0;i<8;i++)await page.mouse.wheel(0,-160);
  await page.waitForFunction(()=>document.querySelector('.dsc-distance-value')?.textContent==='0.70×');
  assert.deepEqual(await commandPanel.boundingBox(),floatingBounds,'Floated working screen stays the same size and position during cabin zoom');
  const distanceBeforeNativeScroll=await flight.locator('.dsc-distance-value').innerText();
  await editor.hover();await page.mouse.wheel(0,200);await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await flight.locator('.dsc-distance-value').innerText(),distanceBeforeNativeScroll,'Scrolling native work content never zooms the cabin');
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  assert.equal(await panorama.evaluate(node=>node.style.transform),beforeDistance.space,'Near cockpit distance also leaves galaxy depth unchanged');
  await page.screenshot({path:join(runDir,'host-cabin-near.png'),animations:'disabled'});
  assert.equal(await editor.innerText(),draft,'Flight controls preserve the native draft');
  await flight.getByRole('button',{name:'复位',exact:true}).click();
  assert.equal(await flight.locator('.dsc-space-readout').innerText(),'+0° / +0°');
  const sceneBeforeTurn=await panorama.evaluate(n=>n.style.transform);
  const cockpitBeforeTurn=await page.locator('.dsc-cabin-front').evaluate(n=>n.style.transform);
  for(const [name,key] of [['right','ArrowRight'],['left','ArrowLeft'],['up','ArrowUp'],['down','ArrowDown']]) {
    await lookPad.focus();
    for(let i=0;i<6;i++)await lookPad.press(`Shift+${key}`);
    assert.notEqual(await page.locator('.dsc-cabin-front').evaluate(n=>n.style.transform),cockpitBeforeTurn,'Head turns move the entire cabin');
    assert.equal(await panorama.evaluate(n=>n.style.transform),sceneBeforeTurn,'Head turns are not background-only movement');
    assert.equal(await page.locator('.dsc-cabin-wall').count(),4,'Continuous walls, floor and ceiling enclose the front');
    await page.screenshot({path:join(runDir,`host-look-${name}.png`),animations:'disabled'});
    await flight.getByRole('button',{name:'复位',exact:true}).click();
  }
  await page.getByRole('button',{name:'收起飞行控制',exact:true}).click();
  await page.getByRole('button',{name:'抬头观景',exact:true}).click();
  await page.screenshot({path:join(runDir,'host-observation.png'),animations:'disabled'});
  await page.getByRole('button',{name:'返回驾驶台',exact:true}).click();
  await writeFile(join(runDir,'performance.json'),JSON.stringify({samples:performanceSamples,physical144HzVerified:false},null,2));

  const geometry = async () => page.evaluate(() => {
    const editor = document.querySelector('[data-composer-input]');
    const composer = editor?.closest('[data-composer-card]') || editor;
    const core = document.querySelector('.dsc-core');
    const rect = (node) => { const r=node?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null; };
    const a=rect(composer), b=rect(core);
    const sidebar=rect(document.querySelector('#root [class*="sidebarCol"]'));
    const center=rect(document.querySelector('#root [class*="centerCol"]'));
    const sidebarOverlap=Boolean(sidebar && center && sidebar.right>center.x+1);
    const coreVisible=core && getComputedStyle(core).display!=='none' && b.width>0 && b.height>0;
    const overlap=Boolean(a && b && coreVisible && a.x<b.right && a.right>b.x && a.y<b.bottom && a.bottom>b.y);
    const e=editor?.getBoundingClientRect();
    const point=e ? document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,e.x+e.width/2)),Math.min(innerHeight-1,Math.max(0,e.y+e.height/2))) : null;
    return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,composer:a,core:coreVisible?b:null,overlap,sidebarOverlap,editorUncovered:!!(point && (editor===point || editor.contains(point)))};
  });
  const layouts=[];
  for (const [width,height] of [[3840,2160],[1536,960],[1366,768],[1280,960],[768,960],[390,844]]) {
    await page.setViewportSize({width,height});
    await editor.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getAnimations().filter(a=>a.effect?.target?.closest?.('#root')).every(a=>a.playState!=='running'));
    const layout=await geometry();
    assert.ok(layout.scrollWidth<=width+1, `No horizontal overflow at ${width}px`);
    assert.equal(layout.overlap,false, `AI panel must not cover the composer at ${width}px`);
    assert.equal(layout.sidebarOverlap,false, `Native sidebar must not overlap the center at ${width}px`);
    assert.equal(layout.editorUncovered,true, `Native editor must remain clickable at ${width}px`);
    layouts.push(layout);
    if(width===3840) {
      // A large viewport resize also queues GPU raster tiles, after layout is ready.
      await page.waitForTimeout(700);
      await page.screenshot({path:join(runDir,'host-4k.png'),fullPage:true});
    }
    if(width===1366) await page.screenshot({path:join(runDir,'host-laptop.png'),fullPage:true});
    if(width===390) await page.screenshot({path:join(runDir,'host-mobile.png'),fullPage:true});
  }
  await page.setViewportSize({width:1536,height:960});
  await editor.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-dsh-sidebar-wide="true"]'));
  await page.waitForFunction(() => document.getAnimations().filter(a=>a.effect?.target?.closest?.('#root')).every(a=>a.playState!=='running'));
  await writeFile(join(runDir,'workspace-ready-text.txt'),await page.locator('body').innerText());
  const snapshot = await page.evaluate(({ packageName, bodyAttr }) => ({
    moduleInGraph: JSON.stringify(window.__DSH_BOOT__).includes(packageName),
    moduleLoaderReady: typeof window.__ModuleLoader__?.load === 'function',
    activated: document.body.hasAttribute(bodyAttr),
    inputs: document.querySelectorAll('[contenteditable="true"], textarea, [data-composer-input]').length,
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    background: getComputedStyle(document.body).backgroundColor,
  }), { packageName: manifest.name, bodyAttr: skin.bodyAttr });
  assert.equal(snapshot.moduleInGraph, true, 'Independent package must appear in the official host boot graph');
  assert.equal(snapshot.moduleLoaderReady, true);
  assert.equal(snapshot.activated, true);
  await page.screenshot({ path: join(runDir, 'host-desktop.png'), fullPage: true, animations:'disabled' });

  // DSH 0.1.2-rc.1 rebuilds the host graph on patch changes but the browser's
  // graph HMR branch is a no-op. Reload only after the authoritative new
  // index reflects the enabled state; do not claim live client graph removal.
  const waitForGraph = async (enabled) => {
    const end=Date.now()+20000;
    while(Date.now()<end) {
      const response=await page.request.get(new URL('/',authenticatedUrl).href);
      if((await response.text()).includes(manifest.name)===enabled)return;
      await new Promise(done=>setTimeout(done,200));
    }
    throw new Error(`Host boot graph did not become ${enabled?'enabled':'disabled'}`);
  };
  await writeFile(patchPath, `- id: ${skin.wiring.id}\n  disabled: true\n`);
  await waitForGraph(false);
  await page.reload();
  await page.waitForFunction((attr) => !document.body.hasAttribute(attr), skin.bodyAttr, { timeout: 20000 });
  const disabled = await page.evaluate((attr) => !document.body.hasAttribute(attr), skin.bodyAttr);
  await page.waitForSelector('[data-composer-input]');
  assert.equal(await page.locator('[data-skin-owner="deep-space-command-bridge"]').count(),0,'Disabled page has no theme-owned UI nodes');
  await writeFile(patchPath, `- id: ${skin.wiring.id}\n  disabled: false\n`);
  await waitForGraph(true);
  await page.reload();
  await page.waitForFunction((attr) => document.body.hasAttribute(attr), skin.bodyAttr, { timeout: 20000 });
  assert.deepEqual(pageErrors, [], 'Browser runtime errors during real-host activation/disposal');
  await mkdir(join(root,'preview'),{recursive:true});
  await copyFile(join(runDir,'host-desktop.png'),join(root,'preview','bridge.png'));
  report = { ...report, success: true, snapshot, realWorkspace:root, createdSession:true, unsentDraft:true, modelUnavailable, modelUnavailableDetail, modelCheck, modeCheck, nativeSettings:true, flightControls:true, pointerDrag:true, distanceControl:'wheel', cockpitDistanceNotScenery:true, floatingStableDuringCabinZoom:true, threeDockableScreens:true, threeSpeeds:'continuous slider with three bands', workViewPreservesEditor:true, threeFloatingWithoutOverlap:true,floatingWindowDrag:true,floatingLayouts,decodedSceneIds,jumpEvidence,uniqueYunxiangSignature:true,performanceSamples,physical144HzVerified:false,layouts, disabledThenReenabledWithReload: disabled, pageErrors, failedRequests };
} catch (error) {
  if (page) {
    await page.screenshot({path:join(runDir,'failure.png'),fullPage:true}).catch(()=>{});
    await writeFile(join(runDir,'failure-text.txt'),await page.locator('body').innerText().catch(()=>''));
  }
  report = { ...report, error: redact(error.stack || error), pageErrors, failedRequests };
  process.exitCode = 1;
} finally {
  await browser?.close();
  child.kill();
  await writeFile(join(runDir, 'host.log'), redact(rawLog));
  await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: report.success, report: join(runDir, 'report.json'), ...(report.error ? { error: report.error } : {}) }, null, 2));
}
