/* Isolated local/CI PostgreSQL fixtures. No application env or real data. */
const assert = require('node:assert/strict');
const path = require('node:path');
const connectionString = process.env.STRUCTURE_ISOLATION_TEST_URL;
if (!connectionString) throw new Error('STRUCTURE_ISOLATION_TEST_URL is required');
const target = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/(statcompy_ci|structure_isolation_test)$/.test(target.pathname)) {
  throw new Error('Only a localhost isolated statcompy_ci or structure_isolation_test database is allowed');
}
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
const { Client } = require('pg');
const { PayrollEngineController } = require('../src/payroll/engine/payroll-engine.controller');
const { salaryStructureTestSql } = require('../src/payroll/salary-structure-record-scope');
const db = new Client({ connectionString });
const checks = [];

// Execute actual controller join/filter SQL against temp tables. Entity hydration
// and HTTP guards are covered by separate unit/API tests, not simulated here.
function queryBuilder() {
  const joins = [], select = [], conditions = [], parameters = {};
  const qb = {
    leftJoin(table, alias, on) { joins.push(`LEFT JOIN ${table} ${alias} ON ${on}`); return qb; },
    addSelect(expression, alias) { select.push(`${expression} AS "${alias}"`); return qb; },
    where(sql, params) { conditions.length = 0; return qb.andWhere(sql, params); },
    andWhere(sql, params) { conditions.push(`(${sql})`); Object.assign(parameters, params || {}); return qb; },
    orderBy() { return qb; }, addOrderBy() { return qb; },
    async getRawAndEntities() {
      const values = [], indexes = new Map();
      const sql = `SELECT ps.*${select.length ? ',' + select.join(',') : ''} FROM pay_salary_structures ps ${joins.join(' ')} WHERE ${conditions.join(' AND ')} ORDER BY ps.id`;
      const bound = sql.replace(/'(?:''|[^'])*'|(?<!:):([A-Za-z_][A-Za-z_0-9]*)/g, (token, key) => {
        if (!key) return token; // Keep quoted POSIX regex classes such as [:space:] literal.
        assert(Object.hasOwn(parameters, key), `Missing controller parameter ${key}`);
        if (!indexes.has(key)) { values.push(parameters[key]); indexes.set(key, values.length); }
        return '$' + indexes.get(key);
      });
      const rows = (await db.query(bound, values)).rows;
      return { raw: rows, entities: rows };
    },
  };
  return qb;
}

async function main() {
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SET LOCAL search_path=pg_temp,public;
      CREATE TEMP TABLE users(id text PRIMARY KEY, owner_cco_id text, deleted_at timestamptz);
      CREATE TEMP TABLE clients(id text PRIMARY KEY, client_name text, assigned_crm_id text);
      CREATE TEMP TABLE employees(id text PRIMARY KEY,client_id text,name text,employee_code text);
      CREATE TEMP TABLE client_branches(id text PRIMARY KEY,clientid text,branchname text);
      CREATE TEMP TABLE departments(id text PRIMARY KEY,client_id text,name text);
      CREATE TEMP TABLE grades(id text PRIMARY KEY,client_id text,name text);
      CREATE TEMP TABLE pay_salary_structures(id text PRIMARY KEY,client_id text,name text,scope_type text,employee_id text,branch_id text,department_id text,grade_id text,approval_status varchar(20),submitted_at timestamptz,effective_from date);
      INSERT INTO users VALUES('CRM-OWN','CCO-OWN',NULL),('CRM-FOREIGN','CCO-FOREIGN',NULL),('CRM-DELETED','CCO-OWN',NOW());
      INSERT INTO clients VALUES('REAL','Acme Manufacturing','CRM-OWN'),('LAB','Test Labs Pvt Ltd','CRM-OWN'),('CLIENT-MARKED','TEST ONLY client fixture','CRM-OWN'),('CLIENT-LEGACY','  test client  ','CRM-OWN'),('FOREIGN','Foreign actual company','CRM-FOREIGN'),('DELETED-OWNER','Actual company','CRM-DELETED');
      INSERT INTO employees VALUES('REAL-EMP','REAL','Real worker','ACM001'),('NAME-MARKED','REAL','TEST ONLY synthetic employee','ACM002'),('CODE-MARKED','REAL','Ordinary worker label','TEST_WORKER'),('FOREIGN-EMP','FOREIGN','TEST ONLY other-client employee','TEST_FOREIGN');`);
    const definitions = [
      ['actual', 'REAL', 'Monthly wages', 'TENANT', null, false],
      ['incidental-word', 'REAL', 'Quality test allowance', 'TENANT', null, false],
      ['legitimate-lab', 'LAB', 'Monthly wages', 'TENANT', null, false],
      ['real-employee', 'REAL', 'Monthly wages', 'EMPLOYEE', 'REAL-EMP', false],
      ['null-employee', 'REAL', null, 'EMPLOYEE', null, false],
      ['missing-employee', 'REAL', 'Monthly wages', 'EMPLOYEE', 'MISSING-EMP', false],
      ['cross-client-employee', 'REAL', 'Monthly wages', 'EMPLOYEE', 'FOREIGN-EMP', false],
      ['ignored-nonemployee-lineage', 'REAL', 'Monthly wages', 'TENANT', 'NAME-MARKED', false],
      ['name-spaces', 'REAL', 'TEST ONLY regular fixture', 'TENANT', null, true],
      ['name-underscore', 'REAL', 'TEST_ONLY_regular fixture', 'TENANT', null, true],
      ['name-hyphen', 'REAL', 'TEST-ONLY-regular fixture', 'TENANT', null, true],
      ['name-code', 'REAL', 'TEST_PAYROLL_2026', 'TENANT', null, true],
      ['name-dash-code', 'REAL', 'TEST-PAYROLL-2026', 'TENANT', null, true],
      ['name-synthetic', 'REAL', 'SYNTHETIC TEST ONLY fixture', 'TENANT', null, true],
      ['client-marker', 'CLIENT-MARKED', 'Unmarked structure', 'TENANT', null, true],
      ['client-legacy', 'CLIENT-LEGACY', 'Unmarked structure', 'TENANT', null, true],
      ['employee-name', 'REAL', 'Unmarked structure', 'EMPLOYEE', 'NAME-MARKED', true],
      ['employee-code', 'REAL', 'Unmarked structure', 'EMPLOYEE', 'CODE-MARKED', true],
      ['foreign-actual', 'FOREIGN', 'Monthly wages', 'TENANT', null, false],
      ['foreign-test', 'FOREIGN', 'TEST ONLY fixture', 'TENANT', null, true],
      ['deleted-owner', 'DELETED-OWNER', 'Monthly wages', 'TENANT', null, false],
      ['null-client', null, 'Monthly wages', 'TENANT', null, false],
      ['null-client-test', null, 'TEST ONLY orphan fixture', 'TENANT', null, true],
    ];
    const fixtures = [];
    for (const status of ['DRAFT','PENDING','APPROVED','REJECTED']) {
      for (const [label, client, name, scope, employee, isTest] of definitions) {
        const row={id:`${status}-${label}`,status,label,client,isTest,owned:client!==null&&!['FOREIGN','DELETED-OWNER'].includes(client)};
        fixtures.push(row);
        await db.query(`INSERT INTO pay_salary_structures(id,client_id,name,scope_type,employee_id,approval_status,submitted_at,effective_from) VALUES($1,$2,$3,$4,$5,$6,'2026-01-01','2026-01-01')`,[row.id,client,name,scope,employee,status]);
      }
    }
    const snapshot=async()=>{
      const result={};
      for(const table of ['users','clients','employees','client_branches','departments','grades','pay_salary_structures'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
      return result;
    };
    const before=await snapshot();
    const controller=Object.create(PayrollEngineController.prototype);
    controller.structureRepo={createQueryBuilder:queryBuilder};
    const cco={id:'CCO-OWN',userId:'CCO-OWN',roleCode:'CCO'},admin={id:'ADMIN',roleCode:'ADMIN'};
    const ids=rows=>rows.map(row=>row.id).sort();
    for(const status of ['DRAFT','PENDING','APPROVED','REJECTED']){
      const expectedActual=ids(fixtures.filter(f=>f.status===status&&f.owned&&!f.isTest));
      const expectedTest=ids(fixtures.filter(f=>f.status===status&&f.owned&&f.isTest));
      const normal=await controller.listApprovalQueue(cco,status);
      const actual=await controller.listApprovalQueue(cco,status,'ACTUAL');
      const test=await controller.listApprovalQueue(cco,status,'TEST');
      assert.deepEqual(ids(normal),expectedActual);checks.push(status+': default scope contains only actual owned structures');
      assert.deepEqual(ids(actual),expectedActual);checks.push(status+': explicit ACTUAL matches default before row mapping');
      assert.deepEqual(ids(test),expectedTest);checks.push(status+': explicit TEST preserves labelled and lineage fixtures');
      assert.equal(ids(actual).filter(id=>ids(test).includes(id)).length,0);
      assert.deepEqual([...ids(actual),...ids(test)].sort(),ids(fixtures.filter(f=>f.status===status&&f.owned)));
      checks.push(status+': partitions disjoint and complete for owned fixtures');
      for(const scope of ['ACTUAL','TEST'])assert.deepEqual(await controller.listApprovalQueue({id:'UNASSIGNED',roleCode:'CCO'},status,scope),[]);
      checks.push(status+': unassigned and foreign CCO rows excluded in both scopes');
      assert.deepEqual(ids(await controller.listApprovalQueue(admin,status,'ACTUAL')),ids(fixtures.filter(f=>f.status===status&&!f.isTest)));
      assert.deepEqual(ids(await controller.listApprovalQueue(admin,status,'TEST')),ids(fixtures.filter(f=>f.status===status&&f.isTest)));
      checks.push(status+': controller admin path handles null client/employee relations without losing partition');
    }
    await assert.rejects(controller.listApprovalQueue(cco,'PENDING','INVALID'),/recordScope|scope/i);checks.push('Invalid scope is rejected');
    await assert.rejects(controller.listApprovalQueue(cco,'INVALID','ACTUAL'),/status/i);checks.push('Invalid status is rejected');
    const predicate=salaryStructureTestSql();
    const classified=(await db.query(`SELECT ps.id,(${predicate}) AS "isTest" FROM pay_salary_structures ps LEFT JOIN clients c ON c.id=ps.client_id LEFT JOIN employees e ON e.id=ps.employee_id AND e.client_id=ps.client_id ORDER BY ps.id`)).rows;
    for(const row of classified)assert.equal(row.isTest,fixtures.find(f=>f.id===row.id).isTest,row.id);
    checks.push('Exact source SQL classifier handles92 fixtures with non-null boolean results');
    assert.deepEqual(await snapshot(),before);checks.push('All rows unchanged after default/test/authorization/classification reads');
  } finally { await db.query('ROLLBACK');await db.end(); }
  console.log(JSON.stringify({status:'PASS',checksPassed:checks.length,checks,fixtureRows:92,rolledBack:true,method:'Actual source controller filters and helper SQL against temporary local PostgreSQL tables; no HTTP guard or production access claim'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
