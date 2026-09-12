// Synthetic service/query benchmark on the dedicated local test cluster only.
// Run: node -r ts-node/register scripts/benchmark-critical-workflows.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { performance } = require('node:perf_hooks');
const { Client, Pool } = require('pg');
const { MonthlyCloseService } = require('../src/monthly-close/monthly-close.service');
const { parseRegister, reconcileRegister } = require('../src/payroll/reconciliation/register-reconciliation');
const config = { host:'127.0.0.1', port:55439, user:'monthly_close_test', database:'postgres' };
const output = path.resolve(__dirname,'../../docs/reviews/2026-09-12/critical-performance.json');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientId=uuid(1), branchId=uuid(1001);
const stats = values => { const sorted=[...values].sort((a,b)=>a-b); const percentile=p=>Number(sorted[Math.ceil(sorted.length*p)-1].toFixed(2)); return {samples:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:percentile(1)}; };
async function timed(work,count,concurrency) {
 const values=[]; let next=0; const started=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{ while(next++<count){ const start=performance.now();await work();values.push(performance.now()-start); } }));
 return {...stats(values),concurrency,elapsedMs:Number((performance.now()-started).toFixed(2))};
}
async function main(){
 const admin=new Client(config);await admin.connect();const results=[];
 try {
  for(const [employees,branches] of [[1000,10],[5000,50],[20000,100]]){
   const schema=`critical_perf_${Date.now()}_${employees}`;assert.match(schema,/^critical_perf_\d+_\d+$/);
   await admin.query(`CREATE SCHEMA "${schema}"`);
   const pool=new Pool({...config,max:10,options:`-c search_path=${schema}`,statement_timeout:30000});
   try {
    await pool.query(`
      CREATE UNLOGGED TABLE attendance_records(client_id uuid,branch_id uuid,date date,approval_status text);
      CREATE UNLOGGED TABLE attendance_mismatches(client_id uuid,branch_id uuid,date date,resolved boolean);
      CREATE UNLOGGED TABLE payroll_runs(id uuid,client_id uuid,branch_id uuid,period_year int,period_month int,status text,created_at timestamptz);
      CREATE UNLOGGED TABLE branch_contractor(client_id uuid,branch_id uuid,contractor_user_id uuid);
      CREATE UNLOGGED TABLE contractor_required_documents(id uuid,client_id uuid,branch_id uuid,contractor_user_id uuid,doc_type text,is_required boolean,updated_at timestamptz);
      CREATE UNLOGGED TABLE users(id uuid,name text);
      CREATE UNLOGGED TABLE contractor_documents(id uuid,client_id uuid,branch_id uuid,contractor_user_id uuid,doc_type text,doc_month text,status text,file_path text,expiry_date date,created_at timestamptz);
      CREATE UNLOGGED TABLE compliance_returns(id uuid,client_id uuid,branch_id uuid,return_type text,period_year int,period_month int,status text,due_date date,crm_owner text,ack_file_path text,filed_date date,is_deleted boolean);
      CREATE INDEX att_client ON attendance_records(client_id);CREATE INDEX att_branch ON attendance_records(branch_id);CREATE INDEX att_date ON attendance_records(date);CREATE INDEX att_approval ON attendance_records(approval_status);
      CREATE INDEX cd_client ON contractor_documents(client_id);CREATE INDEX cd_branch ON contractor_documents(branch_id);CREATE INDEX cd_contractor ON contractor_documents(contractor_user_id);CREATE INDEX cd_month ON contractor_documents(doc_month);CREATE INDEX cd_period ON contractor_documents(contractor_user_id,client_id,doc_month);CREATE INDEX cd_created ON contractor_documents(created_at);
      CREATE INDEX rd_contractor ON contractor_required_documents(contractor_user_id);CREATE INDEX bc_branch ON branch_contractor(branch_id);
    `);
    await pool.query(`INSERT INTO attendance_records SELECT $1::uuid,('00000000-0000-4000-8000-'||lpad((1001+(e-1)%$3)::text,12,'0'))::uuid,'2026-09-01'::date+(d-1),CASE WHEN d%10=0 THEN 'PENDING' ELSE 'APPROVED' END FROM generate_series(1,$2::int)e CROSS JOIN generate_series(1,30)d`,[clientId,employees,branches]);
    await pool.query(`INSERT INTO branch_contractor SELECT $1::uuid,('00000000-0000-4000-8000-'||lpad((1001+(v-1)/20)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad((100001+v)::text,12,'0'))::uuid FROM generate_series(1,$2::int*20)v`,[clientId,branches]);
    await pool.query(`INSERT INTO users SELECT contractor_user_id,'Synthetic contractor' FROM branch_contractor;
      INSERT INTO contractor_required_documents SELECT gen_random_uuid(),client_id,branch_id,contractor_user_id,'DOC_'||d,true,now() FROM branch_contractor CROSS JOIN generate_series(1,5)d;
      INSERT INTO contractor_documents SELECT gen_random_uuid(),client_id,branch_id,contractor_user_id,'DOC_'||d,'2026-09',CASE WHEN d=1 AND v=3 THEN 'PENDING' ELSE 'APPROVED' END,'synthetic.pdf',NULL,'2026-09-01'::timestamptz+(v||' days')::interval FROM branch_contractor CROSS JOIN generate_series(1,5)d CROSS JOIN generate_series(1,3)v;
      INSERT INTO payroll_runs SELECT gen_random_uuid(),client_id,branch_id,2026,9,'APPROVED',now() FROM branch_contractor GROUP BY client_id,branch_id;
      INSERT INTO compliance_returns SELECT gen_random_uuid(),client_id,branch_id,'Synthetic return',2026,9,'APPROVED','2026-09-15',NULL,'ack.pdf','2026-09-14',false FROM branch_contractor GROUP BY client_id,branch_id;
    `);
    for(const table of ['attendance_records','contractor_documents','contractor_required_documents','branch_contractor','users','payroll_runs','compliance_returns']) await pool.query(`VACUUM ANALYZE ${table}`);
    const query={clientId,branchId,month:'2026-09'};const user={roleCode:'CLIENT',userType:'MASTER',clientId};
    const source={query:async(sql,values)=>(await pool.query(sql,values)).rows};
    const service=new MonthlyCloseService(source,{assertClientAllowed:async()=>{},listAllowedBranches:async()=>[{id:branchId,branchName:'Synthetic branch'}]},{getCurrentForClient:async()=>({enabledModules:['EMPLOYEE_ATTENDANCE','PAYROLL','CONTRACTOR_DOCUMENTS','EMPLOYEE_COMPLIANCE']})});
    const expectedAttendance=employees/branches*30;
    const work=async()=>{const result=await service.get(user,query);assert.equal(result.stages[0].total,expectedAttendance);assert.equal(result.stages[0].outstanding,expectedAttendance/10);assert.equal(result.stages[2].outstanding,20);assert.equal(result.needsVerification,false);return result;};
    await timed(work,100,10);
    const before=await timed(work,1000,10);
    const migrationConnection = await pool.connect();
    try {
      await migrationConnection.query('BEGIN');
      await migrationConnection.query(fs.readFileSync(path.resolve(__dirname,'../migrations/20260912_critical_workflow_query_indexes.sql'),'utf8'));
      await migrationConnection.query('COMMIT');
    } catch (error) { await migrationConnection.query('ROLLBACK'); throw error; }
    finally { migrationConnection.release(); }
    await pool.query('ANALYZE attendance_records');await pool.query('ANALYZE contractor_documents');
    await timed(work,100,10);const after=await timed(work,1000,10);const concurrent25=await timed(work,1000,25);
    results.push({employees,branches,attendanceRows:employees*30,documentRows:branches*20*5*3,before,after,concurrent25});console.log(JSON.stringify(results.at(-1)));
   } finally {await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);}
  }
  const payroll=[];
  for(const employees of [1000,5000]){
   const expected=Array.from({length:employees},(_,i)=>({employeeCode:`EMP${String(i).padStart(6,'0')}`,values:{gross_earnings:'25000.10',net_pay:'22000.00',pf_employee:'1800.00',esi_employee:'0.00'}}));
   const buffer=Buffer.from('employee_code,period,gross_earnings,net_pay,pf_employee,esi_employee\n'+expected.map(row=>`${row.employeeCode},2026-09,25000.10,22000,1800,0`).join('\n'));
   const samples=[];for(let i=0;i<11;i++){const start=performance.now();const report=reconcileRegister(expected,parseRegister(buffer,'2026-09'));assert.equal(report.summary.matched,employees);assert.equal(report.totals[0].expected.amount,`${employees*25000+employees/10}.00`);if(i)samples.push(performance.now()-start);}
   payroll.push({employees,fileBytes:buffer.length,...stats(samples)});
  }
  const oversize=Buffer.from('employee_code,period,gross_earnings,net_pay\n'+Array.from({length:5001},(_,i)=>`E${i},2026-09,1,1`).join('\n'));assert.throws(()=>parseRegister(oversize,'2026-09'),/5,000/);
  const report={generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},scope:'Synthetic local PostgreSQL service/query benchmark with authorization/entitlement lookups stubbed; not HTTP capacity, real-user load, face inference, or full payroll-engine throughput. Representative index subset copied from migrations; candidate indexes measured only in disposable schemas. Warm cache, pool maximum 10; 1,000 samples per measured service scenario after 100 warm-up requests.',monthlyClose:results,payrollReconciliation:payroll,oversizedRegisterRejected:true};
  fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Saved',output);
 } finally {await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
