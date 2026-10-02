// Disposable PostgreSQL/file integration: real generation, persistence, approval and downloads.
// Applicability/access are supplied as a fixed synthetic context; their checks have separate regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');
const { RegisterBuilderService } = require('../dist/src/payroll/register-library/register-builder.service');
const { PayrollRegistersService } = require('../dist/src/payroll/payroll-registers.service');
const { RegistersRecordEntity } = require('../dist/src/payroll/entities/registers-record.entity');
const { REGISTER_FORMS } = require('../dist/src/payroll/register-library/register-catalogue');
const { LEGAL_WAGE_REGISTER_TYPES, legalRegisterType } = require('../dist/src/payroll/register-library/register-identity');
const { definition } = require('../dist/src/payroll/register-library/register-workbook');

module.exports = async function verifyRegisterRoundtrip(ds, factory = false, selectedForm = null) {
  const previousDirectory = process.cwd();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'register-roundtrip-'));
  try {
    process.chdir(temporary);
    await ds.query('CREATE TABLE IF NOT EXISTS register_preparation_scopes (register_id uuid PRIMARY KEY, contractor_user_id uuid)');
    const clientId = randomUUID(), branchId = randomUUID();
    const form = selectedForm || REGISTER_FORMS.find(f => factory
      ? f.id === 'ts--factories-1948--ts-integrated-2019--ii---iii--tsi'
      : f.sourceId === 'apw' && f.formNumber === 'V');
    const input = {
      branchId, year: 2026, month: 9, employer: 'Fictional employer', owner: 'Fictional owner',
      employerPan: 'ABCDE1234F', registrationNumber: 'TEST-LIN', issueDate: '2026-09-30',
      rows: [{ name: 'Fictional worker', relativeName: 'Fictional parent', designation: 'Guard',
        uan: '001234567890', bankAccount: '00012345678901234567890', wagePeriod: '2026-09-01 to 2026-09-30',
        basicRate: '16000', daRate: '0', allowanceRate: '2000', daysWorked: '30',
        overtime: '0', gross: '18000', deductions: '2070', pf: '1800', esi: '120',
        otherDeductions: '150', net: '15930' }],
    };
    if (factory) {
      const layout = definition(form.id).layout;
      const values = fields => Object.fromEntries(fields.filter(f => f.required).map(f =>
        [f.key, ['number', 'money'].includes(f.type) ? 0 : 'Reviewed fictional evidence']));
      input.actingCapacity = 'DIRECT_EMPLOYER';
      input.supportingReference = 'Reviewed source records and period applicability';
      input.particulars = { ...values(layout.particulars), regularWorkers: 1, categoryPermanentMale: 1,
        categoryTotalMale: 1, classSkilledMale: 1, classTotalMale: 1 };
      input.rows = [{ ...values(layout.fields), serial: 1, name: 'Factory worker', sex: 'M', gross: 1000, net: 1000 }];
    }
    if(selectedForm) {
      const layout=definition(form.id).layout;
      const values=fields=>Object.fromEntries(fields.filter(f=>f.required).map(f=>[f.key,
        f.type==='date'?'2026-09-01':['number','money'].includes(f.type)?0:'Reviewed fictional evidence']));
      input.supportingReference='Reviewed fictional state register evidence';
      input.particulars=values(layout.particulars);
      const row=values(layout.fields);
      if(layout.fields.some(f=>f.key==='leaveType'))row.leaveType='PRIVILEGE';
      if(layout.fields.some(f=>f.key==='serial'))row.serial=1;
      if(layout.fields.some(f=>f.key==='sex'))row.sex='M';
      for(let d=1;d<=30;d++)if(layout.fields.some(f=>f.key==='day'+d+'Status'))row['day'+d+'Status']=['tns','tn'].includes(form.sourceId)?'LOP':'A';
      if('day1Status' in row && ['tns','tn'].includes(form.sourceId)) row.lopDays=30;
      input.rows=[row];
    }
    const preparer = { id: randomUUID(), roleCode: 'PAYROLL' };
    const reviewer = { id: randomUUID(), roleCode: 'ADMIN' };
    const master = { id: randomUUID(), roleCode: 'CLIENT', userType: 'MASTER', clientId, branchIds: [branchId] };
    const branch = { ...master, userType: 'BRANCH' };
    const scope = { branchId, periodYear: 2026, periodMonth: 9, sourceType: 'GENERATED', category: 'REGISTER' };
    const builder = new RegisterBuilderService(ds, {});
    builder.context = async () => ({
      ...definition(form.id), branch: { id: branchId, clientId, stateCode: form.jurisdiction, branchName: 'Fictional branch', address: 'Fictional road' },
      applicabilityEvidence: [{ applicable: true, computedAt: '2026-09-01T00:00:00Z' }],
    });
    const repo = ds.getRepository(RegistersRecordEntity);
    const service = new PayrollRegistersService(repo, {}, {}, {}, {
      findOne: async () => ({ settings: { allowBranchPayrollAccess: true, allowBranchWageRegisters: true, allowBranchSalaryRegisters: true } }),
    }, { assertPayrollAccessToClient: async () => {} });
    const reviewVersion = async id => (await service.payrollListRegistersFormatted(reviewer, { clientId, ...scope })).find(r => r.id === id).reviewVersion;
    const generated = await builder.generate(form.id, input, preparer);
    const original = await repo.findOneByOrFail({ id: generated.recordId });
    assert.equal(original.approvalStatus, 'PENDING');
    assert.deepEqual(fs.readFileSync(original.filePath), generated.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(generated.buffer);
    if(selectedForm) {
      assert.ok(workbook.getWorksheet('Establishment details'));
      assert.ok(JSON.stringify(workbook.worksheets.map(s=>s.getSheetValues())).includes(form.actCode));
    } else if (factory) {
      assert.deepEqual(workbook.worksheets.map(s => s.name), ['Identity and review', 'Form II', 'Form III']);
      assert.equal(workbook.getWorksheet('Form III').getCell('B6').value, 'Factory worker');
    } else {
      assert.ok(JSON.stringify(workbook.getWorksheet('Form V').getSheetValues()).includes(input.rows[0].bankAccount));
    }
    assert.deepEqual((await service.clientListRegistersRecords(master, scope)).map(r => r.id), [generated.recordId]);
    assert.deepEqual(await service.clientListRegistersRecords(branch, scope), []);
    await service.approveRegister(reviewer, generated.recordId, await reviewVersion(generated.recordId));
    assert.deepEqual((await service.clientListRegistersRecords(branch, scope)).map(r => r.id), [generated.recordId]);
    assert.deepEqual((await service.downloadRegisterForClient(branch, generated.recordId)).buffer, generated.buffer);
    const response = Object.assign(new PassThrough(), { setHeader: () => {} });
    const chunks = []; response.on('data', chunk => chunks.push(chunk));
    const ended = new Promise((resolve, reject) => { response.on('end', resolve); response.on('error', reject); });
    await service.streamClientRegistersPack(branch, { ...scope, registerIds: [generated.recordId] }, response);
    await ended;
    const zip = await require('unzipper').Open.buffer(Buffer.concat(chunks));
    assert.equal(zip.files.length, 1);
    assert.match(zip.files[0].path, /\.xlsx$/);
    assert.deepEqual(await zip.files[0].buffer(), generated.buffer);
    await assert.rejects(service.streamClientRegistersPack(branch, { ...scope, registerIds: [generated.recordId, randomUUID()] }, {}), /Refresh/);
    await repo.update(original.id, { title: 'Integrated register' });
    const restricted = new PayrollRegistersService(repo, {}, {}, {}, {
      findOne: async () => ({ settings: { allowBranchPayrollAccess: true, allowBranchWageRegisters: false, allowBranchSalaryRegisters: true } }),
    }, {});
    if (LEGAL_WAGE_REGISTER_TYPES.includes(legalRegisterType(form.id))) {
    assert.deepEqual(await restricted.clientListRegistersRecords(branch, scope), []);
    await assert.rejects(restricted.downloadRegisterForClient(branch, original.id), /restricted/);
    await assert.rejects(restricted.streamClientRegistersPack(branch, { ...scope, registerIds: [original.id] }, {}), /No registers/);
    }
    const oldGenerationTime = new Date('2026-09-01T00:00:00Z');
    await repo.update(original.id, { generatedAt: oldGenerationTime });
    fs.unlinkSync(original.filePath);
    await assert.rejects(service.approveRegister(reviewer, original.id, await reviewVersion(original.id)), /missing/);
    const repaired = await builder.generate(form.id, input, preparer);
    const replacement = await repo.findOneByOrFail({ id: repaired.recordId });
    assert.equal(repaired.recordId, original.id);
    assert.notEqual(replacement.filePath, original.filePath);
    assert.equal(replacement.createdAt.toISOString(), original.createdAt.toISOString());
    assert.ok(replacement.generatedAt > oldGenerationTime);
    assert.equal(replacement.approvalStatus, 'PENDING');
    assert.equal(replacement.approvedAt, null);
    assert.deepEqual(await service.clientListRegistersRecords(branch, scope), []);
    assert.equal(await repo.countBy({ clientId }), 1);
    console.log('PASS ' + form.id + ': generated XLSX persists, appears in master, transfers to branch only after approval, downloads byte-for-byte in ZIP, and missing-file repair resets review while preserving identity');
  } finally {
    process.chdir(previousDirectory);
    const resolved = path.resolve(temporary);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'register-roundtrip-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  if (!factory && !selectedForm) {
    await verifyRegisterRoundtrip(ds, true);
    for(const form of REGISTER_FORMS.filter(f=>['aps','kas','tns','hrs','wbs','tn'].includes(f.sourceId)))
      await verifyRegisterRoundtrip(ds, false, form);
  }
};
