// Production-bundle smoke of all role shells. All network data is synthetic.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../dist/statco-frontend/browser');
const output = path.resolve(__dirname, '../../docs/reviews/2026-09-12/ui'); fs.mkdirSync(output, { recursive: true });
const origin = 'http://127.0.0.1:4319';
const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
 const relative = decodeURIComponent(new URL(req.url, origin).pathname).replace(/^\/app\/?/, '');
 let file = path.resolve(root, relative || 'index.html');
 if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
 if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const cases = [
 ['admin','ADMIN','users'], ['accounts','ACCOUNTS','settings'], ['sales','SALES','profile'],
 ['auditor','AUDITOR','audits'], ['contractor','CONTRACTOR','employees'], ['pf-team','PF_TEAM','tickets'],
 ['client','CLIENT','profile'], ['ess','EMPLOYEE','profile'], ['ceo','CEO','profile'], ['cco','CCO','profile'],
 ['branch','CLIENT','helpdesk'], ['payroll','PAYROLL','profile'], ['crm','CRM','profile'],
];
async function main() {
 await new Promise(resolve => server.listen(4319, '127.0.0.1', resolve)); let browser; const results = [];
 try {
  browser = await puppeteer.launch({ headless: true });
  for (const [portal,role,route] of cases) {
   const context = await browser.createBrowserContext(); const page = await context.newPage(); const errors = [], requests = [];
   const user = { id:'preview-user', userId:'preview-user', name:'Preview reviewer', email:'preview@example.test', roleCode:role, role:role, clientId:'00000000-0000-4000-8000-000000000001', userType:portal === 'branch' ? 'BRANCH':'MASTER', isMasterUser:portal !== 'branch', branchId:'00000000-0000-4000-8000-000000000002', branchIds:['00000000-0000-4000-8000-000000000002'], servicePackage:'FULL_SERVICE', enabledModules:['EMPLOYEE_COMPLIANCE','EMPLOYEE_ATTENDANCE','PAYROLL','CONTRACTOR_DOCUMENTS','CONTRACTOR_AUDIT','APPRAISAL'] };
   page.on('pageerror', error => errors.push(error.message));
   await page.setRequestInterception(true);
   page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.includes('/api/')) {
     requests.push(url.pathname); let body = {};
     if (url.pathname.endsWith('/auth/me')) body = user;
     else if (url.pathname.endsWith('/contractor/employees')) body = {data:Array.from({length:65},(_,i)=>({id:`worker-${i}`,name:`Preview Worker ${String(i+1).padStart(3,'0')}`,punchCode:String(i+1).padStart(5,'0'),branchId:user.branchId,isActive:i<63,status:i<63?'ACTIVE':'LEFT',gender:i%2?'Female':'Male',designation:'Technician',department:'Operations',monthlySalary:18000,pfApplicable:true,esiApplicable:true,dateOfJoining:'2026-09-01'})),total:65};
     else if (/profile|\/me$/.test(url.pathname)) body = {...user, fullName:user.name, employee:{...user,employeeCode:'EMP001',firstName:'Preview',lastName:'Reviewer'}, branches:[], clients:[], assignments:[], documents:[]};
     else if (/news|users|audits|tickets|notifications|branches|clients|roles|contractors|documents/.test(url.pathname)) body = [];
     request.respond({status:200, contentType:'application/json', body:JSON.stringify(body)}); return;
    }
    if (url.origin === origin || url.protocol === 'data:') request.continue(); else request.abort();
   });
   await page.evaluateOnNewDocument(user => { sessionStorage.setItem('accessToken','synthetic-preview-token'); sessionStorage.setItem('user',JSON.stringify(user)); }, user);
   let failure = null, modules = 0;
   try {
    await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
    await page.goto(`${origin}/app/${portal}/${route}`, {waitUntil:'networkidle0'});
    await page.waitForSelector('.workspace-ui app-workspace-tools', {timeout:10000});
    assert.ok(page.url().includes(`/app/${portal}/`), 'Portal guard unexpectedly redirected');
    if (portal === 'contractor') {
      const rowCount = n => page.waitForFunction(n => document.querySelectorAll('app-contractor-employees-page tbody tr').length === n, {}, n);
      await rowCount(63);
      const status = async label => { await page.$$eval('[aria-label="Worker status filter"] button', (buttons,label) => buttons.find(b => b.textContent.trim() === label).click(), label); };
      await status('Inactive'); await rowCount(2);
      await status('All'); await rowCount(65);
      await page.type('input[placeholder="Search by name…"]','Worker 001'); await rowCount(1);
      await page.click('[aria-label="View active workers"]'); await rowCount(63);
      await page.evaluate(() => {
        window.reviewDownloads = [];
        URL.createObjectURL = blob => { window.reviewDownloads.push(blob); return 'blob:synthetic-export'; };
        HTMLAnchorElement.prototype.click = function() { window.reviewDownloadName = this.download; };
      });
      await page.$$eval('app-contractor-employees-page button', buttons => buttons.find(b => b.textContent.trim() === 'Download Workers').click());
      await page.waitForFunction(() => window.reviewDownloads.length === 1);
      const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.reviewDownloads[0].arrayBuffer())));
      const XLSX = require('xlsx'); const workbook = XLSX.read(Buffer.from(bytes), {type:'buffer'});
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Workers);
      assert.equal(rows.length,63,'Export must contain the 63 active workers');
      assert.equal(rows[0]['Punch Code'],'00001','Excel preserves leading zeros');
      assert.ok(rows.every(row => row.Status === 'Active'));
      assert.match(await page.evaluate(() => window.reviewDownloadName), /^contractor-workers-active-.*\.xlsx$/);
    }
    await page.screenshot({path:path.join(output,`${portal}-desktop.png`),fullPage:true});
    await page.click('app-workspace-tools button[aria-haspopup="dialog"]');
    await page.waitForSelector('dialog[open]');
    // showModal opens synchronously; Angular renders the signal-driven links on its next update.
    await page.waitForSelector('.module-finder__results button', {timeout:10000});
    modules = await page.$$eval('.module-finder__results button', nodes => nodes.length);
    assert.ok(modules > 0, 'Module finder must include available navigation');
    assert.equal(await page.$eval('#module-finder-search', element => document.activeElement === element), true, 'Search focus');
    if (portal === 'admin') await page.screenshot({path:path.join(output,'module-finder-desktop.png')});
    await page.keyboard.press('Escape');
    await page.setViewport({width:390,height:844,deviceScaleFactor:1});
    await page.waitForFunction(() => document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).every(animation => animation.playState !== 'running')); 
    await page.screenshot({path:path.join(output,`${portal}-mobile.png`),fullPage:true});
    if (portal === 'branch') assert.ok(await page.$eval('app-thread-layout > .grid', grid => grid.firstElementChild.getBoundingClientRect().width >= grid.getBoundingClientRect().width * .95), 'Mobile helpdesk list must use the full available width');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile document overflow');
    await page.click('app-workspace-tools button[aria-pressed]');
    await page.waitForFunction(() => document.documentElement.dataset.uiDensity === 'compact');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.uiDensity), 'compact');
    await page.click('app-workspace-tools button[aria-haspopup="dialog"]');
    await page.type('#module-finder-search','zzzz-no-matching-module');
    await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('No matching modules'));
    assert.ok(await page.$eval('dialog',element => element.textContent.includes('No matching modules')));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], 'Browser runtime errors');
   } catch (error) { failure = error.message; }
   results.push({portal, route, modules, errors, failure, requests}); console.log(portal, failure || 'PASS', modules, 'modules');
   await context.close();
  }
  fs.writeFileSync(path.join(output,'portal-smoke.json'),JSON.stringify(results,null,2));
  assert.ok(results.every(result => !result.failure), 'Some portal checks failed; see ui/portal-smoke.json');
 } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
