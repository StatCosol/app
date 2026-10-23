const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const puppeteer=require('../../frontend/node_modules/puppeteer');
module.exports=async({base,tokens,identities,auditId,upgradeAuditId,work,check,root})=>{
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-first-run','--disable-extensions']});
 const evidence=path.join(root,'output/audit-fieldwork-browser');fs.mkdirSync(evidence,{recursive:true});let page;const errors=[];
 try{
  async function open(role,route){if(page)await page.close();page=await browser.newPage();await page.setViewport({width:1500,height:1100});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.evaluateOnNewDocument((token,u)=>{sessionStorage.setItem('accessToken',token);sessionStorage.setItem('user',JSON.stringify({...u,isMasterUser:u.userType==='MASTER',enabledModules:['CONTRACTOR_AUDIT','CONTRACTOR_DOCUMENTS','EMPLOYEE_COMPLIANCE'],modules:['CONTRACTOR_AUDIT','CONTRACTOR_DOCUMENTS','EMPLOYEE_COMPLIANCE']}));sessionStorage.setItem('idle_last_activity',String(Date.now()));},tokens[role],identities[role]);
   await page.goto(base+'/app'+route,{waitUntil:'networkidle0'});
  }
  async function button(text,scope='app-audit-fieldwork'){const handle=await page.evaluateHandle((text,scope)=>Array.from(document.querySelectorAll(scope+' button')).find(e=>e.textContent.trim()===text),text,scope);const e=handle.asElement();assert.ok(e,'Missing '+text);await e.click();await handle.dispose();}
  async function input(selector,value){await page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
  async function post(action,suffix){const pending=page.waitForResponse(r=>r.url().includes(suffix)&&r.request().method()==='POST');await action();const r=await pending;assert.equal(r.status(),201,await r.text());await page.waitForNetworkIdle();return r.json();}
  async function screenshot(name){await page.waitForFunction(()=>document.getAnimations().every(a=>a.constructor.name!=='CSSTransition'||a.playState!=='running'));await page.$eval('app-audit-fieldwork',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}
  if(upgradeAuditId) {
   await open('auditor',`/auditor/audits/${upgradeAuditId}/workspace`);
   await page.waitForSelector('app-audit-fieldwork .checklist-update');
   assert.equal(await page.$$eval('app-audit-fieldwork .point',els=>els.length),1);
   await input('app-audit-fieldwork .review-section textarea','Unfinished notes must survive checklist expansion.');
   await page.setViewport({width:390,height:844});
   assert.ok(await page.$eval('app-audit-fieldwork',e=>e.scrollWidth<=e.getBoundingClientRect().width+1));
   await page.waitForFunction(()=>document.querySelector('app-auditor-sidebar aside')?.getBoundingClientRect().right<=1);
   await screenshot('checklist-upgrade-mobile');
   const updated=await post(()=>button('Add missing checklist points'),'/checklist/refresh');
   assert.ok(updated.created>=30);
   await page.waitForFunction(()=>!document.querySelector('app-audit-fieldwork .checklist-update'));
   assert.ok((await page.$eval('app-audit-fieldwork .review-section textarea',e=>e.value)).includes('Unfinished notes'));
   assert.ok(await page.$eval('app-audit-fieldwork',e=>e.scrollWidth<=e.getBoundingClientRect().width+1));
   await page.select('app-audit-fieldwork .filter-label select','SITE_INSPECTION');
   assert.ok((await page.$$eval('app-audit-fieldwork .point',els=>els.length))>=10);
   await input('app-audit-fieldwork .search-label input','Height:');
   assert.equal(await page.$$eval('app-audit-fieldwork .point',els=>els.length),1);
   await page.click('app-audit-fieldwork .point');
   await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading')?.innerText.includes('Height:'));
   await screenshot('expanded-checklist-mobile');
   await page.setViewport({width:1500,height:1100});await screenshot('expanded-checklist-desktop');
   check('Auditor adds missing standard points from an existing audit without losing drafts; expanded site filter/search fits phone and desktop');
  }
  await open('client','/client/audits');
  await page.waitForSelector('app-client-audits');await page.waitForFunction(()=>Array.from(document.querySelectorAll('tr')).some(e=>e.textContent.includes('SAFETY')));
  await page.evaluate(()=>{const row=Array.from(document.querySelectorAll('tr')).find(e=>e.textContent.includes('SAFETY'));row.querySelector('button').click();});await page.waitForSelector('app-audit-fieldwork .point');
  await input('app-audit-fieldwork .search-label input','Loading bay');await page.click('app-audit-fieldwork .point');await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading')?.innerText.includes('Loading bay emergency exit'));
  await(await page.$('app-audit-fieldwork input[type=file]')).uploadFile(path.join(work,'fixture.pdf'));
  await input('app-audit-fieldwork .upload-section textarea','Updated evacuation plan for the loading bay.');
  await post(()=>button('Upload document'),'/evidence');
  await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .evidence-section').innerText.includes('Updated evacuation plan'));
  assert.equal(await page.$('app-audit-fieldwork .review-section textarea'),null);check('Client browser uploads to selected safety point and cannot self-verify');await screenshot('client-evidence-desktop');
  assert.equal(await page.$eval('app-audit-fieldwork input[type=file]',e=>e.value),'');
  await page.setViewport({width:390,height:844});
  assert.ok(await page.$eval('app-audit-fieldwork',e=>e.scrollWidth<=e.getBoundingClientRect().width+1));
  await screenshot('client-evidence-mobile');check('Client upload controls reset after saving and fit the phone viewport');
  await open('auditor',`/auditor/audits/${auditId}/workspace`);await page.waitForSelector('app-audit-fieldwork .point');
  await input('app-audit-fieldwork .search-label input','Loading bay');await page.click('app-audit-fieldwork .point');await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading')?.innerText.includes('Loading bay emergency exit'));
  await(await page.$('app-audit-fieldwork input[type=file]')).uploadFile(path.join(work,'site.png'));
  await input('app-audit-fieldwork .upload-grid input:not([type=file])','Loading bay / exit 2');await input('app-audit-fieldwork .upload-section textarea','Exit inspected. Route clear and signage visible.');await post(()=>button('Upload artifact'),'/evidence');
  await button('View');await page.waitForSelector('.image-preview img');assert.equal(await page.$eval('.image-preview img',e=>e.complete&&e.naturalWidth>0),true);await button('Close preview');
  await input('app-audit-fieldwork .review-section textarea','Inspected exit 2 and checked the client evacuation plan. Access is clear.');await page.select('app-audit-fieldwork .review-footer select','COMPLIED');await post(()=>button('Save verification'),'/review');
  await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading').innerText.includes('Verified'));const pointBounds=await page.$eval('app-audit-fieldwork .point',e=>({bottom:e.getBoundingClientRect().bottom,metaBottom:e.querySelector('.point-meta').getBoundingClientRect().bottom}));assert.ok(pointBounds.metaBottom<=pointBounds.bottom,'Point status must fit inside the selection card');await screenshot('auditor-verification-desktop');check('Auditor browser uploads site photo with location, previews image and saves verification');
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('app-audit-fieldwork .point');await input('app-audit-fieldwork .search-label input','Loading bay');await page.click('app-audit-fieldwork .point');await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading')?.innerText.includes('Loading bay emergency exit'));await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .review-section textarea')?.value.includes('Inspected exit 2'));await page.click('app-audit-fieldwork .history summary');assert.ok((await page.$eval('app-audit-fieldwork .history',e=>e.innerText)).includes('Inspected exit 2'));check('Saved verification and history survive browser reload');await page.$eval('app-audit-fieldwork .review-section',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(evidence,'auditor-remarks-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844});await screenshot('auditor-mobile');const overflow=await page.$eval('app-audit-fieldwork',e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth,viewport:innerWidth}));assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));check('Audit evidence workspace fits a 390px phone viewport');await page.$eval('app-audit-fieldwork .upload-section',e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(evidence,'auditor-upload-mobile.png'),fullPage:true});
  await open('branch','/branch/audits/evidence');await page.waitForSelector('app-client-audits');await page.waitForFunction(()=>Array.from(document.querySelectorAll('tr')).some(e=>e.textContent.includes('SAFETY')));await page.evaluate(()=>Array.from(document.querySelectorAll('tr')).find(e=>e.textContent.includes('SAFETY')).querySelector('button').click());await page.waitForSelector('app-audit-fieldwork .point');await input('app-audit-fieldwork .search-label input','Loading bay');await page.click('app-audit-fieldwork .point');await page.waitForFunction(()=>document.querySelector('app-audit-fieldwork .detail-heading')?.innerText.includes('Loading bay emergency exit'));assert.ok((await page.$eval('app-audit-fieldwork .detail-heading',e=>e.innerText)).includes('Verified'));check('Branch user can find Audit Evidence and see auditor verification');await screenshot('branch-evidence-desktop');
  await page.setViewport({width:390,height:844});
  assert.ok(await page.$eval('app-audit-fieldwork',e=>e.scrollWidth<=e.getBoundingClientRect().width+1));
  await screenshot('branch-evidence-mobile');check('Branch evidence and verification remain readable on a phone');
  await open('client','/client/audits');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('tr')).some(e=>e.querySelector('td strong')?.textContent.trim()==='HR'));
  await page.evaluate(()=>Array.from(document.querySelectorAll('tr')).find(e=>e.querySelector('td strong')?.textContent.trim()==='HR').querySelector('button').click());
  await page.waitForSelector('app-audit-fieldwork .point');
  assert.equal(await page.$('app-audit-fieldwork input[type=file]'),null);
  assert.ok((await page.$eval('app-audit-fieldwork',e=>e.innerText)).includes('read-only'));
  await screenshot('client-finalized-audit');check('Finalized report stays readable without presenting upload controls');
  assert.deepEqual(errors,[],'Browser runtime errors');
 }finally{if(page)fs.writeFileSync(path.join(evidence,'screen-state.json'),JSON.stringify(await page.evaluate(()=>({heading:document.querySelector('app-audit-fieldwork .detail-heading')?.innerText,remarks:document.querySelector('app-audit-fieldwork .review-section textarea')?.value,points:Array.from(document.querySelectorAll('app-audit-fieldwork .point')).map(e=>({text:e.innerText,html:e.outerHTML,style:{height:getComputedStyle(e).height,overflow:getComputedStyle(e).overflow},children:Array.from(e.children).map(c=>({class:c.className,display:getComputedStyle(c).display,visibility:getComputedStyle(c).visibility}))}))})),null,2));if(page)await page.screenshot({path:path.join(evidence,'last-screen.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'runtime-errors.json'),JSON.stringify(errors,null,2));await browser.close();}
};
