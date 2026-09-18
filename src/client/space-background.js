// High-resolution photographs are uploaded in small strips. A worker performs
// pixel extraction so decoding/raster preparation does not block cabin input.
const VERTEX = `#version 300 es
out vec2 uv;
void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);uv=(p+1.0)*.5;gl_Position=vec4(p,0,1);}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D currentSky;
uniform sampler2D nextSky;
uniform vec2 resolution;
uniform vec2 heading;
uniform vec2 currentSize;
uniform vec2 nextSize;
uniform float blend;
out vec4 color;
vec2 coordinate(vec2 size){
  float cover=max(resolution.x*1.08/size.x,resolution.y*1.08/size.y);
  vec2 pixel=vec2(uv.x,1.0-uv.y)*resolution-resolution*.5-heading;
  return clamp(pixel/(size*cover)+.5,0.0,1.0);
}
void main(){color=mix(texture(currentSky,coordinate(currentSize)),texture(nextSky,coordinate(nextSize)),blend);}`;

function pixelWorker() {
  let canvas, context, imageId, preparing;
  const sources=new Map();
  self.onmessage = async ({data}) => {
    try {
      if(data.type==='register') {
        const source=fetch(data.url).then(response=>{if(!response.ok)throw Error('Image source unavailable');return response.blob();});
        sources.set(data.key,source);source.catch(()=>{});
      } else if (data.type === 'prepare') {
        preparing=data.id;
        const bitmap=data.bitmap || await createImageBitmap(await sources.get(data.key));
        if(preparing!==data.id){bitmap.close();return;}
        imageId = data.id;
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        context = canvas.getContext('2d', {willReadFrequently:true});
        context.drawImage(bitmap,0,0); bitmap.close();
        self.postMessage({type:'ready',id:imageId,width:canvas.width,height:canvas.height});
      } else if (data.type === 'strip' && data.id === imageId) {
        const pixels = context.getImageData(0,data.y,canvas.width,data.rows);
        self.postMessage({type:'strip',id:imageId,y:data.y,rows:data.rows,buffer:pixels.data.buffer},[pixels.data.buffer]);
      } else if (data.type === 'cancel') {
        if(preparing===data.id)preparing=null;
        if(imageId===data.id){imageId=null;canvas=context=null;}
      } else if (data.type === 'release' && data.id === imageId) {
        imageId=null;canvas = context = null;
      }
    } catch(error) {self.postMessage({type:'error',id:data.id,message:error.message});}
  };
}

/** Optional renderer; CSS photographs remain the fallback on any capability failure. */
export function createSpaceBackground(document, {onUnavailable} = {}) {
  const win = document.defaultView;
  if (!win.Worker || !win.OffscreenCanvas || !win.createImageBitmap || !win.WebGL2RenderingContext) return null;
  const canvas = document.createElement('canvas');
  canvas.className='dsc-space-background-gpu';
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  canvas.hidden=true;
  const gl=canvas.getContext('webgl2',{alpha:false,depth:false,stencil:false,antialias:false,powerPreference:'high-performance'});
  if(!gl)return null;
  let worker,program,array,frame=null,job=null,serial=0,width=1,height=1,disposed=false,available=true;
  const shaders=[],textures=new Map(),uniforms={},registered=new Set();
  try {
    program=gl.createProgram();
    for(const [kind,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]) {
      const shader=gl.createShader(kind);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    for(const name of ['currentSky','nextSky','resolution','heading','currentSize','nextSize','blend'])uniforms[name]=gl.getUniformLocation(program,name);
    array=gl.createVertexArray();
    const url=win.URL.createObjectURL(new win.Blob([`(${pixelWorker.toString()})()`],{type:'text/javascript'}));
    try{worker=new win.Worker(url);}finally{win.URL.revokeObjectURL(url);}
  } catch {worker?.terminate();for(const shader of shaders)gl.deleteShader(shader);if(program)gl.deleteProgram(program);if(array)gl.deleteVertexArray(array);return null;}

  function clearDeadline() {
    if(job?.deadline!==undefined)win.clearTimeout(job.deadline);
    if(job)delete job.deadline;
  }
  function armDeadline() {
    clearDeadline();
    // A hidden document intentionally pauses strip uploads with rAF. Only a
    // visible worker/upload that makes no progress for ten seconds has failed.
    if(!job||document.hidden)return;
    job.deadline=win.setTimeout(()=>{if(!document.hidden)fail();},10000);
  }
  function cancelJob() {
    if(!job)return;
    clearDeadline();if(frame!==null)win.cancelAnimationFrame(frame);frame=null;
    const cancelled=job;job=null;serial++;
    worker.postMessage({type:'cancel',id:cancelled.id});
    gl.deleteTexture(cancelled.texture);cancelled.resolve(false);
  }
  function fail() {
    if(!available)return;
    available=false;canvas.hidden=true;
    cancelJob();
    for(const value of textures.values())gl.deleteTexture(value.texture);textures.clear();
    worker.terminate();onUnavailable?.();
  }
  function pump() {
    frame=null;if(!job||!available||disposed)return;
    const chunk=job.chunk;
    if(!chunk)return;
    gl.bindTexture(gl.TEXTURE_2D,job.texture);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,chunk.y,job.width,chunk.rows,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(chunk.buffer));
    job.uploads++; job.chunk=null;
    const y=chunk.y+chunk.rows;
    if(y>=job.height) {
      clearDeadline();const completed=job;job=null;
      textures.set(completed.key,completed);worker.postMessage({type:'release',id:completed.id});
      completed.resolve(true);
    } else worker.postMessage({type:'strip',id:job.id,y,rows:Math.min(job.rows,job.height-y)});
  }
  worker.onmessage=({data})=>{
    if(disposed||!available||!job||data.id!==job.id)return;
    if(data.type==='error'){fail();return;}
    armDeadline();
    if(data.type==='ready') {
      if(data.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||data.height>gl.getParameter(gl.MAX_TEXTURE_SIZE)){fail();return;}
      Object.assign(job,{width:data.width,height:data.height,rows:Math.max(1,Math.floor(512*1024/(data.width*4)))});
      gl.bindTexture(gl.TEXTURE_2D,job.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,data.width,data.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      if(gl.getError()!==gl.NO_ERROR){fail();return;}
      for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);
      for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
      worker.postMessage({type:'strip',id:job.id,y:0,rows:Math.min(job.rows,job.height)});
    } else if(data.type==='strip') {job.chunk=data;frame=win.requestAnimationFrame(pump);}
  };
  worker.onerror=event=>{event.preventDefault();fail();};
  const contextLost=event=>{event.preventDefault();fail();};canvas.addEventListener('webglcontextlost',contextLost);
  const visibilityChanged=()=>armDeadline();document.addEventListener('visibilitychange',visibilityChanged);
  return {
    canvas,
    register(key,url){if(!available||disposed||registered.has(key))return;
      registered.add(key);worker.postMessage({type:'register',key,url:new win.URL(url,document.baseURI).href});},
    resize(w,h,ratio=1){width=w;height=h;const pw=Math.round(w*ratio),ph=Math.round(h*ratio);
      if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;gl.viewport(0,0,pw,ph);},
    async prepare(key,image) {
      if(!available||disposed)return false;
      if(textures.has(key))return true;
      if(job?.key===key)return job.promise;
      // A single producer bounds pixel buffers and GPU uploads. Existing visible
      // textures remain untouched while a new destination is prepared.
      cancelJob();
      const id=++serial;
      let bitmap;
      if(!registered.has(key)) {
        try{bitmap=await win.createImageBitmap(image);}catch{fail();return false;}
        if(disposed||!available||id!==serial){bitmap.close();return false;}
      }
      let resolve;const promise=new Promise(done=>{resolve=done;});
      job={key,id,texture:gl.createTexture(),resolve,promise,uploads:0};
      armDeadline();
      if(bitmap)worker.postMessage({type:'prepare',id,bitmap},[bitmap]);
      else worker.postMessage({type:'prepare',id,key});
      return promise;
    },
    render(currentKey,nextKey,blend,heading) {
      if(!available||disposed)return false;
      const current=textures.get(currentKey),next=textures.get(nextKey)||current;
      if(!current || (nextKey&&!textures.has(nextKey)))return false;
      gl.useProgram(program);gl.bindVertexArray(array);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,current.texture);gl.uniform1i(uniforms.currentSky,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,next.texture);gl.uniform1i(uniforms.nextSky,1);
      gl.uniform2f(uniforms.currentSize,current.width,current.height);gl.uniform2f(uniforms.nextSize,next.width,next.height);
      gl.uniform2f(uniforms.resolution,width,height);gl.uniform2f(uniforms.heading,heading.x,heading.y);gl.uniform1f(uniforms.blend,blend);
      gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);return true;
    },
    retain(keys){if(job&&!keys.includes(job.key))cancelJob();
      for(const [key,value] of textures)if(!keys.includes(key)){gl.deleteTexture(value.texture);textures.delete(key);}},
    get diagnostics(){return {available,textures:textures.size,uploading:job?.key||null,strips:[...textures.values()].map(({key,uploads})=>({key,uploads}))};},
    dispose(){if(disposed)return;disposed=true;serial++;cancelJob();
      worker.terminate();document.removeEventListener('visibilitychange',visibilityChanged);canvas.removeEventListener('webglcontextlost',contextLost);for(const value of textures.values())gl.deleteTexture(value.texture);
      gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);gl.deleteVertexArray(array);
      gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();textures.clear();},
  };
}
