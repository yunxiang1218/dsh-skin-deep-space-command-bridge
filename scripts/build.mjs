import { build } from 'esbuild';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(await readFile('package.json','utf8'));
const css = (await Promise.all(['src/client/bridge.css','src/client/cockpit-screens.css'].map(path=>readFile(path,'utf8')))).join('\n');
const backgroundInfo = JSON.parse(await readFile('assets/resource/background.json','utf8'));
if (!/^[\w.-]+\.(jpe?g|png)$/i.test(backgroundInfo.file)) throw new Error('background.json file must be a JPEG or PNG filename in assets/resource');
const backgroundMime=backgroundInfo.file.endsWith('.png')?'image/png':'image/jpeg';
const background = await readFile('assets/resource/'+backgroundInfo.file);
const frame = await readFile('assets/resource/cockpit-frame.png');
const hull = await readFile('assets/resource/cabin-titanium.png');
await mkdir('lib',{recursive:true});
const result = await build({entryPoints:['src/client/index.js'], bundle:true, write:false, format:'cjs', platform:'browser',target:'chrome120', minify:false, define:{__BRIDGE_CSS__:JSON.stringify(css),__BRIDGE_BACKGROUND__:JSON.stringify('data:'+backgroundMime+';base64,'+background.toString('base64')),__BRIDGE_FRAME__:JSON.stringify('data:image/png;base64,'+frame.toString('base64')),__BRIDGE_HULL__:JSON.stringify('data:image/png;base64,'+hull.toString('base64')),__BRIDGE_BACKGROUND_INFO__:JSON.stringify(backgroundInfo)}});
const bundle = `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
await writeFile('lib/client.js',bundle);
await copyFile('src/index.js','lib/index.js');
// Keep the recorded build time stable while the bundle is byte-identical, so a
// rebuild in an unchanged tree does not leave a spurious diff behind.
const clientSha256 = createHash('sha256').update(bundle).digest('hex');
let builtAt = new Date().toISOString();
try {
  const previous = JSON.parse(await readFile('skin.build.json','utf8'));
  if (previous.clientSha256 === clientSha256 && typeof previous.builtAt === 'string') builtAt = previous.builtAt;
} catch {}
await writeFile('skin.build.json',JSON.stringify({schemaVersion:1,package:pkg.name,version:pkg.version,builtAt,clientSha256},null,2)+'\n');
console.log(`Built official DSH module: ${(Buffer.byteLength(bundle)/1024/1024).toFixed(2)} MiB, assets embedded.`);
