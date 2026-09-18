// One physical camera drives the artwork, room surfaces and live monitor planes.
export function cabinMetrics(width,height) {
  return {width,height,top:-height*.5,horizon:height*.52,deckHeight:height*.66,
    bottom:height*(.52+.66*494/383),focal:width*.85,cx:width/2,cy:height*.44};
}
export function multiplyMatrices(a,b) {
  return Array.from({length:16},(_,i)=>{
    const row=i%4,col=Math.floor(i/4);let result=0;
    for(let k=0;k<4;k++)result+=a[k*4+row]*b[col*4+k];return result;
  });
}
function cameraPoint(x,y,z,view,m) {
  const yaw=(view.yaw||0)*Math.PI/180,pitch=(view.pitch||0)*Math.PI/180;
  const dx=x-m.cx,dy=y-m.cy,dz=z+m.focal*.45*((view.distance||1)-1);
  const rx=dx*Math.cos(yaw)-dz*Math.sin(yaw),rz=dx*Math.sin(yaw)+dz*Math.cos(yaw);
  return {x:rx,y:dy*Math.cos(pitch)+rz*Math.sin(pitch),z:rz*Math.cos(pitch)-dy*Math.sin(pitch)};
}
export function cabinMatrix(view,m) {
  return planeMatrix(view,m,(x,y)=>[x,y,m.focal]);
}
function planeMatrix(view,m,map) {
  const origin=cameraPoint(...map(0,0),view,m);
  const x=cameraPoint(...map(1,0),view,m),y=cameraPoint(...map(0,1),view,m);
  const homogeneous=p=>[(m.focal*p.x+m.cx*p.z)/m.focal,(m.focal*p.y+m.cy*p.z)/m.focal,0,p.z/m.focal];
  const o=homogeneous(origin),a=homogeneous(x),b=homogeneous(y);
  return [...a.map((v,i)=>v-o[i]),...b.map((v,i)=>v-o[i]),0,0,1,0,...o];
}
// Clip room surfaces at the actual camera near plane before perspective division.
function projectPolygon(points,view,m) {
  let input=points.map(p=>cameraPoint(...p,view,m)),out=[];const near=8;
  for(let i=0;i<input.length;i++) {
    const a=input[i],b=input[(i+1)%input.length],ai=a.z>=near,bi=b.z>=near;
    if(ai)out.push(a);
    if(ai!==bi){const t=(near-a.z)/(b.z-a.z);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near});}
  }
  return out.map(p=>[m.cx+p.x*m.focal/p.z,m.cy+p.y*m.focal/p.z]);
}
export function createCabinRoom(stage,{textureUrl=''}={}) {
  const doc=stage.ownerDocument,win=doc.defaultView,canvas=doc.createElement('canvas');
  canvas.className='dsc-cabin-room';stage.append(canvas);
  canvas.hidden=Boolean(textureUrl);
  const planes=Array.from({length:4},()=>{const node=doc.createElement('div');node.className='dsc-cabin-wall';
    node.style.backgroundImage=`url(${JSON.stringify(textureUrl)})`;
    node.style.display=textureUrl?'block':'none';node.style.willChange='transform';stage.append(node);return node;});
  // Textured hull panels are compositor layers. They need no full-viewport 2D canvas repaint.
  const ctx=textureUrl?null:canvas.getContext('2d');let oldSize='',oldView='',faces=[];
  function render(view,m) {
    const ratio=Math.min(win.devicePixelRatio||1,1.5),size=`${m.width}:${m.height}:${ratio}`;
    const viewKey=`${view.yaw||0}:${view.pitch||0}:${view.distance||1}`;
    if(size===oldSize&&viewKey===oldView)return;
    oldView=viewKey;
    if(size!==oldSize){
      if(ctx){canvas.width=m.width*ratio;canvas.height=m.height*ratio;}
      const front=m.focal,back=-m.focal*2.5;
      faces=[
        {u:m.width,v:front-back,map:(u,v)=>[u,m.top,front-v],floor:false},
        {u:m.width,v:front-back,map:(u,v)=>[u,m.bottom,front-v],floor:true},
        {u:front-back,v:m.bottom-m.top,map:(u,v)=>[0,m.top+v,front-u]},
        {u:front-back,v:m.bottom-m.top,map:(u,v)=>[m.width,m.top+v,front-u]},
      ];
      for(const [index,face] of faces.entries()){
        const plane=planes[index];
        plane.style.width=`${face.u}px`;plane.style.height=`${face.v}px`;
        plane.style.backgroundSize=`${m.width*.78}px ${m.width*.78}px`;
        plane.style.filter=`brightness(${face.floor?.56:.78})`;
      }
      oldSize=size;
    }
    if(textureUrl){
      for(const [index,face] of faces.entries())
        planes[index].style.transform=`matrix3d(${planeMatrix(view,m,face.map).join(',')})`;
      return;
    }
    if(!ctx)return;
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,m.width,m.height);
    const draw=(points,fill,stroke,line=1)=>{
      const p=projectPolygon(points,view,m);if(p.length<3)return;
      ctx.beginPath();ctx.moveTo(...p[0]);for(const q of p.slice(1))ctx.lineTo(...q);ctx.closePath();
      if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
    };
    // Full room volume, not an enlarged picture with empty margins. Inset panels,
    // bevels, cooling slots and lit conduits share the same world coordinates.
    for(const face of faces) {
      const box=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>face.map(...p));
      draw(box(0,0,face.u,face.v),'#182832','#4b6776',2);
      const nu=Math.ceil(face.u/(m.width*.17)),nv=Math.ceil(face.v/(m.height*.31));
      const tw=face.u/nu,th=face.v/nv;
      for(let i=0;i<nu;i++)for(let j=0;j<nv;j++) {
        const x=i*tw,y=j*th;
        draw(box(x+2,y+2,tw-4,th-4),'#0b151e','#547080',1.5);
        draw(box(x+8,y+8,tw-16,th-16),(i+j)%2?'#203440':'#263a45','#354f5e',1);
        draw(box(x+12,y+12,tw-24,th*.12),'#344b58','#59717b',1);
        draw(box(x+tw*.13,y+th*.35,tw*.74,th*.43),'#111e27','#071019',2);
        for(let k=0;k<7;k++)draw(box(x+tw*.17,y+th*(.4+k*.043),tw*.66,th*.012),'#071016','#3d525c',.65);
        for(const px of [.08,.9])for(const py of [.1,.88])draw(box(x+tw*px,y+th*py,tw*.018,th*.016),'#73848a','#02090e',1);
        if(!face.floor && (i+j)%2===0) {
          draw(box(x+tw*.07,y+th*.83,tw*.86,th*.035),'#255a72','#43859f',3);
          draw(box(x+tw*.1,y+th*.838,tw*.8,th*.012),'#a9ecff','#5ab8dc',2);
        } else draw(box(x+tw*.14,y+th*.86,tw*.3,th*.013),'#bb9d61');
      }
    }
  }
  return {render,dispose:()=>{canvas.remove();planes.forEach(node=>node.remove());}};
}
