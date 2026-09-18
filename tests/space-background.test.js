import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSpaceBackground} from '../src/client/space-background.js';
import {createSpaceEnvironment} from '../src/client/space-environment.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture() {
  const dom=new JSDOM('<body><div id="stage"></div></body>',{url:'https://dsh.test/',pretendToBeVisual:true});
  const {window}=dom,document=window.document,frames=new Map(),timers=new Map(),messages=[];
  let worker,serial=0,hidden=false,textureId=0;
  Object.defineProperty(document,'hidden',{get:()=>hidden});
  window.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  window.cancelAnimationFrame=id=>frames.delete(id);
  window.setTimeout=(callback,delay)=>{callback.delay=delay;timers.set(++serial,callback);return serial;};
  window.clearTimeout=id=>timers.delete(id);
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  window.OffscreenCanvas=class{};window.WebGL2RenderingContext=class{};
  window.createImageBitmap=async()=>({width:4,height:4,close(){}});
  window.Worker=class {
    constructor(){worker=this;}
    postMessage(data){messages.push(data);}
    terminate(){this.terminated=true;}
  };
  const gl=new Proxy({NO_ERROR:0,getError:()=>0,getShaderParameter:()=>true,getProgramParameter:()=>true,
    getParameter:()=>16384,createTexture:()=>({id:++textureId}),getExtension:()=>null},
  {get:(target,key)=>target[key]??(()=>{})});
  window.HTMLCanvasElement.prototype.getContext=function(){return this.className==='dsc-space-background-gpu'?gl:null;};
  function flushFrame(time=1000){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(time);}
  function ready(id){worker.onmessage({data:{type:'ready',id,width:4,height:4}});}
  function strip(id){worker.onmessage({data:{type:'strip',id,y:0,rows:4,buffer:new ArrayBuffer(64)}});}
  function complete(){const {id}=messages.filter(message=>message.type==='prepare').at(-1);ready(id);strip(id);flushFrame();}
  return{window,document,messages,timers,frames,get worker(){return worker;},flushFrame,ready,strip,complete,
    hide(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},close(){dom.window.close();}};
}

test('discarding an incoming texture settles its upload and ignores delayed worker replies',async()=>{
  const f=fixture(),sky=createSpaceBackground(f.document);
  try {
    sky.register('visible','data:image/png;base64,AA');const first=sky.prepare('visible');f.complete();assert.equal(await first,true);
    sky.register('cancelled','data:image/png;base64,AA');const pending=sky.prepare('cancelled');
    const cancelled=f.messages.filter(message=>message.type==='prepare').at(-1).id;
    sky.retain(['visible']);assert.equal(await pending,false);
    f.ready(cancelled);f.strip(cancelled);f.flushFrame();
    assert.equal(sky.diagnostics.textures,1);assert.equal(sky.diagnostics.uploading,null);
    assert.ok(f.messages.some(message=>message.type==='cancel'&&message.id===cancelled));
    assert.equal(f.timers.size,0);
  } finally {sky.dispose();f.close();}
});

test('silent uploads time out only while visible and release cached GPU resources',async()=>{
  const f=fixture();let fallback=0;const sky=createSpaceBackground(f.document,{onUnavailable(){fallback++;}});
  try {
    sky.register('visible','data:image/png;base64,AA');const first=sky.prepare('visible');f.complete();await first;
    sky.register('stalled','data:image/png;base64,AA');const pending=sky.prepare('stalled');
    assert.equal(f.timers.size,1);f.hide(true);assert.equal(f.timers.size,0,'background rAF pauses are not treated as hangs');
    f.hide(false);assert.equal(f.timers.size,1);[...f.timers.values()][0]();
    assert.equal(await pending,false);assert.equal(fallback,1);assert.equal(f.worker.terminated,true);
    assert.equal(sky.diagnostics.available,false);assert.equal(sky.diagnostics.textures,0);
  } finally {sky.dispose();f.close();}
});

test('worker errors settle pending uploads and return to CSS once',async()=>{
  const f=fixture();let fallback=0;const sky=createSpaceBackground(f.document,{onUnavailable(){fallback++;}});
  try {
    sky.register('broken','data:image/png;base64,AA');const pending=sky.prepare('broken');
    const {id}=f.messages.filter(message=>message.type==='prepare').at(-1);
    f.worker.onmessage({data:{type:'error',id,message:'decode failed'}});
    f.worker.onerror({preventDefault(){}});
    assert.equal(await pending,false);assert.equal(fallback,1);assert.equal(f.timers.size,0);
  } finally {sky.dispose();f.close();}
});

const scenes=[{id:'one',url:'https://dsh.test/photo.jpg',artUrl:'https://dsh.test/art.jpg'}];
test('a slow initial photo decode cannot cancel the newer art upload',async()=>{
  const f=fixture();let finishPhoto;
  const photo=new Promise(resolve=>{finishPhoto=resolve;});
  const env=createSpaceEnvironment(f.document.querySelector('#stage'),{scenes,storage:null,
    preloadScene:scene=>scene.skyQuality==='photo'?photo:Promise.resolve({})});
  try {
    const change=env.setSkyQuality('art');await settle();
    assert.deepEqual(f.messages.filter(message=>message.type==='prepare').map(message=>message.key),['one:art']);
    finishPhoto({});await settle();
    assert.deepEqual(f.messages.filter(message=>message.type==='prepare').map(message=>message.key),['one:art']);
    f.complete();assert.equal(await change,true);f.flushFrame();
    assert.equal(env.getState().skyQuality,'art');assert.equal(env.element.dataset.backgroundRenderer,'webgl2');
  } finally {env.dispose();f.close();}
});

test('reselecting the current quality cancels the stale upload without retaining its texture',async()=>{
  const f=fixture();const env=createSpaceEnvironment(f.document.querySelector('#stage'),{scenes,storage:null,preloadScene:async()=>({})});
  try {
    await settle();f.complete();await settle();
    const art=env.setSkyQuality('art');await settle();
    const stale=f.messages.filter(message=>message.type==='prepare').at(-1).id;
    assert.equal(await env.setSkyQuality('photo'),true);assert.equal(await art,false);
    f.ready(stale);f.strip(stale);f.flushFrame();
    assert.ok(f.messages.some(message=>message.type==='cancel'&&message.id===stale));
    assert.equal(env.getState().skyQuality,'photo');assert.equal(env.element.dataset.backgroundRenderer,'webgl2');
  } finally {env.dispose();f.close();}
});

test('a stalled GPU destination still completes its warp through decoded CSS scenery',async()=>{
  const f=fixture();const catalog=[...scenes,{id:'two',url:'https://dsh.test/second.jpg'}];
  const env=createSpaceEnvironment(f.document.querySelector('#stage'),{scenes:catalog,storage:null,preloadScene:async()=>({})});
  try {
    await settle();f.complete();await settle();env.setSpeed('warp');
    for(let time=1100;time<=6300;time+=100)f.flushFrame(time);
    await settle();
    assert.equal(f.messages.filter(message=>message.type==='prepare').at(-1).key,'two:photo');
    const deadline=[...f.timers.values()].find(callback=>callback.delay===10000);
    assert.ok(deadline);deadline();await settle();
    for(let time=6400;time<=8300;time+=100)f.flushFrame(time);
    assert.equal(env.getState().sceneId,'two');assert.equal(env.getState().speed,'fast');
    assert.equal(env.element.dataset.backgroundRenderer,'css');
    assert.equal(env.element.querySelector('[data-scene-id="two"]').style.display,'block');
    assert.equal(env.element.querySelector('[data-scene-id="two"]').style.opacity,'1');
  } finally {env.dispose();f.close();}
});
