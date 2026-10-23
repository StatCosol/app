// Synthetic, disposable PostgreSQL and HTTP/browser regression. Never reads app DB credentials.
require('reflect-metadata');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {PGlite}=require('./auditxpert-test-db.cjs');
const {Test}=require('@nestjs/testing');
const {DataSource}=require('typeorm');
const {ValidationPipe,VersioningType,UnauthorizedException}=require('@nestjs/common');
const {JwtService}=require('@nestjs/jwt');
const express=require('express');
const {AuditFieldworkService}=require('../dist/src/audits/audit-fieldwork.service');
const {AuditFieldworkController}=require('../dist/src/audits/audit-fieldwork.controller');
const {JwtAuthGuard}=require('../dist/src/auth/jwt-auth.guard');
const {RolesGuard}=require('../dist/src/auth/roles.guard');
const {AUDIT_CHECKLIST_TEMPLATES}=require('../dist/src/audits/audit-checklist-templates');
const {fieldworkScore,fieldworkAppendix}=require('../dist/src/audits/audit-fieldwork-report');
const {generateAuditReportPdfBuffer}=require('../dist/src/audits/utils/report-pdf');
const root=path.resolve(__dirname,'../..'),originalCwd=process.cwd();
const work=fs.mkdtempSync(path.join(os.tmpdir(),'audit-fieldwork-'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientId=uuid(10),branchId=uuid(11),otherBranchId=uuid(12);
const identities={auditor:{id:uuid(1),roleCode:'AUDITOR'},otherAuditor:{id:uuid(2),roleCode:'AUDITOR'},client:{id:uuid(3),roleCode:'CLIENT',userType:'MASTER',clientId},branch:{id:uuid(4),roleCode:'CLIENT',userType:'BRANCH',clientId,branchIds:[branchId]},otherBranch:{id:uuid(5),roleCode:'CLIENT',userType:'BRANCH',clientId,branchIds:[otherBranchId]},outsider:{id:uuid(6),roleCode:'CLIENT',userType:'MASTER',clientId:uuid(20)},contractor:{id:uuid(7),roleCode:'CONTRACTOR',clientId}};
let app,db,source;let checks=0;const check=message=>{checks++;console.log('PASS '+message);};
(async()=>{try{
 process.chdir(work);db=new PGlite();
 const adapter=target=>({query:async(sql,params)=>(await target.query(sql,params)).rows});
 await db.ready; source=new DataSource({type:'postgres',host:'127.0.0.1',port:Number(process.env.AUDITXPERT_TEST_PORT||55439),username:process.env.AUDITXPERT_TEST_USER||'monthly_close_test',password:process.env.AUDITXPERT_TEST_PASSWORD,database:db.name});await source.initialize();
 await db.exec(`CREATE TABLE clients(id uuid PRIMARY KEY,client_name text);
 CREATE TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text,isactive boolean,isdeleted boolean);
 CREATE TABLE user_branches(user_id uuid,branch_id uuid);
 CREATE TABLE users(id uuid PRIMARY KEY,name text);
 CREATE TABLE audits(id uuid PRIMARY KEY,audit_code text,client_id uuid,branch_id uuid,contractor_user_id uuid,audit_type text,status text,period_code text,due_date date,assigned_auditor_id uuid);
 CREATE TABLE audit_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid,status text,updated_at timestamptz DEFAULT now());
 CREATE TABLE audit_checklist_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid,item_label varchar(255),doc_type text,status text,is_required boolean,sort_order int,remarks text,automated_remarks text,automation_reviewed boolean NOT NULL DEFAULT false,reviewed_by uuid,reviewed_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE contractor_required_documents(contractor_user_id uuid,client_id uuid,doc_type text,is_required boolean);`);
 const migration=fs.readFileSync(path.join(root,'backend/migrations/20261023_audit_fieldwork.sql'),'utf8');await db.exec(migration);await db.exec(migration);check('Migration safely replays');
 await db.query('INSERT INTO clients VALUES($1,$2),($3,$4)',[clientId,'Northstar Industries',uuid(20),'Other Company']);
 await db.query('INSERT INTO client_branches VALUES($1,$2,$3,true,false),($4,$2,$5,true,false)',[branchId,clientId,'Chennai - Manufacturing Unit',otherBranchId,'Other branch']);
 for(const [name,u]of Object.entries(identities)){u.userId=u.id;u.name='Test '+name;u.email=name+'@audit-test.invalid';await db.query('INSERT INTO users VALUES($1,$2)',[u.id,u.name]);for(const b of u.branchIds||[])await db.query('INSERT INTO user_branches VALUES($1,$2)',[u.id,b]);}
 const audits=[];for(const [i,type]of Object.keys(AUDIT_CHECKLIST_TEMPLATES).entries()){const id=uuid(100+i);await db.query("INSERT INTO audits VALUES($1,$2,$3,$4,NULL,$5,'IN_PROGRESS','2026-10','2026-10-30',$6)",[id,'AX-2026-'+(100+i),clientId,branchId,type,identities.auditor.id]);audits.push({id,type});}
 const service=new AuditFieldworkService(source);const jwt=new JwtService({secret:crypto.randomBytes(32).toString('hex')});
 const tokens=Object.fromEntries(Object.entries(identities).map(([k,u])=>[k,jwt.sign({sub:u.id,type:'access'},{expiresIn:'1h'})]));
 const authenticate=req=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const p=jwt.verify(token);const u=Object.values(identities).find(u=>u.id===p.sub);if(!u||p.type!=='access')throw Error();return u;}catch{throw new UnauthorizedException();}};
 const mod=await Test.createTestingModule({controllers:[AuditFieldworkController],providers:[{provide:AuditFieldworkService,useValue:service},RolesGuard]}).overrideGuard(JwtAuthGuard).useValue({canActivate:c=>{c.switchToHttp().getRequest().user=authenticate(c.switchToHttp().getRequest());return true;}}).compile();
 app=mod.createNestApplication({logger:['error']});app.setGlobalPrefix('api');app.enableVersioning({type:VersioningType.URI});app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
 const http=app.getHttpAdapter().getInstance();
 const auditRows=async()=> (await source.query('SELECT * FROM audits')).map(a=>({id:a.id,auditCode:a.audit_code,auditType:a.audit_type,status:a.status,clientId:a.client_id,branchId:a.branch_id,periodCode:a.period_code,periodYear:2026,frequency:'MONTHLY',dueDate:a.due_date,assignedAuditorId:a.assigned_auditor_id,assignedAuditor:{name:'Test auditor'},client:{id:clientId,clientName:'Northstar Industries'},branch:{id:branchId,branchName:'Chennai - Manufacturing Unit'},score:null}));
 // Only surrounding navigation/existing legacy panels use fixtures. All new fieldwork APIs are real Nest + PostgreSQL.
 http.use(async(req,res,next)=>{if(!req.path.startsWith('/api/')||req.path.startsWith('/api/v1/audit-fieldwork/'))return next();
  let u;try{u=authenticate(req);}catch{return res.status(401).json({message:'Unauthorized'});}
  const p=req.path;
  if(p==='/api/v1/me')return res.json({...u,enabledModules:['CONTRACTOR_AUDIT','CONTRACTOR_DOCUMENTS','EMPLOYEE_COMPLIANCE'],modules:['CONTRACTOR_AUDIT','CONTRACTOR_DOCUMENTS','EMPLOYEE_COMPLIANCE']});
  if(p==='/api/v1/client/audits'||p==='/api/v1/auditor/audits')return res.json(await auditRows());
  const match=p.match(/^\/api\/v1\/auditor\/audits\/([\w-]+)(?:\/(.*))?$/);if(match){const a=(await auditRows()).find(a=>a.id===match[1]);if(!match[2]||match[2]==='info')return res.json(a||{});if(match[2]==='checklist'){const w=await service.workspace(u,match[1]);return res.json({items:w.items,summary:{total:w.items.length,pending:w.items.filter(i=>['PENDING','UPLOADED'].includes(i.status)).length}});}if(match[2]==='documents')return res.json({branchDocuments:[],contractorDocuments:[]});return res.json({});}
  if(p.includes('report-status'))return res.json({stage:'DRAFT'});
  if(p.includes('branches'))return res.json([{id:branchId,branchName:'Chennai - Manufacturing Unit',branchCode:'CHE-01',clientId}]);
  if(p.includes('notification')||p.includes('unread-count'))return res.json({items:[],count:0,unreadCount:0});
  if(p.includes('settings'))return res.json({allowBranchPayrollAccess:false});
  return res.json([]);
 });
 const dist=path.join(root,'frontend/dist/statco-frontend/browser');http.use('/app',express.static(dist,{dotfiles:'allow'}));http.get(/^\/app(?:\/.*)?$/,(req,res)=>res.sendFile(path.join(dist,'index.html'),{dotfiles:'allow'}));
 await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 const pdf=await generateAuditReportPdfBuffer({auditId:'fixture',version:'INTERNAL',stage:'FINAL',executiveSummary:'Synthetic test document',scope:'Test',methodology:'Inspection',findings:'None',recommendations:'None',observations:[]});fs.writeFileSync(path.join(work,'fixture.pdf'),pdf);
 const call=async(role,url,init={},expected=200)=>{const r=await fetch(base+url,{...init,headers:{...(role?{Authorization:'Bearer '+tokens[role]}:{}),...init.headers}});const t=await r.text();assert.equal(r.status,expected,`${role} ${url}: ${r.status} ${t.slice(0,500)}`);return t?JSON.parse(t):null;};
 const upload=async(role,id,item,fields={},expected=201,bytes=pdf,name='fixture.pdf',mime='application/pdf')=>{const fd=new FormData();fd.append('description','Evidence for audit verification');for(const [k,v]of Object.entries(fields))fd.set(k,v);fd.append('file',new Blob([bytes],{type:mime}),name);return call(role,`/api/v1/audit-fieldwork/${id}/items/${item}/evidence`,{method:'POST',body:fd},expected);};
 const review=async(role,id,item,revision,decision='COMPLIED',expected=201)=>call(role,`/api/v1/audit-fieldwork/${id}/items/${item}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,decision,remarks:'Checked evidence and recorded inspection decision.'})},expected);
 for(const a of audits){const url='/api/v1/audit-fieldwork/'+a.id;const w=await call('client',url);assert.equal(w.items.length,AUDIT_CHECKLIST_TEMPLATES[a.type].length);const item=w.items[0].id;const e=await upload('client',a.id,item);const aw=await call('auditor',url);assert.equal(aw.items[0].status,'UPLOADED');assert.equal(aw.items[0].evidence[0].id,e.id);await review('auditor',a.id,item,1);assert.equal((await call('client',url)).items[0].status,'COMPLIED');check(a.type+': client upload → assigned auditor verification → client feedback');}
 const a=audits.find(a=>a.type==='SAFETY'),url='/api/v1/audit-fieldwork/'+a.id;let w=await call('auditor',url);const item=w.items[0].id;
 for(const role of ['otherAuditor','outsider','otherBranch','contractor']){await call(role,url,{},403);await upload(role,a.id,item,{},403);}
 await call(null,url,{},401);await call('branch',url);check('Tenant, branch, assignment, role and authentication boundaries enforced');
 await review('client',a.id,item,1,'COMPLIED',403);await review('auditor',a.id,uuid(999),0,'COMPLIED',404);await review('auditor',a.id, (await call('client','/api/v1/audit-fieldwork/'+audits[0].id)).items[0].id,1,'COMPLIED',404);check('Client cannot self-verify; cross-audit point IDs rejected');
 await upload('branch',a.id,item,{description:'Corrected supporting record'});await review('auditor',a.id,item,1,'COMPLIED',409);await review('auditor',a.id,item,2,'NON_COMPLIED');w=await call('client',url);assert.equal(w.items[0].history.length,2);assert.equal(w.items[0].evidence.length,2);assert.equal(w.items[0].status,'NON_COMPLIED');check('Corrections retain files and prior reviews; stale verification rejected');
 await assert.rejects(()=>db.query("UPDATE audit_checklist_items SET evidence_revision=0,status='COMPLIED' WHERE id=$1",[item]),/New audit evidence/);check('A stale legacy review cannot overwrite a newer evidence revision');
 const score=await fieldworkScore(source,a.id);assert.equal(score.score,0);assert.equal(score.nonComplied,1);check('Failed inspection points affect scoring');
 const added=await call('auditor',url+'/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'Loading bay emergency exit',kind:'SITE_INSPECTION'})},201);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64');fs.writeFileSync(path.join(work,'site.png'),png);
 await upload('auditor',a.id,added.id,{description:'Exit signage visible; access route is unobstructed.',location:'Warehouse A / loading bay'},201,png,'site.png','image/png');w=await call('client',url);const site=w.items.find(i=>i.id===added.id);assert.equal(site.evidence[0].uploadedRole,'AUDITOR');assert.equal(site.evidence[0].location,'Warehouse A / loading bay');
 for(const role of ['client','branch','auditor']){const response=await fetch(base+site.evidence[0].url,{headers:{Authorization:'Bearer '+tokens[role]}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);}
 for(const role of ['otherBranch','outsider','otherAuditor'])await call(role,site.evidence[0].url,{},403);check('Auditor site artifact, remarks and location persist; protected download returns exact bytes');
 await upload('client',a.id,added.id,{description:'  '},400);await upload('client',a.id,added.id,{},400,Buffer.from('fake image'),'fake.png','image/png');await upload('client',a.id,added.id,{},413,Buffer.alloc(10*1024*1024+1),'large.pdf');check('Blank descriptions, invalid file signatures and oversized uploads rejected');
 await assert.rejects(()=>db.query("UPDATE audits SET status='SUBMITTED' WHERE id=$1",[a.id]),/Review all audit evidence/);
 await assert.rejects(()=>db.query("INSERT INTO audit_reports(audit_id,status) VALUES($1,'SUBMITTED')",[a.id]),/Review all audit evidence/);check('Submission and report finalization cannot bypass pending evidence');
 const beforeFiles=fs.readdirSync(path.join(work,'uploads/audit-evidence')).length;
 for(const status of ['SUBMITTED','COMPLETED','CLOSED','CANCELLED']){await db.query('ALTER TABLE audits DISABLE TRIGGER audit_fieldwork_closure');await db.query('UPDATE audits SET status=$2 WHERE id=$1',[a.id,status]);await db.query('ALTER TABLE audits ENABLE TRIGGER audit_fieldwork_closure');await upload('client',a.id,item,{},400);await review('auditor',a.id,item,2,'COMPLIED',400);assert.equal((await call('client',url)).canEdit,false);}
 assert.equal(fs.readdirSync(path.join(work,'uploads/audit-evidence')).length,beforeFiles);await db.query("UPDATE audits SET status='IN_PROGRESS' WHERE id=$1",[a.id]);check('Closed and submitted audits reject changes without orphan files');

 const namesBeforeFailure=fs.readdirSync(path.join(work,'uploads/audit-evidence')).sort();
 const failureService=new AuditFieldworkService({...source,transaction:fn=>db.transaction(tx=>fn({query:async(sql,params)=>{if(sql.includes('INSERT INTO audit_item_evidence'))throw new Error('Synthetic database failure');return (await tx.query(sql,params)).rows;}}))});
 await assert.rejects(()=>failureService.upload(identities.client,a.id,item,{description:'Rejected transaction fixture'},{originalname:'fixture.pdf',mimetype:'application/pdf',size:pdf.length,buffer:pdf}),/Synthetic database failure/);
 assert.deepEqual(fs.readdirSync(path.join(work,'uploads/audit-evidence')).sort(),namesBeforeFailure);check('Database rollback removes only the rejected upload');
 const closed=audits.find(v=>v.type==='HR');const cw=await call('auditor','/api/v1/audit-fieldwork/'+closed.id);
 for(const p of cw.items)await review('auditor',closed.id,p.id,p.revision,'COMPLIED');
 await db.query("INSERT INTO audit_reports(audit_id,status) VALUES($1,'SUBMITTED')",[closed.id]);
 await upload('client',closed.id,cw.items[0].id,{},400);assert.equal((await call('auditor','/api/v1/audit-fieldwork/'+closed.id)).canEdit,false);
 await db.query("UPDATE audit_reports SET status='DRAFT' WHERE audit_id=$1",[closed.id]);assert.equal((await call('client','/api/v1/audit-fieldwork/'+closed.id)).canEdit,true);check('Finalized report locks fieldwork; reopening its draft restores editing');
 const appendix=await fieldworkAppendix(source,a.id);assert.ok(appendix.find(i=>i.label==='Loading bay emergency exit').evidence.includes('Warehouse A / loading bay'));
 const report=await generateAuditReportPdfBuffer({auditId:a.id,version:'CLIENT',stage:'FINAL',executiveSummary:'Synthetic inspection report',scope:'Safety',methodology:'On site review',findings:'See inspection record',recommendations:'Complete corrections',observations:[],fieldwork:appendix});assert.ok(report.length>1000);check('Exported report includes checklist decisions, remarks and evidence register');
 if(process.argv.includes('--browser'))await require('./audit-fieldwork-browser.cjs')({base,tokens,identities,auditId:a.id,work,check,root,service,clientId,branchId});
 console.log(`PASS ${checks} AuditXpert fieldwork checks`);
 }finally{await app?.close();await source?.destroy();await db?.close();process.chdir(originalCwd);if(path.dirname(work)===os.tmpdir()&&path.basename(work).startsWith('audit-fieldwork-'))fs.rmSync(work,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
