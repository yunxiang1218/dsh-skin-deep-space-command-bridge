// Match live HTML surfaces to the apertures in the original cockpit artwork.
// The host owns every React node; docking changes only presentation attributes.
import {cabinMetrics,cabinMatrix,multiplyMatrices} from './cabin-camera.js';
export const SCREEN_QUADS = {
  mission: [[135,499],[425,486],[408,762],[64,781]],
  command: [[527,485],[1145,485],[1163,766],[508,766]],
  core: [[1247,488],[1530,503],[1601,780],[1261,766]],
};
const LABELS = {mission:'任务屏',command:'主控制台',core:'AI 核心屏'};
const TITLES = {mission:'01 / MISSION',command:'02 / DEEPSEEK AI',core:'03 / AI CORE'};
const VARIABLES = ['--dsc-screen-width','--dsc-screen-height','--dsc-screen-transform','--dsc-screen-z'];

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
  let alive=true, raised=20;
  const notify=()=>onChange?.({...state});
  function renderRecord(id,record) {
    const floating=state[id];
    record.node.dataset.dscFloating=String(floating);
    record.button.textContent=floating?'↙ 嵌回':'↗ 悬浮';
    record.button.setAttribute('aria-label',`${LABELS[id]}：${floating?'嵌回屏幕':'悬浮屏幕'}`);
    record.button.setAttribute('aria-pressed',String(floating));
    record.node.style.setProperty('--dsc-screen-z',String(floating?++raised:6));
  }
  function setFloating(id,value) {
    if(!alive || !(id in state))return;
    state[id]=Boolean(value);
    const record=records.get(id);
    if(record)renderRecord(id,record);
    notify();
  }
  function release(record) {
    record.button.removeEventListener('click',record.toggle);
    record.node.removeEventListener('pointerdown',record.raise);
    record.toolbar.remove();
    for(const [name,value] of record.attributes) {
      if(value===null)record.node.removeAttribute(name);else record.node.setAttribute(name,value);
    }
    for(const [name,value,priority] of record.variables) {
      if(value)record.node.style.setProperty(name,value,priority);else record.node.style.removeProperty(name);
    }
  }
  function attach(id,node) {
    if(records.get(id)?.node===node)return;
    if(records.has(id)){release(records.get(id));records.delete(id);}
    if(!node)return;
    const toolbar=doc.createElement('div');
    toolbar.className='dsc-screen-toolbar';toolbar.dataset.skinOwner=owner;
    const title=doc.createElement('span');title.textContent=TITLES[id];
    const button=doc.createElement('button');button.type='button';button.dataset.dscDockToggle=id;
    toolbar.append(title,button);
    const record={node,toolbar,button,
      attributes:['data-dsc-screen','data-dsc-floating'].map(name=>[name,node.getAttribute(name)]),
      variables:VARIABLES.map(name=>[name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]),
      toggle:()=>setFloating(id,!state[id]),
      raise:()=>{if(state[id])node.style.setProperty('--dsc-screen-z',String(++raised));}};
    node.dataset.dscScreen=id;node.prepend(toolbar);
    button.addEventListener('click',record.toggle);node.addEventListener('pointerdown',record.raise);
    records.set(id,record);renderRecord(id,record);
  }
  function geometry() {
    if(!alive)return;
    const width=win.innerWidth, height=win.innerHeight;
    const m=cabinMetrics(width,height),camera=cabinMatrix(getView(),m);
    for(const [id,record] of records) {
      const base=SCREEN_QUADS[id].map(([x,y])=>[x/1672*width,m.horizon+(y-447)/383*m.deckHeight]);
      const screenWidth=id==='command'?Math.max(460,base[1][0]-base[0][0]):280;
      const screenHeight=Math.max(200,((base[2][1]-base[1][1])+(base[3][1]-base[0][1]))/2);
      record.node.style.setProperty('--dsc-screen-width',`${screenWidth}px`);
      record.node.style.setProperty('--dsc-screen-height',`${screenHeight}px`);
      record.node.style.setProperty('--dsc-screen-transform',`matrix3d(${multiplyMatrices(camera,quadToMatrix(screenWidth,screenHeight,base)).join(',')})`);
    }
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
  const observer=new win.MutationObserver(refresh);
  if(root)observer.observe(root,{childList:true,subtree:true});
  const resize=win.ResizeObserver?new win.ResizeObserver(geometry):null;
  const canopy=doc.querySelector('.dsc-canopy');if(canopy)resize?.observe(canopy);
  win.addEventListener('resize',geometry);
  refresh();notify();
  return {refresh,setFloating,getState:()=>({...state}),dispose(){
    if(!alive)return;alive=false;observer.disconnect();resize?.disconnect();win.removeEventListener('resize',geometry);
    for(const record of records.values())release(record);records.clear();
  }};
}
