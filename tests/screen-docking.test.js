import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {SCREEN_QUADS,quadToMatrix,projectScreenPoint,createScreenDocking} from '../src/client/screen-docking.js';

test('projective screen matrices place all four corners exactly inside each artwork aperture',()=>{
  for(const quad of Object.values(SCREEN_QUADS)) {
    const matrix=quadToMatrix(600,400,quad);
    [[0,0],[600,0],[600,400],[0,400]].forEach(([x,y],i)=>{
      const result=projectScreenPoint(matrix,x,y);
      assert.ok(Math.abs(result[0]-quad[i][0])<1e-8);
      assert.ok(Math.abs(result[1]-quad[i][1])<1e-8);
    });
  }
});

function fixture(){
  const dom=new JSDOM('<body><div class="dsc-canopy"></div><div id="root"><div data-pane="sidebar"><button id="history">History</button></div><main data-pane="conversation"><div data-composer-input contenteditable="true">draft stays</div></main><aside id="core"></aside></div></body>',{pretendToBeVisual:true});
  const doc=dom.window.document;
  return {dom,doc,core:doc.getElementById('core')};
}

function pointerFixture() {
  const f=fixture(),win=f.dom.window,frames=new Map();let serial=0;
  win.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  win.cancelAnimationFrame=id=>frames.delete(id);
  win.HTMLElement.prototype.setPointerCapture=function(id){this.captured=id;};
  win.HTMLElement.prototype.hasPointerCapture=function(id){return this.captured===id;};
  win.HTMLElement.prototype.releasePointerCapture=function(){this.captured=null;};
  f.pointer=(node,type,x,y,extra={})=>{
    const event=new win.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,...extra});
    Object.defineProperty(event,'pointerId',{value:1});node.dispatchEvent(event);return event;
  };
  f.flush=()=>{const ready=[...frames.values()];frames.clear();ready.forEach(callback=>callback(100));};
  return {...f,frames};
}

function floatingBox(node) {
  const value=name=>parseFloat(node.style.getPropertyValue(`--dsc-float-${name}`));
  return {x:value('left'),y:value('top'),width:value('width'),height:value('height')};
}

test('all three floating screens tile without overlap and keep their titles within the viewport',()=>{
  const f=fixture(),win=f.dom.window,dock=createScreenDocking({document:f.doc,core:f.core});
  for(const id of ['mission','command','core'])dock.setFloating(id,true);
  for(const [width,height] of [[1100,700],[1366,768],[1536,960],[1920,1080],[2560,1440],[900,800],[390,844]]) {
    win.innerWidth=width;win.innerHeight=height;win.dispatchEvent(new win.Event('resize'));
    const boxes=['mission','command','core'].map(id=>floatingBox(f.doc.querySelector(`[data-dsc-screen=${id}]`)));
    for(const box of boxes) {
      assert.ok(Number.isFinite(box.x)&&box.x>=0,'floating left is resolved in pixels');
      assert.ok(box.y>=0&&box.y+box.height<=height);
      assert.ok(box.width>150&&box.x+box.width<=width);
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j];
      assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`overlap at ${width}px`);
    }
    if(width>=1100)assert.ok(boxes[1].width>=460,'desktop editor retains a readable width');
  }
  dock.dispose();win.close();
});

test('floating titlebar drag commits once per animation frame and preserves native content and docking position',()=>{
  const f=pointerFixture(),win=f.dom.window;win.innerWidth=1536;win.innerHeight=960;
  const dock=createScreenDocking({document:f.doc,core:f.core});dock.setFloating('command',true);
  const panel=f.doc.querySelector('[data-dsc-screen=command]'),toolbar=panel.querySelector('.dsc-screen-toolbar'),editor=panel.querySelector('[contenteditable]');
  const start=panel.style.transform;
  f.pointer(toolbar,'pointerdown',500,100);
  f.pointer(toolbar,'pointermove',530,125);f.pointer(toolbar,'pointermove',560,130);
  assert.equal(f.frames.size,1,'pointer samples coalesce into one scheduled frame');
  assert.equal(panel.style.transform,start,'pointermove does not synchronously render');
  f.flush();
  assert.equal(panel.style.transform,'translate3d(60px, 30px, 0)');
  assert.equal(panel.querySelector('[contenteditable]'),editor);assert.equal(editor.textContent,'draft stays');
  f.pointer(toolbar,'pointerup',560,130);
  assert.equal(toolbar.captured,null);assert.equal(panel.hasAttribute('data-dsc-dragging'),false);
  const layer=Number(panel.style.getPropertyValue('--dsc-screen-z'));
  editor.dispatchEvent(new win.FocusEvent('focusin',{bubbles:true}));
  assert.equal(Number(panel.style.getPropertyValue('--dsc-screen-z')),layer,'focusing the topmost screen does not grow its layer');
  dock.setFloating('command',false);dock.setFloating('command',true);
  assert.equal(panel.style.transform,'translate3d(60px, 30px, 0)','re-floating retains the user position');
  dock.dispose();win.close();
});

test('repeated pointer and keyboard focus keep the active floating screen highest within a bounded stack',()=>{
  const f=fixture(),win=f.dom.window,dock=createScreenDocking({document:f.doc,core:f.core});
  const ids=['mission','command','core'];
  for(const id of ids)dock.setFloating(id,true);
  const panels=Object.fromEntries(ids.map(id=>[id,f.doc.querySelector(`[data-dsc-screen=${id}]`)]));
  const layer=id=>Number(panels[id].style.getPropertyValue('--dsc-screen-z'));
  for(let i=0;i<600;i++) {
    const id=ids[i%ids.length];
    panels[id].dispatchEvent(new win.Event(i%2?'focusin':'pointerdown',{bubbles:true}));
    assert.equal(layer(id),23,'the latest active screen is on top');
    assert.deepEqual(ids.map(layer).sort((a,b)=>a-b),[21,22,23],'native overlays retain their higher layer');
  }
  dock.setFloating('command',false);
  assert.equal(layer('command'),6);
  assert.deepEqual(['mission','core'].map(layer).sort((a,b)=>a-b),[21,22]);
  dock.setFloating('command',true);
  assert.equal(layer('command'),23);
  dock.dispose();win.close();
});

test('resizing a manually moved screen keeps its complete bounds and toolbar accessible',()=>{
  const f=pointerFixture(),win=f.dom.window;win.innerWidth=1920;win.innerHeight=1080;
  const dock=createScreenDocking({document:f.doc,core:f.core});dock.setFloating('mission',true);
  const panel=f.doc.querySelector('[data-dsc-screen=mission]'),toolbar=panel.querySelector('.dsc-screen-toolbar');
  f.pointer(toolbar,'pointerdown',100,100);f.pointer(toolbar,'pointermove',1400,300);f.pointer(toolbar,'pointerup',1400,300);
  win.innerWidth=1100;win.innerHeight=700;win.dispatchEvent(new win.Event('resize'));
  const box=floatingBox(panel),[x,y]=panel.style.transform.match(/-?[\d.]+(?=px)/g).map(Number);
  assert.ok(box.x+x>=0&&box.x+x+box.width<=1100);
  assert.ok(box.y+y>=0&&box.y+y+box.height<=700);
  dock.dispose();win.close();
});

test('drag ignores native content and toolbar buttons, clamps to viewport, and cancels on dispose',()=>{
  const f=pointerFixture(),win=f.dom.window;win.innerWidth=1536;win.innerHeight=960;
  const dock=createScreenDocking({document:f.doc,core:f.core});dock.setFloating('command',true);
  const panel=f.doc.querySelector('[data-dsc-screen=command]'),toolbar=panel.querySelector('.dsc-screen-toolbar');
  for(const target of [panel.querySelector('[contenteditable]'),toolbar.querySelector('button')]) {
    f.pointer(target,'pointerdown',500,100);f.pointer(toolbar,'pointermove',800,500);
    assert.equal(f.frames.size,0,'interactive content is never treated as a drag handle');
  }
  f.pointer(toolbar,'pointerdown',500,100);f.pointer(toolbar,'pointermove',10000,-10000);f.flush();
  const box=floatingBox(panel),offsets=panel.style.transform.match(/-?[\d.]+(?=px)/g).map(Number);
  assert.ok(box.x+offsets[0]>=0&&box.x+offsets[0]+box.width<=win.innerWidth);
  assert.ok(box.y+offsets[1]>=0&&box.y+offsets[1]<=win.innerHeight-29);
  f.pointer(toolbar,'pointermove',800,500);assert.equal(f.frames.size,1);
  dock.dispose();assert.equal(f.frames.size,0);assert.equal(toolbar.captured,null);
  assert.equal(panel.style.transform,'');
  f.flush();assert.equal(panel.hasAttribute('data-dsc-screen'),false);win.close();
});

test('camera updates reuse cached geometry without discovering nodes or writing floating geometry',()=>{
  const f=fixture(),dock=createScreenDocking({document:f.doc,core:f.core});
  assert.equal(typeof dock.updateView,'function');
  const panel=f.doc.querySelector('[data-dsc-screen=command]'),old=panel.style.transform;
  const originalQuery=f.doc.getElementById('root').querySelector;
  f.doc.getElementById('root').querySelector=()=>{throw Error('Camera update must not discover host nodes');};
  dock.updateView({yaw:18,pitch:5,distance:1});assert.notEqual(panel.style.transform,old);
  assert.equal(panel.style.getPropertyValue('--dsc-screen-transform'),'','Camera transforms do not propagate inherited custom properties through the native UI subtree');
  dock.setFloating('command',true);const floating=panel.getAttribute('style');
  dock.updateView({yaw:30,pitch:0,distance:1.2});assert.equal(panel.getAttribute('style'),floating);
  f.doc.getElementById('root').querySelector=originalQuery;dock.dispose();f.dom.window.close();
});
test('three independent dock buttons preserve editor identity and restore all owned changes',()=>{
  const f=fixture(),editor=f.doc.querySelector('[data-composer-input]'),command=editor.parentElement;
  command.setAttribute('data-dsc-floating','prior');command.style.setProperty('--dsc-screen-z','2');command.style.setProperty('transform','scale(2)','important');
  const dock=createScreenDocking({document:f.doc,core:f.core});
  for(const id of ['mission','command','core']) f.doc.querySelector(`[data-dsc-dock-toggle=${id}]`).click();
  assert.deepEqual(dock.getState(),{mission:true,command:true,core:true});
  f.doc.querySelector('[data-dsc-dock-toggle=command]').click();
  assert.deepEqual(dock.getState(),{mission:true,command:false,core:true});
  assert.equal(f.doc.querySelector('[data-composer-input]'),editor);
  assert.equal(editor.textContent,'draft stays');
  dock.dispose();dock.dispose();
  assert.equal(f.doc.querySelectorAll('.dsc-screen-toolbar').length,0);
  assert.equal(command.getAttribute('data-dsc-floating'),'prior');
  assert.equal(command.style.getPropertyValue('--dsc-screen-z'),'2');
  assert.equal(command.style.transform,'scale(2)');assert.equal(command.style.getPropertyPriority('transform'),'important');
  assert.equal(command.hasAttribute('data-dsc-screen'),false);
  f.dom.window.close();
});
test('distance scales the deck and embedded screen coordinates, never the floated state or local content size',()=>{
  const f=fixture();let distance=1;
  const dock=createScreenDocking({document:f.doc,core:f.core,getDistance:()=>distance});
  const command=f.doc.querySelector('[data-dsc-screen=command]');
  const original=command.style.transform,width=command.style.getPropertyValue('--dsc-screen-width');
  distance=.7;dock.refresh();
  assert.notEqual(command.style.transform,original);
  assert.equal(command.style.getPropertyValue('--dsc-screen-width'),width);
  dock.setFloating('command',true);distance=1.6;dock.refresh();
  assert.equal(dock.getState().command,true);
  distance=1;dock.setFloating('command',false);dock.refresh();
  assert.equal(command.style.transform,original);
  dock.dispose();f.dom.window.close();
});
test('resizing reprojects the same native nodes and a later host screen receives its own controls',async()=>{
  const f=fixture(),dock=createScreenDocking({document:f.doc,core:f.core});
  const command=f.doc.querySelector('[data-dsc-screen=command]'),matrix=command.style.transform;
  f.dom.window.innerWidth=1400;f.dom.window.dispatchEvent(new f.dom.window.Event('resize'));
  assert.notEqual(command.style.transform,matrix);
  const replacement=f.doc.createElement('main');replacement.dataset.pane='conversation';
  command.replaceWith(replacement);await Promise.resolve();
  assert.equal(replacement.dataset.dscScreen,'command');
  assert.equal(replacement.querySelectorAll('[data-dsc-dock-toggle]').length,1);
  assert.equal(command.hasAttribute('data-dsc-screen'),false);
  dock.dispose();f.dom.window.close();
});
