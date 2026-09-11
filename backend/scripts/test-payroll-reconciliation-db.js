// Dedicated disposable PostgreSQL only. Never reads application connection settings.
const assert=require('node:assert/strict');
const {DataSource}=require('typeorm');
const {PayrollRunEntity}=require('../dist/src/payroll/entities/payroll-run.entity');
const {PayrollRunEmployeeEntity}=require('../dist/src/payroll/entities/payroll-run-employee.entity');
const {PayrollReconciliationService}=require('../dist/src/payroll/reconciliation/payroll-reconciliation.service');
async function main(){
 const schema=`reconciliation_test_${Date.now()}`;
 const db=new DataSource({type:'postgres',host:'127.0.0.1',port:55439,username:'monthly_close_test',database:'postgres',schema,entities:[PayrollRunEntity,PayrollRunEmployeeEntity]});
 await db.initialize();
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);await db.synchronize();
  const clientId='00000000-0000-4000-8000-000000000001';
  const run=await db.getRepository(PayrollRunEntity).save({clientId,branchId:null,periodYear:2026,periodMonth:9,status:'PROCESSED'});
  const employee=await db.getRepository(PayrollRunEmployeeEntity).save({runId:run.id,clientId,employeeCode:'001',employeeName:'Synthetic employee',grossEarnings:'100.10',netPay:'90.00',pfEmployee:null,esiEmployee:'0.00'});
  const service=new PayrollReconciliationService(db,{assertClientAllowed:async()=>{}},{hasModule:async()=>true});
  const file={originalname:'synthetic-register.csv',buffer:Buffer.from('employee_code,period,gross_earnings,net_pay,pf_employee,esi_employee\n001,2026-09,100.11,90,,0')};
  const user={id:'synthetic-reviewer',userId:'synthetic-reviewer',roleCode:'PAYROLL'};
  const before=await db.getRepository(PayrollRunEmployeeEntity).findOneByOrFail({id:employee.id});
  const result=await service.compare(user,run.id,file);
  assert.equal(result.rows[0].comparisons[0].difference,'0.01');
  assert.equal(result.rows[0].comparisons[2].expected,null);
  assert.equal(result.summary.mismatched,1);assert.equal(result.summary.unverifiable,1);
  assert.deepEqual(await db.getRepository(PayrollRunEmployeeEntity).findOneByOrFail({id:employee.id}),before,'Comparison must not modify employee payroll');
  await db.getRepository(PayrollRunEmployeeEntity).update(employee.id,{grossEarnings:'100.11'});
  const changed=await service.compare(user,run.id,file);
  assert.notEqual(result.baselineSha256,changed.baselineSha256,'Changed payroll changes the baseline fingerprint');
  assert.equal(result.source.sha256,changed.source.sha256,'Unchanged source keeps its fingerprint');
  assert.equal(changed.rows[0].status,'UNVERIFIABLE','Unknown PF remains unknown even when known amounts match');
  assert.equal((await db.getRepository(PayrollRunEntity).findOneByOrFail({id:run.id})).status,'PROCESSED');
  console.log('PostgreSQL/TypeORM integration passed: actual entity mappings, numeric precision, null handling, changed baseline fingerprints, and no payroll mutation.');
 }finally{
  if(!/^reconciliation_test_\d+$/.test(schema))throw new Error('Unexpected test schema');
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.destroy();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});