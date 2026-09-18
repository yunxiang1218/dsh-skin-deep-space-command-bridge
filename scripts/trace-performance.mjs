// Optional bounded diagnostic trace. Performance conclusions use a separate,
// untraced run because tracing changes scheduling and allocation costs.
export async function startFrameTrace(page) {
  const session = await page.context().newCDPSession(page), events = [];
  const names = /^(dsc:|Display::(?:DrawAndSwap|FrameDisplayed)|FrameDisplayed|FramePresented|DXGI.*Present|BeginFrame|BeginMainFrame|RasterTask|Paint|ImageDecodeTask)/;
  let discarded = 0;
  session.on('Tracing.dataCollected', ({value}) => {
    for (const event of value) {
      if (event.ph === 'M' || event.dur >= 1000 || names.test(event.name)) events.push(event);
      else discarded++;
    }
  });
  await session.send('Tracing.start', {categories:'blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline.frame,viz,gpu',
    options:'record-until-full',bufferUsageReportingInterval:1000,transferMode:'ReportEvents'});
  return async () => {
    const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.end'); const result = await complete; await session.detach();
    return {traceEvents:events,discardedShortEvents:discarded,dataLossOccurred:result.dataLossOccurred || false};
  };
}
