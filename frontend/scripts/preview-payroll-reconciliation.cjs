// Production UI smoke test. All API responses and uploaded records are synthetic.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {parseRegister,reconcileRegister}=require('../../backend/dist/src/payroll/reconciliation/register-reconciliation.js');
const root=path.resolve(__dirname,'../dist/statco-frontend/browser'),output=path.resolve(__dirname,'../../docs/reviews/2026-09-12');
const c='00000000-0000-4000-8000-000000000001',r='00000000-0000-4000-8000-000000000002';
const user={id:'preview',userId:'preview',name:'Synthetic reviewer',roleCode:'PAYROLL',assignedClientIds:[c]};
const run={id:r,clientId:c,clientName:'Example Industries',periodMonth:9,periodYear:2026,status:'PROCESSED',employeeCount:2,createdAt:'2026-09-01T09:00:00Z'};
const csv='employee_code,period,gross_earnings,net_pay,pf_employee,esi_employee\r\nEMP001,2026-09,25000.01,23200,1800,0\r\nEMP003,2026-09,18000,16500,,135\r\n';
const baseline=[{employeeCode:'EMP001',values:{gross_earnings:'25000.00',net_pay:'23200.00',pf_employee:'1800.00',esi_employee:'0.00'}},{employeeCode:'EMP002',values:{gross_earnings:'20000.00',net_pay:'18200.00',pf_employee:'1800.00',esi_employee:null}}];
const report={...reconcileRegister(baseline,parseRegister(Buffer.from(csv),'2026-09')),run:{...run,period:'2026-09',branchId:null,updatedAt:'2026-09-12T09:00:00Z'},source:{fileName:'synthetic-wages.csv',sha256:'synthetic-file-fingerprint'},baselineSha256:'synthetic-payroll-fingerprint',generatedAt:'2026-09-12T09:00:00Z',comparedBy:'preview',note:'Comparison of supplied CSV values with a payroll snapshot. Differences are uploaded minus payroll. Blank amounts are unknown, not zero. Matching amounts do not verify payment or statutory remittance. Review findings before acting; payroll is unchanged.'};
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/app\/?/,'')||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(4318,'127.0.0.1',resolve));let browser;
 try{
  browser=await puppeteer.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
   const url=new URL(request.url());
   if(url.pathname.includes('/api/')){
    let body={};
    if(url.pathname.endsWith('/payroll/clients'))body=[{id:c,clientName:'Example Industries'}];
    else if(url.pathname.endsWith('/payroll/runs'))body=[run];
    else if(url.pathname.endsWith('/reconcile-register'))body=report;
    else if(url.pathname.endsWith('/employees'))body=[];
    else if(url.pathname.endsWith('/approval-status'))body={status:'PROCESSED'};
    else if(url.pathname.endsWith('/auth/me'))body=user;
    else if(url.pathname.includes('news'))body=[];
    request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
   }
   if(url.hostname==='127.0.0.1'||url.protocol==='data:')request.continue();else request.abort();
  });
  await page.evaluateOnNewDocument(user=>{sessionStorage.setItem('accessToken','synthetic-preview-token');sessionStorage.setItem('user',JSON.stringify(user));},user);
  await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:4318/app/payroll/clients/${c}/runs`,{waitUntil:'networkidle0'});
  await page.waitForSelector('app-payroll-reconciliation input[type=file]',{timeout:15000});
  const fixture=path.join(output,'synthetic-wages.csv');fs.writeFileSync(fixture,csv);
  const chooserPromise = page.waitForFileChooser();
  await page.click('app-payroll-reconciliation .upload button.secondary');
  await (await chooserPromise).accept([fixture]);
  await page.waitForFunction(() => [...document.querySelectorAll('app-payroll-reconciliation button')].some(button => button.textContent.includes('Compare with payroll') && !button.disabled));
  await page.$$eval('app-payroll-reconciliation button',buttons=>buttons.find(button=>button.textContent.includes('Compare with payroll')).click());
  await page.waitForSelector('app-payroll-reconciliation .metrics');
  await page.$eval('app-payroll-reconciliation details',element=>{element.open=true;});
  await page.$eval('app-payroll-reconciliation',element=>element.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(output,'reconciliation-desktop.png')});
  assert.ok(await page.$eval('app-payroll-reconciliation',element=>element.textContent.includes('0.01')),'One-paisa difference visible');
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.$eval('app-payroll-reconciliation',element=>element.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(output,'reconciliation-mobile.png')});
  assert.equal(await page.$eval('app-payroll-reconciliation .reconciliation',element=>element.scrollWidth>element.clientWidth+1),false,'Reconciliation panel must not overflow horizontally');
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('Production-bundle wage register upload, comparison display, desktop/mobile layout and one-paisa detail passed using synthetic records.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});