const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../dist/statco-frontend/browser');
const output=process.env.UI_OUTPUT_DIR||path.join(__dirname,'../output/time-office');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/app\//,'');
  let file=path.resolve(root,pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();const errors=[];const sent=[];const savedSettings=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1000});
    await page.evaluateOnNewDocument(()=>{
      sessionStorage.setItem('accessToken','local-ui-test-token');
      sessionStorage.setItem('user',JSON.stringify({id:'test-office',roleCode:'TIME_OFFICE_EXECUTIVE',name:'Test Time Office',clientName:'Test Company',clientLogoUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" rx="6" fill="#183f34"/><text x="10" y="26" fill="white" font-size="16">TEST Logo</text></svg>'),clientId:'test-company',enabledModules:['EMPLOYEE_ATTENDANCE']}));
    });
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      if(!req.url().includes('/api/'))return req.continue();
      const u=new URL(req.url());let body={};
      if(u.pathname.endsWith('/time-office/follow-up')){sent.push(JSON.parse(req.postData()));body={sent:1,existing:0,recipients:['Test recipient']};}
      else if(u.pathname.endsWith('/time-office/automation')){const changes=req.method()==='PUT'?JSON.parse(req.postData()):null;if(changes)savedSettings.push(changes);body={enabled:changes?changes.enabled:true,weekly_off_days:changes?changes.weeklyOffDays:[0],starts_on:'2026-01-05',last_run_at:null,awaiting_correction:2,escalated:1,delivery_issues:0,issues:[]};}
      else if(u.pathname.endsWith('/time-office')){
        const view=u.searchParams.get('view');
        const row={id:'test-employee',name:'Missing Employee',employee_code:'E001',branch:'Test Branch',worker_type:'EMPLOYEE',status:'NOT_MARKED',incomplete:false};
        if(view==='leaves') Object.assign(row,{leave_type:'CL',from_date:'2026-01-05',to_date:'2026-01-05',total_days:1,status:'APPROVED'});
        if(view==='coff') Object.assign(row,{accrued:2,used:1,lapsed:0,available:1});
        const contractor={...row,id:'test-contractor-worker',name:'TEST ONLY Contractor worker',employee_code:'TEST-C001',worker_type:'CONTRACTOR',contractor_name:'TEST ONLY Vendor',status:'PRESENT',check_in:'09:00:00',check_out:'18:00:00',worked_hours:9,approval_status:'RECORDED'};
        body={rows:view==='attendance'?[row,contractor]:[row],branches:[],contractors:[{id:'test-vendor',name:'TEST ONLY Vendor'}],summary:view==='attendance'?{workers:2,employees:1,contractorWorkers:1,notMarked:1,shortHours:0,incomplete:0,onLeave:0,absent:0}:{employees:1},total:view==='attendance'?2:1,pageSize:50,date:u.searchParams.get('date')};
      }else if(u.pathname.endsWith('/notifications/inbox'))body={data:[{id:'test-thread',subject:'Missed attendance reminder',status:'OPEN',createdAt:'2026-01-05T12:00:00Z',assignedTo:{name:'Test employee'}}],total:1};
      else if(u.pathname.endsWith('/threads/test-thread'))body={thread:{id:'test-thread',subject:'Missed attendance reminder',status:'OPEN'},messages:[{id:1,message:'Please review your attendance.',from:{name:'Time Office'},createdAt:'2026-01-05T12:00:00Z'}]};
      else if(u.pathname.includes('/auth/me'))body={id:'test-office',roleCode:'TIME_OFFICE_EXECUTIVE',clientId:'test-company',enabledModules:['EMPLOYEE_ATTENDANCE']};
      await req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    const base=`http://127.0.0.1:${server.address().port}/app`;
    await page.goto(base+'/time-office',{waitUntil:'networkidle0'});
    await page.waitForSelector('table tbody tr');
    await page.waitForFunction(()=>document.querySelector('.client-logo')?.naturalWidth>0);
    assert((await page.$eval('body',e=>e.innerText)).includes('Missing Employee'));
    const click=async label=>{await page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label);if(!b)throw Error('Button missing: '+label);b.click();},label);};
    await click('Notify employee');await page.waitForFunction(()=>document.body.innerText.includes('In-app notification sent'));
    assert.equal(sent[0].target,'EMPLOYEE');assert.equal(sent[0].date,await page.$eval('input[name=date]',e=>e.value));
    await click('Escalate to branch');await page.waitForFunction(()=>document.body.innerText.includes('In-app notification sent'));
    await page.waitForNetworkIdle();assert.equal(sent[1].target,'BRANCH');
    await click('Leaves');await page.waitForFunction(()=>document.body.innerText.includes('Leave applications in selected month'));
    await click('Comp-off');await page.waitForFunction(()=>document.body.innerText.includes('Comp-off balances as of review date'));
    await click('Notifications & escalations');await page.waitForFunction(()=>document.body.innerText.includes('Missed attendance reminder'));
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Missed attendance reminder')).click());
    await page.waitForSelector('textarea');await page.type('textarea','Attendance has been reviewed.');await click('Send reply');await page.waitForNetworkIdle();
    await click('Automatic follow-ups');await page.waitForSelector('input[name=enabled]');
    assert(await page.$eval('input[name=enabled]',e=>e.disabled));
    await page.evaluate(()=>{const user=JSON.parse(sessionStorage.getItem('user'));user.roleCode='TIME_OFFICE_MANAGER';sessionStorage.setItem('user',JSON.stringify(user));});
    await click('Attendance');await click('Automatic follow-ups');await page.waitForSelector('input[name=enabled]');
    await page.click('input[name=enabled]');await click('Save settings');await page.waitForFunction(()=>document.body.innerText.includes('settings saved'));assert.equal(savedSettings[0].enabled,false);
    await click('Attendance');await page.waitForSelector('table');await page.waitForNetworkIdle();
    for(const width of [1872,1440,768,390]){
      await page.setViewport({width,height:950});
      // Capture settled responsive layout, not an intermediate drawer animation.
      await page.waitForFunction(()=>{
        const panel=document.querySelector('.sidebar-panel');
        return window.innerWidth>=1024 || (panel.inert && panel.getBoundingClientRect().right<=1);
      });
      await page.screenshot({path:path.join(output,`time-office-${width}.png`),fullPage:true});
      assert(await page.evaluate(()=>[...document.querySelectorAll('nav button:not(.active)')].every(b=>getComputedStyle(b).backgroundImage==='none'&&getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')),'Inactive navigation must stay neutral');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false,'Page should fit viewport '+width);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: production browser rendering, automatic settings, manager-only changes, employee reminder, branch escalation, notification reply and mobile layout (mock API fixtures).');
  }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);server.close();process.exitCode=1;});
