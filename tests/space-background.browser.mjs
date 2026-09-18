import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const bundle=await build({entryPoints:['src/client/space-background.js'],bundle:true,write:false,format:'iife',globalName:'Sky'});
const headless=!process.argv.includes('--headed');
const browser=await chromium.launch({headless,args:['--use-angle=d3d11','--enable-gpu']});
const report={headless,errors:[],success:false};
try {
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.setContent('<body style="margin:0"></body>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  report.result=await page.evaluate(async()=>{
    window.sky=Sky.createSpaceBackground(document);if(!sky)throw Error('WebGL background unavailable');
    document.body.append(sky.canvas);sky.canvas.hidden=false;sky.resize(960,640);
    const pattern=document.createElement('canvas');pattern.width=4000;pattern.height=2300;
    const ctx=pattern.getContext('2d');
    for(const [x,y,color] of [[0,0,'red'],[2000,0,'lime'],[0,1150,'blue'],[2000,1150,'white']]){ctx.fillStyle=color;ctx.fillRect(x,y,2000,1150);}
    sky.register('pattern',pattern.toDataURL());
    const prepared=await sky.prepare('pattern',null);
    const gl=sky.canvas.getContext('webgl2');
    const pixel=(x,y)=>{const rgba=new Uint8Array(4);gl.readPixels(x,640-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return[...rgba];};
    sky.render('pattern',null,0,{x:0,y:0});
    const corners=[pixel(160,160),pixel(800,160),pixel(160,480),pixel(800,480)];
    const other=document.createElement('canvas');other.width=4000;other.height=3000;
    const c=other.getContext('2d');c.fillStyle='black';c.fillRect(0,0,4000,3000);
    sky.register('black',other.toDataURL());
    await sky.prepare('black',null);sky.render('pattern','black',.5,{x:0,y:0});
    const half=pixel(160,160),before=sky.diagnostics;sky.retain(['pattern']);
    const retained=sky.diagnostics;
    const pending=sky.prepare('cancelled',other);sky.dispose();const cancellation=await pending;
    let lost=false;
    const recovery=Sky.createSpaceBackground(document,{onUnavailable(){lost=true;}});
    document.body.append(recovery.canvas);recovery.resize(960,640);
    recovery.register('pattern',pattern.toDataURL());await recovery.prepare('pattern',null);
    recovery.canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
    await new Promise(resolve=>recovery.canvas.addEventListener('webglcontextlost',resolve,{once:true}));
    const contextLossFallback=lost&&!recovery.render('pattern',null,0,{x:0,y:0});recovery.dispose();
    return{prepared,corners,half,before,retained,cancellation,contextLossFallback};
  });
  assert.equal(report.result.prepared,true);
  assert.deepEqual(report.result.corners,[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,255,255]],'photograph orientation and coverage are preserved');
  assert.ok(report.result.half[0]>=126&&report.result.half[0]<=129&&report.result.half[1]===0);
  assert.equal(report.result.before.textures,2);assert.ok(report.result.before.strips.every(item=>item.uploads>60));
  assert.equal(report.result.retained.textures,1);assert.equal(report.result.cancellation,false);
  assert.equal(report.result.contextLossFallback,true);
  assert.deepEqual(report.errors,[]);report.success=true;
} finally {
  await browser.close();await mkdir('test-results/space-background',{recursive:true});
  await writeFile('test-results/space-background/report.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
