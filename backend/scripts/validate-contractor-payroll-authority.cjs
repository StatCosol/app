// Run after backend build. Uses only the disposable local integration database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { AccessScopeService } = require('../dist/src/access/access-scope.service');
const { ContractorMcdComputationEntity } = require('../dist/src/contractor/entities/contractor-mcd-computation.entity');
const { ContractorQuotationWageEntity } = require('../dist/src/contractor/entities/contractor-quotation-wage.entity');
const { ContractorComputationService } = require('../dist/src/contractor/contractor-computation.service');
const ExcelJS = require('exceljs');
const { ContractorPayrollWorkflowController } = require('../dist/src/contractor/contractor-payroll-workflow.controller');
const { ContractorPayrollWorkflowService } = require('../dist/src/contractor/contractor-payroll-workflow.service');
const schema = `payroll_authority_${Date.now()}`;
const connection = { host: '127.0.0.1', port: Number(process.env.AUTOMATION_TEST_PORT || 55439), user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test', password: process.env.AUTOMATION_TEST_PASSWORD || undefined, database: process.env.AUTOMATION_TEST_DATABASE || 'postgres' };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main() {
  const admin = new Client(connection); await admin.connect();
  let ds;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ type: 'postgres', uuidExtension: 'pgcrypto', ...connection, username: connection.user, schema,
      extra: { options: `-c search_path=${schema}` }, entities: [ContractorMcdComputationEntity, ContractorQuotationWageEntity], synchronize: true });
    await ds.initialize();
    await ds.query('CREATE TABLE client_branches(id uuid PRIMARY KEY, branchname text, clientid uuid, isdeleted boolean DEFAULT false)');
    await ds.query('CREATE TABLE users(id uuid PRIMARY KEY, name text, owner_cco_id uuid, deleted_at timestamptz)');
    await ds.query("INSERT INTO client_branches(id,branchname,clientid) VALUES ($1, 'Branch One', $2)", [id(2),id(1)]);
    await ds.query("INSERT INTO users(id,name) VALUES ($1, 'Contractor One')", [id(3)]);
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/20260913_contractor_payroll_authority.sql'), 'utf8');
    await ds.query(migration); await ds.query(migration);
    const repo = ds.getRepository(ContractorMcdComputationEntity);
    await ds.query('CREATE TABLE clients(id uuid PRIMARY KEY, assigned_crm_id uuid, is_deleted boolean DEFAULT false)');
    await ds.query("INSERT INTO users(id,name,owner_cco_id) VALUES ($1,'Managed CRM',$2),($3,'Other CRM',$4)",[id(4),id(6),id(10),id(11)]);
    await ds.query('INSERT INTO clients(id,assigned_crm_id) VALUES ($1,$2),($3,$4)',[id(1),id(4),id(9),id(10)]);
    await ds.query('CREATE TABLE contractor_documents(id uuid PRIMARY KEY)');
    await ds.query("INSERT INTO users(id,name) VALUES ($1,'Branch reviewer')",[id(8)]);
    const attendanceMigration=fs.readFileSync(path.join(__dirname,'../migrations/20260915_contractor_attendance_approval.sql'),'utf8');
    await ds.query(attendanceMigration); await ds.query(attendanceMigration);
    await ds.query(`INSERT INTO contractor_attendance_batches(client_id,branch_id,contractor_user_id,period_month,rows_snapshot,submitted_by,status,reviewed_by,reviewed_at)
      VALUES($1,$2,$3,'2026-09','[]',$3,'APPROVED',$4,now())`,[id(1),id(2),id(3),id(8)]);
    for(const file of ['20260916_contractor_rate_cards.sql','20260917_payroll_document_checks.sql']) {const sql=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8');await ds.query(sql);await ds.query(sql);}
    await ds.query('CREATE TABLE audits(client_id uuid,branch_id uuid,contractor_user_id uuid,assigned_auditor_id uuid)');
    await ds.query('INSERT INTO audits VALUES($1,$2,$3,$4)',[id(1),id(2),id(3),id(5)]);
    const ccoAccess = new AccessScopeService({}, {}, {manager:ds.manager}, {manager:ds.manager}, {});
    const scope = {
      assertCcoClientAllowed: (u,c)=>ccoAccess.assertCcoClientAllowed(u,c),
      assertCcoBranchAllowed: (u,b)=>ccoAccess.assertCcoBranchAllowed(u,b),
      getCcoClientIds: (u)=>ccoAccess.getCcoClientIds(u),
      listAllowedClients: async()=>[{id:id(1),clientName:'Managed client'},{id:id(9),clientName:'Other client'}],
      assertClientAllowed: async (u,c) => { assert.equal(c,id(1)); },
      assertBranchAllowed: async (u,b) => { assert.equal(b,id(2)); },
      getScope: async (u) => u.roleCode === 'BRANCH_DESK' ? { level: 'branches', branchIds: u.branchIds } : { level: 'client', clientId: id(1) },
      resolveClientId: () => id(1),
    };
    const workflow = new ContractorPayrollWorkflowService(repo,scope);
    const user = (role,n) => ({ id:id(n),roleCode:role,clientId:id(1),branchIds:[id(2)] });
    const contractor=user('CONTRACTOR',3), crm=user('CRM',4), auditor=user('AUDITOR',5), cco=user('CCO',6);
    const key = {client_id:id(1),branch_id:id(2),contractor_user_id:id(3),period_month:'2026-09'};
    const calculate = async () => [repo.create({clientId:id(1),branchId:id(2),contractorUserId:id(3),periodMonth:'2026-09',rowNumber:1,
      payableDailyWage:500,pfWage:10000,pfEmployerContribution:100,esiEmployerContribution:0,lwfEmployeeDeduction:0,lwfEmployerContribution:0,totalEmployerContribution:100,employeeCode:'E001',employeeName:'Test Employee',skillCategory:'SKILLED',daysWorked:20,basicWage:10000,otherEarnings:0,grossWage:10000,
      pfDeduction:100,esiDeduction:0,ptDeduction:0,netSalary:9900,matchStatus:'MATCHED'})];
    const computation = new ContractorComputationService(ds.getRepository(ContractorQuotationWageEntity),repo,{ findOne: async()=>({}) },{},{},{},{},{},{},scope,{},workflow);
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['skill_category','daily_wage','effective_from']); sheet.addRow(['SKILLED',500,'2026-09-01']);
    const upload = {buffer:Buffer.from(await workbook.xlsx.writeBuffer()),originalname:'rates.xlsx'};
    const rateInput = {clientId:id(1),contractorUserId:id(3),branchId:id(2)};
    const rateResults = await Promise.all([computation.uploadQuotationExcel(crm,rateInput,upload),computation.uploadQuotationExcel(crm,rateInput,upload)]);
    assert.equal(rateResults.reduce((n,r)=>n+r.inserted,0),1); assert.equal(rateResults.reduce((n,r)=>n+r.errors,0),1);
    assert.equal(await ds.getRepository(ContractorQuotationWageEntity).count(),1);

    // Exercise the real calculation against dated quotation versions in PostgreSQL.
    const rateRepo=ds.getRepository(ContractorQuotationWageEntity);
    const makeCard=(basic)=>({divisor:30,rounding:'RUPEE',components:[
      {code:'BASIC_DA',label:'Basic and DA',category:'EARNING',method:'FIXED',value:basic,prorate:true},
      {code:'SITE',label:'Site allowance',category:'EARNING',method:'FIXED',value:2000,prorate:true},
      {code:'PF_EMP',label:'Employee PF',category:'DEDUCTION',method:'PERCENT',basis:['BASIC_DA'],ceiling:15000,value:12,prorate:false},
      {code:'PF_ER',label:'Employer PF',category:'EMPLOYER_COST',method:'PERCENT',basis:['BASIC_DA'],ceiling:15000,value:13,prorate:false}
    ]});
    for(const [date,basic] of [['2026-11-01',16000],['2026-11-16',20000]]) await rateRepo.save(rateRepo.create({clientId:id(1),branchId:id(2),contractorUserId:id(3),skillCategory:'SKILLED',designation:'GUARD',effectiveFrom:date,dailyWage:basic/30,rateCard:makeCard(basic),createdByUserId:id(4)}));
    computation.findEmployee=async()=>({employeeCode:'E001',name:'Test Employee',skillCategory:'SKILLED',designation:'GUARD',pfApplicable:true,esiApplicable:false,uan:'100000000001',dateOfJoining:'2026-01-01'});
    computation.branchRepo={findOne:async()=>({id:id(2),clientId:id(1),stateCode:'TS'})};
    computation.findPayrollSetup=async()=>({pfEnabled:true,pfWageCeiling:15000,pfEmployeeRate:12,pfEmployerRate:13,esiEnabled:false,ptEnabled:false,lwfEnabled:false});
    computation.findMinimumDailyWage=async()=>400;computation.resolveSlabAmount=async()=>0;
    await assert.rejects(computation.computeOne(id(1),id(3),id(2),'2026-11',null,1,{employee_code:'E001',days_worked:30}),/changes within/);
    const ledger=Array.from({length:30},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),days:1,hours:0}));
    const revised=await computation.computeOne(id(1),id(3),id(2),'2026-11',null,1,{employee_code:'E001',days_worked:30,daily_attendance:ledger});
    computation.findMinimumDailyWage=async()=>600;
    const belowMinimum=await computation.computeOne(id(1),id(3),id(2),'2026-11',null,1,{employee_code:'E001',days_worked:30,daily_attendance:ledger});assert.equal(belowMinimum.matchStatus,'MISMATCH');assert.match(belowMinimum.mismatchReason,/minimum wage/);
    computation.findMinimumDailyWage=async()=>400;
    assert.equal(revised.basicWage,18000);assert.equal(revised.pfDeduction,1800);assert.equal(revised.pfEmployerContribution,1950);assert.equal(revised.calculationSnapshot.segments.length,2);
    const first=await workflow.saveDraft(contractor,key,calculate); const firstId=first.version.id;
    assert.equal((await workflow.list(contractor,{})).data[0].branchName,'Branch One');
    assert.equal((await workflow.list(contractor,{offset:'1'})).data.length,0);
    await assert.rejects(workflow.list(contractor,{offset:'-1'}),/offset/);
    assert.equal((await workflow.list(user('CLIENT',7),{})).data.length,1);
    assert.equal((await workflow.list(auditor,{})).data.length,1);
    assert.equal((await workflow.list(user('AUDITOR',55),{})).data.length,0);
    await assert.rejects(workflow.pack(user('AUDITOR',55),firstId),/audit/i);
    assert.equal((await workflow.pack(contractor,firstId)).rows.length,1);
    await assert.rejects(workflow.saveDraft(contractor,key,async()=>{throw Error('Invalid employee');}),/Invalid employee/);
    await assert.rejects(workflow.saveDraft(contractor,key,async()=>{const rows=await calculate();rows[0].employeeName=null;return rows;}), /null value/);
    assert.equal(await repo.count(),1); assert.equal((await workflow.list(contractor,{})).data[0].version,1);
    await workflow.transition(contractor,firstId,'submit','Attendance confirmed for review');
    await assert.rejects(workflow.saveDraft(contractor,key,calculate),/under review/);
    await workflow.transition(crm,firstId,'approve','Attendance and wage rates checked');
    assert.equal((await workflow.list(user('CLIENT',7),{})).data.length,1);
    assert.equal((await workflow.list({...user('BRANCH_DESK',8),branchIds:[]},{})).data.length,0);
    const pack=await workflow.pack(contractor,firstId); assert.equal(pack.rows[0].netSalary,9900);
    const download = await new ContractorPayrollWorkflowController(workflow).pack(contractor,firstId);
    const chunks=[]; for await (const chunk of download.getStream()) chunks.push(chunk);
    const exported = new ExcelJS.Workbook(); await exported.xlsx.load(Buffer.concat(chunks));
    assert.equal(exported.getWorksheet('Payroll').rowCount,2);
    assert.equal(exported.getWorksheet('Approval').getCell('B2').value,'CRM_APPROVED');
    assert.equal(exported.getWorksheet('PF working').getCell('D2').value,10000);
    await workflow.transition(auditor,firstId,'verify','Evidence: attendance A1, rates R1, payment P1 and statutory S1 checked');
    await assert.rejects(workflow.transition(crm,firstId,'reopen','Need to change payroll'),/not available/);
    assert.deepEqual((await workflow.clients(cco)).map(c=>c.id),[id(1)]);
    assert.deepEqual(await workflow.clients(user('CCO',12)),[]);
    await assert.rejects(workflow.list(user('CCO',11),{}),/CCO scope/);
    await assert.rejects(workflow.pack(user('CCO',11),firstId),/CCO scope/);
    await assert.rejects(workflow.history(user('CCO',11),firstId),/CCO scope/);
    await assert.rejects(workflow.transition(user('CCO',11),firstId,'reopen','Unauthorized correction'),/CCO scope/);
    await workflow.transition(cco,firstId,'reopen','Authorized correction to attendance');
    assert.equal((await workflow.pack(contractor,firstId)).rows.length,1);
    const second=await workflow.saveDraft(contractor,key,calculate); assert.equal(second.version.version,2);
    assert.ok((await workflow.history(contractor,second.version.id)).some(e=>e.action==='VERIFY' && e.version===1));
    const history=await ds.query('SELECT * FROM contractor_payroll_versions ORDER BY version');
    assert.equal(history.length,2); assert.equal(history[0].rows_snapshot[0].netSalary,9900); assert.equal(history[0].is_current,false);
    // Concurrent submissions: exactly one valid transition, one recorded event.
    const submissions=await Promise.allSettled([workflow.transition(contractor,second.version.id,'submit','Attendance ready for review'),workflow.transition(contractor,second.version.id,'submit','Attendance ready for review')]);
    assert.equal(submissions.filter((r)=>r.status==='fulfilled').length,1);
    assert.equal(Number((await ds.query("SELECT count(*) FROM contractor_payroll_events WHERE version_id=$1 AND action='SUBMIT'",[second.version.id]))[0].count),1);
    await workflow.transition(crm,second.version.id,'return','Correct attendance before resubmission');
    await assert.rejects(workflow.transition(contractor,second.version.id,'submit','No correction made'),/not available/);
    const third=await workflow.saveDraft(contractor,key,calculate); assert.equal(third.version.version,3);
    await workflow.transition(contractor,third.version.id,'submit','Corrected attendance submitted');
    await workflow.transition(crm,third.version.id,'approve','Corrected attendance reviewed');
    await workflow.transition(auditor,third.version.id,'return','Correct the reviewed payroll evidence');
    await assert.rejects(workflow.transition(contractor,third.version.id,'submit','Resubmit unchanged snapshot'),/not available/);
    const fourth=await workflow.saveDraft(contractor,key,calculate); assert.equal(fourth.version.version,4);
    await workflow.transition(contractor,fourth.version.id,'submit','Recalculated payroll submitted');
    const [pending] = await ds.query(`INSERT INTO contractor_attendance_batches(client_id,branch_id,contractor_user_id,period_month,rows_snapshot,submitted_by)
      VALUES($1,$2,$3,'2026-10',$4::jsonb,$3) RETURNING id`,[id(1),id(2),id(3),JSON.stringify([{employee_code:'E001',days_worked:20}])]);
    computation.computeOne=async()=>{throw new Error('Invalid employee deployment');};
    await assert.rejects(computation.reviewAttendance(user('BRANCH_DESK',8),pending.id,'approve','Checked attendance'),/Invalid employee deployment/);
    assert.equal((await ds.query('SELECT status FROM contractor_attendance_batches WHERE id=$1',[pending.id]))[0].status,'PENDING');
    computation.computeOne=async()=>{const rows=await calculate();rows[0].periodMonth='2026-10';return rows[0];};
    const approvals=await Promise.allSettled([computation.reviewAttendance(user('BRANCH_DESK',8),pending.id,'approve','Checked attendance'),computation.reviewAttendance(user('BRANCH_DESK',8),pending.id,'approve','Checked attendance')]);
    assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await ds.query('SELECT status FROM contractor_attendance_batches WHERE id=$1',[pending.id]))[0].status,'APPROVED');
    assert.equal(Number((await ds.query("SELECT count(*) FROM contractor_payroll_versions WHERE period_month='2026-10'"))[0].count),1);

    // The branch queue must remain accessible beyond the previous 200-row cap.
    await ds.query("INSERT INTO users(id,name) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic vendor '||n FROM generate_series(1000,1204) n");
    await ds.query("INSERT INTO contractor_attendance_batches(client_id,branch_id,contractor_user_id,period_month,rows_snapshot,submitted_by) SELECT $1,$2,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2026-12','[]'::jsonb,$3 FROM generate_series(1000,1204) n",[id(1),id(2),id(3)]);
    let attendanceOffset=0,more=true;const attendanceIds=new Set();while(more){const page=await computation.listAttendance(user('BRANCH_DESK',8),{periodMonth:'2026-12',offset:String(attendanceOffset)});page.data.forEach(r=>attendanceIds.add(r.id));attendanceOffset+=page.data.length;more=page.hasMore;assert.ok(attendanceOffset<=205);}
    assert.equal(attendanceIds.size,205);
    console.log('PASS: actual entity schema + migration, transactional preservation, role visibility, approval, independent verification, controlled reopening, immutable snapshots and concurrent transitions.');
  } finally { if(ds?.isInitialized) await ds.destroy(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); }
}
main().catch((err)=>{console.error(err);process.exitCode=1;});
