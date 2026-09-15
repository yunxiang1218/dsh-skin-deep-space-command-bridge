import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const log = await readFile(process.env.APPDATA + '/dsh-desktop/logs/harness.log', 'utf8');
const url = [...log.matchAll(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/g)].at(-1)?.[1];
if (!url) throw new Error('Running DSH endpoint missing');
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
 const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
 await page.goto(url);
 await page.waitForSelector('[data-composer-input]', {timeout: 30000});
 const structure = await page.evaluate(() => ({
   root: [...document.querySelector('#root').children].map(x=>({tag:x.tagName,cls:x.className,style:x.getAttribute('style')})),
   slots: [...document.querySelectorAll('[data-slot]')].map(x=>x.getAttribute('data-slot')),
   input: document.querySelector('[data-composer-input]')?.outerHTML,
   sidebar: document.querySelector('[class*=sidebarCol]')?.outerHTML.slice(0, 3500),
   attrs:[...document.body.attributes].map(x=>[x.name, x.name==='style'?'[styles]':x.value]),
   loader: Object.keys(window.__ModuleLoader__ || {})
 }));
 await mkdir('test-results', {recursive:true});
 await writeFile('test-results/host-structure.json', JSON.stringify(structure,null,2));
 console.log(JSON.stringify(structure,null,2));
 await page.screenshot({path:'test-results/host-before.png'});
} finally { await browser.close(); }
