// Local integration regression: actual entity columns, disposable schema, no production configuration.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const {DataSource,Table}=require('typeorm');
const {OperationalScopeService}=require('../dist/src/access/operational-scope.service');
const {SlaService}=require('../dist/src/sla/sla.service');
const {SlaTaskEntity}=require('../dist/src/sla/entities/sla-task.entity');
const {EscalationsService}=require('../dist/src/escalations/escalations.service');
const {EscalationEntity}=require('../dist/src/escalations/entities/escalation.entity');
const {SystemTaskEntity}=require('../dist/src/automation/entities/system-task.entity');
const {TaskCenterController}=require('../dist/src/task-center/task-center.controller');
const {TaskCenterService}=require('../dist/src/task-center/task-center.service');
const {operationalDate,addCalendarDays}=require('../dist/src/common/operational-date');
const connection={host:'127.0.0.1',port:55439,user:'monthly_close_test',database:'postgres'};
const schema=`operational_test_${Date.now()}`;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const admin=new Client(connection);await admin.connect();let ds;
 try{
  await admin.query(`CREATE SCHEMA "${schema}"`);
  ds=new DataSource({type:'postgres',...connection,username:connection.user,schema,extra:{options:`-c search_path=${schema},public`},entities:[path.join(__dirname,'../dist/src/**/*.entity.js')],synchronize:false});await ds.initialize();
  const runner=ds.createQueryRunner();try{for(const entity of [SlaTaskEntity,EscalationEntity,SystemTaskEntity])await runner.createTable(Table.create(ds.getMetadata(entity),ds.driver),true);}finally{await runner.release();}
  const access={getScope:async u=>u.roleCode==='ADMIN'?{level:'all'}:u.roleCode==='BRANCH_DESK'?{level:'branches',clientId:id(1),branchIds:u.branchIds}:{level:'clients',clientIds:[id(1)]},getCcoClientIds:async()=>[id(1)],assertClientAllowed:async()=>{},assertBranchAllowed:async()=>{},assertCcoClientAllowed:async()=>{},assertCcoBranchAllowed:async()=>{}};
  const scope=new OperationalScopeService(access),sr=ds.getRepository(SlaTaskEntity),er=ds.getRepository(EscalationEntity),tr=ds.getRepository(SystemTaskEntity);
  const sla=new SlaService(sr,scope),esc=new EscalationsService(er,scope);
  const user=(role,branches=[id(11),id(12)])=>({id:id(9),userId:id(9),roleCode:role,branchIds:branches});
  const crm=user('CRM'),branch=user('BRANCH_DESK'),empty=user('BRANCH_DESK',[]),today=operationalDate();
  for(const [n,clientId,branchId] of [[101,id(1),id(11)],[102,id(1),id(12)],[103,id(2),id(21)]]){
   await sr.save({id:id(n),clientId,branchId,module:'AUDIT',title:'Fixture',dueDate:addCalendarDays(today,-1),status:'OPEN'});
   await er.save({id:id(n),clientId,branchId,reason:'Fixture',riskScore:70,status:'OPEN'});
   await tr.save({id:id(n),clientId,branchId,taskType:'COMPLIANCE',module:'COMPLIANCE',title:'Fixture',assignedRole:'CRM',dueDate:addCalendarDays(today,-1),status:'OPEN'});
  }
  assert.equal((await sla.listAll(crm,{})).items.length,2);assert.equal((await esc.listAll(crm,{})).items.length,2);
  assert.equal((await sla.listAll(branch,{})).items.length,2);assert.equal((await esc.listAll(branch,{})).items.length,2);
  assert.equal((await sla.listAll(empty,{})).items.length,0);assert.equal((await esc.listAll(empty,{})).items.length,0);
  assert.equal((await sla.listAll(crm,{status:'OVERDUE'})).items.length,2);
  await assert.rejects(sla.update(null,crm,id(103),{status:'CLOSED'}),/outside/);
  await assert.rejects(esc.update(id(2),crm,id(103),{status:'CLOSED'}),/outside/);
  await assert.rejects(sla.update(null,branch,id(101),{dueDate:today}),/operations managers/);
  await assert.rejects(sla.update(null,crm,id(101),{dueDate:'2026-02-30'}),/valid/);
  await assert.rejects(sla.update(null,crm,id(101),{status:'VERIFIED'}),/OPEN/);
  await assert.rejects(esc.update(id(1),crm,id(101),{status:'VERIFIED'}),/OPEN/);
  await sla.update(null,crm,id(101),{status:'CLOSED'});assert.ok((await sr.findOneBy({id:id(101)})).closedAt);
  await sla.update(null,crm,id(101),{status:'OPEN'});assert.equal((await sr.findOneBy({id:id(101)})).closedAt,null);
  await Promise.all([sla.update(null,crm,id(101),{status:'IN_PROGRESS'}),sla.update(null,crm,id(101),{dueDate:today})]);
  const current=await sr.findOneBy({id:id(101)});assert.equal(current.status,'IN_PROGRESS');assert.equal(current.dueDate,today);
  assert.equal((await sla.listAll(crm,{status:'OVERDUE'})).items.length,1);
  await esc.update(id(1),crm,id(101),{status:'ACK'});assert.equal((await er.findOneBy({id:id(101)})).status,'ACK');
  const tasks=new TaskCenterController(new TaskCenterService(ds),scope);
  assert.equal((await tasks.getMyItems(crm)).length,2);assert.equal((await tasks.getMySummary(crm)).overdue,2);
  await tr.update({id:id(101)},{status:'CANCELLED'});await tr.update({id:id(102)},{dueDate:today});
  assert.equal((await tasks.getMySummary(crm)).overdue,0);assert.equal((await tasks.getMySummary(crm)).dueSoon,1);
  for (const [n,clientId,module,assignedRole] of [[201,id(1),'PAYROLL','ADMIN'],[202,id(1),'AUDIT','ADMIN'],[203,id(2),'PAYROLL','ADMIN'],[204,id(1),'PAYROLL','PAYROLL']]) await tr.save({id:id(n),clientId,taskType:'COMPLIANCE',module,title:'Legacy compatibility fixture',assignedRole,status:'OPEN'});
  assert.deepEqual((await tasks.getMyItems(user('PAYROLL'))).map(x=>x.id).sort(),[id(201),id(204)]);
  assert.deepEqual((await tasks.getMyItems(user('CCO'))).map(x=>x.id).sort(),[id(201),id(202)]);
  console.log('PASS: real entity SQL; company and multi/empty-branch lists; unauthorized updates; status/date validation; close/reopen; concurrent patches; task deadlines.');
 }finally{if(ds?.isInitialized)await ds.destroy();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
