import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBridge, BODY_ATTRIBUTE } from '../src/client/index.js';

function fixture() {
 const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"><div data-pane="sidebar"><div data-dsc-preview-sidebar><button id="native-history">History</button></div></div><main data-pane="conversation"><div data-chat-flow>Original response</div><div data-composer-input contenteditable="true">unfinished draft</div></main></div></body></html>',{url:'http://localhost'});
 dom.window.HTMLCanvasElement.prototype.getContext = () => null;
 const snapshots = new Set(), calls=[];
 let released=0,disposed=0;
 let state={session:{title:'Title',summary:'Actual goal objective',status:'ready'},workspace:{path:'D:\\project'},
   model:{available:true,id:'m1',options:[{id:'m1',label:'Model one'},{id:'m2',label:'Model two'}]},
   thinking:{available:true,value:'high',options:[{id:'high',label:'High'},{id:'medium',label:'Medium'}]},
   mode:{available:true,id:'agent',options:[{id:'agent',label:'Agent'},{id:'plan',label:'Plan'}]},
   tokens:{available:true,total:150,input:100,output:50,contextUsed:250,contextProjected:300,contextWindow:1000},connection:{state:'connected'},
   tools:[{id:'new',name:'Newest tool',status:'completed'},{id:'middle',name:'Middle tool',status:'completed'},{id:'old',name:'Old tool',status:'error'},{id:'older',name:'Older tool'}], files:[]};
 const adapter={read:()=>state,subscribe(fn){snapshots.add(fn);return()=>snapshots.delete(fn)},actions:{setModel:async id=>calls.push(['model',id]),setThinking:async id=>calls.push(['thinking',id]),setMode:async id=>calls.push(['mode',id])},dispose(){disposed++}};
 const ctx={theme:{overrideTokens(){return()=>released++}}};
 return {dom,ctx,adapter,calls,get released(){return released},get disposed(){return disposed},get subscriptions(){return snapshots.size},set(value){state={...state,...value};for(const fn of snapshots)fn()}};
}

test('mount and unmount preserve native editor identity, draft, history handlers and previous body state',()=>{
 const f=fixture(),doc=f.dom.window.document;
 doc.body.setAttribute(BODY_ATTRIBUTE,'previous');
 const editor=doc.querySelector('[data-composer-input]'), history=doc.querySelector('#native-history');
 let clicked=0;history.addEventListener('click',()=>clicked++);
 const bridge=createBridge(f.ctx,{document:doc,adapter:f.adapter,css:'/* owned style */'});
 assert.equal(doc.querySelector('[data-composer-input]'),editor);
 assert.equal(editor.textContent,'unfinished draft');
 history.click();assert.equal(clicked,1);
 assert.equal(doc.querySelectorAll('.dsc-core').length,1);
 const layoutButton=doc.querySelector('.dsc-layout-toggle');
 layoutButton.click();
 assert.equal(doc.querySelector('[data-dsc-screen=command]').dataset.dscFloating,'true');
 assert.equal(layoutButton.getAttribute('aria-pressed'),'true');
 assert.equal(doc.querySelector('[data-composer-input]'),editor);
 assert.equal(editor.textContent,'unfinished draft');
 bridge.dispose();bridge.dispose();
 assert.equal(doc.querySelector('[data-composer-input]'),editor);
 assert.equal(editor.textContent,'unfinished draft');
 assert.equal(doc.querySelectorAll('[data-skin-owner]').length,0);
 assert.equal(doc.body.getAttribute(BODY_ATTRIBUTE),'previous');
 assert.equal(doc.body.hasAttribute('data-dsc-layout'),false);
 assert.equal(f.released,1);assert.equal(f.disposed,1);assert.equal(f.subscriptions,0);
 f.dom.window.close();
});

test('telemetry renders current goal, newest-first logs and real context pressure fields',()=>{
 const f=fixture(),doc=f.dom.window.document;
 const bridge=createBridge(f.ctx,{document:doc,adapter:f.adapter});
 try {
   assert.equal(doc.querySelector('[data-dsc-mission=task]').textContent,'Actual goal objective');
   assert.equal(doc.querySelector('.dsc-pressure i').style.width,'25%');
   assert.deepEqual([...doc.querySelectorAll('.dsc-log-row > span:nth-child(2)')].map(x=>x.textContent),['Newest tool','Middle tool','Old tool']);
 } finally {bridge.dispose();f.dom.window.close()}
});

test('dashboard selects delegate only to host actions and remain intact through refresh',async()=>{
 const f=fixture(),doc=f.dom.window.document;
 const bridge=createBridge(f.ctx,{document:doc,adapter:f.adapter});
 const control=doc.querySelector('[data-dsc-control=model]');
 control.value='m2';control.dispatchEvent(new f.dom.window.Event('change'));
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(f.calls,[['model','m2']]);
 f.set({model:{available:true,id:'m2',options:[{id:'m1',label:'Model one'},{id:'m2',label:'Model two'}]}});
 assert.equal(doc.querySelector('[data-dsc-control=model]'),control);
 assert.equal(control.value,'m2');
 bridge.dispose();f.dom.window.close();
});

test('failed mounting retracts partial writes so the native shell remains usable',()=>{
 const f=fixture(),doc=f.dom.window.document;
 const editor=doc.querySelector('[data-composer-input]');
 assert.throws(()=>createBridge({theme:{overrideTokens(){throw new Error('Unavailable theme service')}}},{document:doc,adapter:f.adapter}),/Unavailable/);
 assert.equal(doc.body.hasAttribute(BODY_ATTRIBUTE),false);
 assert.equal(doc.querySelectorAll('[data-skin-owner]').length,0);
 assert.equal(doc.querySelector('[data-composer-input]'),editor);
 f.dom.window.close();
});
