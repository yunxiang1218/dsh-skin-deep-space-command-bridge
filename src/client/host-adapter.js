/**
 * Read-only presentation over DSH 0.1.2-rc.1's official client services.
 * No DOM scraping, private backend URLs, polling, or synthetic telemetry.
 * The only writes are explicit actions forwarded to the owning host service.
 *
 * Inject: sessions, workspaces, modelDirectories, connection.
 * Optional: uiWorkspace (new session), remote.session (open produced file).
 * Host-owned stores/directories are never disposed by this adapter.
 */
const PROJECTIONS = ['goal', 'plan', 'agentPreset', 'tokenUsage', 'contextPressure', 'sessionStats'];
const snapshotOf = (source) => source?.getSnapshot?.();
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === 'string' ? value : '';
const count = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const basename = (path) => path.split(/[\\/]/).filter(Boolean).at(-1) || path;
// Cordis get() explicitly permits optional service reads without injection.
// Property access on its context proxy can throw for an uninjected service.
const service = (ctx, name) => typeof ctx.get === 'function' ? ctx.get(name) : ctx[name];
const errorMessage = (error) => error instanceof Error ? error.message : String(error);

function contentText(content) {
  if (typeof content === 'string') return content;
  return array(content).map((part) => part?.type === 'text' ? text(part.text) : contentText(part?.content)).filter(Boolean).join('\n');
}

function mutationPath(name, raw) {
  let args;
  try { args = JSON.parse(raw); } catch { return null; }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
  let path;
  if (name === 'write' && typeof args.content === 'string') path = args.file_path;
  if (name === 'edit' && typeof args.old_string === 'string' && args.old_string.length > 0 && typeof args.new_string === 'string' && args.old_string !== args.new_string && (args.replace_all === undefined || typeof args.replace_all === 'boolean')) path = args.file_path;
  if (name === 'str_replace_editor') {
    const valid = args.command === 'create' && typeof args.file_text === 'string'
      || args.command === 'str_replace' && typeof args.old_str === 'string' && args.old_str.length > 0 && (args.new_str === undefined || typeof args.new_str === 'string')
      || args.command === 'insert' && Number.isInteger(args.insert_line) && args.insert_line >= 0 && typeof args.new_str === 'string';
    if (valid) path = args.path;
  }
  return typeof path === 'string' && path.trim() ? path : null;
}

/** Event window contains actual wire entries, including packed chunk entries. */
function readEvents(window) {
  const calls = new Map(), produced = new Map();
  let firstPrompt = '';
  for (const entry of array(window?.entries)) {
    const event = entry?.event;
    if (!event || entry.type !== 'event') continue;
    const data = event.data ?? {};
    if (event.type === 'user/message' && event.surfaceOp === 'append' && !firstPrompt) firstPrompt = contentText(data.message?.content);
    if (event.type === 'tool/call') {
      const id = String(data.callId);
      calls.set(id, { id, name: text(data.name), status: 'pending', detail: text(data.arguments), seq: event.seq, time: event.time ?? null, path: mutationPath(data.name, data.arguments) });
    }
    if (event.type === 'tool/result' && event.surfaceOp === 'append') {
      const call = calls.get(String(data.message?.source?.callId));
      if (!call) continue;
      const failed = data.message?.content?.[0]?.isError === true;
      call.status = failed ? 'error' : 'completed';
      call.result = contentText(data.message?.content);
      if (!failed && call.path) produced.set(call.path, { id: call.path, path: call.path, name: basename(call.path), status: 'written', tool: call.name, seq: event.seq });
    }
  }
  return { files: [...produced.values()], tools: [...calls.values()].slice(-40).reverse().map(({ path, ...call }) => call), firstPrompt, partial: window?.hasMore === true };
}

function tokenSnapshot(usage, pressure) {
  const uncached = count(usage?.uncachedInputTokens), output = count(usage?.outputTokens);
  const cacheRead = count(usage?.cacheReadTokens), cacheWrite = count(usage?.cacheWriteTokens);
  const available = [uncached, output, cacheRead, cacheWrite].every((value) => value !== null);
  const input = available ? uncached + cacheRead + cacheWrite : null;
  return { available, input, output: available ? output : null, total: available ? input + output : null,
    uncachedInput: uncached, cacheRead, cacheWrite, contextUsed: count(pressure?.pressureTokens),
    contextProjected: count(pressure?.projectedTokens), contextWindow: count(pressure?.contextWindow),
    source: available ? 'tokenUsage' : 'unavailable' };
}

function modelSnapshot(state, writable) {
  const options = array(state?.groups).flatMap((group) => array(group.models).map((model) => ({
    id: `${group.id}/${model.id}`, label: model.name || model.id, provider: group.id, providerLabel: group.name || group.id,
    model: model.id, description: model.description ?? '', reasoning: model.reasoning
  })));
  const selection = state?.current;
  const current = options.find((option) => option.provider === selection?.provider && option.model === selection?.model);
  const reasoning = current?.reasoning;
  const effort = selection?.reasoningEffort ?? reasoning?.defaultEffort;
  const efforts = reasoning ? [
    ...(reasoning.defaultEffort === undefined ? [{ id: 'provider-default', label: 'Provider default' }] : []),
    ...array(reasoning.efforts).map((item) => ({ id: item.id, label: item.name || item.id }))
  ] : [];
  // Selecting an advertised model can repair an unroutable current provider.
  // Routing checks still belong to DSH when it executes an actual conversation.
  const available = writable && state?.status === 'ready' && options.length > 0;
  return {
    model: { available, id: selection ? `${selection.provider}/${selection.model}` : null,
      label: current?.label ?? selection?.model ?? null, provider: selection?.provider ?? null,
      providerLabel: current?.providerLabel ?? selection?.provider ?? null, options,
      status: state?.status ?? 'unavailable', error: state?.error ?? null, failures: array(state?.failures), routable: state?.routable ?? null },
    thinking: { available: available && efforts.length > 0, value: reasoning ? effort ?? 'provider-default' : null,
      label: reasoning ? efforts.find((item) => item.id === (effort ?? 'provider-default'))?.label ?? effort ?? 'Provider default' : null,
      options: efforts }
  };
}

function assertResult(result, operation) {
  if (!result?.ok) throw new Error(`${operation}: ${result?.error?.message ?? 'Host did not acknowledge the action'}${result?.error?.code ? ` (${result.error.code})` : ''}`);
  return result.value;
}

/**
 * @param {object} ctx Cordis plugin context containing injected DSH services.
 * @param {Document} [document] Reserved for shell integration; state never comes from the DOM.
 * @returns {{read:Function,subscribe:Function,actions:object,dispose:Function}}
 */
export function createHostAdapter(ctx = {}, document) {
  void document;
  const sessions = service(ctx, 'sessions'), workspaces = service(ctx, 'workspaces');
  const models = service(ctx, 'modelDirectories'), connection = service(ctx, 'connection');
  // Remote namespaces are separately provided Cordis services: resolving remote
  // and then reading .session would re-enter the uninjected-property guard.
  const uiWorkspace = service(ctx, 'uiWorkspace'), remoteSession = service(ctx, 'remote.session');
  const listeners = new Set(), rootStops = [], bindingStops = [];
  let disposed = false, activeId, binding, directory, directoryError = null, cached;
  let currentFaces = new Map();

  const watch = (source, listener, stops) => {
    if (typeof source?.subscribe === 'function') {
      const stop = source.subscribe(listener);
      if (typeof stop === 'function') stops.push(stop);
    }
  };
  const stopAll = (stops) => { for (const stop of stops.splice(0)) stop(); };
  const liveConnection = () => snapshotOf(connection?.state);
  const connected = () => liveConnection() === undefined || liveConnection() === 'connected';
  const projection = (key, summary) => {
    const value = snapshotOf(currentFaces.get(key));
    return value === undefined ? summary?.projectionValues?.[key] : value;
  };

  function build() {
    const list = snapshotOf(sessions?.list), workspaceList = snapshotOf(workspaces?.list);
    const summary = list?.current === undefined ? undefined : list?.byId?.[list.current];
    const sessionState = snapshotOf(binding?.session);
    const events = readEvents(snapshotOf(binding?.eventSource));
    const goal = projection('goal', summary)?.goal;
    const plan = projection('plan', summary);
    const knownPlan = typeof plan?.active === 'boolean' && typeof plan?.pending === 'boolean';
    const inPlan = knownPlan ? (plan.pending ? !plan.active : plan.active) : null;
    const addressed = sessionState?.subagent != null || (activeId !== undefined && sessions?.subagentAddress?.(activeId) !== undefined);
    const canWrite = Boolean(summary && binding?.session && !sessionState?.removed && !addressed && connected() && !disposed);
    const modelState = snapshotOf(directory?.store);
    const model = modelSnapshot(modelState, canWrite && typeof directory?.select === 'function');
    if (directoryError && !model.model.error) model.model.error = directoryError;
    const tokens = tokenSnapshot(projection('tokenUsage', summary), projection('contextPressure', summary));
    const workspace = array(workspaceList?.items).find((item) => array(item.sessionIds).includes(list?.current));
    const archived = new Set(array(workspaceList?.archivedSessionIds));
    const history = array(list?.ids).filter((id) => list.byId?.[id] && !archived.has(id)).map((id) => {
      const item = list.byId[id];
      return { id, title: item.displayTitle || item.title || id, running: item.running === true, blank: item.blank === true,
        current: id === list.current, cwd: item.cwd ?? null, updatedAt: item.updatedAt ?? null };
    });
    const summaryText = text(goal?.objective) || (!events.partial ? events.firstPrompt : '') || summary?.displayTitle || summary?.title || '';
    const status = sessionState?.openError || sessionState?.lastAgentError ? 'error'
      : sessionState?.running === true || summary?.running === true ? 'running'
      : sessionState?.openState === 'loading' ? 'loading' : summary?.blank ? 'blank' : summary ? 'ready' : 'unavailable';
    const unavailable = [];
    if (!summary) unavailable.push('session');
    if (!workspace) unavailable.push('workspace');
    if (!modelState?.current) unavailable.push('model');
    if (!model.thinking.options.length) unavailable.push('thinking');
    if (!knownPlan) unavailable.push('mode');
    if (!tokens.available) unavailable.push('tokens');
    if (!binding?.eventSource) unavailable.push('files', 'tools');
    if (liveConnection() === undefined) unavailable.push('connection');
    return { source: list ? 'host' : 'unavailable',
      session: summary ? { id: list.current, title: summary.displayTitle || summary.title || list.current,
        summary: summaryText, summarySource: goal?.objective ? 'goal' : !events.partial && events.firstPrompt ? 'firstPrompt' : 'title',
        blank: summary.blank === true, running: status === 'running', status, cwd: summary.cwd ?? workspace?.path ?? null,
        agentPreset: projection('agentPreset', summary) ?? null, goal: goal ?? null,
        error: sessionState?.openError ?? sessionState?.lastAgentError ?? null } : null,
      history, historyPartial: events.partial, workspace: workspace ? { id: workspace.workspaceId, title: workspace.title, path: workspace.path } : null,
      workspaces: array(workspaceList?.items).map((item) => ({ id: item.workspaceId, title: item.title, path: item.path })),
      files: events.files, filesAvailable: Boolean(binding?.eventSource), filesSource: 'successful-tool-mutations',
      tools: events.tools, toolsAvailable: Boolean(binding?.eventSource), ...model,
      mode: { id: knownPlan ? inPlan ? 'plan' : 'agent' : null, label: knownPlan ? inPlan ? 'Plan' : 'Agent' : null,
        available: canWrite && knownPlan && typeof binding?.session?.command === 'function', pending: plan?.pending === true,
        options: knownPlan ? [{ id: 'agent', label: 'Agent' }, { id: 'plan', label: 'Plan' }] : [],
        reason: !knownPlan ? 'Host plan projection unavailable' : addressed ? 'Subagent session is read-only' : !connected() ? 'Host disconnected' : null },
      tokens, connection: { available: liveConnection() !== undefined, state: liveConnection() ?? 'unavailable' }, unavailable,
      capabilities: { openSession: typeof sessions?.open === 'function', newSession: typeof uiWorkspace?.startSession === 'function' && connected(),
        openFile: typeof remoteSession?.openWorkspacePath === 'function' && connected() } };
  }

  function publish() {
    if (disposed) return;
    cached = build();
    for (const listener of [...listeners]) {
      try { listener(cached); } catch (error) { console.error('[hud-host-adapter] Subscriber failed:', error); }
    }
  }

  function bindCurrent() {
    if (disposed) return;
    const id = snapshotOf(sessions?.list)?.current;
    const next = id === undefined ? undefined : sessions?.binding?.(id);
    if (activeId === id && binding === next) { publish(); return; }
    stopAll(bindingStops);
    activeId = id; binding = next; directory = undefined; directoryError = null; currentFaces = new Map();
    if (binding) {
      watch(binding.session, publish, bindingStops);
      watch(binding.eventSource, publish, bindingStops);
      for (const key of PROJECTIONS) {
        const face = binding.session?.projections?.faceOf?.(key);
        if (face) { currentFaces.set(key, face); watch(face, publish, bindingStops); }
      }
      try {
        directory = models?.directoryFor?.(id);
        watch(directory?.store, publish, bindingStops);
      } catch (error) { directoryError = errorMessage(error); }
    }
    publish();
  }

  const requireActive = (available, operation) => {
    if (disposed || !available) throw new Error(`${operation} unavailable for the current host session`);
  };
  const actions = {
    async setModel(id) {
      const state = build(); requireActive(state.model.available, 'Model selection');
      const option = state.model.options.find((item) => item.id === id);
      if (!option) throw new Error('Unknown or unavailable model');
      const selection = snapshotOf(directory.store).current;
      const same = option.provider === selection?.provider && option.model === selection?.model;
      const reasoningEffort = same ? selection?.reasoningEffort ?? option.reasoning?.defaultEffort : option.reasoning?.defaultEffort;
      await directory.select({ provider: option.provider, model: option.model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) });
    },
    async setThinking(value) {
      const state = build(); requireActive(state.thinking.available, 'Thinking selection');
      if (!state.thinking.options.some((item) => item.id === value)) throw new Error('Unknown or unavailable thinking level');
      const selection = snapshotOf(directory.store).current;
      await directory.select({ provider: selection.provider, model: selection.model, ...(value === 'provider-default' ? {} : { reasoningEffort: value }) });
    },
    async setMode(id) {
      const state = build(); requireActive(state.mode.available, 'AI mode');
      if (!state.mode.options.some((option) => option.id === id)) throw new Error('Unknown or unavailable AI mode');
      const value = assertResult(await binding.session.command(id === 'plan' ? '/plan' : '/plan off'), 'AI mode');
      if (value?.matched !== true) throw new Error('AI mode command unavailable on this host');
    },
    async openSession(id) {
      requireActive(typeof sessions?.open === 'function', 'Open session');
      if (!snapshotOf(sessions.list)?.byId?.[id]) throw new Error('Unknown or unavailable session');
      await sessions.open(id);
    },
    async newSession(workspaceId) {
      requireActive(typeof uiWorkspace?.startSession === 'function' && connected(), 'New session');
      if (workspaceId !== undefined && !array(snapshotOf(workspaces?.list)?.items).some((item) => item.workspaceId === workspaceId)) throw new Error('Unknown workspace');
      await uiWorkspace.startSession(workspaceId);
    },
    async refreshModels() {
      requireActive(typeof directory?.load === 'function' && connected(), 'Model catalog');
      await directory.load();
    },
    async openFile(path) {
      const state = build(); requireActive(state.capabilities.openFile, 'Open file');
      if (!state.files.some((file) => file.path === path)) throw new Error('Unknown or unavailable produced file');
      const absolute = /^(?:[A-Za-z]:[\\/]|[\\/])/.test(path);
      const cwd = state.session?.cwd;
      if (!absolute && !cwd) throw new Error('Workspace path unavailable');
      const resolved = absolute ? path : `${cwd.replace(/[\\/]$/, '')}/${path}`;
      assertResult(await remoteSession.openWorkspacePath({ path: resolved }), 'Open file');
    }
  };

  watch(sessions?.list, bindCurrent, rootStops);
  watch(workspaces?.list, publish, rootStops);
  watch(connection?.state, publish, rootStops);
  bindCurrent();
  cached ??= build();
  return { read: () => cached,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener); return () => listeners.delete(listener);
    }, actions,
    dispose() {
      if (disposed) return;
      disposed = true; stopAll(bindingStops); stopAll(rootStops); listeners.clear();
    } };
}
