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
test('three independent dock buttons preserve editor identity and restore all owned changes',()=>{
  const f=fixture(),editor=f.doc.querySelector('[data-composer-input]'),command=editor.parentElement;
  command.setAttribute('data-dsc-floating','prior');command.style.setProperty('--dsc-screen-z','2');
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
  assert.equal(command.hasAttribute('data-dsc-screen'),false);
  f.dom.window.close();
});
test('distance scales the deck and embedded screen coordinates, never the floated state or local content size',()=>{
  const f=fixture();let distance=1;
  const dock=createScreenDocking({document:f.doc,core:f.core,getDistance:()=>distance});
  const command=f.doc.querySelector('[data-dsc-screen=command]');
  const original=command.style.getPropertyValue('--dsc-screen-transform'),width=command.style.getPropertyValue('--dsc-screen-width');
  distance=.7;dock.refresh();
  assert.notEqual(command.style.getPropertyValue('--dsc-screen-transform'),original);
  assert.equal(command.style.getPropertyValue('--dsc-screen-width'),width);
  dock.setFloating('command',true);distance=1.6;dock.refresh();
  assert.equal(dock.getState().command,true);
  distance=1;dock.setFloating('command',false);dock.refresh();
  assert.equal(command.style.getPropertyValue('--dsc-screen-transform'),original);
  dock.dispose();f.dom.window.close();
});
test('resizing reprojects the same native nodes and a later host screen receives its own controls',async()=>{
  const f=fixture(),dock=createScreenDocking({document:f.doc,core:f.core});
  const command=f.doc.querySelector('[data-dsc-screen=command]'),matrix=command.style.getPropertyValue('--dsc-screen-transform');
  f.dom.window.innerWidth=1400;f.dom.window.dispatchEvent(new f.dom.window.Event('resize'));
  assert.notEqual(command.style.getPropertyValue('--dsc-screen-transform'),matrix);
  const replacement=f.doc.createElement('main');replacement.dataset.pane='conversation';
  command.replaceWith(replacement);await Promise.resolve();
  assert.equal(replacement.dataset.dscScreen,'command');
  assert.equal(replacement.querySelectorAll('[data-dsc-dock-toggle]').length,1);
  assert.equal(command.hasAttribute('data-dsc-screen'),false);
  dock.dispose();f.dom.window.close();
});
