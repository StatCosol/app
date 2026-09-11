// Visual smoke test of the production bundle, using synthetic API responses only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../dist/statco-frontend/browser');
const output = path.resolve(__dirname, '../../docs/reviews/2026-09-12');
const c = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const user = { id: 'preview-user', userId: 'preview-user', name: 'Preview reviewer', roleCode: 'CLIENT', clientId: c, userType: 'MASTER', isMasterUser: true, branchIds: [], servicePackage: 'FULL_SERVICE', enabledModules: ['EMPLOYEE_COMPLIANCE', 'EMPLOYEE_ATTENDANCE', 'PAYROLL', 'CONTRACTOR_DOCUMENTS'] };
const stage = (area,title,total,issues,description) => ({ area,title,total,issues,outstanding:issues.length,state:issues.length?'REVIEW':'RECORDED_CLEAR',description,truncated:false });
const issue = (id,title,reason,owner) => ({id,title,reason,owner,sourceId:null,dueDate:null});
const data = { clientId:c, branchId:b,branchName:'Bengaluru branch', month:'2026-09',generatedAt:'2026-09-12T09:00:00Z',outstanding:4,needsVerification:false,
 note:'Live review of recorded branch data. Clear checks do not close the month, certify compliance, or confirm payment. Company-wide payroll runs and returns are outside this branch view.',
 stages:[
 stage('attendance','Attendance',342,[issue('a','Attendance awaiting approval or correction','1 recorded entry is not approved.','Attendance reviewer')],'Checks recorded attendance approvals and unresolved mismatches. Missing days and offline punches are not inferred from an empty queue.'),
 stage('payroll','Payroll approval',1,[],'Approval status of branch-specific runs. An approved run is not evidence of salary payment.'),
 stage('documents','Contractor evidence',12,[issue('d','Example Services — Wage register','No submission for this required document and reporting month.','Contractor and document reviewer'),issue('d2','Sample Facilities — PF challan','The latest submission has not been approved. Earlier approvals do not approve a replacement.','Contractor and document reviewer')],'Reconciles configured requirements against the latest submission for this month. Checks file references, expiry and approval; it does not read wage amounts or verify document contents.'),
 stage('returns','Returns and filing evidence',3,[issue('r','Monthly return','Approved return has no recorded acknowledgment file.','Compliance team')],'Checks returns recorded for this month and non-monthly returns due within it. An acknowledgment reference is not independent verification of a filing.'),
 ]};
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server = http.createServer((req,res) => {
 const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/app\/?/,'');
 let file = path.resolve(root,relative || 'index.html');
 if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
 if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file=path.join(root,'index.html');
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(4317,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await puppeteer.launch({headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
   const url=new URL(request.url());
   if(url.pathname.includes('/api/')){
    let body={};
    if(url.pathname.endsWith('/monthly-close/options'))body={clients:[{id:c,clientName:'Example Industries'}]};
    else if(url.pathname.endsWith('/monthly-close/branches'))body={branches:[{id:b,branchName:'Bengaluru branch'}]};
    else if(url.pathname.endsWith('/monthly-close'))body=data;
    else if(url.pathname.endsWith('/auth/me'))body=user;
    else if(url.pathname.includes('news'))body=[];
    request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
   }
   if(url.hostname==='127.0.0.1'||url.protocol==='data:')request.continue();
   else request.abort();
  });
  await page.evaluateOnNewDocument(user=>{
   sessionStorage.setItem('accessToken','synthetic-preview-token');sessionStorage.setItem('user',JSON.stringify(user));
  },user);
  await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:4317/app/client/monthly-close',{waitUntil:'networkidle0'});
  await page.waitForSelector('app-monthly-close .stage',{timeout:15000});
  assert.equal(await page.$eval('app-monthly-close h1',element=>getComputedStyle(element).color),'rgb(255, 255, 255)','Hero title must have readable contrast');
  await page.screenshot({path:path.join(output,'monthly-close-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.screenshot({path:path.join(output,'monthly-close-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile page must not overflow horizontally');
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('Desktop and mobile production-bundle smoke passed with synthetic data; screenshots saved.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});