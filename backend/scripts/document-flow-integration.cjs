// Run after backend/frontend production builds. Uses only the isolated local test
// PostgreSQL cluster on 55439, generated schema, fixture users and temporary files.
// The real document controllers, services, TypeORM, JWT strategy, role guards,
// file authorization and production Angular bundle are exercised. Email is disabled.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const crypto = require('crypto');
const backend = path.resolve(__dirname, '..');
const workspace = path.dirname(backend);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'statcompy-document-flow-'));
process.chdir(work);
require('reflect-metadata');
const {DataSource, EntitySchema} = require('typeorm');
const {Client} = require('pg');
const {Test} = require('@nestjs/testing');
const {ValidationPipe, VersioningType, Logger} = require('@nestjs/common');
const {Reflector} = require('@nestjs/core');
const {JwtService} = require('@nestjs/jwt');
const express = require('express');
const src = (file, name) => require(path.join(backend,'dist/src',file))[name];
const Compliance = src('branch-compliance/entities/compliance-document.entity','ComplianceDocumentEntity');
const Master = src('branch-compliance/entities/compliance-return-master.entity','ComplianceReturnMasterEntity');
const Unit = src('crm-documents/entities/crm-unit-document.entity','CrmUnitDocumentEntity');
const Company = src('clients/entities/client.entity','ClientEntity');
const Branch = src('branches/entities/branch.entity','BranchEntity');
const User = src('users/entities/user.entity','UserEntity');
const Assignment = src('assignments/entities/client-assignment-current.entity','ClientAssignmentCurrentEntity');
const BranchAccess = src('auth/branch-access.service','BranchAccessService');
const Scope = src('access/access-scope.service','AccessScopeService');
const CompService = src('branch-compliance/branch-compliance.service','BranchComplianceService');
const UnitService = src('crm-documents/crm-documents.service','CrmDocumentsService');
const Files = src('files/files.service','FilesService');
const JwtStrategy = src('auth/jwt.strategy','JwtStrategy');
const JwtGuard = src('auth/jwt-auth.guard','JwtAuthGuard');
const RolesGuard = src('auth/roles.guard','RolesGuard');
const {uploadsAuthorization} = require(path.join(backend,'dist/src/files/uploads-authorization'));
const uuid=n=>`d0c00000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientId=uuid(1), branchId=uuid(2), otherBranchId=uuid(3), otherClientId=uuid(4);
const identities={
 branch:{id:uuid(11),roleCode:'CLIENT',userType:'BRANCH',clientId,branchIds:[branchId]},
 crm:{id:uuid(12),roleCode:'CRM',clientId:null,branchIds:[]},
 client:{id:uuid(13),roleCode:'CLIENT',userType:'MASTER',clientId,branchIds:[]},
 otherBranch:{id:uuid(14),roleCode:'CLIENT',userType:'BRANCH',clientId,branchIds:[otherBranchId]},
 otherCrm:{id:uuid(15),roleCode:'CRM',clientId:null,branchIds:[]},
 otherClient:{id:uuid(16),roleCode:'CLIENT',userType:'MASTER',clientId:otherClientId,branchIds:[]},
};
const checks=[];
const check=(name)=>{checks.push(name); console.log('PASS '+name);};
async function main(){
 const schema='document_flow_'+Date.now();
 const connection={host:'127.0.0.1',port:Number(process.env.AUTOMATION_TEST_PORT||55439),user:process.env.AUTOMATION_TEST_USER||'monthly_close_test',password:process.env.AUTOMATION_TEST_PASSWORD||'',database:process.env.AUTOMATION_TEST_DATABASE||'postgres'};
 const admin=new Client(connection); await admin.connect(); let db, app;
 try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const emptyTables=['contractor_documents','payroll_input_files','registers_records','helpdesk_message_files'].map(name=>new EntitySchema({name,tableName:name,columns:{id:{type:'uuid',primary:true,generated:'uuid'},filePath:{name:'file_path',type:String}}}));
  db=new DataSource({type:'postgres',host:connection.host,port:connection.port,username:connection.user,password:connection.password,database:connection.database,schema,extra:{options:`-c search_path=${schema},public`},entities:[Compliance,Master,Unit,Company,Branch,User,Assignment,...emptyTables]});
  await db.initialize(); await db.synchronize();
  const registrationSchema=fs.readFileSync(path.join(backend,'migrations/20260224_branch_desk_wiring.sql'),'utf8').match(/CREATE TABLE IF NOT EXISTS branch_registrations[\s\S]*?\n\);/)[0];
  await db.query(registrationSchema);
  await db.query(fs.readFileSync(path.join(backend,'migrations/20260226_registration_documents.sql'),'utf8'));
  await db.query(fs.readFileSync(path.join(backend,'migrations/20260226_registration_alerts.sql'),'utf8'));
  await db.query('ALTER TABLE branch_registrations ADD COLUMN IF NOT EXISTS licensed_worker_limit integer');
  const linkMigration=fs.readFileSync(path.join(backend,'migrations/20261014_unit_document_registration_link.sql'),'utf8');
  await db.query(linkMigration); await db.query(linkMigration);
  check('Registration link migration is safe to replay');
  await db.getRepository(Company).save([{id:clientId,clientCode:'DOC-A',clientName:'Document Test Company',crmOnBehalfEnabled:true},{id:otherClientId,clientCode:'DOC-B',clientName:'Other Company'}]);
  await db.getRepository(Branch).save([{id:branchId,clientId,branchCode:'DOC-A1',branchName:'Document Test Branch',branchType:'OFFICE',stateCode:'TS',address:'Test fixture'},{id:otherBranchId,clientId,branchCode:'DOC-A2',branchName:'Other Test Branch',branchType:'OFFICE',stateCode:'TS',address:'Test fixture'}]);
  for(const [name,u] of Object.entries(identities)) {
   u.email=name+'@document-test.invalid';u.name='Test '+name;u.userId=u.id;
   await db.getRepository(User).save({id:u.id,roleId:uuid(90),userCode:name,name:u.name,email:u.email,passwordHash:'unused-fixture',clientId:u.clientId});
   await db.query('UPDATE users SET user_type=$1, role=$2 WHERE id=$3',[u.userType||null,u.roleCode,u.id]);
   for(const b of u.branchIds) await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)',[u.id,b]);
  }
  await db.getRepository(Assignment).save({clientId,assignmentType:'CRM',assignedToUserId:identities.crm.id,startDate:new Date()});
  for(const frequency of ['MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY']) await db.getRepository(Master).save({returnCode:'TEST_'+frequency,returnName:'Test '+frequency+' Return',lawArea:'PT',frequency,dueDay:15,stateCode:'ALL',appliesTo:'BOTH',isActive:true});
  const branchAccess=new BranchAccess(db);
  const scope=new Scope({manager:db.manager},{},db.getRepository(Company),db.getRepository(Branch),{});
  const comp=new CompService(db.getRepository(Compliance),db.getRepository(Master),branchAccess,db,{log:async()=>{}},{sendRejection:async()=>{}},scope);
  const RegService=src('branches/branch-registrations.service','BranchRegistrationsService');
  const BranchDocsService=src('branches/branch-documents.service','BranchDocumentsService');
  const AssignmentsService=src('assignments/assignments.service','AssignmentsService');
  const registrations=new RegService({},db.getRepository(Branch),db);
  const assignmentService=new AssignmentsService();
  assignmentService.isClientAssignedToCrm=async(c,u)=>!!await db.getRepository(Assignment).findOneBy({clientId:c,assignmentType:'CRM',assignedToUserId:u});
  const unit=new UnitService(db.getRepository(Unit),db.getRepository(Assignment));
  const files=new Files(...emptyTables.map(e=>db.getRepository(e)).slice(1,3),db.getRepository(emptyTables[3]),db.getRepository(emptyTables[0]),{},scope);
  const users={findById:async id=>{const rows=await db.query('SELECT id,email,is_active AS "isActive",deleted_at AS "deletedAt",user_type AS "userType",client_id AS "clientId" FROM users WHERE id=$1',[id]);return rows[0];},getUserRoleCode:async id=>(await db.query('SELECT role FROM users WHERE id=$1',[id]))[0]?.role,getUserBranchIds:id=>branchAccess.getUserBranchIds(id),getAssignedClientIds:async id=>(await db.query('SELECT client_id FROM client_assignments_current WHERE assigned_to_user_id=$1',[id])).map(x=>x.client_id)};
  const secret=crypto.randomBytes(32).toString('hex');
  const jwt=new JwtService({secret});
  const strategy=new JwtStrategy(users,{getOrThrow:()=>secret});
  const tokens=Object.fromEntries(Object.entries(identities).map(([key,u])=>[key,jwt.sign({sub:u.id,type:'access',roleCode:u.roleCode,clientId:u.clientId},{expiresIn:'1h'})]));
  const controllers=[['branches/branch-documents.controller','ClientBranchDocumentsController'],['branches/branch-documents.controller','CrmBranchRegistrationsController'],['branch-compliance/controllers/branch-compliance-docs.controller','BranchComplianceDocsController'],['branch-compliance/controllers/crm-compliance-docs.controller','CrmComplianceDocsController'],['branch-compliance/controllers/client-compliance-docs.controller','ClientComplianceDocsController'],['crm-documents/controllers/branch-unit-documents.controller','BranchUnitDocumentsController'],['crm-documents/controllers/crm-unit-documents.controller','CrmUnitDocumentsController'],['crm-documents/controllers/client-unit-documents.controller','ClientUnitDocumentsController']].map(([p,n])=>src(p,n));
  Logger.overrideLogger(['error']);
  const module=await Test.createTestingModule({controllers,providers:[{provide:RegService,useValue:registrations},{provide:BranchDocsService,useValue:{}},{provide:AssignmentsService,useValue:assignmentService},{provide:CompService,useValue:comp},{provide:UnitService,useValue:unit},{provide:BranchAccess,useValue:branchAccess},{provide:Scope,useValue:scope}]}).compile();
  app=module.createNestApplication({logger:['error']});
  app.setGlobalPrefix('api'); app.enableVersioning({type:VersioningType.URI});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  app.useGlobalGuards(new JwtGuard(new Reflector()),new RolesGuard(new Reflector()));
  app.use('/uploads',uploadsAuthorization(jwt,strategy,files),express.static(path.join(work,'uploads')));
  const branches=await db.getRepository(Branch).find();
  const http=app.getHttpAdapter().getInstance();
  // Only non-document navigation chrome uses fixtures; document paths fall through to Nest.
  http.use(async(req,res,next)=>{
   const p=req.path;
   if(/^\/api\/v1\/(client|crm)\/compliance-docs(?:\/categories.*)?$/.test(p)) return res.json([]);
   if(p==='/api/v1/client/compliance-docs/settings') return res.json({});
   if(p.startsWith('/api/') && !/compliance-docs|branch-compliance|unit-documents|registrations|registration-summary|registration-alerts/.test(p)) {
    let u;try{u=await strategy.validate(jwt.verify((req.headers.authorization||'').slice(7)));}catch{return res.status(401).json({message:'Authentication required'});}
    if(p.endsWith('/branches') || p.endsWith('/branches/assigned')) return res.json(branches.filter(b=>u.userType!=='BRANCH'||u.branchIds.includes(b.id)));
    if(p.includes('/clients')) return res.json([{id:clientId,clientId,clientName:'Document Test Company',crmOnBehalfEnabled:true}]);
    if(p.includes('/me')) return res.json(u);
    return res.json([]);
   }
   next();
  });
  http.use('/app',express.static(path.join(workspace,'frontend/dist/statco-frontend/browser')));
  http.use('/app',(req,res)=>res.sendFile(path.join(workspace,'frontend/dist/statco-frontend/browser/index.html')));
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const PDFDocument=require('pdfkit');
  const pdf=await new Promise(resolve=>{const chunks=[];const d=new PDFDocument();d.on('data',c=>chunks.push(c));d.on('end',()=>resolve(Buffer.concat(chunks)));d.text('Statcompy document upload verification - synthetic data only.');d.end();});
  fs.writeFileSync(path.join(work,'fixture.pdf'),pdf);
  async function call(role,url,options={},expected=200){const r=await fetch(base+url,{...options,headers:{Authorization:'Bearer '+tokens[role],...options.headers}});const text=await r.text();if(Array.isArray(expected)){assert.ok(expected.includes(r.status),`${role} ${url}: ${r.status} ${text.slice(0,500)}`);return {httpStatus:r.status,data:text?JSON.parse(text):null};}assert.equal(r.status,expected,`${role} ${url}: ${text.slice(0,500)}`);return text?JSON.parse(text):null;}
  async function upload(role,url,fields,expected=201){const form=new FormData();for(const [k,v]of Object.entries(fields))form.append(k,String(v));form.append('file',new Blob([pdf],{type:'application/pdf'}),'fixture.pdf');return call(role,url,{method:'POST',body:form},expected);}
  const docs=[];
  for(const role of ['branch','crm'])for(const [frequency,period]of [['MONTHLY',{periodMonth:10}],['QUARTERLY',{periodQuarter:4}],['HALF_YEARLY',{periodHalf:2}],['YEARLY',{}]]){
   const doc=await upload(role,role==='branch'?'/api/v1/branch/compliance-docs/upload':'/api/v1/crm/branch-compliance/upload-on-behalf',{...(role==='crm'?{companyId:clientId}:{}),branchId,returnCode:'TEST_'+frequency,frequency,periodYear:role==='branch'?2026:2025,...period});
   docs.push(doc);check(`${role} ${frequency} compliance upload persisted`);
  }
  for(const role of ['branch','crm','client']){
   const route=role==='branch'?`branch/compliance-docs?branchId=${branchId}`:role==='crm'?`crm/branch-compliance?companyId=${clientId}`:'client/branch-compliance';
   const listed=await call(role,'/api/v1/'+route);assert.equal(listed.total,8);
   for(const doc of docs){const r=await fetch(base+doc.uploadedFileUrl,{headers:{Authorization:'Bearer '+tokens[role]}});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pdf);}
   check(`${role} lists all eight compliance records and retrieves exact file bytes`);
  }
  const originalRegistrations={};
  for(const role of ['branch','crm'])for(const documentType of ['Registration','Licence','Renewal','Report']){
   const fields={clientId,branchId,scope:'BRANCH',lawCategory:'POLLUTION',documentType,periodFrom:'2026-01-01',periodTo:documentType==='Renewal'?'2030-12-31':'2027-12-31'};
   if(['Registration','Licence'].includes(documentType)) fields.registrationType=role+' '+documentType;
   if(documentType==='Renewal') fields.registrationId=originalRegistrations[role];
   const uploaded=await upload(role,'/api/v1/'+role+'/unit-documents/upload',fields);
   const doc=await db.getRepository(Unit).findOneByOrFail({id:role==='crm'?uploaded.documents[0].id:uploaded.id});
   if(documentType==='Registration') originalRegistrations[role]=doc.registrationId;
   if(documentType==='Renewal') assert.equal(doc.registrationId,originalRegistrations[role]);
   assert.equal(!!doc.registrationId,documentType!=='Report');
   check(role+' '+documentType+' unit upload persisted with correct registration link');
  }
  for(const role of ['branch','crm','client']){
   const listed=await call(role,`/api/v1/${role}/unit-documents`);assert.equal(listed.length,8);
   for(const doc of listed){const r=await fetch(`${base}/api/v1/${role}/unit-documents/${doc.id}/download`,{headers:{Authorization:'Bearer '+tokens[role]}});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/fixture.pdf/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pdf);}
   check(`${role} lists all eight unit records and downloads exact file bytes`);
  }
  for(const role of ['branch','crm','client']) {
   const route=role==='crm' ? '/api/v1/crm/branch-registrations?clientId='+clientId+'&branchId='+branchId : '/api/v1/client/branches/'+branchId+'/registrations';
   const registered=await call(role,route); assert.equal(registered.length,4);
   const renewed=registered.find(r=>r.id===originalRegistrations.branch);
   assert.equal(renewed.expiryDate,'2030-12-31'); assert.ok(renewed.renewedOn);
   const response=await fetch(base+renewed.renewalDocumentUrl,{headers:{Authorization:'Bearer '+tokens[role]}});
   assert.equal(response.status,200); assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
   const listed=await call(role,'/api/v1/'+role+'/unit-documents');
   assert.equal(listed.find(d=>d.registrationId===renewed.id).registration.expiryDate,'2030-12-31');
   check(role+' registration register and unit list share the renewed expiry and protected evidence');
  }
  const fields={clientId,branchId,scope:'BRANCH',lawCategory:'PT',documentType:'Renewal',registrationId:originalRegistrations.branch,periodTo:'2031-12-31'};
  await upload('otherBranch','/api/v1/branch/unit-documents/upload',fields,403);
  await upload('otherCrm','/api/v1/crm/unit-documents/upload',fields,403);
  await upload('client','/api/v1/branch/unit-documents/upload',fields,403);
  await upload('client','/api/v1/crm/unit-documents/upload',fields,403);
  await upload('branch','/api/v1/branch/unit-documents/upload',{...fields,registrationId:uuid(500)},403);
  await upload('branch','/api/v1/branch/unit-documents/upload',{...fields,periodTo:'2025-01-01'},400);
  await upload('crm','/api/v1/crm/unit-documents/upload',{...fields,periodTo:''},400);
  await call('otherBranch','/api/v1/branch/unit-documents/registrations?branchId='+branchId,{},403);
  await call('otherCrm','/api/v1/crm/unit-documents/registrations?branchId='+branchId+'&clientId='+clientId,{},403);
  await call('otherClient','/api/v1/client/branches/'+branchId+'/registrations',{},404);
  check('Wrong branch, unassigned CRM, other client and client write attempts denied; stale/missing renewal dates rejected');
  await db.query(`ALTER TABLE crm_unit_documents ADD CONSTRAINT test_failure CHECK (remarks IS DISTINCT FROM '__force_failure__')`);
  const beforeFiles=fs.readdirSync(path.join(work,'uploads'),{recursive:true}).filter(p=>String(p).endsWith('.pdf')).length;
  const beforeCount=await db.getRepository(Unit).count();
  await upload('branch','/api/v1/branch/unit-documents/upload',{...fields,remarks:'__force_failure__'},500);
  assert.equal((await db.query('SELECT expiry_date::text FROM branch_registrations WHERE id=$1',[fields.registrationId]))[0].expiry_date,'2030-12-31');
  assert.equal(await db.getRepository(Unit).count(),beforeCount);
  assert.equal(fs.readdirSync(path.join(work,'uploads'),{recursive:true}).filter(p=>String(p).endsWith('.pdf')).length,beforeFiles);
  await upload('crm','/api/v1/crm/unit-documents/upload',{clientId,branchId,scope:'BRANCH',lawCategory:'OTHER',documentType:'Registration',registrationType:'Failed registration',periodTo:'2031-01-01',remarks:'__force_failure__'},500);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM branch_registrations WHERE type='Failed registration'"))[0].n,0);
  assert.equal(fs.readdirSync(path.join(work,'uploads'),{recursive:true}).filter(p=>String(p).endsWith('.pdf')).length,beforeFiles);
  await db.query('ALTER TABLE crm_unit_documents DROP CONSTRAINT test_failure');
  check('Failed document save rolls back renewal expiry and removes the new file');
  const permanent={clientId,branchId,scope:'BRANCH',lawCategory:'PT',documentType:'Registration',registrationType:'Permanent test registration',noExpiry:'true'};
  const simultaneous=await Promise.all([upload('branch','/api/v1/branch/unit-documents/upload',permanent,[201,400]).then(r=>r.httpStatus),upload('crm','/api/v1/crm/unit-documents/upload',permanent,[201,400]).then(r=>r.httpStatus)]);
  assert.deepEqual(simultaneous.sort(),[201,400]);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM branch_registrations WHERE type=$1',[permanent.registrationType]))[0].count,1);
  check('Concurrent duplicate registrations create one tracking record; explicit permanent registration supported');
  const [otherRegistration]=await db.query(`INSERT INTO branch_registrations(client_id,branch_id,type,expiry_date) VALUES($1,$2,'Other branch expired',CURRENT_DATE-1) RETURNING id`,[clientId,otherBranchId]);
  await upload('branch','/api/v1/branch/unit-documents/upload',{...fields,registrationId:otherRegistration.id},403);
  await db.query(`INSERT INTO registration_alerts(registration_id,client_id,branch_id,alert_type,title,message,created_at) VALUES($1,$2,$3,'EXPIRED','Old expiry','Superseded',NOW()-INTERVAL '1 day')`,[originalRegistrations.branch,clientId,branchId]);
  assert.equal((await call('branch','/api/v1/client/branches/registration-summary')).expired,0);
  assert.equal((await call('client','/api/v1/client/branches/registration-summary')).expired,1);
  assert.equal((await call('branch','/api/v1/client/branches/registration-alerts')).length,0);
  check('Branch summary excludes other branches; client summary includes them; renewed alerts are no longer current');
  const [today]=await db.query('SELECT CURRENT_DATE::text AS day');
  await upload('branch','/api/v1/branch/unit-documents/upload',{...permanent,registrationType:'Expires today',noExpiry:'false',periodTo:today.day});
  assert.equal((await call('branch','/api/v1/client/branches/registration-summary')).expiringSoon,1);
  check('A registration expiring today is counted as expiring soon');
  const firstUnit=await db.getRepository(Unit).findOneByOrFail({documentType:'Registration'});
  await call('crm','/api/v1/crm/unit-documents/'+firstUnit.id,{method:'DELETE'},400);
  check('Linked original registration evidence cannot be deleted through unit documents');
  for(const role of ['otherBranch','otherCrm','otherClient']){
   await call(role,docs[0].uploadedFileUrl,{},403);
   const portal=role==='otherBranch'?'branch':role==='otherCrm'?'crm':'client';
   await call(role,`/api/v1/${portal}/unit-documents/${firstUnit.id}/download`,{},403);
   check(`${role} denied other users' document files`);
  }
  assert.equal((await fetch(base+docs[0].uploadedFileUrl)).status,401);check('Unauthenticated file access denied');
  if(process.argv.includes('--browser')) await require('./document-flow-browser.cjs')({base,tokens,identities,clientId,branchId,work,pdf,check});
  fs.mkdirSync(path.join(workspace,'output'),{recursive:true});
  fs.writeFileSync(path.join(workspace,'output/document-flow-verification.json'),JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks,scope:'Isolated PostgreSQL schema, real document APIs/services/files/JWT; synthetic users and navigation fixtures; no production changes'},null,2));
 }finally{if(app)await app.close();if(db?.isInitialized)await db.destroy();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  process.chdir(backend);
  if(path.dirname(work)===os.tmpdir()&&path.basename(work).startsWith('statcompy-document-flow-'))fs.rmSync(work,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
