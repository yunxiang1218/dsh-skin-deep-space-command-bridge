import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/client/host-adapter.js';

function store(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of [...listeners]) fn(); }, get count() { return listeners.size; } };
}

function host() {
  const commands = [], selections = [], opened = [];
  const projections = new Map(Object.entries({
    plan: { active: false, pending: false }, agentPreset: 'default',
    goal: { goal: { objective: 'Build the actual theme', phase: 'active' } },
    tokenUsage: { uncachedInputTokens: 100, cacheReadTokens: 30, cacheWriteTokens: 20, outputTokens: 40 },
    contextPressure: { pressureTokens: 500, contextWindow: 1000 }
  }).map(([key, value]) => [key, store(value)]));
  const session = Object.assign(store({ sessionId: 's1', running: false, blank: false, openState: 'open', subagent: null }), {
    projections: { faceOf(key) { if (!projections.has(key)) projections.set(key, store(undefined)); return projections.get(key); } },
    command: async (line) => { commands.push(line); return { ok: true, value: { matched: true } }; }
  });
  const events = store({ entries: [], hasMore: false });
  const binding = { session, eventSource: events };
  const list = store({ phase: 'ready', current: 's1', ids: ['s1', 's2'], byId: {
    s1: { id: 's1', displayTitle: 'Theme mission', blank: false, running: false, cwd: 'D:\\project' },
    s2: { id: 's2', displayTitle: 'Earlier mission', blank: false, running: false }
  } });
  const directory = { store: store({ status: 'ready', current: { provider: 'provider/one', model: 'model/two', reasoningEffort: 'high' }, routable: true,
    groups: [{ id: 'provider/one', name: 'Provider One', models: [
      { id: 'model/two', name: 'Model Two', reasoning: { defaultEffort: 'medium', efforts: [{ id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }] } },
      { id: 'plain', name: 'Plain' }
    ] }], failures: [] }), load: async () => {}, select: async (selection) => selections.push(selection) };
  const ctx = { sessions: { list, binding: (id) => id === 's1' ? binding : undefined, subagentAddress: () => undefined, open: (id) => opened.push(id) },
    workspaces: { list: store({ phase: 'ready', archivedSessionIds: [], items: [{ workspaceId: 'w1', title: 'Workspace', path: 'D:\\project', sessionIds: ['s1'] }] }) },
    modelDirectories: { directoryFor: () => directory }, connection: { state: store('connected') } };
  return { ctx, session, projections, events, list, directory, selections, commands, opened };
}

test('reads real session, workspace, model, goal and disjoint token buckets', () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  const value = adapter.read();
  assert.equal(value.session.summary, 'Build the actual theme');
  assert.equal(value.workspace.path, 'D:\\project');
  assert.equal(value.history[1].title, 'Earlier mission');
  assert.equal(value.model.id, 'provider/one/model/two');
  assert.equal(value.thinking.value, 'high');
  assert.deepEqual([value.tokens.input, value.tokens.output, value.tokens.total], [150, 40, 190]);
  assert.equal(value.tokens.contextWindow, 1000);
  assert.equal(value.connection.state, 'connected');
  adapter.dispose();
});

test('model ids remain opaque and changing models uses advertised default reasoning', async () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  await adapter.actions.setModel('provider/one/model/two');
  await adapter.actions.setModel('provider/one/plain');
  assert.deepEqual(f.selections, [{ provider: 'provider/one', model: 'model/two', reasoningEffort: 'high' }, { provider: 'provider/one', model: 'plain' }]);
  await assert.rejects(adapter.actions.setModel('invented/model'), /unavailable|unknown/i);
  assert.equal(f.selections.length, 2);
  adapter.dispose();
});

test('thinking validates model metadata and preserves exact provider and model', async () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  await adapter.actions.setThinking('medium');
  assert.deepEqual(f.selections[0], { provider: 'provider/one', model: 'model/two', reasoningEffort: 'medium' });
  await assert.rejects(adapter.actions.setThinking('ultra'), /unavailable|unknown/i);
  adapter.dispose();
});

test('an unroutable current provider does not prevent choosing another advertised model', async () => {
  const f = host();
  f.directory.store.set({...f.directory.store.getSnapshot(),routable:false});
  const adapter = createHostAdapter(f.ctx);
  await adapter.actions.setModel('provider/one/plain');
  assert.equal(f.selections[0].model,'plain');
  adapter.dispose();
});

test('plan mode reflects host pending target and awaits actual command acknowledgement', async () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  await adapter.actions.setMode('plan');
  assert.equal(adapter.read().mode.id, 'agent', 'no optimistic host state');
  f.projections.get('plan').set({ active: false, pending: true });
  assert.equal(adapter.read().mode.id, 'plan');
  await adapter.actions.setMode('agent');
  assert.deepEqual(f.commands, ['/plan', '/plan off']);
  f.session.command = async () => ({ ok: false, error: { code: 'blocked', message: 'Host refused' } });
  await assert.rejects(adapter.actions.setMode('agent'), /Host refused/);
  adapter.dispose();
});

test('event log lists successful produced files and excludes errors, reads and replacement copies', () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  const call = (seq, callId, name, args) => ({ type: 'event', event: { seq, time: 123, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args), turn: 1 } } });
  const result = (seq, callId, isError, surfaceOp = 'append') => ({ type: 'event', event: { seq, type: 'tool/result', surfaceOp, data: { turn: 1, message: { source: { callId }, content: [{ isError, content: [{ type: 'text', text: 'tool output' }] }] } } } });
  f.events.set({ hasMore: true, entries: [
    call(1, 'a', 'write', { file_path: 'src/app.js', content: 'ok' }), result(2, 'a', false),
    call(3, 'b', 'write', { file_path: 'failed.js', content: 'bad' }), result(4, 'b', true),
    call(5, 'c', 'read', { file_path: 'secret.txt' }), result(6, 'c', false),
    call(7, 'd', 'write', { file_path: 'copy.js', content: 'copy' }), result(8, 'd', false, 'replace')
  ] });
  assert.deepEqual(adapter.read().files.map((file) => file.path), ['src/app.js']);
  assert.equal(adapter.read().tools.find((tool) => tool.id === 'b').status, 'error');
  assert.equal(adapter.read().historyPartial, true);
  adapter.dispose();
});

test('session switch removes old subscriptions and dispose releases every owned listener', () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  let calls = 0;
  const stop = adapter.subscribe(() => calls++);
  f.projections.get('tokenUsage').set({ uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2 });
  assert.equal(calls, 1);
  f.list.set({ ...f.list.getSnapshot(), current: 's2' });
  const switched = calls;
  f.projections.get('tokenUsage').set(undefined);
  assert.equal(calls, switched);
  assert.equal(adapter.read().tokens.available, false);
  stop(); adapter.dispose(); adapter.dispose();
  assert.equal(f.list.count, 0);
  assert.equal(f.events.count, 0);
  assert.equal(f.session.count, 0);
  assert.equal(f.directory.store.count, 0);
});

test('missing host data is explicitly unavailable and never synthesized as zero', async () => {
  const adapter = createHostAdapter({});
  assert.equal(adapter.read().session, null);
  assert.equal(adapter.read().tokens.available, false);
  assert.equal(adapter.read().tokens.total, null);
  assert.equal(adapter.read().model.available, false);
  assert.equal(adapter.read().connection.state, 'unavailable');
  await assert.rejects(adapter.actions.setMode('plan'), /unavailable/i);
  adapter.dispose();
});

test('openSession uses known host ids and disconnected controls cannot mutate', async () => {
  const f = host(), adapter = createHostAdapter(f.ctx);
  await adapter.actions.openSession('s2');
  assert.deepEqual(f.opened, ['s2']);
  await assert.rejects(adapter.actions.openSession('missing'), /unavailable|unknown/i);
  f.ctx.connection.state.set('reconnecting');
  assert.equal(adapter.read().model.available, false);
  await assert.rejects(adapter.actions.setModel('provider/one/plain'), /unavailable/i);
  assert.equal(f.selections.length, 0);
  adapter.dispose();
});

test('optional Cordis services use get rather than throwing uninjected property access', () => {
  const f = host();
  const ctx = new Proxy({ get: (name) => f.ctx[name] }, { get(target, name) {
    if (name === 'get') return target.get;
    throw new Error(`Property ${String(name)} requires injection`);
  } });
  const adapter = createHostAdapter(ctx);
  assert.equal(adapter.read().session.title, 'Theme mission');
  assert.equal(adapter.read().capabilities.newSession, false);
  adapter.dispose();
});

test('remote.session is resolved by its full service name without touching the remote namespace proxy', async () => {
  const f = host(), opened = [];
  const remoteSession = { openWorkspacePath: async (request) => { opened.push(request); return { ok: true, value: undefined }; } };
  const remote = new Proxy({}, { get() { throw new Error('cannot get property "remote.session" without inject'); } });
  const ctx = { get(name) { return name === 'remote' ? remote : name === 'remote.session' ? remoteSession : f.ctx[name]; } };
  const adapter = createHostAdapter(ctx);
  assert.equal(adapter.read().capabilities.openFile, true);
  f.events.set({ hasMore: false, entries: [
    { type: 'event', event: { seq: 1, type: 'tool/call', data: { callId: 'write1', name: 'write', arguments: JSON.stringify({ file_path: 'app.js', content: 'ok' }) } } },
    { type: 'event', event: { seq: 2, type: 'tool/result', surfaceOp: 'append', data: { message: { source: { callId: 'write1' }, content: [{ isError: false, content: [] }] } } } }
  ] });
  await adapter.actions.openFile('app.js');
  assert.deepEqual(opened, [{ path: 'D:\\project/app.js' }]);
  adapter.dispose();
});

test('a null host projection clears a stale list hint and the real loading enum is honored', () => {
  const f = host();
  const list = f.list.getSnapshot();
  list.byId.s1.projectionValues = { goal: { goal: { objective: 'Stale goal' } } };
  const adapter = createHostAdapter(f.ctx);
  f.projections.get('goal').set(null);
  assert.equal(adapter.read().session.goal, null);
  assert.equal(adapter.read().session.summary, 'Theme mission');
  f.session.set({ ...f.session.getSnapshot(), openState: 'loading' });
  assert.equal(adapter.read().session.status, 'loading');
  adapter.dispose();
});
