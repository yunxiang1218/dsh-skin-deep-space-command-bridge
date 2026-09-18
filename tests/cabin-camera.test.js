import test from 'node:test';
import assert from 'node:assert/strict';
import {cabinMetrics,cabinMatrix,multiplyMatrices,createCabinRoom} from '../src/client/cabin-camera.js';
import {JSDOM} from 'jsdom';
import {projectScreenPoint,quadToMatrix,SCREEN_QUADS} from '../src/client/screen-docking.js';
import {approachFlight} from '../src/client/space-environment.js';

test('one physical camera projects windows and monitor corners consistently at distance and head-turn limits',()=>{
 const m=cabinMetrics(1536,960);
 for(const distance of [.7,1,1.6])for(const yaw of [-60,0,60])for(const pitch of [-60,0,60]) {
  const camera=cabinMatrix({distance,yaw,pitch},m);
  for(const quad of Object.values(SCREEN_QUADS)) {
   const world=quad.map(([x,y])=>[x/1672*m.width,m.horizon+(y-447)/383*m.deckHeight]);
   const display=multiplyMatrices(camera,quadToMatrix(600,400,world));
   [[0,0],[600,0],[600,400],[0,400]].forEach(([x,y],i)=>{
    const actual=projectScreenPoint(display,x,y),expected=projectScreenPoint(camera,...world[i]);
    assert.ok(actual.every(Number.isFinite));
    assert.ok(Math.abs(actual[0]-expected[0])<1e-5&&Math.abs(actual[1]-expected[1])<1e-5);
   });
  }
 }
});
test('looking up lowers the cockpit in view and far distance reduces both window and console',()=>{
 const m=cabinMetrics(1536,960),p=[400,520];
 const at=(view)=>projectScreenPoint(cabinMatrix(view,m),...p);
 const base=at({distance:1});
 assert.ok(Math.abs(base[0]-p[0])<1e-6&&Math.abs(base[1]-p[1])<1e-6);
 assert.ok(at({pitch:24,distance:1})[1]>base[1]+250);
 assert.ok(Math.abs(at({distance:1.6})[0]-m.cx)<Math.abs(base[0]-m.cx));
});
test('acceleration and deceleration have bounded continuous, frame-rate independent easing',()=>{
 const slow={velocity:.8,panoramaRate:1,trail:0,brightness:1,warp:0};
 const warp={velocity:36,panoramaRate:13,trail:52,brightness:1.8,warp:1};
 const first=approachFlight(slow,warp,1/60);
 assert.ok(first.velocity>.8&&first.velocity<2);
 assert.ok(first.warp>0&&first.warp<.03);
 let sixty=slow,thirty=slow;
 for(let i=0;i<180;i++)sixty=approachFlight(sixty,warp,1/60);
 for(let i=0;i<90;i++)thirty=approachFlight(thirty,warp,1/30);
 assert.ok(Math.abs(sixty.velocity-thirty.velocity)<1e-9);
 assert.ok(sixty.warp>.97&&sixty.warp<1);
 const down=approachFlight(sixty,slow,.1);
 assert.ok(down.velocity<sixty.velocity&&down.velocity>slow.velocity);
 assert.ok(down.warp>0&&down.warp<sixty.warp);
});

test('textured cabin camera changes only compositor transforms until the viewport is resized',()=>{
 const dom=new JSDOM('<body><div id="stage"></div></body>');
 const doc=dom.window.document;
 dom.window.HTMLCanvasElement.prototype.getContext=()=>{throw new Error('textured hull must not allocate a canvas renderer');};
 const room=createCabinRoom(doc.querySelector('#stage'),{textureUrl:'/hull.webp'}),m=cabinMetrics(1536,960);
 try{
  room.render({yaw:0,pitch:0,distance:1},m);
  const planes=[...doc.querySelectorAll('.dsc-cabin-wall')];
  assert.equal(planes.length,4);assert.equal(doc.querySelector('canvas').hidden,true);
  const original=planes.map(plane=>plane.style.transform);
  for(const plane of planes)for(const property of ['width','height','backgroundSize','filter']){
   const value=plane.style[property];
   Object.defineProperty(plane.style,property,{configurable:true,get:()=>value,set:()=>{throw new Error(`${property} changed while turning camera`);}});
  }
  for(let i=1;i<25;i++)room.render({yaw:i,pitch:i/2,distance:1.1},m);
  assert.ok(planes.every((plane,index)=>plane.style.transform!==original[index]));
  for(const plane of planes)for(const property of ['width','height','backgroundSize','filter'])delete plane.style[property];
  room.render({yaw:24,pitch:12,distance:1.1},cabinMetrics(1920,1080));
  assert.equal(planes[0].style.width,'1920px');
 }finally{room.dispose();assert.equal(doc.querySelectorAll('.dsc-cabin-wall,canvas').length,0);dom.window.close();}
});
