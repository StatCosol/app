const assert = require('node:assert/strict');
const { randomUUID: id } = require('node:crypto');
module.exports = async ({ db, service, user, company, branch, otherCompany, otherBranch }) => {
  const vendor = id(), secondVendor = id();
  await db.query(`INSERT INTO users(id,client_id,name) VALUES($1,$2,'TEST ONLY Contractor'),($3,$2,'TEST ONLY Second')`,[vendor,company,secondVendor]);
  const worker = async (name, options={}) => {
    const workerId=id();
    await db.query(`INSERT INTO contractor_employees(id,client_id,branch_id,contractor_user_id,employee_code,name,date_of_joining,date_of_exit,is_active)
      VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8)`,[workerId,options.client || company,options.branch || branch,options.vendor || vendor,name,options.join || null,options.exit || null,options.active ?? true]);
    return workerId;
  };
  const punch=async(workerId,time,direction='AUTO',decision='AUTO',client=company,unit=branch)=>db.query(
    `INSERT INTO contractor_biometric_punches(client_id,branch_id,contractor_employee_id,punch_time,direction,decision) VALUES($1,$2,$3,$4,$5,$6)`,[client,unit,workerId,time,direction,decision]);
  const complete=await worker('TEST COMPLETE'), open=await worker('TEST OPEN'), missing=await worker('TEST MISSING'), pending=await worker('TEST PENDING'), repeated=await worker('TEST REPEATED'), boundary=await worker('TEST BOUNDARY'), other=await worker('TEST OTHER',{client:otherCompany,branch:otherBranch}), second=await worker('TEST SECOND',{vendor:secondVendor});
  await worker('TEST FUTURE',{join:'2026-01-08'}); await worker('TEST EXITED',{exit:'2026-01-04',active:false});
  await punch(complete,'2026-01-05T03:30:00Z','IN');await punch(complete,'2026-01-05T09:30:00Z','OUT','REVIEW_APPROVED');
  await punch(open,'2026-01-05T03:30:00Z','IN');await punch(open,'2026-01-05T06:30:00Z','OUT');await punch(open,'2026-01-05T07:30:00Z','IN');
  await punch(repeated,'2026-01-05T03:30:00Z','IN');await punch(repeated,'2026-01-05T09:30:00Z','IN');
  await punch(pending,'2026-01-05T03:30:00Z','IN','REVIEW_REQUIRED');await punch(pending,'2026-01-05T10:00:00Z','OUT','REVIEW_REJECTED');
  await punch(boundary,'2026-01-04T18:30:00Z');await punch(boundary,'2026-01-05T03:30:00Z');await punch(boundary,'2026-01-05T18:30:00Z','IN');
  await punch(other,'2026-01-05T03:30:00Z','IN','AUTO',otherCompany,otherBranch);
  await punch(missing,'2026-01-05T03:30:00Z','IN','AUTO',otherCompany,otherBranch);
  await punch(second,'2026-01-05T03:30:00Z','IN');
  const query={date:'2026-01-05',workforce:'CONTRACTOR'};
  const result=await service.dashboard(user,query), row=workerId=>result.rows.find(r=>r.id===workerId);
  assert.equal(result.total,7); assert.equal(Number(result.summary.contractorWorkers),7); assert.equal(Number(result.summary.employees),0);
  assert.equal(row(complete).contractor_name,'TEST ONLY Contractor');assert.equal(row(complete).worked_hours,6);assert.equal(row(complete).check_in,'09:00:00');assert.equal(row(complete).short_hours,true);
  assert.equal(row(open).incomplete,true);assert.equal(row(open).check_out,null);assert.equal(row(repeated).incomplete,true);
  assert.equal(row(boundary).check_in,'00:00:00');assert.equal(row(boundary).worked_hours,9);assert.equal(row(boundary).incomplete,false);
  assert.equal(row(pending).status,'NOT_MARKED');assert.equal(row(missing).status,'NOT_MARKED');assert(!row(other));
  assert.equal(result.contractors.length,2);
  assert.equal((await service.dashboard(user,{...query,contractor:secondVendor})).rows[0].id,second);
  assert.equal((await service.dashboard(user,{...query,issue:'SHORT_HOURS'})).rows[0].id,complete);
  assert.equal((await service.dashboard(user,{...query,search:'COMPLETE'})).total,1);
  assert.equal((await service.dashboard(user,{date:query.date,workforce:'EMPLOYEE'})).rows.every(r=>r.worker_type==='EMPLOYEE'),true);
  assert.equal((await service.dashboard(user,{date:query.date})).rows.some(r=>r.worker_type==='CONTRACTOR'),true);
  assert.equal((await service.dashboard(user,{...query,page:'2'})).rows.length,0);
  console.log('PASS: contractor roster, tenant/branch filters, accepted decisions, IST day boundaries, punch pairing, workforce/contractor/search filters and summary separation.');
};
