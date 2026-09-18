// Profiling helpers for the real-host smoke run. This measures browser work and
// animation cadence; it cannot certify a physical 144 Hz display or GPU presentation.
export async function installPerformanceProbe(page,{headless=true}={}) {
  await page.addInitScript(({headless})=>{
    const originalFrame=window.requestAnimationFrame.bind(window),originalCancel=window.cancelAnimationFrame.bind(window);
    let active=null,probeFrame=null;
    const observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>{
      if(active)active.longTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})));
    }):null;
    try{observer?.observe({type:'longtask'});}catch{}
    window.requestAnimationFrame=callback=>originalFrame(now=>{
      const phase=active,start=performance.now();
      try{return callback(now);}finally {
        if(phase&&active===phase)phase.callbacks.push({name:callback.name||'anonymous',duration:performance.now()-start});
      }
    });
    const quantile=(values,fraction)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor((values.length-1)*fraction))]:null;
    window.__dscPerformanceProbe={
      start(label){
        if(probeFrame!==null)originalCancel(probeFrame);
        active={label,start:performance.now(),intervals:[],callbacks:[],longTasks:[],slowIntervals:[]};let last=null;
        performance.mark(`dsc:${label}:start`);
        const sample=now=>{if(!active)return;if(last!==null){
          const duration=now-last;active.intervals.push(duration);
          if(duration>1000/144)active.slowIntervals.push({offsetMs:last-active.start,durationMs:duration});
        }last=now;probeFrame=originalFrame(sample);};
        probeFrame=originalFrame(sample);
      },
      stop(){
        if(probeFrame!==null)originalCancel(probeFrame);probeFrame=null;
        const phase=active;active=null;if(!phase)return null;
        performance.mark(`dsc:${phase.label}:end`);
        const durations=phase.callbacks.map(row=>row.duration),callbacks={};
        for(const row of phase.callbacks)(callbacks[row.name]??=[]).push(row.duration);
        const summarize=values=>({samples:values.length,p50Ms:quantile(values,.5),p95Ms:quantile(values,.95),p99Ms:quantile(values,.99),maxMs:values.length?Math.max(...values):null});
        const cadence=summarize(phase.intervals);
        return {label:phase.label,durationMs:performance.now()-phase.start,cadence,
          medianCadenceFps:cadence.p50Ms?1000/cadence.p50Ms:null,callbacks:summarize(durations),
          callbackGroups:Object.fromEntries(Object.entries(callbacks).map(([key,value])=>[key,summarize(value)])),
          longTasks:phase.longTasks,slowIntervals:phase.slowIntervals,over144HzBudgetCallbacks:durations.filter(value=>value>1000/144).length,
          documentVisibility:document.visibilityState,devicePixelRatio:window.devicePixelRatio,
          limitation:`${headless?'Headless':'Headed'} rAF and callback timings only; not measured physical display presentation or guaranteed 144 fps.`};
      }
    };
  },{headless});
}

export async function startPerformanceSample(page,label) {
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const before=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
  await page.evaluate(name=>window.__dscPerformanceProbe.start(name),label);
  return {session,before};
}

export async function finishPerformanceSample(page,sample) {
  const result=await page.evaluate(()=>window.__dscPerformanceProbe.stop());
  const after=Object.fromEntries((await sample.session.send('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
  await sample.session.detach();
  result.rendererWorkMs=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(key=>[key,(after[key]-sample.before[key])*1000]));
  result.jsHeapUsedBytes=after.JSHeapUsedSize;
  return result;
}
