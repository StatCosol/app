// Run after npm run build. argv[2] may point to an installed PGlite module.
// All data is synthetic in a fresh in-memory database. No app DB configuration is read.
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { AuditEntryService } = require('../dist/src/audits/audit-entry.service');
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
(async () => {
  const db = new PGlite();
  const adapter = target => ({ query: async (sql, params) => (await target.query(sql, params)).rows });
  const service = new AuditEntryService({ ...adapter(db), transaction: fn => db.transaction(tx => fn(adapter(tx))) });
  const user = { id: uuid(1), userId: uuid(1), roleCode: 'AUDITOR' };
  try {
    await db.exec(`
      CREATE TABLE clients(id uuid PRIMARY KEY,client_name text,status text,is_deleted boolean);
      CREATE TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text,isactive boolean,isdeleted boolean);
      CREATE TABLE client_assignments_current(client_id uuid,assignment_type text,assigned_to_user_id uuid);
      CREATE TABLE branch_auditor_assignments(client_id uuid,branch_id uuid,auditor_user_id uuid,is_active boolean,start_date timestamp,end_date timestamp);
      CREATE TABLE roles(id uuid,code text);
      CREATE TABLE users(id uuid,name text,role_id uuid,is_active boolean,deleted_at timestamp);
      CREATE TABLE branch_contractor(client_id uuid,branch_id uuid,contractor_user_id uuid);
      CREATE TABLE audits(id uuid PRIMARY KEY,audit_code varchar(20) UNIQUE,client_id uuid,branch_id uuid,contractor_user_id uuid,
        frequency text,audit_type text,period_year int,period_code text,assigned_auditor_id uuid,created_by_user_id uuid,status text,created_at timestamp,updated_at timestamp);
    `);
    for (const n of [10,20,30]) await db.query("INSERT INTO clients VALUES($1,$2,'ACTIVE',FALSE)",[uuid(n),`Synthetic client ${n}`]);
    for (const [id,client] of [[11,10],[12,10],[21,20],[22,20],[31,30]])
      await db.query('INSERT INTO client_branches VALUES($1,$2,$3,TRUE,FALSE)',[uuid(id),uuid(client),`Synthetic branch ${id}`]);
    await db.query("INSERT INTO client_assignments_current VALUES($1,'AUDITOR',$2)",[uuid(10),uuid(1)]);
    await db.query('INSERT INTO branch_auditor_assignments VALUES($1,$2,$3,TRUE,NOW()-INTERVAL \'1 day\',NULL)',[uuid(20),uuid(21),uuid(1)]);
    await db.query('INSERT INTO branch_auditor_assignments VALUES($1,$2,$3,TRUE,NOW()-INTERVAL \'2 days\',NOW()-INTERVAL \'1 day\')',[uuid(20),uuid(22),uuid(1)]);
    await db.query("INSERT INTO roles VALUES($1,'CONTRACTOR')",[uuid(90)]);
    for (const n of [101,102]) await db.query('INSERT INTO users VALUES($1,$2,$3,TRUE,NULL)',[uuid(n),`Synthetic contractor ${n}`,uuid(90)]);
    await db.query('INSERT INTO branch_contractor VALUES($1,$2,$3),($4,$5,$6)',[uuid(10),uuid(11),uuid(101),uuid(20),uuid(21),uuid(102)]);
    const options = await service.options(user);
    assert.deepEqual(options.branches.map(b=>b.id),[uuid(11),uuid(12),uuid(21)]);
    assert.equal(options.clients.length,2);
    assert.equal(options.contractors.length,2);
    assert.deepEqual((await service.options({...user,id:uuid(2),userId:uuid(2)})).clients,[]);
    const input = {clientId:uuid(10),branchId:uuid(11),auditType:'CONTRACTOR',periodCode:'2026-08',contractorUserId:uuid(101)};
    const first = await service.start(user,input);
    assert.equal(first.created,true);
    assert.equal((await service.start(user,input)).auditId,first.auditId);
    assert.equal((await service.start(user,input)).created,false);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM audits')).rows[0].n,1);
    const saved=(await db.query('SELECT * FROM audits')).rows[0];
    assert.equal(saved.period_year,2026); assert.equal(saved.period_code,'2026-08');
    assert.equal(saved.assigned_auditor_id,user.id); assert.equal(saved.status,'IN_PROGRESS');
    assert.equal(saved.contractor_user_id,input.contractorUserId);
    await assert.rejects(service.start(user,{...input,contractorUserId:uuid(102)}),/not linked/);
    await assert.rejects(service.start(user,{...input,branchId:uuid(21)}),/not assigned/);
    await assert.rejects(service.start(user,{...input,clientId:uuid(20),branchId:uuid(22)}),/not assigned/);
    await assert.rejects(service.start(user,{...input,periodCode:'2026-13'}),/valid audit/);
    await assert.rejects(service.start(user,{...input,contractorUserId:undefined}),/Select a contractor/);
    await assert.rejects(service.start({...user,roleCode:'CRM'},input),/Auditor access/);
    const branchAudit=await service.start(user,{clientId:uuid(20),branchId:uuid(21),auditType:'FACTORY',periodCode:'2026-09'});
    assert.equal(branchAudit.created,true);
    await db.query('DELETE FROM client_assignments_current');
    await assert.rejects(service.start(user,input),/not assigned/);
    console.log('PASS: client/branch assignment scope, expired/unassigned denial, contractor mapping, period/type validation, existing-audit reuse, and assignment recheck.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
