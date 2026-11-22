const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../dist/statco-frontend/browser');
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/app\//,'');
  let file=path.resolve(root,pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();const errors=[];const sent=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1000});
    await page.evaluateOnNewDocument(()=>{
      sessionStorage.setItem('accessToken','local-ui-test-token');
      sessionStorage.setItem('user',JSON.stringify({id:'test-office',roleCode:'TIME_OFFICE_EXECUTIVE',name:'Test Time Office',clientName:'Test Company',clientId:'test-company',enabledModules:['EMPLOYEE_ATTENDANCE']}));
    });
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      if(!req.url().includes('/api/'))return req.continue();
      const u=new URL(req.url());let body={};
      if(u.pathname.endsWith('/time-office/follow-up')){sent.push(JSON.parse(req.postData()));body={sent:1,existing:0,recipients:['Test recipient']};}
      else if(u.pathname.endsWith('/time-office')){
        const view=u.searchParams.get('view');
        const row={id:'test-employee',name:'Missing Employee',employee_code:'E001',branch:'Test Branch',status:'NOT_MARKED',incomplete:false};
        if(view==='leaves') Object.assign(row,{leave_type:'CL',from_date:'2026-01-05',to_date:'2026-01-05',total_days:1,status:'APPROVED'});
        if(view==='coff') Object.assign(row,{accrued:2,used:1,lapsed:0,available:1});
        body={rows:[row],branches:[],summary:{employees:1,notMarked:1},total:1,pageSize:50,date:'2026-01-05'};
      }else if(u.pathname.endsWith('/notifications/inbox'))body={data:[{id:'test-thread',subject:'Missed attendance reminder',status:'OPEN',createdAt:'2026-01-05T12:00:00Z',assignedTo:{name:'Test employee'}}],total:1};
      else if(u.pathname.endsWith('/threads/test-thread'))body={thread:{id:'test-thread',subject:'Missed attendance reminder',status:'OPEN'},messages:[{id:1,message:'Please review your attendance.',from:{name:'Time Office'},createdAt:'2026-01-05T12:00:00Z'}]};
      else if(u.pathname.includes('/auth/me'))body={id:'test-office',roleCode:'TIME_OFFICE_EXECUTIVE',clientId:'test-company',enabledModules:['EMPLOYEE_ATTENDANCE']};
      await req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    const base=`http://127.0.0.1:${server.address().port}/app`;
    await page.goto(base+'/time-office',{waitUntil:'networkidle0'});
    await page.waitForSelector('table tbody tr');
    assert((await page.$eval('body',e=>e.innerText)).includes('Missing Employee'));
    const click=async label=>{await page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label);if(!b)throw Error('Button missing: '+label);b.click();},label);};
    await click('Notify employee');await page.waitForFunction(()=>document.body.innerText.includes('In-app notification sent'));
    assert.equal(sent[0].target,'EMPLOYEE');assert.equal(sent[0].date,'2026-01-05');
    await click('Escalate to branch');await page.waitForFunction(()=>document.body.innerText.includes('In-app notification sent'));
    await page.waitForNetworkIdle();assert.equal(sent[1].target,'BRANCH');
    await click('Leaves');await page.waitForFunction(()=>document.body.innerText.includes('Leave applications in selected month'));
    await click('Comp-off');await page.waitForFunction(()=>document.body.innerText.includes('Comp-off balances as of review date'));
    await click('Notifications & escalations');await page.waitForFunction(()=>document.body.innerText.includes('Missed attendance reminder'));
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Missed attendance reminder')).click());
    await page.waitForSelector('textarea');await page.type('textarea','Attendance has been reviewed.');await click('Send reply');await page.waitForNetworkIdle();
    await click('Attendance');await page.waitForSelector('table');
    await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(__dirname,'../time-office-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false,'Page should fit mobile viewport');
    assert.deepEqual(errors,[]);
    console.log('PASS: production browser rendering, four menus, employee reminder, branch escalation, notification reply and mobile layout (mock API fixtures).');
  }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);server.close();process.exitCode=1;});
