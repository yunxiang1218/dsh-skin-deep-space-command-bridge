// Match live HTML surfaces to the slim glass apertures in the v3 cockpit artwork.
// The host owns every React node; docking changes only presentation attributes.
import {cabinMetrics,cabinMatrix,multiplyMatrices} from './cabin-camera.js';
export const SCREEN_QUADS = {
  mission: [[49,504],[403,482],[367,679],[12,725]],
  command: [[480,481],[1191,481],[1221,681],[450,681]],
  core: [[1270,483],[1620,506],[1661,725],[1305,679]],
};
const LABELS = {mission:'任务屏',command:'主控制台',core:'AI 核心屏'};
const TITLES = {mission:'01 / MISSION',command:'02 / DEEPSEEK AI',core:'03 / AI CORE'};
const VARIABLES = ['--dsc-screen-width','--dsc-screen-height','--dsc-screen-z',
  '--dsc-float-left','--dsc-float-top','--dsc-float-width','--dsc-float-height','transform'];
const SURFACES = '[class*="_sidebarCol"],[class*="_centerCol"],[data-pane="sidebar"],[data-pane="conversation"]';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** Detached windows share a layout budget, so their default bounds cannot overlap. */
export function floatingLayout(width,height) {
  const margin=width<680?8:14,gap=12,top=height<800?44:58;
  const availableWidth=Math.max(1,width-margin*2),availableHeight=Math.max(96,height-top-54);
  if(width>=1100) {
    const side=clamp(width*.21,230,320),center=availableWidth-side*2-gap*2;
    return {mission:{x:margin,y:top,width:side,height:availableHeight},
      command:{x:margin+side+gap,y:top,width:center,height:availableHeight},
      core:{x:width-margin-side,y:top,width:side,height:availableHeight}};
  }
  if(width>=680) {
    const commandHeight=Math.floor((availableHeight-gap)*.60),sideHeight=availableHeight-gap-commandHeight;
    const sideWidth=(availableWidth-gap)/2;
    return {command:{x:margin,y:top,width:availableWidth,height:commandHeight},
      mission:{x:margin,y:top+commandHeight+gap,width:sideWidth,height:sideHeight},
      core:{x:margin+sideWidth+gap,y:top+commandHeight+gap,width:sideWidth,height:sideHeight}};
  }
  const contentHeight=availableHeight-gap*2,commandHeight=Math.floor(contentHeight*.54),sideHeight=(contentHeight-commandHeight)/2;
  return {command:{x:margin,y:top,width:availableWidth,height:commandHeight},
    mission:{x:margin,y:top+commandHeight+gap,width:availableWidth,height:sideHeight},
    core:{x:margin,y:top+commandHeight+gap*2+sideHeight,width:availableWidth,height:sideHeight}};
}

/** Column-major CSS matrix3d mapping a rectangle onto four clockwise corners. */
export function quadToMatrix(width, height, quad) {
  if (!(width>0 && height>0) || quad.length!==4 || !quad.flat().every(Number.isFinite)) throw new TypeError('Invalid screen geometry');
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad;
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3;
  const dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
  const determinant=dx1*dy2-dx2*dy1;
  let g=0,h=0;
  if(Math.abs(dx3)+Math.abs(dy3)>1e-9) {
    if(Math.abs(determinant)<1e-9) throw new TypeError('Degenerate screen geometry');
    g=(dx3*dy2-dx2*dy3)/determinant;
    h=(dx1*dy3-dx3*dy1)/determinant;
  }
  return [(x1-x0+g*x1)/width,(y1-y0+g*y1)/width,0,g/width,
    (x3-x0+h*x3)/height,(y3-y0+h*y3)/height,0,h/height,
    0,0,1,0,x0,y0,0,1];
}

export function projectScreenPoint(matrix,x,y) {
  const w=matrix[3]*x+matrix[7]*y+matrix[15];
  return [(matrix[0]*x+matrix[4]*y+matrix[12])/w,(matrix[1]*x+matrix[5]*y+matrix[13])/w];
}

export function createScreenDocking({document:doc,core,owner='deep-space-command-bridge',onChange,getDistance=()=>1,getView=()=>({distance:getDistance()})}={}) {
  const win=doc.defaultView, root=doc.getElementById('root');
  const state={mission:false,command:false,core:false}, records=new Map();
  let alive=true, floatingOrder=[], metrics=cabinMetrics(win.innerWidth,win.innerHeight),view=getView(),drag=null,dragFrame=null;
  const notify=()=>onChange?.({...state});
  function restack(topId) {
    floatingOrder=floatingOrder.filter(id=>state[id]&&records.has(id)&&id!==topId);
    if(topId&&state[topId]&&records.has(topId))floatingOrder.push(topId);
    // Keep native details, menus and dialogs above the three floating screens,
    // regardless of how often a native control receives a click or keyboard focus.
    floatingOrder.forEach((id,index)=>records.get(id).node.style.setProperty('--dsc-screen-z',String(21+index)));
  }
  function applyPosition(record) {
    const {x,y,width,height}=record.bounds;
    record.offset.x=clamp(record.offset.x,8-x,Math.max(8,win.innerWidth-width-8)-x);
    record.offset.y=clamp(record.offset.y,8-y,Math.max(8,win.innerHeight-height-8)-y);
    if(state[record.id])record.node.style.transform=`translate3d(${record.offset.x}px, ${record.offset.y}px, 0)`;
  }
  function flushDrag() {
    if(dragFrame!==null){win.cancelAnimationFrame(dragFrame);dragFrame=null;}
    if(!alive||!drag)return;
    drag.record.offset={x:drag.offset.x+drag.x-drag.startX,y:drag.offset.y+drag.y-drag.startY};
    applyPosition(drag.record);
  }
  function stopDrag(commit=true) {
    if(!drag)return;
    if(commit)flushDrag();
    else if(dragFrame!==null){win.cancelAnimationFrame(dragFrame);dragFrame=null;}
    const {record,id}=drag;drag=null;
    record.node.removeAttribute('data-dsc-dragging');
    if(record.toolbar.hasPointerCapture?.(id))record.toolbar.releasePointerCapture(id);
  }
  function startDrag(event,record) {
    if(!state[record.id]||event.button!==0||drag||event.target.closest('button,input,select,textarea,a,[contenteditable]'))return;
    drag={id:event.pointerId,record,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offset:{...record.offset}};
    record.toolbar.setPointerCapture?.(event.pointerId);
    record.node.setAttribute('data-dsc-dragging','');
    event.preventDefault();
  }
  function moveDrag(event) {
    if(!drag||drag.id!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(dragFrame===null)dragFrame=win.requestAnimationFrame(()=>{dragFrame=null;flushDrag();});
  }
  function endDrag(event) {
    if(!drag||drag.id!==event.pointerId)return;
    if(event.type==='pointerup'){drag.x=event.clientX;drag.y=event.clientY;}
    stopDrag();
  }
  function updateView(nextView=getView(),nextMetrics=metrics) {
    if(!alive)return;
    view=nextView;
    const camera=cabinMatrix(view,nextMetrics);
    for(const [id,record] of records) {
      if(state[id]||!record.matrix)continue;
      // A direct, non-inherited property avoids invalidating every native chat
      // descendant's style on each camera frame, unlike a custom CSS variable.
      record.node.style.transform=`matrix3d(${multiplyMatrices(camera,record.matrix).join(',')})`;
    }
  }
  function renderRecord(id,record) {
    const floating=state[id];
    record.node.dataset.dscFloating=String(floating);
    record.button.textContent=floating?'↙ 嵌回':'↗ 悬浮';
    record.button.setAttribute('aria-label',`${LABELS[id]}：${floating?'嵌回屏幕':'悬浮屏幕'}`);
    record.button.setAttribute('aria-pressed',String(floating));
    if(floating)restack(id);
    else {record.node.style.setProperty('--dsc-screen-z','6');restack();}
    record.toolbar.tabIndex=floating?0:-1;
    record.toolbar.title=floating?'拖动标题栏移动窗口；方向键微调位置':'';
    if(floating&&record.bounds)applyPosition(record);
    else {record.node.style.removeProperty('transform');updateView(view);}
  }
  function setFloating(id,value) {
    if(!alive || !(id in state))return;
    if(drag?.record.id===id)stopDrag();
    state[id]=Boolean(value);
    const record=records.get(id);
    if(record)renderRecord(id,record);
    notify();
  }
  function release(record) {
    if(drag?.record===record)stopDrag(false);
    record.button.removeEventListener('click',record.toggle);
    record.node.removeEventListener('pointerdown',record.raise);
    record.node.removeEventListener('focusin',record.raise);
    for(const [event,handler] of record.listeners)record.toolbar.removeEventListener(event,handler);
    record.toolbar.remove();
    for(const [name,value] of record.attributes) {
      if(value===null)record.node.removeAttribute(name);else record.node.setAttribute(name,value);
    }
    for(const [name,value,priority] of record.variables) {
      if(value)record.node.style.setProperty(name,value,priority);else record.node.style.removeProperty(name);
    }
  }
  function attach(id,node) {
    if(records.get(id)?.node===node)return false;
    if(records.has(id)){release(records.get(id));records.delete(id);}
    if(!node)return true;
    const toolbar=doc.createElement('div');
    toolbar.className='dsc-screen-toolbar';toolbar.dataset.skinOwner=owner;
    const title=doc.createElement('span');title.textContent=TITLES[id];
    const button=doc.createElement('button');button.type='button';button.dataset.dscDockToggle=id;
    toolbar.append(title,button);
    toolbar.setAttribute('aria-label',`${LABELS[id]}窗口标题栏`);
    const record={id,node,toolbar,button,offset:{x:0,y:0},
      attributes:['data-dsc-screen','data-dsc-floating','data-dsc-dragging'].map(name=>[name,node.getAttribute(name)]),
      variables:VARIABLES.map(name=>[name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]),
      toggle:()=>setFloating(id,!state[id]),
      raise:()=>{if(state[id])restack(id);}};
    record.listeners=[['pointerdown',event=>startDrag(event,record)],['pointermove',moveDrag],['pointerup',endDrag],['pointercancel',endDrag],['lostpointercapture',endDrag],
      ['keydown',event=>{
        if(event.target!==toolbar||!state[id])return;
        const movement={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
        if(!movement)return;
        event.preventDefault();const step=event.shiftKey?24:8;
        record.offset.x+=movement[0]*step;record.offset.y+=movement[1]*step;applyPosition(record);
      }]];
    node.dataset.dscScreen=id;node.prepend(toolbar);
    button.addEventListener('click',record.toggle);node.addEventListener('pointerdown',record.raise);node.addEventListener('focusin',record.raise);
    for(const [event,handler] of record.listeners)toolbar.addEventListener(event,handler);
    records.set(id,record);renderRecord(id,record);return true;
  }
  function geometry() {
    if(!alive)return;
    const width=win.innerWidth, height=win.innerHeight;
    const m=metrics=cabinMetrics(width,height),layout=floatingLayout(width,height);
    for(const [id,record] of records) {
      const base=SCREEN_QUADS[id].map(([x,y])=>[x/1672*width,m.horizon+(y-447)/383*m.deckHeight]);
      const screenWidth=id==='command'?Math.max(460,base[1][0]-base[0][0]):280;
      const screenHeight=Math.max(200,((base[2][1]-base[1][1])+(base[3][1]-base[0][1]))/2);
      record.node.style.setProperty('--dsc-screen-width',`${screenWidth}px`);
      record.node.style.setProperty('--dsc-screen-height',`${screenHeight}px`);
      record.matrix=quadToMatrix(screenWidth,screenHeight,base);
      record.bounds=layout[id];
      for(const [key,value] of Object.entries({left:record.bounds.x,top:record.bounds.y,width:record.bounds.width,height:record.bounds.height})) {
        record.node.style.setProperty(`--dsc-float-${key}`,`${value}px`);
      }
      applyPosition(record);
    }
    updateView(getView(),m);
  }
  function refresh() {
    if(!alive)return;
    const sidebar=root?.querySelector('[class*="_sidebarCol"]');
    const frame=sidebar?.parentElement;
    attach('mission',sidebar || root?.querySelector('[data-pane="sidebar"]'));
    attach('command',[...(frame?.children || [])].find(node=>node.className?.includes?.('_centerCol')) || root?.querySelector('[data-pane="conversation"]'));
    attach('core',core);
    geometry();
  }
  // Native message streaming and token updates do not change screen identity.
  const observer=new win.MutationObserver(changes=>{
    if(changes.some(change=>[...change.addedNodes,...change.removedNodes].some(node=>node.nodeType===1&&(node.matches(SURFACES)||node.querySelector(SURFACES)))))refresh();
  });
  if(root)observer.observe(root,{childList:true,subtree:true});
  const resize=win.ResizeObserver?new win.ResizeObserver(geometry):null;
  const canopy=doc.querySelector('.dsc-canopy');if(canopy)resize?.observe(canopy);
  win.addEventListener('resize',geometry);
  refresh();notify();
  return {refresh,updateView,setFloating,getState:()=>({...state}),dispose(){
    if(!alive)return;alive=false;observer.disconnect();resize?.disconnect();win.removeEventListener('resize',geometry);
    for(const record of records.values())release(record);records.clear();
  }};
}
