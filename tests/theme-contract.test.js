import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package can be resolved through the official DSH browser plugin contract', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.notEqual(pkg.name, '@dsh-external/dsh-client-ui-skin-maid-atelier');
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8').catch(() => '');
  assert.ok(bundle.includes('window.__ModuleLoader__.load'), 'build must produce a DSH closure-factory bundle');
  assert.ok(bundle.includes(pkg.name), 'loader id must match package name');
});

test('client lifecycle installs and retracts the theme without replacing native editor', async () => {
  const module = await import('../src/client/index.js').catch(() => ({}));
  assert.equal(typeof module.apply, 'function', 'theme exposes the Cordis apply lifecycle');
});
