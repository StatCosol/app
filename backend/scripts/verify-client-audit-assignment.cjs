// Disposable synthetic database only. Never loads application DB settings.
const assert = require('node:assert/strict');
const {PGlite} = require(process.argv[2] || '@electric-sql/pglite');
const {ClientAuditAssignmentService} = require('../dist/src/audits/client-audit-assignment.service');
const {actualAuditSql} = require('../dist/src/common/actual-records');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{
  const db = new PGlite();
  const adapter = tx => ({query:async(sql,args)=>(await tx.query(sql,args)).rows});
  const data = {transaction:(...args)=>db.transaction(tx=>args.at(-1)(adapter(tx)))};
  const service = new ClientAuditAssignmentService(data);
  const actor = {userId:id(1),roleCode:'CRM'};
  const input = {clientId:id(10),assignedAuditorId:id(2),auditType:'CONTRACTOR',frequency:'MONTHLY',periodYear:2099,periodCode:'2099-12',dueDate:'2099-12-31',notes:'TEST ONLY client-wide assignment'};
  try {
    await db.exec(`
      CREATE TABLE clients(id uuid PRIMARY KEY,status text,is_deleted boolean);
      CREATE TABLE client_assignments_current(client_id uuid,assignment_type text,assigned_to_user_id uuid);
      CREATE TABLE roles(id uuid PRIMARY KEY,code text);
      CREATE TABLE users(id uuid PRIMARY KEY,name text,role_id uuid,is_active boolean,deleted_at timestamp);
      CREATE TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text,isactive boolean,isdeleted boolean);
      CREATE TABLE branch_contractor(client_id uuid,branch_id uuid,contractor_user_id uuid);
      CREATE TABLE audits(id uuid PRIMARY KEY,audit_code varchar(20) UNIQUE,client_id uuid,branch_id uuid,contractor_user_id uuid,
        assigned_auditor_id uuid,created_by_user_id uuid,frequency text,audit_type text,period_year int,period_code text,status text,
        due_date date,upload_lock_from date,upload_lock_until date,notes text);
    `);
    await db.query("INSERT INTO clients VALUES($1,'ACTIVE',FALSE),($2,'ACTIVE',FALSE)",[id(10),id(20)]);
    await db.query("INSERT INTO client_assignments_current VALUES($1,'CRM',$2)",[id(10),id(1)]);
    await db.query("INSERT INTO roles VALUES($1,'AUDITOR'),($2,'CONTRACTOR')",[id(90),id(91)]);
    for(const [n,r,active] of [[2,90,true],[3,90,true],[101,91,true],[102,91,true],[103,91,false]]) await db.query('INSERT INTO users VALUES($1,$2,$3,$4,NULL)',[id(n),`Synthetic user ${n}`,id(r),active]);
    for(const [n,c,active] of [[11,10,true],[12,10,true],[13,10,true],[14,10,false],[21,20,true]]) await db.query('INSERT INTO client_branches VALUES($1,$2,$3,$4,FALSE)',[id(n),id(c),`Synthetic branch ${n}`,active]);
    for(const [c,b,v] of [[10,11,101],[10,11,102],[10,12,101],[10,13,103],[10,14,101],[20,21,102]]) await db.query('INSERT INTO branch_contractor VALUES($1,$2,$3)',[id(c),id(b),id(v)]);
    const preview = await service.preview(actor,input);
    assert.equal(preview.branchCount,3);assert.equal(preview.createCount,3);assert.equal(preview.uncoveredBranches.length,1);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM audits')).rows[0].n,0);
    await assert.rejects(service.preview({...actor,roleCode:'CLIENT'},input),/CRM access/);
    await assert.rejects(service.preview(actor,{...input,clientId:id(20)}),/not assigned/);
    await assert.rejects(service.preview(actor,{...input,assignedAuditorId:id(101)}),/active auditor/);
    await assert.rejects(service.preview(actor,{...input,branchId:id(11)}),/cannot specify/);
    await assert.rejects(service.preview(actor,{...input,dueDate:'2099-02-30'}),/valid audit/);
    await assert.rejects(service.assign(actor,input),/Preview/);
    await assert.rejects(service.assign(actor,{...input,previewToken:preview.previewToken,dueDate:'2100-01-01'}),/changed/);
    const result = await service.assign(actor,{...input,previewToken:preview.previewToken});
    assert.equal(result.created.length,3);
    const saved=(await db.query('SELECT * FROM audits')).rows;
    assert.ok(saved.every(a=>a.assigned_auditor_id===id(2)&&a.status==='PLANNED'&&a.notes.startsWith('TEST ONLY')));
    assert.equal(new Set(saved.map(a=>`${a.branch_id}:${a.contractor_user_id}`)).size,3);
    assert.equal((await db.query(`SELECT COUNT(*)::int n FROM audits a WHERE ${actualAuditSql('a')}`)).rows[0].n,0);
    const markerOnly={...input,periodCode:'2099-10',notes:'TEST ONLY'};
    const markerPreview=await service.preview(actor,markerOnly);
    await service.assign(actor,{...markerOnly,previewToken:markerPreview.previewToken});
    assert.equal((await db.query(`SELECT COUNT(*)::int n FROM audits a WHERE ${actualAuditSql('a')}`)).rows[0].n,0);
    await assert.rejects(service.assign(actor,{...input,previewToken:preview.previewToken}),/changed/);
    const repeat=await service.preview(actor,input);assert.equal(repeat.createCount,0);assert.equal(repeat.existingCount,3);
    assert.equal((await service.assign(actor,{...input,previewToken:repeat.previewToken})).created.length,0);
    const actual=await service.preview(actor,{...input,notes:'Operational audit'});assert.equal(actual.createCount,3);
    const conflict=await service.preview(actor,{...input,assignedAuditorId:id(3)});assert.equal(conflict.canAssign,false);
    await assert.rejects(service.assign(actor,{...input,assignedAuditorId:id(3),previewToken:conflict.previewToken}),/conflicting/);
    const factory=await service.preview(actor,{...input,auditType:'FACTORY'});assert.equal(factory.createCount,3);assert.equal(factory.uncoveredBranches.length,0);
    // Two separate PostgreSQL connections submitting the same preview cannot duplicate the batch.
    if(db.client) {
      const {Client}=require('pg');
      const connection=new Client(db.client.connectionParameters);await connection.connect();
      try {
        const concurrent=new ClientAuditAssignmentService({transaction:async(...args)=>{
          await connection.query('BEGIN');
          try { const result=await args.at(-1)(adapter(connection));await connection.query('COMMIT');return result; }
          catch(e) { await connection.query('ROLLBACK');throw e; }
        }});
        const parallelInput={...input,periodCode:'2099-11'};
        const reviewed=await service.preview(actor,parallelInput);
        const submissions=await Promise.allSettled([
          service.assign(actor,{...parallelInput,previewToken:reviewed.previewToken}),
          concurrent.assign(actor,{...parallelInput,previewToken:reviewed.previewToken}),
        ]);
        assert.equal(submissions.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(submissions.filter(r=>r.status==='rejected').length,1);
        assert.equal((await db.query("SELECT COUNT(*)::int n FROM audits WHERE period_code='2099-11'")).rows[0].n,3);
      } finally { await connection.end(); }
    }
    // A disappearing assignment invalidates the preview before any inserts.
    await db.query('DELETE FROM branch_contractor WHERE branch_id=$1 AND contractor_user_id=$2',[id(11),id(102)]);
    await assert.rejects(service.assign(actor,{...input,previewToken:repeat.previewToken}),/changed/);
    // Failure midway rolls back the entire new assignment.
    const rollbackInput={...input,auditType:'FACTORY'};
    const rollbackPreview=await service.preview(actor,rollbackInput);
    const failing = new ClientAuditAssignmentService({transaction:(...args)=>db.transaction(tx=>args.at(-1)({query:async(sql,params)=>{
      if(sql.startsWith('INSERT INTO audits') && params[3]===id(12)) throw new Error('synthetic second insert failure');
      return (await tx.query(sql,params)).rows;
    }}))});
    await assert.rejects(failing.assign(actor,{...rollbackInput,previewToken:rollbackPreview.previewToken}),/second insert/);
    assert.equal((await db.query("SELECT COUNT(*)::int n FROM audits WHERE audit_type='FACTORY'")).rows[0].n,0);
    await db.query('UPDATE audits SET branch_id=NULL WHERE id=$1',[saved[0].id]);
    const incomplete=await service.preview(actor,input);assert.equal(incomplete.canAssign,false);assert.equal(incomplete.blocking.length,1);
    await db.query('DELETE FROM client_assignments_current');
    await assert.rejects(service.assign(actor,{...input,previewToken:incomplete.previewToken}),/not assigned/);
    console.log('PASS: client-wide coverage, tenant/role checks, one auditor, test separation, conflict preservation, preview expiry, duplicate retry and atomic rollback (synthetic database only).');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
