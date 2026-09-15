import { createHostAdapter } from './host-adapter.js';
import { createSpaceEnvironment } from './space-environment.js';
import { themeTokens } from './palette.js';
import { createScreenDocking } from './screen-docking.js';
import { cabinMetrics, cabinMatrix, createCabinRoom } from './cabin-camera.js';

// ModelDirectoryResolver executes remote access with the calling plugin's context.
export const inject = ['theme', 'sessions', 'workspaces', 'modelDirectories', 'connection', 'remote', 'remote.session'];
export const OWNER = 'deep-space-command-bridge';
export const BODY_ATTRIBUTE = 'data-dsh-deep-space-command-bridge';
const instances = new WeakMap();
const WINDOW_APERTURES = 'M218 0H588L643 52H1027L1080 0H1450L1330 365L1201 400H487L338 366Z M31 0H141L268 361L68 460L0 396V302L61 111Z M1533 0H1644L1610 112L1672 302V397L1604 461L1403 360Z';

function element(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Mount only theme-owned siblings. The native editor, transcript and tools stay intact. */
export function createBridge(ctx, options = {}) {
  const doc = options.document || document;
  const win = doc.defaultView;
  instances.get(doc)?.();
  const cleanups = [];
  const owned = [];
  const own = (node) => { node.dataset.skinOwner = OWNER; owned.push(node); return node; };
  const oldAttr = doc.body.getAttribute(BODY_ATTRIBUTE);
  const oldLayout = doc.body.getAttribute('data-dsc-layout');
  let alive = true;
  function dispose() {
    if (!alive) return;
    alive = false;
    for (const release of cleanups.reverse()) {
      try { if (typeof release === 'function') release(); }
      catch (error) { console.warn('[Deep Space Bridge] cleanup:', error); }
    }
    for (const node of owned) node.remove();
    if (oldAttr === null) doc.body.removeAttribute(BODY_ATTRIBUTE);
    else doc.body.setAttribute(BODY_ATTRIBUTE, oldAttr);
    if (oldLayout === null) doc.body.removeAttribute('data-dsc-layout');
    else doc.body.setAttribute('data-dsc-layout', oldLayout);
    if (instances.get(doc) === dispose) instances.delete(doc);
  }
  try {
  doc.body.setAttribute(BODY_ATTRIBUTE, '');
  doc.body.setAttribute('data-dsc-layout', 'bridge');
  const css = options.css ?? (typeof __BRIDGE_CSS__ !== 'undefined' ? __BRIDGE_CSS__ : '');
  const backgroundUrl = options.backgroundUrl ?? (typeof __BRIDGE_BACKGROUND__ !== 'undefined' ? __BRIDGE_BACKGROUND__ : '');
  const frameUrl = options.frameUrl ?? (typeof __BRIDGE_FRAME__ !== 'undefined' ? __BRIDGE_FRAME__ : '');
  const backgroundInfo = options.backgroundInfo ?? (typeof __BRIDGE_BACKGROUND_INFO__ !== 'undefined' ? __BRIDGE_BACKGROUND_INFO__ : {});
  const style = own(element(doc, 'style', ''));
  style.textContent = css;
  doc.head.append(style);
  const releaseTokens = ctx.theme?.overrideTokens?.(OWNER, themeTokens());
  if (typeof releaseTokens === 'function') cleanups.push(releaseTokens);

  const stage = own(element(doc, 'div', 'dsc-stage'));
  stage.setAttribute('aria-hidden', 'true');
  doc.body.prepend(stage);
  let screens,room,front;
  const updateCabin = state => {
    const m=cabinMetrics(win.innerWidth,win.innerHeight);
    stage.style.setProperty('--dsc-window-top',`${m.top}px`);
    stage.style.setProperty('--dsc-window-height',`${m.horizon-m.top}px`);
    stage.style.setProperty('--dsc-deck-top',`${m.horizon}px`);
    stage.style.setProperty('--dsc-deck-height',`${m.bottom-m.horizon}px`);
    if(front)front.style.transform=`matrix3d(${cabinMatrix(state,m).join(',')})`;
    room?.render(state,m);
    screens?.refresh();
  };
  const space = createSpaceEnvironment(stage, {backgroundUrl,onChange:updateCabin});
  updateCabin(space.getState());
  cleanups.push(() => space.dispose());
  room=createCabinRoom(stage,{textureUrl:typeof __BRIDGE_HULL__!=='undefined'?__BRIDGE_HULL__:''});cleanups.push(()=>room.dispose());
  front=element(doc,'div','dsc-cabin-front');stage.append(front);
  const canopy = element(doc, 'div', 'dsc-canopy');
  // Apertures are composited in the browser. The source artwork contains no seats.
  canopy.innerHTML = `<svg viewBox="0 0 1672 447" preserveAspectRatio="none"><defs><mask id="dsc-window-aperture"><rect width="1672" height="941" fill="white"/><path fill="black" d="${WINDOW_APERTURES}"/></mask><clipPath id="dsc-scene-window-clip" clipPathUnits="userSpaceOnUse"><path id="dsc-scene-apertures" d="${WINDOW_APERTURES}"/></clipPath></defs><image width="1672" height="941" mask="url(#dsc-window-aperture)"/></svg>`;
  canopy.querySelector('image').setAttribute('href', frameUrl);
  front.append(canopy);
  const deck = element(doc, 'div', 'dsc-deck');
  deck.innerHTML = `<svg viewBox="0 447 1672 494" preserveAspectRatio="none"><image width="1672" height="941"/></svg>`;
  deck.querySelector('image').setAttribute('href', frameUrl);
  front.append(deck);
  const resizeCabin=()=>updateCabin(space.getState());
  win.addEventListener('resize',resizeCabin);
  cleanups.push(()=>win.removeEventListener('resize',resizeCabin));
  resizeCabin();

  const header = own(element(doc, 'header', 'dsc-header'));
  header.innerHTML = `<div class="dsc-brand"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 44 38H4Z M24 15 35 34H13Z M24 3v12 M4 38l9-4 M44 38l-9-4"/></svg><div><span class="dsc-eyebrow">DEEPSEEK HARNESS · ORBITAL SYSTEMS</span><h1>Deep Space <strong>Command Bridge</strong></h1></div></div><div class="dsc-ship-tag"><span class="dsc-led"></span> COMMAND DECK <span class="dsc-serial">DS / 01</span></div>`;
  const viewport = own(element(doc, 'div', 'dsc-viewport-caption'));
  viewport.innerHTML = `<div><span class="dsc-eyebrow">OBSERVATION WINDOW</span><p>Beyond the horizon.</p></div><div class="dsc-bearing" aria-hidden="true">−60° <span>┄┄┄┄┄┄┄┄┄┄┄ ⌖ ┄┄┄┄┄┄┄┄┄┄┄</span> +60°</div><span class="dsc-window-tag">CARINA NEBULA / NGC 3324</span>`;
  doc.body.append(header, viewport);
  viewport.querySelector('.dsc-window-tag').textContent = backgroundInfo.label || 'DEEP SPACE / OBSERVATION';
  const credit = own(element(doc, 'a', 'dsc-image-credit', backgroundInfo.credit || ''));
  if (/^https:\/\//.test(backgroundInfo.source || '')) credit.href = backgroundInfo.source;
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  doc.body.append(credit);
  const layoutButton = element(doc, 'button', 'dsc-layout-toggle', '展开工作区');
  layoutButton.type = 'button';
  layoutButton.setAttribute('aria-pressed', 'false');
  const toggleLayout = () => screens?.setFloating('command',!screens.getState().command);
  layoutButton.addEventListener('click', toggleLayout);
  cleanups.push(() => layoutButton.removeEventListener('click', toggleLayout));
  header.append(layoutButton);

  const core = own(element(doc, 'aside', 'dsc-core dsc-panel'));
  core.setAttribute('aria-label', 'AI Core Panel · AI 核心控制');
  core.innerHTML = `<div class="dsc-panel-title"><div><span class="dsc-eyebrow">02 / INTELLIGENCE</span><h2>AI CORE PANEL</h2></div><span class="dsc-led"></span></div><div class="dsc-core-orbit" aria-hidden="true"><div class="dsc-orbit-a"></div><div class="dsc-orbit-b"></div><div class="dsc-orbit-c"></div><svg viewBox="0 0 44 44"><path d="m22 4 16 9v18l-16 9-16-9V13Z M6 13l16 10 16-10 M22 23v17 M22 4v19"/></svg><span>NEURAL LINK</span></div>`;
  const actionsError = element(doc, 'p', 'dsc-action-error');
  actionsError.setAttribute('role', 'status');
  actionsError.hidden = true;
  const field = (label, key) => {
    const wrap = element(doc, 'label', 'dsc-field');
    wrap.append(element(doc, 'span', 'dsc-field-label', label));
    const select = element(doc, 'select', 'dsc-select');
    select.dataset.dscControl = key;
    wrap.append(select);
    core.append(wrap);
    return select;
  };
  const modelSelect = field('MODEL / 当前模型', 'model');
  const thinkingSelect = field('THINKING / 推理能力', 'thinking');
  const modeSelect = field('AI MODE / 工作模式', 'mode');
  const modeNote = element(doc, 'p', 'dsc-note');
  core.append(modeNote, actionsError);
  const tokenCard = element(doc, 'section', 'dsc-token-card');
  tokenCard.innerHTML = `<div class="dsc-section-label">TOKEN TELEMETRY <span>会话累计</span></div><div class="dsc-token-total">— <small>TOKENS</small></div><div class="dsc-token-grid"><span>INPUT <b data-dsc-token="input">—</b></span><span>OUTPUT <b data-dsc-token="output">—</b></span></div><div class="dsc-pressure"><i></i></div><p class="dsc-note" data-dsc-pressure>等待 DSH 上下文数据</p>`;
  core.append(tokenCard);
  const status = element(doc, 'section', 'dsc-system-status');
  status.innerHTML = `<div class="dsc-section-label">SYSTEM STATUS</div><dl><div><dt>Harness 连接</dt><dd data-dsc-status="connection">—</dd></div><div><dt>Agent 状态</dt><dd data-dsc-status="agent">—</dd></div></dl>`;
  core.append(status);
  const navigation = own(element(doc, 'section', 'dsc-navigation dsc-panel'));
  const navBar=element(doc,'div','dsc-navigation-bar');
  const navToggle=element(doc,'button','dsc-navigation-toggle','展开飞行控制');navToggle.type='button';
  navToggle.setAttribute('aria-expanded','false');space.controls.id='dsc-flight-controls';navToggle.setAttribute('aria-controls',space.controls.id);
  space.controls.hidden=true;
  const toggleNavigation=()=>{space.controls.hidden=!space.controls.hidden;navToggle.textContent=space.controls.hidden?'展开飞行控制':'收起飞行控制';navToggle.setAttribute('aria-expanded',String(!space.controls.hidden));};
  navToggle.addEventListener('click',toggleNavigation);cleanups.push(()=>navToggle.removeEventListener('click',toggleNavigation));
  const observe=element(doc,'button','dsc-observe-button','抬头观景');observe.type='button';
  const returnView=element(doc,'button','dsc-return-view','返回驾驶台');returnView.type='button';
  const lookUp=()=>space.setView({yaw:0,pitch:18});const lookForward=()=>space.reset();
  observe.addEventListener('click',lookUp);returnView.addEventListener('click',lookForward);
  cleanups.push(()=>{observe.removeEventListener('click',lookUp);returnView.removeEventListener('click',lookForward);});
  navBar.append(navToggle,observe,returnView);navigation.append(navBar,space.controls);
  doc.body.append(navigation);
  (doc.getElementById('root') || doc.body).append(core);

  const mission = own(element(doc, 'section', 'dsc-mission'));
  mission.setAttribute('aria-label', 'Mission Panel · 任务遥测');
  mission.innerHTML = `<div class="dsc-panel-title"><div><span class="dsc-eyebrow">01 / OPERATIONS</span><h2>MISSION PANEL</h2></div><span class="dsc-mission-cross">⌖</span></div><div class="dsc-mission-workspace"><span class="dsc-section-label">WORKSPACE</span><strong data-dsc-mission="workspace">等待选择工作区</strong></div><div class="dsc-current-task"><span class="dsc-section-label">CURRENT MISSION / 当前任务</span><p data-dsc-mission="task">准备接收指令</p></div><div class="dsc-section-label dsc-history-label">MISSION ARCHIVE / 历史对话</div>`;
  const activity = own(element(doc, 'section', 'dsc-activity'));
  activity.setAttribute('aria-label', '文件状态与 Agent 执行日志');
  activity.innerHTML = `<div class="dsc-section-label">AGENT LOG / 最近执行</div><ol class="dsc-log-list"></ol><div class="dsc-section-label">FILES / 已观测文件</div><ul class="dsc-file-list"></ul>`;
  const missionFallback = own(element(doc, 'details', 'dsc-mission-fallback'));
  missionFallback.append(element(doc, 'summary', '', 'MISSION PANEL / 任务与文件'));
  const fallbackBody = element(doc, 'div', 'dsc-mission-fallback-body');
  missionFallback.append(fallbackBody);
  core.append(missionFallback);
  const attachMission = () => {
    const sidebar = doc.querySelector('[data-dsh-sidebar-root][data-dsh-sidebar-wide="true"]') || doc.querySelector('[data-pane="sidebar"] [data-dsc-preview-sidebar]');
    const target = sidebar || fallbackBody;
    if (mission.parentNode !== target) target.prepend(mission);
    if (activity.parentNode !== target) target.append(activity);
    if (missionFallback.hidden !== !!sidebar) missionFallback.hidden = !!sidebar;
  };
  attachMission();
  const observer = new win.MutationObserver((records) => {
    if (records.some(r => !r.target.closest?.('[data-skin-owner]'))) attachMission();
  });
  observer.observe(doc.getElementById('root') || doc.body, {childList: true, subtree: true, attributes:true, attributeFilter:['data-dsh-sidebar-wide']});
  cleanups.push(() => observer.disconnect());

  screens = createScreenDocking({document:doc,core,owner:OWNER,getView:()=>space.getState(),onChange(state){
    layoutButton.textContent=state.command?'返回舰桥':'展开工作区';
    layoutButton.setAttribute('aria-pressed',String(state.command));
  }});
  cleanups.push(()=>screens.dispose());

  const adapter = options.adapter || createHostAdapter(ctx, doc);
  cleanups.push(() => adapter.dispose());
  const runAction = async (control, fn, value) => {
    control.disabled = true;
    actionsError.hidden = true;
    try { await fn(value); }
    catch (error) {
      if (alive) { actionsError.textContent = `DSH 未执行此操作：${error.message || error}`; actionsError.hidden = false; }
    } finally { if (alive) render(adapter.read()); }
  };
  const bindSelect = (control, key) => {
    const handler = () => runAction(control, (value) => adapter.actions[key](value), control.value);
    control.addEventListener('change', handler);
    cleanups.push(() => control.removeEventListener('change', handler));
  };
  bindSelect(modelSelect, 'setModel');
  bindSelect(thinkingSelect, 'setThinking');
  bindSelect(modeSelect, 'setMode');
  const syncSelect = (select, state, empty) => {
    const rows = state?.options || [];
    const normalized = rows.map(row => ({value: String(row.id ?? row.value), label: row.label ?? row.name ?? row.id}));
    const value = String(state?.id ?? state?.value ?? '');
    if (!normalized.length) normalized.push({value, label: state?.label || empty});
    else if (value && !normalized.some(row=>row.value===value)) normalized.unshift({value,label:state?.label || value});
    const signature = JSON.stringify(normalized);
    if (select.dataset.options !== signature) {
      select.replaceChildren(...normalized.map(row=>{const opt=element(doc,'option','',row.label);opt.value=row.value;return opt;}));
      select.dataset.options = signature;
    }
    select.value = value || normalized[0].value;
    select.disabled = !state?.available;
    select.title = state?.reason || state?.error || '';
  };
  const text = (root, selector, value) => {const node=root.querySelector(selector);if(node.textContent!==String(value))node.textContent=String(value);};
  const renderRows = (root, selector, rows, empty, renderRow) => {
    const list = root.querySelector(selector);
    const signature = JSON.stringify(rows);
    if (list.dataset.rows === signature) return;
    list.dataset.rows = signature;
    list.replaceChildren(...(rows.length ? rows.map(renderRow) : [element(doc, 'li', 'dsc-empty', empty)]));
  };
  const formatCount = (value) => Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
  function render(snapshot) {
    if (!alive) return;
    syncSelect(modelSelect, snapshot.model, snapshot.model?.error ? '模型目录读取失败' : snapshot.workspace ? '请在设置中配置模型' : '选择工作区后加载模型');
    syncSelect(thinkingSelect, snapshot.thinking, '当前模型不提供此选项');
    syncSelect(modeSelect, snapshot.mode, '等待会话');
    modeNote.textContent = snapshot.mode?.available ? 'Agent 执行任务 · Plan 先规划' : snapshot.mode?.reason === 'Subagent session is read-only' ? '子 Agent 会话仅供查看' : snapshot.mode?.reason === 'Host disconnected' ? '等待 Harness 恢复连接' : '打开会话后可切换工作模式';
    text(mission, '[data-dsc-mission="workspace"]', snapshot.workspace?.path || snapshot.workspace?.title || snapshot.session?.cwd || '等待选择工作区');
    text(mission, '[data-dsc-mission="task"]', snapshot.session?.summary || snapshot.session?.title || '准备接收指令');
    text(status, '[data-dsc-status="connection"]', ({connected:'已连接',connecting:'连接中',disconnected:'已断开'})[snapshot.connection?.state] || snapshot.connection?.state || '未知');
    status.querySelector('[data-dsc-status="agent"]').dataset.value = snapshot.session?.status || 'unavailable';
    text(status, '[data-dsc-status="agent"]', ({blank:'准备就绪',ready:'就绪',running:'执行中',loading:'加载中',error:'执行异常',unavailable:'等待会话'})[snapshot.session?.status] || (snapshot.session ? '就绪' : '等待会话'));
    const tokens = snapshot.tokens || {};
    const total = tokenCard.querySelector('.dsc-token-total');
    total.replaceChildren(doc.createTextNode(tokens.available ? formatCount(tokens.total) + ' ' : '— '), element(doc,'small','', 'TOKENS'));
    text(tokenCard, '[data-dsc-token="input"]', formatCount(tokens.input));
    text(tokenCard, '[data-dsc-token="output"]', formatCount(tokens.output));
    const capacity = tokens.contextWindow;
    const used = tokens.contextUsed ?? tokens.contextProjected;
    const ratio = Number.isFinite(capacity) && capacity > 0 && Number.isFinite(used) ? Math.max(0,Math.min(100,used/capacity*100)) : null;
    tokenCard.querySelector('.dsc-pressure i').style.width = `${ratio ?? 0}%`;
    text(tokenCard, '[data-dsc-pressure]', ratio === null ? '上下文压力：DSH 尚未提供' : `上下文 ${ratio.toFixed(1)}% · ${formatCount(used)} / ${formatCount(capacity)}`);
    renderRows(activity,'.dsc-log-list',(snapshot.tools || []).slice(0,3),'暂无 Agent 执行记录',row=>{
      const li=element(doc,'li','dsc-log-row');li.append(element(doc,'span','dsc-log-dot'),element(doc,'span','',row.name || row.tool || row.type || 'Tool'),element(doc,'small','',row.status || ''));return li;
    });
    renderRows(activity,'.dsc-file-list',(snapshot.files || []).slice(-2).reverse(),'暂无工具产生的文件',row=>{
      const li=element(doc,'li','dsc-file-row',row.path || row.name || String(row));li.title=row.path || '';return li;
    });
  }
  cleanups.push(adapter.subscribe(() => render(adapter.read())));
  render(adapter.read());
  const bottom = own(element(doc,'footer','dsc-bottom'));
  bottom.innerHTML = `<span><i class="dsc-led"></i> DEEP SPACE COMMAND BRIDGE</span><span>MISSION SYSTEMS / DSH NATIVE</span><span>INTERFACE v0.2</span>`;
  doc.body.append(bottom);
  instances.set(doc, dispose);
  return {dispose, space, adapter, screens};
  } catch (error) {
    dispose();
    throw error;
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    try {
      const bridge = createBridge(ctx);
      return () => bridge.dispose();
    } catch (error) {
      console.error('[Deep Space Bridge] Theme could not start; native DSH remains available.', error);
      return () => {};
    }
  }, `${OWNER}: cockpit and telemetry`);
}
