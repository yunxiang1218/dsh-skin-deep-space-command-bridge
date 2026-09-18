// Optional real-renderer check: node tests/space-particles.browser.mjs
// Standalone browser fixture; no DSH profile, credentials or model requests.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const software=process.argv.includes('--software'),uncapped=process.argv.includes('--uncapped'),transitionsOnly=process.argv.includes('--transitions-only');
const output = transitionsOnly?'test-results/space-transition-regression':`test-results/space-particles-${software?'software':'hardware'}${uncapped?'-uncapped':''}`;
await mkdir(output, { recursive:true });
const bundle = await build({entryPoints:['src/client/space-environment.js'],bundle:true,write:false,format:'iife',globalName:'FlightTest'});
const background = `data:image/webp;base64,${(await readFile('assets/resource/scenes/sapphire-veil.webp')).toString('base64')}`;
const args=!software&&process.platform==='win32'?['--use-angle=d3d11','--enable-gpu']:[];
if(uncapped)args.push('--disable-frame-rate-limit');
const browser = await chromium.launch({headless:true,args});
const report = {viewport:{width:1920,height:1080},headless:true,uncapped,args,starCount:600,rayCount:180,results:{},errors:[]};
try {
  for(const renderer of (transitionsOnly?[]:['canvas','auto'])) {
    const page = await browser.newPage({viewport:report.viewport});
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.setContent('<body style="margin:0"><div id="stage"></div></body>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    report.results[renderer] = await page.evaluate(async({renderer,background})=>{
      const nativeRaf=window.requestAnimationFrame.bind(window);
      let samples=[],intervals=[],prior=null;
      window.requestAnimationFrame=callback=>nativeRaf(now=>{
        const started=performance.now();callback(now);samples.push(performance.now()-started);
        if(prior!==null)intervals.push(now-prior);prior=now;
      });
      window.env=FlightTest.createSpaceEnvironment(document.querySelector('#stage'),{renderer,backgroundUrl:background,storage:null});
      const summarize=values=>{values.sort((a,b)=>a-b);return{median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1),count:values.length};};
      const speeds={};
      for(const speed of ['slow','fast','warp']) {
        env.setSpeed(speed);await new Promise(resolve=>setTimeout(resolve,1500));samples=[];intervals=[];prior=null;
        await new Promise(resolve=>setTimeout(resolve,2200));
        speeds[speed]={cpuMs:summarize(samples),frameIntervalMs:summarize(intervals)};
      }
      const canvas=document.querySelector('.dsc-space-canvas-gpu');
      const gl=canvas?.getContext('webgl2');
      const info=gl?.getExtension('WEBGL_debug_renderer_info');
      // The CSS fallback is display:none while the GPU background is active;
      // percentages must be resolved against its intended 108% viewport extent.
      const transform=document.querySelector('.dsc-space-panorama').style.transform.match(/translate3d\(\s*([^,]+)%,\s*([^,]+)%/);
      const program=gl?.getParameter(gl.CURRENT_PROGRAM);
      const heading=program?[...gl.getUniform(program,gl.getUniformLocation(program,'heading'))]:null;
      return{renderer:env.element.dataset.renderer,speeds,gpu:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null,
        drift:{x:Number(transform[1])*innerWidth*1.08/100,y:Number(transform[2])*innerHeight*1.08/100},gpuHeading:heading};
    },{renderer,background});
    await page.screenshot({path:`${output}/${renderer}-warp.png`});
    if(renderer==='auto') {
      assert.equal(report.results.auto.renderer,'webgl2','real GPU shader compilation must succeed');
      const {drift,gpuHeading}=report.results.auto;
      assert.ok(Math.abs(gpuHeading[0]-drift.x)<.01 && Math.abs(gpuHeading[1]+drift.y)<.01,'GPU stars and warp centre follow the same 2D drift as the panorama');
      await page.evaluate(()=>{
        const canvas=document.querySelector('.dsc-space-canvas-gpu');
        window.contextLoss=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');contextLoss.loseContext();
      });
      await page.waitForFunction(()=>env.element.dataset.renderer==='canvas2d');
      assert.equal(await page.locator('.dsc-space-canvas:not(.dsc-space-canvas-gpu)').isVisible(),true);
      await page.waitForTimeout(100);
      await page.evaluate(()=>contextLoss.restoreContext());
      await page.waitForFunction(()=>env.element.dataset.renderer==='webgl2');
      assert.equal(await page.locator('.dsc-space-canvas-gpu').isVisible(),true);
      report.contextLossRecovery=true;
    }
    await page.evaluate(()=>env.dispose());
    assert.equal(await page.locator('.dsc-space-environment,.dsc-space-canvas').count(),0);
    await page.close();
  }
  // Pixel evidence catches a fade that has the correct opacity but is hidden behind
  // the previous opaque layer because of DOM order (the second-hop regression).
  const page=await browser.newPage({viewport:{width:320,height:180}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.setContent('<body data-dsh-deep-space-command-bridge style="margin:0"><div id="stage"></div></body>');
  await page.addStyleTag({content:await readFile('src/client/space-controls.css','utf8')});
  await page.addStyleTag({content:'.dsc-space-canvas,.dsc-space-shade{visibility:hidden!important}'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(async()=>{
    const colors=['#ff0000','#00ff00','#0000ff','#ffff00'];
    const scenes=colors.map((color,index)=>({id:String(index),label:color,
      url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${color}"/></svg>`)}));
    await Promise.all(scenes.map(scene=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.decode().then(resolve,reject);image.onerror=reject;image.src=scene.url;})));
    window.framesForTest=new Map();let frameId=0;
    window.requestAnimationFrame=callback=>{framesForTest.set(++frameId,callback);return frameId;};
    window.cancelAnimationFrame=id=>framesForTest.delete(id);
    window.runFrame=time=>{const pending=[...framesForTest.values()];framesForTest.clear();for(const callback of pending)callback(time);};
    window.env=FlightTest.createSpaceEnvironment(document.querySelector('#stage'),{scenes,storage:null,renderer:'canvas',random:()=>0,preloadScene:async()=>({decoded:true})});
    await new Promise(resolve=>setTimeout(resolve,0));runFrame(0);
  });
  report.transitionPixels=[];
  for(let jump=0;jump<3;jump++) {
    await page.evaluate(jump=>{env.setSpeed('warp');for(let now=jump*6800+10;now<=jump*6800+5800;now+=10)runFrame(now);},jump);
    const screenshot=await page.screenshot({path:`${output}/transition-${jump+1}-midpoint.png`});
    const rgba=await page.evaluate(async base64=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);return[...context.getImageData(80,80,1,1).data];
    },screenshot.toString('base64'));
    assert.ok(rgba[0]>75&&rgba[1]>75&&rgba[2]<15,`jump ${jump+1}: incoming red/green must blend visibly, got ${rgba}`);
    assert.ok(rgba[0]+rgba[1]>240,'the continuous backdrop must not fade through black');
    report.transitionPixels.push({jump:jump+1,rgba});
    await page.evaluate(jump=>{for(let now=jump*6800+5810;now<=jump*6800+6800;now+=10)runFrame(now);},jump);
    assert.equal(await page.evaluate(()=>env.getState().speed),'fast');
  }
  await page.evaluate(()=>env.dispose());await page.close();
  assert.deepEqual(report.errors,[]);
  report.success=true;
} finally {
  await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
