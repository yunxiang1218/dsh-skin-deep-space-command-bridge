// Run the installed DSH runtime against an isolated workspace-owned profile.
// The existing desktop profile, credentials and original skin are never edited.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, symlink, access, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultsRoot = join(root, 'test-results');
const resources = process.env.DSH_DESKTOP_RESOURCES || join(process.env.LOCALAPPDATA, 'Programs', 'DSH Desktop', 'resources');
const bundledModules = join(resources, 'app', 'node_modules');
const runtime = join(bundledModules, 'node', 'bin', 'node.exe');
const cli = join(bundledModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const skin = JSON.parse(await readFile(join(root, 'skin.json'), 'utf8'));
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
let report = { package: manifest.name, isolatedHome, installedRuntime: runtime, success: false };
try {
  const deadline = Date.now() + 45000;
  while (!authenticatedUrl) {
    if (child.exitCode !== null) throw new Error(`Isolated DSH host exited ${child.exitCode}: ${redact(rawLog).slice(-5000)}`);
    if (Date.now() > deadline) throw new Error(`Isolated DSH host did not become ready: ${redact(rawLog).slice(-5000)}`);
    await new Promise((done) => setTimeout(done, 150));
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', (error) => pageErrors.push(redact(error.message)));
  page.on('requestfailed', (request) => failedRequests.push({ url: redact(request.url()), error: request.failure()?.errorText }));
  await page.goto(authenticatedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction((attr) => document.body.hasAttribute(attr), skin.bodyAttr, { timeout: 30000 });
  await page.waitForSelector('[data-composer-input]', {timeout:30000});
  await page.waitForSelector('.dsc-space-controls',{state:'attached'});
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
  await page.getByRole('button',{name:'展开工作区',exact:true}).click();
  assert.ok(await commandPanel.evaluate(node=>node.getBoundingClientRect().height)>originalRootHeight+150, 'Floating the main screen expands the actual conversation area');
  assert.equal(await nativeEditor.evaluate(node=>node===document.querySelector('[data-composer-input]')),true, 'Work view retains the same native editor node');
  assert.equal(await editor.innerText(),draft);
  await page.getByRole('button',{name:'返回舰桥',exact:true}).click();
  for(const id of ['mission','command','core']) {
    const button=page.locator(`[data-dsc-dock-toggle="${id}"]`),panel=page.locator(`[data-dsc-screen="${id}"]`);
    await button.click();
    assert.equal(await panel.getAttribute('data-dsc-floating'),'true');
    assert.equal(await panel.evaluate(node=>getComputedStyle(node).transform),'none');
    assert.equal(await nativeEditor.evaluate(node=>node===document.querySelector('[data-composer-input]')),true);
    if(id==='command')await page.screenshot({path:join(runDir,'host-floating.png'),animations:'disabled'});
    await button.click();
    assert.equal(await panel.getAttribute('data-dsc-floating'),'false');
    assert.match(await panel.evaluate(node=>getComputedStyle(node).transform),/^matrix/);
    assert.equal(await editor.innerText(),draft);
  }

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
  await flight.getByRole('button',{name:'巡航',exact:true}).click();
  assert.equal(await flight.getByRole('button',{name:'巡航',exact:true}).getAttribute('aria-pressed'), 'true');
  for(const [label,speed] of [['缓慢','slow'],['快速','fast'],['极快','warp']]) {
    await flight.getByRole('button',{name:label,exact:true}).click();
    assert.equal(await page.locator('.dsc-space-environment').getAttribute('data-speed'),speed);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({path:join(runDir,'host-warp.png'),animations:'disabled'});
  await flight.getByRole('button',{name:'缓慢',exact:true}).click();
  await flight.getByRole('button',{name:'停泊',exact:true}).click();
  await page.waitForTimeout(9000);
  assert.equal(await flight.getByRole('button',{name:'停泊',exact:true}).getAttribute('aria-pressed'), 'true');
  const lookPad = flight.getByRole('group',{name:/拖动观察整个船舱/});
  await lookPad.focus();
  await lookPad.press('ArrowRight');
  const changedView = await flight.locator('.dsc-space-readout').innerText();
  assert.ok(!changedView.includes('偏航 +0°'), 'Viewport direction keys change the visual camera');
  const padBox = await lookPad.boundingBox();
  await page.mouse.move(padBox.x+padBox.width/2,padBox.y+padBox.height/2);
  await page.mouse.down();
  await page.mouse.move(padBox.x+padBox.width/2+50,padBox.y+padBox.height/2-15,{steps:5});
  await page.mouse.up();
  assert.notEqual(await flight.locator('.dsc-space-readout').innerText(),changedView,'Pointer dragging changes the visual camera');
  const distance = flight.getByRole('slider',{name:'观察距离'});
  const beforeDistance={screen:await commandPanel.evaluate(node=>getComputedStyle(node).transform),space:await page.locator('.dsc-space-nebula').evaluate(node=>node.style.transform)};
  await distance.focus();
  await distance.press('End');
  assert.equal(await distance.inputValue(),'1.6','Distance control reaches its advertised far limit');
  assert.notEqual(await commandPanel.evaluate(node=>getComputedStyle(node).transform),beforeDistance.screen,'Distance moves the cockpit display');
  assert.equal(await page.locator('.dsc-space-nebula').evaluate(node=>node.style.transform),beforeDistance.space,'Distance does not zoom the external galaxy');
  await page.screenshot({path:join(runDir,'host-cabin-far.png'),animations:'disabled'});
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  const floatingBounds=await commandPanel.boundingBox();
  await distance.focus();
  await distance.press('Home');
  assert.equal(await distance.inputValue(),'0.7','Distance control reaches the cockpit near limit');
  assert.deepEqual(await commandPanel.boundingBox(),floatingBounds,'Floated working screen stays the same size and position during cabin zoom');
  await page.locator('[data-dsc-dock-toggle="command"]').click();
  assert.equal(await page.locator('.dsc-space-nebula').evaluate(node=>node.style.transform),beforeDistance.space,'Near cockpit distance also leaves galaxy depth unchanged');
  await page.screenshot({path:join(runDir,'host-cabin-near.png'),animations:'disabled'});
  assert.equal(await editor.innerText(),draft,'Flight controls preserve the native draft');
  await flight.getByRole('button',{name:'视角复位',exact:true}).click();
  assert.ok((await flight.locator('.dsc-space-readout').innerText()).includes('偏航 +0°'));
  const sceneBeforeTurn=await page.locator('.dsc-space-nebula').evaluate(n=>n.style.transform);
  const cockpitBeforeTurn=await page.locator('.dsc-cabin-front').evaluate(n=>n.style.transform);
  for(const [name,key] of [['right','ArrowRight'],['left','ArrowLeft'],['up','ArrowUp'],['down','ArrowDown']]) {
    await lookPad.focus();
    for(let i=0;i<6;i++)await lookPad.press(`Shift+${key}`);
    assert.notEqual(await page.locator('.dsc-cabin-front').evaluate(n=>n.style.transform),cockpitBeforeTurn,'Head turns move the entire cabin');
    assert.equal(await page.locator('.dsc-space-nebula').evaluate(n=>n.style.transform),sceneBeforeTurn,'Head turns are not background-only movement');
    assert.equal(await page.locator('.dsc-cabin-wall').count(),4,'Continuous walls, floor and ceiling enclose the front');
    await page.screenshot({path:join(runDir,`host-look-${name}.png`),animations:'disabled'});
    await flight.getByRole('button',{name:'视角复位',exact:true}).click();
  }
  await page.getByRole('button',{name:'收起飞行控制',exact:true}).click();
  await page.getByRole('button',{name:'抬头观景',exact:true}).click();
  await page.screenshot({path:join(runDir,'host-observation.png'),animations:'disabled'});
  await page.getByRole('button',{name:'返回驾驶台',exact:true}).click();

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
  for (const [width,height] of [[1536,960],[1366,768],[1280,960],[768,960],[390,844]]) {
    await page.setViewportSize({width,height});
    await editor.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getAnimations().filter(a=>a.effect?.target?.closest?.('#root')).every(a=>a.playState!=='running'));
    const layout=await geometry();
    assert.ok(layout.scrollWidth<=width+1, `No horizontal overflow at ${width}px`);
    assert.equal(layout.overlap,false, `AI panel must not cover the composer at ${width}px`);
    assert.equal(layout.sidebarOverlap,false, `Native sidebar must not overlap the center at ${width}px`);
    assert.equal(layout.editorUncovered,true, `Native editor must remain clickable at ${width}px`);
    layouts.push(layout);
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
  report = { ...report, success: true, snapshot, realWorkspace:root, createdSession:true, unsentDraft:true, modelUnavailable, modelUnavailableDetail, modelCheck, modeCheck, nativeSettings:true, flightControls:true, pointerDrag:true, distanceControl:true, cockpitDistanceNotScenery:true, floatingStableDuringCabinZoom:true, threeDockableScreens:true, threeSpeeds:true, workViewPreservesEditor:true, layouts, disabledThenReenabledWithReload: disabled, pageErrors, failedRequests };
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
