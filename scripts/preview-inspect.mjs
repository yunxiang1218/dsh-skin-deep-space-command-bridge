import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
const log=await readFile('test-results/preview.log','utf8');
const url=[...log.matchAll(/dsh web: (http:\/\/127\.0\.0\.1:\d+[^\s]*)/g)].at(-1)?.[1];
if(!url)throw new Error('Start npm run preview first');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000},storageState:await readFile('test-results/preview-browser.json','utf8').then(JSON.parse).catch(()=>undefined)});
const page=await context.newPage();
try {
 await page.goto(url);
 await page.waitForSelector('[data-composer-input]');
 const notice=page.getByRole('dialog').filter({hasText:'内测声明'});
 if(await notice.count())await notice.getByRole('button',{name:'继续',exact:true}).click();
 const setup=page.getByRole('dialog').filter({hasText:'接入模型提供方'});
 if(await setup.count())await setup.getByRole('button',{name:'稍后配置',exact:true}).click();
 if(process.argv.includes('--workspace')) {
   await page.getByRole('button',{name:'选择工作区',exact:true}).first().click();
 }
 await page.waitForTimeout(900);
 await page.screenshot({path:'test-results/preview-current.png',fullPage:true});
 console.log(await page.locator('body').innerText());
 console.log(JSON.stringify(await page.locator('input,button').evaluateAll(nodes=>nodes.map(x=>({tag:x.tagName,text:x.textContent?.slice(0,60),aria:x.getAttribute('aria-label'),placeholder:x.getAttribute('placeholder'),type:x.getAttribute('type')}))),null,2));
 await context.storageState({path:'test-results/preview-browser.json'});
} finally {await browser.close()}
