const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { ApplicabilityEngineService } = require('../src/units/services/applicability-engine.service');
const { UnitApplicabilityService } = require('../src/units/services/unit-applicability.service');
const { RuleEvaluatorService } = require('../src/units/services/rule-evaluator.service');
const { REGISTER_FORMS } = require('../src/payroll/register-library/register-catalogue');

module.exports = async function verifySocialSecurity(ds, builder, branch, admin, backend) {
  const migrationName = '20260924_social_security_register_applicability.sql';
  const runner = await fs.readFile(path.join(backend, 'scripts/apply-service-entitlements-migrations.mjs'), 'utf8');
  assert.ok(runner.includes("'" + migrationName + "'"), 'Migration must run before deployment');
  const migration = await fs.readFile(path.join(backend, 'migrations', migrationName), 'utf8');
  await ds.query(migration);
  await ds.query(migration);
  const identities = await ds.query("SELECT c.id, c.is_active, pc.included_by_default FROM unit_compliance_master c JOIN package_compliance pc ON pc.compliance_id=c.id JOIN compliance_package p ON p.id=pc.package_id WHERE c.code='SOCIAL_SECURITY_2020' AND p.code='DEFAULT_INDIA'");
  assert.equal(identities.length, 1);
  assert.equal(identities[0].is_active, true);
  assert.equal(identities[0].included_by_default, false);
  const complianceId = identities[0].id;
  const names = [
    ['units', 'unit-facts', 'UnitFactsEntity'],
    ['units', 'unit-applicable-compliance', 'UnitApplicableComplianceEntity'],
    ['units', 'unit-applicability-audit', 'UnitApplicabilityAuditEntity'],
    ['masters', 'package-compliance', 'PackageComplianceEntity'],
    ['masters', 'package-rule', 'PackageRuleEntity'],
    ['masters', 'applicability-rule', 'ApplicabilityRuleEntity'],
    ['masters', 'compliance-package', 'CompliancePackageEntity'],
    ['masters', 'unit-compliance-master', 'UnitComplianceMasterEntity'],
  ];
  const entities = names.map(([area, file, name]) => require('../src/' + area + '/entities/' + file + '.entity')[name]);
  const appDs = new DataSource({ ...ds.options, entities, synchronize: false });
  await appDs.initialize();
  try {
    const repos = entities.map(entity => appDs.getRepository(entity));
    const engine = new ApplicabilityEngineService(...repos.slice(0, 7), new RuleEvaluatorService());
    const overrides = new UnitApplicabilityService(repos[1], repos[2], repos[7]);
    const forms = REGISTER_FORMS.filter(f => f.actCode === 'SOCIAL_SECURITY_2020');
    assert.deepEqual(new Set(forms.map(f => f.jurisdiction)), new Set(['CENTRAL', 'AP', 'BR', 'UP']));
    for (const form of forms) {
      branch.stateCode = form.jurisdiction === 'CENTRAL' ? 'AP' : form.jurisdiction;
      const government = form.jurisdiction === 'CENTRAL' ? 'CENTRAL' : 'STATE';
      await ds.query("UPDATE unit_facts SET state_code=$2,appropriate_government=$3,updated_at='2026-09-01' WHERE branch_id=$1", [branch.id, branch.stateCode, government]);
      await ds.query('DELETE FROM unit_applicable_compliance WHERE branch_id=$1 AND compliance_id=$2', [branch.id, complianceId]);
      await engine.recompute(branch.id, 'DEFAULT_INDIA', admin.id);
      const row = (await overrides.getApplicable(branch.id)).find(r => r.compliance.code === form.actCode);
      assert.ok(row, 'Recomputation must expose the identity in the override screen');
      assert.equal(row.isApplicable, false);
      await assert.rejects(builder.context(form.id, branch.id, 2027, 12, admin), /SOCIAL_SECURITY_2020 applicability/);
      await overrides.applyOverrides(branch.id, [{complianceId, isApplicable: true, reason: 'Reviewed fictional Social Security applicability'}], admin.id);
      await engine.recompute(branch.id, 'DEFAULT_INDIA', admin.id);
      assert.equal((await builder.context(form.id, branch.id, 2027, 12, admin)).form.id, form.id);
      await ds.query(migration);
      assert.equal((await builder.context(form.id, branch.id, 2027, 12, admin)).form.id, form.id);
      await overrides.applyOverrides(branch.id, [{complianceId, isApplicable: false, reason: 'Reviewed fictional non-applicability'}], admin.id);
      await assert.rejects(builder.context(form.id, branch.id, 2027, 12, admin), /SOCIAL_SECURITY_2020 applicability/);
    }
    assert.equal(Number((await ds.query("SELECT count(*) n FROM unit_applicability_audit WHERE action='OVERRIDE_APPLIED'"))[0].n), 8);
  } finally {
    await appDs.destroy();
  }
};
