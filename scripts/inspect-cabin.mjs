import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const log=await readFile('test-results/preview.log','utf8');
const url=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+[^\s]*)/)[1];
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1536,height:960}});
 await page.goto(url);await page.waitForSelector('[data-dsc-screen=mission]');
 console.log(JSON.stringify(await page.locator('[data-dsc-screen=mission]').evaluate(root=>[root,...root.querySelectorAll('*')].filter(n=>n.matches('[data-dsh-sidebar-root],.dsc-mission,.dsc-activity,[class*="regionArea"],[class*="footArea"],[class*="logoRow"],.dsc-screen-toolbar')||n===root).map(n=>({tag:n.tagName,cls:n.className,height:n.getBoundingClientRect().height,top:n.getBoundingClientRect().top,css: ['display','height','paddingTop','paddingBottom','marginTop','minHeight','flex'].map(k=>[k,getComputedStyle(n)[k]])}))),null,2));
}finally{await browser.close();}
