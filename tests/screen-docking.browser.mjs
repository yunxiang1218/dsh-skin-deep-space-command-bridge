// A real CSS/layout check for docking, independent of DSH credentials and runtime.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const css=await readFile(new URL('../src/client/cockpit-screens.css',import.meta.url),'utf8');
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/client/screen-docking.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'Docking'});
const browser=await chromium.launch({headless:true}),results=[];
try {
  const page=await browser.newPage({viewport:{width:1536,height:960}});
  await page.setContent('<body data-dsh-deep-space-command-bridge><div id="root"><aside data-pane="sidebar"><button id="history">History</button><input aria-label="Search"></aside><main data-pane="conversation"><div contenteditable="true" data-composer-input>unsent native draft</div></main><aside id="core"><select aria-label="Model"><option>DeepSeek</option></select></aside></div></body>');
  await page.addStyleTag({content:`${css}\nbody{margin:0;background:#081320} [data-composer-input]{flex:1;overflow:auto;padding:16px} input,select{box-sizing:border-box;width:100%}`});
  await page.addScriptTag({content:outputFiles[0].text});
  await page.evaluate(()=>{
    window.docking=Docking.createScreenDocking({document,core:document.getElementById('core')});
    window.originalEditor=document.querySelector('[data-composer-input]');
    for(const id of ['mission','command','core'])docking.setFloating(id,true);
  });
  const bounds=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-dsc-screen]')].map(node=>{
    const r=node.getBoundingClientRect();return [node.dataset.dscScreen,{x:r.x,y:r.y,width:r.width,height:r.height}];
  })));
  for(const [width,height] of [[1100,700],[1366,768],[1536,960],[1920,1080],[2560,1440],[900,800],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const panels=await bounds(),rows=Object.values(panels);
    for(const rect of rows)assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+.1&&rect.y+rect.height<=height+.1,`within viewport at ${width}: ${JSON.stringify(panels)}`);
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++) {
      const a=rows[i],b=rows[j];assert.ok(a.x+a.width<=b.x+.1||b.x+b.width<=a.x+.1||a.y+a.height<=b.y+.1||b.y+b.height<=a.y+.1,`CSS overlap at ${width}: ${JSON.stringify(panels)}`);
    }
    results.push({width,height,panels});
  }
  await page.evaluate(()=>docking.setFloating('command',false));
  assert.equal(await page.locator('[data-dsc-screen=command]').evaluate(node=>getComputedStyle(node).transform),'none','Narrow embedded screens remain flat despite the inline desktop camera matrix');
  await page.evaluate(()=>docking.setFloating('command',true));
  await page.setViewportSize({width:1536,height:960});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const toolbar=page.locator('[data-dsc-screen=command]>.dsc-screen-toolbar');
  const before=(await bounds()).command,handle=await toolbar.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+60,handle.y+handle.height/2+25,{steps:30});await page.mouse.up();
  const after=(await bounds()).command;
  assert.ok(Math.abs(after.x-before.x-60)<1&&Math.abs(after.y-before.y-25)<1,`real pointer capture moves the window: ${JSON.stringify({before,after,handle})}`);
  await page.locator('[data-composer-input]').fill('draft preserved while moving windows');
  assert.equal(await page.evaluate(()=>originalEditor===document.querySelector('[data-composer-input]')),true);
  await page.evaluate(()=>docking.setFloating('command',false));await page.evaluate(()=>docking.setFloating('command',true));
  assert.equal(await page.locator('[data-composer-input]').innerText(),'draft preserved while moving windows');
  assert.deepEqual((await bounds()).command,after);
  // A transformed native panel must not trap its fixed-position settings dialog.
  await page.evaluate(()=>{
    const dialog=document.createElement('section');dialog.setAttribute('role','dialog');
    dialog.style.cssText='position:fixed;left:100px;top:100px;width:400px;height:300px';
    document.querySelector('[data-dsc-screen=command]').append(dialog);
  });
  const dialog=await page.locator('[role=dialog]').boundingBox();
  assert.equal(dialog.x,100);assert.equal(dialog.y,100);
  await page.evaluate(()=>document.querySelector('[role=dialog]').remove());
  assert.deepEqual((await bounds()).command,after);
  await page.evaluate(()=>docking.dispose());
  assert.equal(await page.locator('.dsc-screen-toolbar').count(),0);
  assert.equal(await page.evaluate(()=>originalEditor===document.querySelector('[data-composer-input]')),true);
  await mkdir(new URL('../test-results/docking-browser/',import.meta.url),{recursive:true});
  await writeFile(new URL('../test-results/docking-browser/report.json',import.meta.url),JSON.stringify({success:true,layouts:results,realPointerDrag:true,nativeDraftPreserved:true,fixedDialogEscapes:true},null,2));
  console.log(JSON.stringify({success:true,viewportLayouts:results.length,realPointerDrag:true,nativeDraftPreserved:true,fixedDialogEscapes:true}));
} finally {await browser.close();}
