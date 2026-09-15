// Short visual evidence from the existing isolated preview; never sends a chat.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const log=await readFile('test-results/preview.log','utf8');
const url=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+[^\s]*)/)[1];
await mkdir('test-results/motion',{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1536,height:960},recordVideo:{dir:'test-results/motion',size:{width:1536,height:960}}});
const page=await context.newPage(),video=page.video(),started=Date.now();
try {
 await page.goto(url);await page.waitForSelector('.dsc-navigation-toggle');
 for(const [text,button] of [['内测声明','继续'],['接入模型提供方','稍后配置']]) {
  const dialog=page.getByRole('dialog').filter({hasText:text});
  if(await dialog.isVisible())await dialog.getByRole('button',{name:button,exact:true}).click();
 }
 await page.getByRole('button',{name:'返回驾驶台',exact:true}).click();
 await page.getByRole('button',{name:'展开飞行控制',exact:true}).click();
 const flight=page.locator('.dsc-space-controls');
 await flight.getByRole('button',{name:'停泊',exact:true}).click();await page.waitForTimeout(9000);
 const offset=(Date.now()-started)/1000;
 await page.getByRole('button',{name:'抬头观景',exact:true}).click();
 await flight.getByRole('button',{name:'巡航',exact:true}).click();
 await flight.getByRole('button',{name:'缓慢',exact:true}).click();await page.waitForTimeout(3000);
 await flight.getByRole('button',{name:'快速',exact:true}).click();await page.waitForTimeout(4500);
 await flight.getByRole('button',{name:'极快',exact:true}).click();await page.waitForTimeout(5500);
 await page.getByRole('button',{name:'收起飞行控制',exact:true}).click();await page.waitForTimeout(2000);
 await page.getByRole('button',{name:'展开飞行控制',exact:true}).click();
 await flight.getByRole('button',{name:'缓慢',exact:true}).click();await page.waitForTimeout(4000);
 await page.getByRole('button',{name:'返回驾驶台',exact:true}).click();
 await flight.getByRole('slider',{name:'观察距离'}).focus();await page.keyboard.press('End');
 const pad=flight.getByRole('group',{name:/拖动观察整个船舱/});await pad.focus();
 for(let i=0;i<2;i++)await pad.press('Shift+ArrowRight');
 await page.getByRole('button',{name:'收起飞行控制',exact:true}).click();await page.waitForTimeout(2500);
 await page.getByRole('button',{name:'展开工作区',exact:true}).click();await page.waitForTimeout(2000);
 await page.getByRole('button',{name:'返回舰桥',exact:true}).click();
 await page.getByRole('button',{name:'返回驾驶台',exact:true}).click();
 await context.close();
 await writeFile('test-results/motion/capture.json',JSON.stringify({video:await video.path(),offset,duration:25},null,2));
 console.log('Motion capture saved to test-results/motion/capture.json');
}finally{await browser.close();}
