const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DataSource } = require('typeorm');
const {
  ApplicabilityEngineService,
} = require('../src/units/services/applicability-engine.service');
const {
  UnitApplicabilityService,
} = require('../src/units/services/unit-applicability.service');
const {
  RuleEvaluatorService,
} = require('../src/units/services/rule-evaluator.service');
const {
  REGISTER_FORMS,
} = require('../src/payroll/register-library/register-catalogue');

module.exports = async function verifyReviewedRegisters(
  ds,
  builder,
  branch,
  admin,
  backend,
) {
  const filename = '20260925_reviewed_register_applicability.sql';
  const migration = await fs.readFile(
    path.join(backend, 'migrations', filename),
    'utf8',
  );
  assert.ok(
    (
      await fs.readFile(
        path.join(backend, 'scripts/apply-service-entitlements-migrations.mjs'),
        'utf8',
      )
    ).includes("'" + filename + "'"),
  );
  const codes = [
    'WAGES_2019',
    'OSH_2020',
    'TS_SHOPS_1988',
    'SHOPS_2017',
    'SOCIAL_SECURITY_2020',
  ];
  const ids = await ds.query(
    'SELECT id,code FROM unit_compliance_master WHERE code=ANY($1)',
    [codes],
  );
  assert.equal(ids.length, 5);
  // Reproduce deployed default=true links and stale AUTO=true decisions.
  await ds.query(
    'UPDATE package_compliance SET included_by_default=true WHERE compliance_id=ANY($1::uuid[])',
    [ids.map((c) => c.id)],
  );
  await ds.query('DELETE FROM package_compliance WHERE compliance_id=$1', [
    ids[0].id,
  ]);
  for (const c of ids) {
    await ds.query(
      "INSERT INTO unit_applicable_compliance(branch_id,compliance_id,is_applicable,source) VALUES ($1,$2,true,'AUTO') ON CONFLICT(branch_id,compliance_id) DO UPDATE SET is_applicable=true,source='AUTO'",
      [branch.id, c.id],
    );
    for (const [suffix, source] of [
      ['2', 'OVERRIDE'],
      ['3', 'SPECIAL_SELECTED'],
    ]) {
      await ds.query(
        "INSERT INTO unit_applicable_compliance(branch_id,compliance_id,is_applicable,source,override_reason) VALUES ($1,$2,true,$3,'Reviewed and retained')",
        ['77777777-7777-4777-8777-77777777777' + suffix, c.id, source],
      );
    }
  }
  await ds.query(migration);
  await ds.query(migration);
  const links = await ds.query(
    "SELECT pc.included_by_default FROM package_compliance pc JOIN compliance_package p ON p.id=pc.package_id JOIN unit_compliance_master c ON c.id=pc.compliance_id WHERE p.code='DEFAULT_INDIA' AND c.code=ANY($1)",
    [codes],
  );
  assert.equal(links.length, 5);
  assert.ok(links.every((r) => r.included_by_default === false));
  assert.equal(
    Number(
      (
        await ds.query(
          "SELECT count(*) n FROM unit_applicability_audit WHERE action='REGISTER_REVIEW_REQUIRED'",
        )
      )[0].n,
    ),
    5,
  );
  const manual = await ds.query(
    "SELECT * FROM unit_applicable_compliance WHERE override_reason='Reviewed and retained'",
  );
  assert.equal(manual.length, 10);
  assert.ok(
    manual.every(
      (r) =>
        r.is_applicable && ['OVERRIDE', 'SPECIAL_SELECTED'].includes(r.source),
    ),
  );
  const areas = [
    ['units', 'unit-facts', 'UnitFactsEntity'],
    ['units', 'unit-applicable-compliance', 'UnitApplicableComplianceEntity'],
    ['units', 'unit-applicability-audit', 'UnitApplicabilityAuditEntity'],
    ['masters', 'package-compliance', 'PackageComplianceEntity'],
    ['masters', 'package-rule', 'PackageRuleEntity'],
    ['masters', 'applicability-rule', 'ApplicabilityRuleEntity'],
    ['masters', 'compliance-package', 'CompliancePackageEntity'],
    ['masters', 'unit-compliance-master', 'UnitComplianceMasterEntity'],
  ];
  const entities = areas.map(
    ([a, f, n]) => require('../src/' + a + '/entities/' + f + '.entity')[n],
  );
  const appDs = new DataSource({ ...ds.options, entities, synchronize: false });
  await appDs.initialize();
  try {
    const repos = entities.map((e) => appDs.getRepository(e));
    const engine = new ApplicabilityEngineService(
      ...repos.slice(0, 7),
      new RuleEvaluatorService(),
    );
    const overrides = new UnitApplicabilityService(
      repos[1],
      repos[2],
      repos[7],
    );
    for (const [sourceId, formNumber] of [
      ['cw', 'V'],
      ['osh', 'XVI'],
      ['tsi', 'II + III'],
      ['mh', 'Q'],
      ['ss', 'XXII'],
    ]) {
      const form = REGISTER_FORMS.find(
        (f) => f.sourceId === sourceId && f.formNumber === formNumber,
      );
      const compliance = ids.find((c) => c.code === form.actCode);
      branch.stateCode =
        form.jurisdiction === 'CENTRAL' ? 'AP' : form.jurisdiction;
      await ds.query(
        "UPDATE unit_facts SET state_code=$2,appropriate_government=$3,updated_at='2026-09-01' WHERE branch_id=$1",
        [
          branch.id,
          branch.stateCode,
          form.jurisdiction === 'CENTRAL' ? 'CENTRAL' : 'STATE',
        ],
      );
      // Repair blocks the stale decision even before a recomputation runs.
      await assert.rejects(
        builder.context(form.id, branch.id, 2027, 12, admin),
        /applicability/,
      );
      await engine.recompute(branch.id, 'DEFAULT_INDIA', admin.id);
      assert.equal(
        (await overrides.getApplicable(branch.id)).find(
          (r) => r.complianceId === compliance.id,
        ).isApplicable,
        false,
      );
      await assert.rejects(
        builder.context(form.id, branch.id, 2027, 12, admin),
        /applicability/,
      );
      await overrides.applyOverrides(
        branch.id,
        [
          {
            complianceId: compliance.id,
            isApplicable: true,
            reason: 'Reviewed register applicability test',
          },
        ],
        admin.id,
      );
      await engine.recompute(branch.id, 'DEFAULT_INDIA', admin.id);
      await ds.query(migration);
      assert.equal(
        (await builder.context(form.id, branch.id, 2027, 12, admin)).form.id,
        form.id,
      );
      await overrides.applyOverrides(
        branch.id,
        [
          {
            complianceId: compliance.id,
            isApplicable: false,
            reason: 'Reviewed non-applicability test',
          },
        ],
        admin.id,
      );
      await engine.recompute(branch.id, 'DEFAULT_INDIA', admin.id);
      await assert.rejects(
        builder.context(form.id, branch.id, 2027, 12, admin),
        /applicability/,
      );
    }
  } finally {
    await appDs.destroy();
  }
};
