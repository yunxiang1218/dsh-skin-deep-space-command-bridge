// Persistent real-host preview with its own DSH home inside this checkout.
import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let port = 43130;
let openBrowser = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--open') openBrowser = true;
  else if (args[i] === '--port') {
    const value = args[++i];
    if (!/^\d+$/.test(value || '') || Number(value) > 65535) throw new Error('--port must be 0–65535');
    port = Number(value);
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: npm run preview -- [--port 43130] [--open]\nUses the installed DSH Desktop runtime and test-results/preview-harness.\nOverride its resources directory with DSH_DESKTOP_RESOURCES.');
    process.exit(0);
  } else throw new Error(`Unknown preview option: ${args[i]}`);
}

async function writeIfMissing(path, text) {
  try {
    await writeFile(path, text, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function main() {
  const resources = process.env.DSH_DESKTOP_RESOURCES || (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DSH Desktop', 'resources'));
  if (!resources) throw new Error('Set DSH_DESKTOP_RESOURCES to the installed DSH Desktop resources directory.');
  const bundledModules = join(resources, 'app', 'node_modules');
  const runtime = join(bundledModules, 'node', 'bin', 'node.exe');
  const cli = join(bundledModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  try {
    await Promise.all([access(runtime), access(cli)]);
  } catch {
    throw new Error(`DSH Desktop runtime was not found under ${resources}. Set DSH_DESKTOP_RESOURCES to its resources directory.`);
  }
  try {
    await access(join(root, 'lib', 'client.js'));
    await access(join(root, 'lib', 'index.js'));
  } catch {
    throw new Error('Build the theme first: npm run build');
  }
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const isolatedHome = join(root, 'test-results', 'preview-harness');
  const profileDir = join(isolatedHome, 'profiles', 'web');
  const packageLink = join(profileDir, 'node_modules', ...manifest.name.split('/'));
  await mkdir(dirname(packageLink), { recursive: true });
  try {
    await lstat(packageLink);
    if ((await realpath(packageLink)).toLowerCase() !== (await realpath(root)).toLowerCase()) {
      throw new Error(`The preview package link points outside this checkout: ${packageLink}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await symlink(root, packageLink, 'junction');
  }
  // This generated manifest owns the preview roster. User patch, settings and
  // session data are kept across runs; only the three intended bundles load.
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-deep-space-preview', private: true,
    dependencies: { [manifest.name]: `file:${root.replaceAll('\\', '/')}` },
    dsh: { profile: {
      bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', manifest.name],
      patchReload: 'live',
    } },
  }, null, 2) + '\n');
  await writeIfMissing(join(profileDir, 'cordis.yml'), '[]\n');
  await writeIfMissing(join(profileDir, 'cordis.patch.yml'), '[]\n');
  // Ordinary browsers have no Desktop native picker bridge. Compose the
  // official browse pair only for this workspace-owned preview process.
  const browserPatch = join(isolatedHome, 'browser-preview.patch.yml');
  await writeFile(browserPatch, `- id: directory-picker
  disabled: true
- insert:
    - id: preview-directory-picker-browse-host
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: preview-directory-picker-browse-client
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
`);
  console.log(`Preview data: ${isolatedHome}`);
  console.log(`Starting the installed DSH runtime on 127.0.0.1:${port || '(automatic port)'}.`);
  console.log('The authenticated preview URL will appear below. Press Ctrl+C to stop.');

  const hostArgs = ['--expose-internals', cli, 'web', '--patch', browserPatch, '--host', '127.0.0.1', '--port', String(port)];
  if (!openBrowser) hostArgs.push('--no-open');
  const child = spawn(runtime, hostArgs, {
    cwd: root,
    env: { ...process.env, DSH_HOME: isolatedHome, DSH_TELEMETRY_DISABLED: '1' },
    windowsHide: true,
    stdio: 'inherit',
  });
  let stopping = false;
  let shutdownTimer;
  const stop = () => {
    if (stopping) {
      child.kill('SIGKILL');
      return;
    }
    stopping = true;
    child.kill('SIGINT');
    shutdownTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    shutdownTimer.unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const cleanup = () => {
    clearTimeout(shutdownTimer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };
  child.once('error', (error) => {
    cleanup();
    console.error(`Preview could not start: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    cleanup();
    process.exitCode = stopping ? 0 : (code ?? 1);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
