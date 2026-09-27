// Build first. Only connects to localhost and creates/drops its own disposable database.
// Minimal audit schemas exercise real TypeORM transactions/locks; delivery hooks are stubbed.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const {
  AdminReportsController,
} = require('../dist/src/admin/admin-reports.controller');
const { DataSource, EntitySchema } = require('typeorm');
const { AuditNcService } = require('../dist/src/audits/audit-nc.service');
const {
  AuditReportService,
} = require('../dist/src/audits/audit-report.service');
const { AuditEntity } = require('../dist/src/audits/entities/audit.entity');
const {
  AuditNonComplianceEntity,
} = require('../dist/src/audits/entities/audit-non-compliance.entity');
const {
  AuditResubmissionEntity,
} = require('../dist/src/audits/entities/audit-resubmission.entity');
const {
  AuditDocumentReviewEntity,
} = require('../dist/src/audits/entities/audit-document-review.entity');

const config = {
  host: '127.0.0.1',
  port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
  user: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
  password: process.env.AUDITXPERT_TEST_PASSWORD,
  database: 'postgres',
};
const database = `auditxpert_regression_${randomUUID().replaceAll('-', '')}`;
const admin = new Client(config);
const column = (name, type = 'text', nullable = true) => ({
  name,
  type,
  nullable,
});
const schema = (target, tableName, columns) =>
  new EntitySchema({
    target,
    name: target.name,
    tableName,
    columns: {
      id: { type: 'uuid', primary: true, generated: 'uuid' },
      ...columns,
    },
  });
const ds = new DataSource({
  ...config,
  username: config.user,
  database,
  type: 'postgres',
  synchronize: true,
  entities: [
    schema(AuditEntity, 'audits', {
      assignedAuditorId: column('assigned_auditor_id', 'uuid'),
      clientId: column('client_id', 'uuid'),
      status: column('status'),
    }),
    schema(AuditNonComplianceEntity, 'audit_non_compliances', {
      auditId: column('audit_id', 'uuid'),
      requestedToUserId: column('requested_to_user_id', 'uuid'),
      documentId: column('document_id', 'uuid'),
      sourceTable: column('source_table'),
      status: column('status'),
      remark: column('remark'),
      closedAt: column('closed_at', 'timestamptz'),
    }),
    schema(AuditResubmissionEntity, 'audit_resubmissions', {
      auditId: column('audit_id', 'uuid'),
      nonComplianceId: column('non_compliance_id', 'uuid'),
      documentId: column('document_id', 'uuid'),
      sourceTable: column('source_table'),
      filePath: column('file_path'),
      fileName: column('file_name'),
      mimeType: column('mime_type'),
      fileSize: column('file_size', 'bigint'),
      resubmittedBy: column('resubmitted_by', 'uuid'),
      resubmittedAt: {
        ...column('resubmitted_at', 'timestamptz'),
        default: () => 'CURRENT_TIMESTAMP',
      },
      createdAt: { ...column('created_at', 'timestamptz'), createDate: true },
      updatedAt: { ...column('updated_at', 'timestamptz'), updateDate: true },
      finalMark: column('final_mark'),
      auditorRemark: column('auditor_remark'),
      reviewedBy: column('reviewed_by', 'uuid'),
      reviewedAt: column('reviewed_at', 'timestamptz'),
    }),
    schema(AuditDocumentReviewEntity, 'audit_document_reviews', {
      auditId: column('audit_id', 'uuid'),
      documentId: column('document_id', 'uuid'),
      sourceTable: column('source_table'),
      complianceMark: column('compliance_mark'),
      auditorRemark: column('auditor_remark'),
      version: column('version', 'int'),
      reviewedBy: column('reviewed_by', 'uuid'),
      reviewedAt: column('reviewed_at', 'timestamptz'),
    }),
  ],
});
const auditor = { userId: randomUUID(), roleCode: 'AUDITOR' };
const vendor = { userId: randomUUID(), roleCode: 'CONTRACTOR' };
const crm = { userId: randomUUID(), roleCode: 'CRM' };
const auditId = randomUUID(),
  ncId = randomUUID(),
  documentId = randomUUID();
const file = {
  path: 'fictional-proof.pdf',
  originalname: 'fictional-proof.pdf',
  mimetype: 'application/pdf',
  size: 100,
};
const nc = Object.assign(Object.create(AuditNcService.prototype), {
  dataSource: ds,
  ncEngine: { closeNc: async () => {}, createTaskForNc: async () => {} },
  auditOutputEngine: { refreshAuditOutputs: async () => {} },
  auditLogs: { log: async () => {} },
});
const auditRepo = () => ds.getRepository(AuditEntity);
const ncRepo = () => ds.getRepository(AuditNonComplianceEntity);
const resubRepo = () => ds.getRepository(AuditResubmissionEntity);
const reportService = (source) =>
  new AuditReportService(
    { findOne: ({ where }) => auditRepo().findOneBy(where) },
    {},
    source,
    { isClientAssignedToCrm: async () => true },
  );
async function reset() {
  await ds.query(
    'TRUNCATE audits,audit_non_compliances,audit_resubmissions,audit_document_reviews,contractor_documents,audit_reports',
  );
  await auditRepo().save({
    id: auditId,
    assignedAuditorId: auditor.userId,
    clientId: randomUUID(),
    status: 'CORRECTION_PENDING',
  });
  await ncRepo().save({
    id: ncId,
    auditId,
    requestedToUserId: vendor.userId,
    documentId,
    sourceTable: 'contractor_documents',
    status: 'NC_RAISED',
    remark: 'Missing proof',
  });
  await ds.query(
    "INSERT INTO contractor_documents(id,status) VALUES($1,'REJECTED')",
    [documentId],
  );
}
let passed = 0;
async function test(name, run) {
  await reset();
  await run();
  passed++;
  console.log('PASS: ' + name);
}
async function main() {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  await ds.initialize();
  await ds.query(
    'CREATE TABLE contractor_documents(id uuid PRIMARY KEY,status text NOT NULL,review_notes text,reviewed_by_user_id uuid,reviewed_at timestamptz)',
  );
  await ds.query(
    'CREATE TABLE audit_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid,status text,approved_by_user_id uuid,approved_date date,published_date date,updated_at timestamptz DEFAULT NOW(),created_at timestamptz DEFAULT NOW())',
  );
  const migration = readFileSync(
    join(__dirname, '../migrations/20260927_audit_report_hold.sql'),
    'utf8',
  );
  await ds.query(migration);
  await ds.query(migration);

  await test('missing upload cannot close an NC or audit', async () => {
    await assert.rejects(
      nc.reviewCorrectedDocument(auditor, ncId, 'COMPLIED'),
      /upload/,
    );
    assert.equal(
      (await auditRepo().findOneBy({ id: auditId })).status,
      'CORRECTION_PENDING',
    );
  });
  await test('simultaneous uploads create exactly one pending correction', async () => {
    const results = await Promise.allSettled([
      nc.uploadCorrectedFile(vendor, ncId, file),
      nc.uploadCorrectedFile(vendor, ncId, file),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await resubRepo().count(), 1);
    assert.equal(
      (await auditRepo().findOneBy({ id: auditId })).status,
      'REVERIFICATION_PENDING',
    );
  });
  await test('simultaneous reviews cannot double-review the same upload', async () => {
    await nc.uploadCorrectedFile(vendor, ncId, file);
    const results = await Promise.allSettled([
      nc.reviewCorrectedDocument(auditor, ncId, 'COMPLIED'),
      nc.reviewCorrectedDocument(auditor, ncId, 'COMPLIED'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await ds.getRepository(AuditDocumentReviewEntity).count(), 1);
    assert.equal(
      (await auditRepo().findOneBy({ id: auditId })).status,
      'CLOSED',
    );
  });
  await test('simultaneous acceptance of the last two NCs closes the parent audit', async () => {
    const second = randomUUID();
    await ncRepo().save({
      id: second,
      auditId,
      requestedToUserId: vendor.userId,
      status: 'NC_RAISED',
    });
    await nc.uploadCorrectedFile(vendor, ncId, file);
    await nc.uploadCorrectedFile(vendor, second, file);
    await Promise.all([
      nc.reviewCorrectedDocument(auditor, ncId, 'COMPLIED'),
      nc.reviewCorrectedDocument(auditor, second, 'COMPLIED'),
    ]);
    assert.equal(
      (await auditRepo().findOneBy({ id: auditId })).status,
      'CLOSED',
    );
    assert.equal(await ncRepo().countBy({ status: 'ACCEPTED' }), 2);
  });
  await test('rejection persists audit state and allows a new correction', async () => {
    await nc.uploadCorrectedFile(vendor, ncId, file);
    await nc.reviewCorrectedDocument(
      auditor,
      ncId,
      'NON_COMPLIED',
      'Missing signed proof',
    );
    assert.equal(
      (await auditRepo().findOneBy({ id: auditId })).status,
      'CORRECTION_PENDING',
    );
    assert.equal(
      (await resubRepo().findOneBy({ nonComplianceId: ncId })).finalMark,
      'NON_COMPLIED',
    );
    await nc.uploadCorrectedFile(vendor, ncId, file);
    await nc.reviewCorrectedDocument(auditor, ncId, 'COMPLIED');
    assert.equal(await ds.getRepository(AuditDocumentReviewEntity).count(), 2);
  });
  await test('database error rolls back every review write', async () => {
    await nc.uploadCorrectedFile(vendor, ncId, file);
    await ds.query(
      "CREATE FUNCTION fail_sample_review() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'sample history failure'; END $$ LANGUAGE plpgsql",
    );
    await ds.query(
      'CREATE TRIGGER fail_sample_review BEFORE INSERT ON audit_document_reviews FOR EACH ROW EXECUTE FUNCTION fail_sample_review()',
    );
    try {
      await assert.rejects(
        nc.reviewCorrectedDocument(
          auditor,
          ncId,
          'NON_COMPLIED',
          'Missing proof',
        ),
        /sample history failure/,
      );
      assert.equal(
        (await auditRepo().findOneBy({ id: auditId })).status,
        'REVERIFICATION_PENDING',
      );
      assert.equal(
        (await ncRepo().findOneBy({ id: ncId })).status,
        'REUPLOADED',
      );
      assert.equal(
        (await resubRepo().findOneBy({ nonComplianceId: ncId })).finalMark,
        null,
      );
      assert.equal(
        (await ds.query('SELECT status FROM contractor_documents'))[0].status,
        'REJECTED',
      );
    } finally {
      await ds.query(
        'DROP TRIGGER fail_sample_review ON audit_document_reviews',
      );
      await ds.query('DROP FUNCTION fail_sample_review()');
    }
  });
  await test('report hold survives reload and must be released before publishing', async () => {
    await ds.query(
      "INSERT INTO audit_reports(audit_id,status) VALUES($1,'SUBMITTED')",
      [auditId],
    );
    const reports = reportService(ds);
    await reports.holdReportForCrm(crm, auditId, 'Awaiting signed proof');
    assert.equal(
      (await reports.getReportStatusForCrm(crm, auditId)).held,
      true,
    );
    await assert.rejects(reports.publishReportForCrm(crm, auditId), /hold/);
    await reports.releaseReportHoldForCrm(crm, auditId);
    await reports.approveReportForCrm(crm, auditId);
    await reports.publishReportForCrm(crm, auditId);
    assert.equal(
      (await reports.getReportStatusForCrm(crm, auditId)).status,
      'PUBLISHED',
    );
  });
  await test('a hold placed after approval reads is detected with real TypeORM SQL results', async () => {
    await ds.query(
      "INSERT INTO audit_reports(audit_id,status) VALUES($1,'SUBMITTED')",
      [auditId],
    );
    const reports = reportService({
      query: async (sql, params) => {
        if (sql.startsWith('WITH changed'))
          await ds.query(
            'UPDATE audit_reports SET held_at=NOW() WHERE audit_id=$1',
            [auditId],
          );
        return ds.query(sql, params);
      },
    });
    await assert.rejects(
      reports.approveReportForCrm(crm, auditId),
      /Report changed/,
    );
    assert.equal(
      (await ds.query('SELECT status FROM audit_reports'))[0].status,
      'SUBMITTED',
    );
  });
  for (const action of ['approve', 'publish']) {
    await test(`admin ${action} rejects a concurrent CRM hold`, async () => {
      const status = action === 'approve' ? 'SUBMITTED' : 'APPROVED';
      const [report] = await ds.query(
        'INSERT INTO audit_reports(audit_id,status) VALUES($1,$2) RETURNING id',
        [auditId, status],
      );
      const controller = new AdminReportsController({
        query: async (sql, params) => {
          if (sql.startsWith('WITH changed'))
            await ds.query(
              'UPDATE audit_reports SET held_at=NOW() WHERE id=$1',
              [report.id],
            );
          return ds.query(sql, params);
        },
      });
      await assert.rejects(
        action === 'approve'
          ? controller.approveAuditReport(report.id, crm)
          : controller.publishAuditReport(report.id),
        /Report changed/,
      );
      assert.equal(
        (
          await ds.query('SELECT status FROM audit_reports WHERE id=$1', [
            report.id,
          ])
        )[0].status,
        status,
      );
    });
  }
  await test('HTTP hold/release routing, admin transitions, role guards and corrected-review validation', async () => {
    const { Test } = require('@nestjs/testing');
    const { VersioningType } = require('@nestjs/common');
    const request = require('supertest');
    const { AuditsService } = require('../dist/src/audits/audits.service');
    const {
      CrmAuditsController,
      AuditorAuditsController,
    } = require('../dist/src/audits/audits.controller');
    const { JwtAuthGuard } = require('../dist/src/auth/jwt-auth.guard');
    const {
      BranchAccessService,
    } = require('../dist/src/auth/branch-access.service');
    const {
      AssignmentsService,
    } = require('../dist/src/assignments/assignments.service');
    const {
      AuditOutputEngineService,
    } = require('../dist/src/automation/services/audit-output-engine.service');
    const {
      createGlobalValidationPipe,
    } = require('../dist/src/common/validators/global-validation-pipe');
    const facade = Object.assign(Object.create(AuditsService.prototype), {
      reportService: reportService(ds),
      ncService: nc,
      onModuleInit: async () => {},
    });
    const module = await Test.createTestingModule({
      controllers: [
        CrmAuditsController,
        AuditorAuditsController,
        AdminReportsController,
      ],
      providers: [
        { provide: AuditsService, useValue: facade },
        { provide: DataSource, useValue: ds },
        { provide: BranchAccessService, useValue: {} },
        { provide: AuditOutputEngineService, useValue: {} },
        {
          provide: AssignmentsService,
          useValue: { isClientAssignedToAuditor: async () => true },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          const req = context.switchToHttp().getRequest();
          req.user =
            req.headers['x-test-role'] === 'AUDITOR'
              ? auditor
              : req.headers['x-test-role'] === 'ADMIN'
                ? { ...crm, roleCode: 'ADMIN' }
                : crm;
          return true;
        },
      })
      .compile();
    const app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(createGlobalValidationPipe());
    try {
      await app.listen(0, '127.0.0.1');
      const server = app.getHttpServer(),
        base = `/api/v1/crm/audits/${auditId}`;
      await ds.query(
        "INSERT INTO audit_reports(audit_id,status) VALUES($1,'SUBMITTED')",
        [auditId],
      );
      await request(server)
        .post(`${base}/report/hold`)
        .send({ remarks: 'Awaiting evidence' })
        .expect(201);
      assert.equal(
        (await request(server).get(`${base}/report-status`).expect(200)).body
          .held,
        true,
      );
      await request(server).post(`${base}/report/approve`).send({}).expect(400);
      const reportId = (await ds.query('SELECT id FROM audit_reports'))[0].id;
      const adminBase = `/api/v1/admin/reports/audit-reports/${reportId}`;
      await request(server)
        .patch(`${adminBase}/approve`)
        .set('x-test-role', 'ADMIN')
        .expect(400);
      await request(server)
        .post(`${base}/report/release-hold`)
        .set('x-test-role', 'AUDITOR')
        .send({})
        .expect(403);
      assert.equal(
        (
          await request(server)
            .post(`${base}/report/release-hold`)
            .send({})
            .expect(201)
        ).body.held,
        false,
      );
      await request(server)
        .patch(`${adminBase}/approve`)
        .set('x-test-role', 'ADMIN')
        .expect(200);
      await request(server)
        .post(`${base}/report/hold`)
        .send({ remarks: 'Hold before publication' })
        .expect(201);
      await request(server)
        .patch(`${adminBase}/publish`)
        .set('x-test-role', 'ADMIN')
        .expect(400);
      await request(server)
        .post(`${base}/report/release-hold`)
        .send({})
        .expect(201);
      await request(server)
        .patch(`${adminBase}/publish`)
        .set('x-test-role', 'ADMIN')
        .expect(200);
      for (const body of [
        {},
        { decision: 'INVALID' },
        { decision: 'COMPLIED', remark: 42 },
      ]) {
        await request(server)
          .post(`/api/v1/auditor/audits/non-compliances/${ncId}/review`)
          .set('x-test-role', 'AUDITOR')
          .send(body)
          .expect(400);
      }
      assert.equal(
        (await ncRepo().findOneBy({ id: ncId })).status,
        'NC_RAISED',
      );
    } finally {
      await app.close();
    }
  });
  console.log(`RESULT: ${passed} real PostgreSQL/TypeORM checks passed`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ds.isInitialized) await ds.destroy();
    if (!/^auditxpert_regression_[0-9a-f]{32}$/.test(database))
      throw new Error('Unsafe cleanup target');
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`).catch(() => {});
    await admin.end();
  });
