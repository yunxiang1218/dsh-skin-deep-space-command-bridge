import { build } from 'esbuild';
import { readFile, mkdir, writeFile, copyFile, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep, extname, isAbsolute } from 'node:path';
const pkg = JSON.parse(await readFile('package.json','utf8'));
const css = (await Promise.all(['src/client/bridge.css','src/client/cockpit-screens.css','src/client/space-controls.css','src/client/cabin-finish.css'].map(path=>readFile(path,'utf8')))).join('\n');
const resourceRoot=resolve('assets/resource');
async function embeddedImage(file) {
  const path=resolve(resourceRoot,file), within=relative(resourceRoot,path);
  const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[extname(file).toLowerCase()];
  if(!mime || isAbsolute(within) || within==='..' || within.startsWith('..'+sep) || path===resourceRoot) throw new Error(`Invalid artwork path: ${file}`);
  return 'data:'+mime+';base64,'+(await readFile(path)).toString('base64');
}
const manifest=JSON.parse(await readFile('assets/resource/scenes/manifest.json','utf8'));
if(!Array.isArray(manifest.scenes) || manifest.scenes.length<2) throw new Error('Scene catalog must contain at least two backgrounds');
const ids=new Set();
const scenes=await Promise.all(manifest.scenes.map(async scene=>{
  if(!scene.id || ids.has(scene.id)) throw new Error('Scene ids must be unique');
  ids.add(scene.id);
  return {id:scene.id,label:scene.label,photoLabel:scene.photoLabel,credit:scene.credit,source:scene.source,
    url:await embeddedImage(scene.detailFile || scene.file),
    ...(scene.detailFile ? {artUrl:await embeddedImage(scene.file)} : {})};
}));
const frame = await embeddedImage('cockpit-frame-v3.png');
const hull = await readFile('assets/resource/cabin-titanium-v3.png');
await mkdir('lib',{recursive:true});
const result = await build({entryPoints:['src/client/index.js'], bundle:true, write:false, format:'cjs', platform:'browser',target:'chrome120', minify:false, define:{__BRIDGE_CSS__:JSON.stringify(css),__BRIDGE_SCENES__:JSON.stringify(scenes),__BRIDGE_FRAME__:JSON.stringify(frame),__BRIDGE_HULL__:JSON.stringify('data:image/png;base64,'+hull.toString('base64'))}});
const bundle = `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
// Replace the completed bundle atomically. A running Windows host or file viewer
// can map the old bundle and prevent truncation; it should never see half a file.
const pendingBundle=resolve('lib',`client.${process.pid}.tmp`);
try {
  await writeFile(pendingBundle,bundle,{flag:'wx'});
  await rename(pendingBundle,resolve('lib/client.js'));
} finally {
  await unlink(pendingBundle).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
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
