const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const puppeteer=require('../../frontend/node_modules/puppeteer');
module.exports=async({base,tokens,identities,clientId,branchId,work,pdf,check})=>{
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-first-run','--disable-extensions']});
 const evidence=path.resolve(__dirname,'../../output/document-flow-browser');fs.mkdirSync(evidence,{recursive:true});
 let page;
 const errors=[];
 try{
  async function open(role,route){
   if(page)await page.close();page=await browser.newPage();await page.setViewport({width:1440,height:1100});page.setDefaultTimeout(15000);
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.on('response',async r=>{if(r.url().includes('/api/')||r.url().includes('/uploads/')){try{errors.push(r.status()+' '+new URL(r.url()).pathname+' '+(r.url().includes('/api/')?(await r.text()).slice(0,700):''));}catch{}}});
   await page.evaluateOnNewDocument((token,user)=>{sessionStorage.setItem('accessToken',token);sessionStorage.setItem('user',JSON.stringify({...user,isMasterUser:user.userType==='MASTER',enabledModules:['EMPLOYEE_COMPLIANCE'],modules:['EMPLOYEE_COMPLIANCE']}));sessionStorage.setItem('idle_last_activity',String(Date.now()));},tokens[role],identities[role]);
   await page.goto(base+'/app'+route,{waitUntil:'networkidle0'});
  }
  async function button(label,selector='button'){const found=await page.evaluateHandle((label,selector)=>Array.from(document.querySelectorAll(selector)).find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===label),label,selector);const e=found.asElement();assert.ok(e,'Missing button '+label);await e.click();await found.dispose();}
  async function input(selector,value){await page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
  async function saved(action,url){const response=page.waitForResponse(r=>r.url().includes(url)&&r.request().method()==='POST');await action();const r=await response;assert.equal(r.status(),201,await r.text());await page.waitForNetworkIdle();return r.json();}
  let downloadIndex=0;
  async function viewDownload(label,container=''){
   await page.waitForFunction(container=>{const root=container?document.querySelector(container):document;return root&&Array.from(root.querySelectorAll('button')).some(e=>(e.getAttribute('aria-label')||e.textContent).trim()==='View');},{},container);
   const popupPromise=new Promise(resolve=>page.once('popup',resolve));
   await button('View',container+' button');const popup=await popupPromise;await popup.waitForFunction(()=>location.href.startsWith('blob:'));
   const bytes=await page.evaluate(async u=>Array.from(new Uint8Array(await(await fetch(u)).arrayBuffer())),popup.url());assert.deepEqual(Buffer.from(bytes),pdf);await popup.close();
   const folder=path.join(work,'downloads-'+(++downloadIndex));fs.mkdirSync(folder);
   const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:folder});
   await button('Download',container+' button');
   const deadline=Date.now()+10000;let downloaded;
   while(Date.now()<deadline){downloaded=fs.readdirSync(folder).find(n=>!n.endsWith('.crdownload'));if(downloaded)break;await new Promise(r=>setTimeout(r,100));}
   assert.ok(downloaded,'Browser download did not finish');assert.deepEqual(fs.readFileSync(path.join(folder,downloaded)),pdf);await cdp.detach();
   await page.screenshot({path:path.join(evidence,label+'.png'),fullPage:true});check(label+' browser View and Download return exact PDF');
  }
  await open('branch','/branch/compliance-docs');
  await page.waitForSelector('#bcd-upload-return-code option[value="TEST_MONTHLY"]');
  assert.equal(await page.$('select[aria-label="Branch"]'),null);
  assert.equal(await page.$('app-compliance-document-records input[aria-label="Submission year"]'),null);
  assert.equal(await page.$('app-compliance-document-records select[aria-label="Submission frequency"]'),null);
  const quarterList=page.waitForResponse(r=>r.url().includes('/branch/compliance-docs?')&&r.url().includes('frequency=QUARTERLY'));
  await page.select('select[aria-label="Frequency"]','QUARTERLY');
  assert.equal(new URL((await quarterList).url()).searchParams.get('quarter'),'4');
  await page.waitForSelector('select[aria-label="Quarter"]');assert.equal(await page.$('#bcd-month'),null);
  await page.select('select[aria-label="Frequency"]','MONTHLY');
  await page.waitForSelector('#bcd-upload-return-code option[value="TEST_MONTHLY"]');
  check('Branch has one period control set, hides its single-branch selector and filters submissions by quarter');
  await page.select('#bcd-upload-return-code','TEST_MONTHLY');await(await page.$('input[name="complianceFile"]')).uploadFile(path.join(work,'fixture.pdf'));
  await saved(async()=>{await button('Upload');await page.waitForSelector('app-confirm-dialog button');await button('OK','app-confirm-dialog button');},'/branch/compliance-docs/upload');
  check('Branch browser compliance upload/reupload');await viewDownload('branch-compliance','app-compliance-document-records');
  await open('branch','/branch/unit-documents');await page.waitForSelector('select[name="uploadType"]');
  assert.equal(await page.$('select[name="uploadBranch"]'),null);
  assert.equal(await page.$('select[name="uploadType"] option[value="Return"]'),null);
  assert.equal(await page.$eval('#bud-month',e=>e.closest('details').open),false);
  await page.click('details summary');await page.select('#bud-scope','COMPANY');
  await page.waitForFunction(()=>document.body.innerText.includes('No Documents Found'));
  await button('Clear filters');await page.waitForFunction(()=>document.body.innerText.includes('fixture.pdf'));
  await page.click('details summary');
  check('Unit advanced filters are collapsed by default and Clear filters restores the document list');
  await page.select('select[name="uploadType"]','Licence');await page.waitForNetworkIdle();await(await page.$('input[type="file"]')).uploadFile(path.join(work,'fixture.pdf'));
  await input('input[aria-label="Registration name"]','Browser branch licence');
  await input('input[name="validTo"]','2028-12-31');
  const branchLicence=await saved(()=>button('Upload'),'/branch/unit-documents/upload');check('Branch browser unit upload creates registration');
  await page.select('select[name="uploadType"]','Renewal');
  await page.waitForSelector('select[aria-label="Registration to renew"] option[value="'+branchLicence.registrationId+'"]');
  await page.select('select[aria-label="Registration to renew"]',branchLicence.registrationId);
  await input('input[name="validTo"]','2034-12-31');
  await(await page.$('input[type="file"]')).uploadFile(path.join(work,'fixture.pdf'));
  await saved(()=>button('Upload'),'/branch/unit-documents/upload');
  await page.waitForFunction(()=>document.body.innerText.includes('Current expiry: 2034-12-31'));
  check('Branch browser renewal updates current expiry');await viewDownload('branch-unit');
  await open('crm',`/crm/clients/${clientId}/compliance-tracker?tab=DOCS`);
  await page.waitForSelector('button[aria-label="⬆ Upload on Behalf"]');await button('⬆ Upload on Behalf');
  await page.waitForSelector('select[name="compBranch"] option[value="'+branchId+'"]');await page.select('select[name="compBranch"]',branchId);
  await page.select('select[name="compFreq"]','YEARLY');await page.select('select[name="compReturn"]','TEST_YEARLY');await input('input[name="compYear"]','2026');await(await page.$('input[type="file"]')).uploadFile(path.join(work,'fixture.pdf'));
  await saved(()=>button('Upload on Behalf'),'/crm/branch-compliance/upload-on-behalf');check('CRM browser compliance upload');
  await open('crm',`/crm/clients/${clientId}/compliance-docs`);await viewDownload('crm-compliance','app-compliance-document-records');
  await open('crm',`/crm/clients/${clientId}/unit-documents`);await button('Upload Document');
  assert.equal(await page.$('#crm-ud-form-month'),null);
  check('CRM unit upload uses validity dates without a redundant month field');
  await page.waitForSelector('#crm-ud-form-branch option[value="'+branchId+'"]');await page.select('#crm-ud-form-branch',branchId);await page.select('#crm-ud-form-law','POLLUTION');await page.select('#crm-ud-form-doctype','Report');await(await page.$('#crm-ud-form-file')).uploadFile(path.join(work,'fixture.pdf'));
  await saved(()=>button('Upload'),'/crm/unit-documents/upload');check('CRM browser unit report upload');
  await button('Upload Document');
  await page.waitForSelector('#crm-ud-form-branch');
  await page.select('#crm-ud-form-branch',branchId);await page.select('#crm-ud-form-law','POLLUTION');await page.select('#crm-ud-form-doctype','Renewal');
  await page.waitForSelector('select[aria-label="Registration to renew"] option[value="'+branchLicence.registrationId+'"]');
  await page.select('select[aria-label="Registration to renew"]',branchLicence.registrationId);
  await input('input[name="periodTo"]','2035-12-31');
  await(await page.$('#crm-ud-form-file')).uploadFile(path.join(work,'fixture.pdf'));
  await saved(()=>button('Upload'),'/crm/unit-documents/upload');
  await page.waitForFunction(()=>document.body.innerText.includes('Current expiry: 2035-12-31'));
  check('CRM browser renews the branch-created licence');await viewDownload('crm-unit');
  await open('branch','/branch/unit-documents');
  await page.waitForFunction(()=>document.body.innerText.includes('Current expiry: 2035-12-31'));
  check('Branch sees CRM renewal expiry');
  await open('client','/client/compliance/library');await viewDownload('client-compliance','app-compliance-document-records');
  await open('client','/client/unit-documents');await page.waitForFunction(()=>document.body.innerText.includes('Current expiry: 2035-12-31'));check('Client sees shared current renewal expiry');await viewDownload('client-unit');
  assert.equal(await page.$('input[type="file"]'),null);check('Client unit page is read-only');
  for(const name of ['failure.txt','failure.png']){const p=path.join(evidence,name);if(fs.existsSync(p))fs.unlinkSync(p);}
 }catch(e){if(page&&!page.isClosed()){await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true});fs.writeFileSync(path.join(evidence,'failure.txt'),page.url()+'\n'+await page.evaluate(()=>document.body.innerText)+'\n'+errors.join('\n'));}throw e;}
 finally{await browser.close();}
};
