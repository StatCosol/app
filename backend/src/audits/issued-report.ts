import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { fieldworkAppendix } from './audit-fieldwork-report';
import { generateAuditReportPdfBuffer } from './utils/report-pdf';

type Db = { query(sql: string, params?: any[]): Promise<any> };

export async function readIssuedReport(
  db: Db,
  reportId: string,
): Promise<Buffer> {
  const [row] = await db.query(
    'SELECT pdf, sha256 FROM audit_report_publications WHERE report_id=$1',
    [reportId],
  );
  if (!row)
    throw new BadRequestException(
      'The archived PDF is unavailable for this legacy report. Reopen and publish a new revision; issued reports cannot be rebuilt from current findings.',
    );
  const pdf = Buffer.from(row.pdf);
  if (createHash('sha256').update(pdf).digest('hex') !== row.sha256)
    throw new BadRequestException(
      'Archived report integrity check failed. Contact support.',
    );
  return pdf;
}

/** Called only inside publication's transaction, with the audit and report locked. */
export async function archiveIssuedReport(
  db: Db,
  reportId: string,
  actorId: string | null,
) {
  const [r] = await db.query(
    `SELECT r.*, a.audit_code, a.audit_type, a.period_code, a.score,
    c.client_name, b.branchname AS branch_name, u.name AS contractor_name
    FROM audit_reports r JOIN audits a ON a.id=r.audit_id
    JOIN clients c ON c.id=a.client_id LEFT JOIN client_branches b ON b.id=a.branch_id
    LEFT JOIN users u ON u.id=a.contractor_user_id WHERE r.id=$1`,
    [reportId],
  );
  if (!r || r.status !== 'PUBLISHED')
    throw new BadRequestException('Report is not published');
  const ids = Array.isArray(r.selected_observation_ids)
    ? r.selected_observation_ids
    : [];
  const observations = await db.query(
    `SELECT o.*, c.name AS category_name FROM audit_observations o
    LEFT JOIN audit_observation_categories c ON c.id=o.category_id
    WHERE o.audit_id=$1 AND ($2::uuid[] = '{}'::uuid[] OR o.id=ANY($2::uuid[]))
    ORDER BY o.sequence_number, o.created_at, o.id`,
    [r.audit_id, ids],
  );
  const pdf = await generateAuditReportPdfBuffer({
    auditId: r.audit_id,
    auditCode: r.audit_code || r.audit_id,
    clientName: r.client_name,
    branchName: r.branch_name,
    contractorName: r.contractor_name,
    auditType: r.audit_type,
    periodCode: r.period_code,
    version: r.report_type === 'CLIENT' ? 'CLIENT' : 'INTERNAL',
    stage: 'FINAL',
    updatedAt: r.updated_at,
    finalizedAt: r.finalized_at,
    revision: r.version_no,
    reportStatus: r.status,
    approvedAt: r.approved_date,
    publishedAt: r.published_date,
    executiveSummary: r.executive_summary || '',
    scope: r.scope || '',
    methodology: r.methodology || '',
    findings: r.findings || '',
    recommendations: r.recommendations || '',
    fieldwork: await fieldworkAppendix(db, r.audit_id),
    observations: observations.map((o: any) => ({
      sequenceNumber: o.sequence_number,
      observation: o.observation,
      clause: o.clause,
      risk: o.risk,
      status: o.status,
      recommendation: o.recommendation,
      consequences: o.consequences,
      complianceRequirements: o.compliance_requirements,
      elaboration: o.elaboration,
      evidenceFilePaths: o.evidence_file_paths,
      categoryName: o.category_name,
    })),
  });
  await db.query(
    `INSERT INTO audit_report_publications(report_id, pdf, sha256, assessment_score, published_by)
    VALUES ($1,$2,$3,$4,$5)`,
    [
      reportId,
      pdf,
      createHash('sha256').update(pdf).digest('hex'),
      r.score,
      actorId,
    ],
  );
}
