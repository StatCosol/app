import { readIssuedReport } from '../../audits/issued-report';
import { fieldworkAppendix } from '../../audits/audit-fieldwork-report';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { AuditEntity } from '../../audits/entities/audit.entity';
import { AuditDocumentReviewEntity } from '../../audits/entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from '../../audits/entities/audit-non-compliance.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { AutomationNotificationService } from './automation-notification.service';
import { generateAuditReportPdfBuffer } from '../../audits/utils/report-pdf';
import { actualAuditSql, isTestAudit } from '../../common/actual-records';

@Injectable()
export class AuditOutputEngineService {
  private readonly logger = new Logger(AuditOutputEngineService.name);

  constructor(
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly _reviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly _ncRepo: Repository<AuditNonComplianceEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly automationNotification: AutomationNotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Read the submitted audit assessment without changing it.
   * Submission owns scoring; NC progress must not rewrite the assessment.
   */
  async calculateAuditScore(
    auditId: string,
    manager?: EntityManager,
  ): Promise<{
    auditId: string;
    docScore: number | null;
    obsScore: number | null;
    blendedScore: number | null;
    totalDocs: number | null;
    compliedDocs: number | null;
  }> {
    const repo = manager?.getRepository(AuditEntity) ?? this.auditRepo;
    const audit = await repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    // The submitted assessment is historical. Corrections update their own
    // workflow, never recalculate from mutable findings or all-period documents.
    return {
      auditId,
      docScore: null,
      obsScore: null,
      blendedScore: audit.score,
      totalDocs: null,
      compliedDocs: null,
    };
  }

  /**
   * Generate audit report version (hook point).
   * Connects to the existing report-pdf utility.
   */
  async generateReportVersion(
    auditId: string,
    manager?: EntityManager,
    publishedOnly = false,
  ): Promise<{
    auditId: string;
    version: number;
    generatedAt: Date;
    pdfBuffer: Buffer | null;
    publishable: boolean;
  }> {
    const audit = await (
      manager?.getRepository(AuditEntity) ?? this.auditRepo
    ).findOne({
      where: { id: auditId },
      relations: ['client', 'branch', 'contractorUser'],
    });
    if (!audit) throw new NotFoundException('Audit not found');

    // Fetch the latest audit_reports record
    const reportRows = await (manager ?? this.dataSource).query(
      `SELECT ar.id, ar.executive_summary, ar.scope, ar.methodology,
              ar.findings, ar.recommendations, ar.report_type AS report_version,
              ar.selected_observation_ids, ar.finalized_at, ar.updated_at, ar.version_no,
              ar.status, ar.held_at, ar.approved_date, ar.published_date
       FROM audit_reports ar
       WHERE ar.audit_id = $1${publishedOnly ? " AND ar.status = 'PUBLISHED' AND ar.held_at IS NULL AND ar.report_type = 'CLIENT'" : ''}
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1${manager ? ' FOR UPDATE OF ar' : ''}`,
      [auditId],
    );
    const report = reportRows[0] ?? null;
    // Audit IDs are UUIDs; document_versions.document_id is a legacy bigint.
    // Rendering an existing report must not invent a new persisted version.
    const nextVersion = report?.version_no ?? 0;

    if (!report) {
      this.logger.warn(
        `No audit_reports record found for audit ${auditId}, skipping PDF generation`,
      );
      return {
        auditId,
        version: nextVersion,
        generatedAt: new Date(),
        pdfBuffer: null,
        publishable: false,
      };
    }

    if (report.status === 'PUBLISHED') {
      return {
        auditId,
        version: nextVersion,
        generatedAt: new Date(),
        pdfBuffer: await readIssuedReport(
          manager ?? this.dataSource,
          report.id,
        ),
        publishable: !report.held_at,
      };
    }

    // Fetch selected observations (or all if none selected)
    const selectedIds: string[] = Array.isArray(report.selected_observation_ids)
      ? report.selected_observation_ids
      : [];

    let obsQuery = `SELECT sequence_number, observation, clause, risk, status, recommendation,
                           consequences, compliance_requirements, elaboration, evidence_file_paths,
                           (SELECT name FROM audit_observation_categories c WHERE c.id = audit_observations.category_id) AS category_name
                    FROM audit_observations WHERE audit_id = $1`;
    const obsParams: unknown[] = [auditId];
    if (selectedIds.length) {
      obsQuery += ` AND id = ANY($2)`;
      obsParams.push(selectedIds);
    }
    obsQuery += ` ORDER BY sequence_number ASC, created_at ASC`;

    const obsRows = await (manager ?? this.dataSource).query(
      obsQuery,
      obsParams,
    );

    // Generate PDF
    let pdfBuffer: Buffer | null = null;
    try {
      const fieldwork = await fieldworkAppendix(
        manager ?? this.dataSource,
        auditId,
      );
      pdfBuffer = await generateAuditReportPdfBuffer({
        fieldwork,
        auditId,
        auditCode: audit.auditCode || audit.id,
        clientName: audit.client?.clientName || null,
        branchName: audit.branch?.branchName || null,
        contractorName: audit.contractorUser?.name || null,
        auditType: audit.auditType,
        periodCode: audit.periodCode || null,
        version: report.report_version === 'CLIENT' ? 'CLIENT' : 'INTERNAL',
        stage: 'FINAL',
        updatedAt: report.updated_at,
        finalizedAt: report.finalized_at,
        revision: report.version_no,
        reportStatus: report.status,
        approvedAt: report.approved_date,
        publishedAt: report.published_date,
        executiveSummary: report.executive_summary || '',
        scope: report.scope || '',
        methodology: report.methodology || '',
        findings: report.findings || '',
        recommendations: report.recommendations || '',
        observations: (obsRows || []).map(
          (o: {
            sequence_number: number | null;
            observation: string;
            clause: string | null;
            risk: string | null;
            status: string;
            recommendation: string | null;
            consequences: string | null;
            compliance_requirements: string | null;
            elaboration: string | null;
            evidence_file_paths: string | null;
            category_name: string | null;
          }) => ({
            sequenceNumber: o.sequence_number ?? null,
            observation: o.observation || '',
            clause: o.clause || null,
            risk: o.risk || null,
            status: o.status || 'OPEN',
            recommendation: o.recommendation || null,
            consequences: o.consequences,
            complianceRequirements: o.compliance_requirements,
            elaboration: o.elaboration,
            evidenceFilePaths: o.evidence_file_paths,
            categoryName: o.category_name,
          }),
        ),
      });

      this.logger.log(
        `PDF generated for audit ${auditId}, version ${nextVersion}, ${pdfBuffer.length} bytes`,
      );
    } catch (err: any) {
      this.logger.error(`PDF generation failed for audit ${auditId}`);
      throw err;
    }

    return {
      auditId,
      version: nextVersion,
      generatedAt: new Date(),
      pdfBuffer,
      publishable: report.status === 'PUBLISHED' && !report.held_at,
    };
  }

  /**
   * Push audit results to CRM and Client via notifications.
   */
  async publishToCrmAndClient(
    auditId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const audit = await (
      manager?.getRepository(AuditEntity) ?? this.auditRepo
    ).findOne({ where: { id: auditId } });
    if (!audit || isTestAudit(audit)) return;

    const auditCode = audit.auditCode || auditId.slice(0, 8);
    const scoreText = audit.score != null ? `${audit.score}%` : 'N/A';

    try {
      // Find CRM user assigned to this client
      const crmRows = await (manager ?? this.dataSource).query(
        `SELECT assigned_to_user_id FROM client_assignments_current
         WHERE client_id = $1 AND assignment_type = 'CRM'
           AND assigned_to_user_id IS NOT NULL
         LIMIT 1`,
        [audit.clientId],
      );
      const crmUserId =
        crmRows[0]?.assigned_to_user_id || audit.createdByUserId;

      // Notify CRM
      await this.notificationsService.createTicket(
        crmUserId,
        'CRM',
        {
          queryType: 'COMPLIANCE',
          subject: `Audit Correction Updated — ${auditCode} (${scoreText})`,
          message: `Audit ${auditCode} correction was reviewed. Submitted assessment: ${scoreText}.`,
          clientId: audit.clientId,
          branchId: audit.branchId || undefined,
        },
        manager,
      );

      // Find a client-portal user for this client
      const clientUserRows = await (manager ?? this.dataSource).query(
        `SELECT id FROM users
         WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 1`,
        [audit.clientId],
      );
      const clientUserId = clientUserRows[0]?.id || crmUserId;

      // Notify Client
      await this.notificationsService.createTicket(
        clientUserId,
        'CLIENT',
        {
          queryType: 'AUDIT',
          subject: `Audit Report Updated — ${auditCode} (${scoreText})`,
          message: `Audit ${auditCode} has been updated. Submitted assessment: ${scoreText}. The issued report remains unchanged.`,
          clientId: audit.clientId,
          branchId: audit.branchId || undefined,
        },
        manager,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish audit ${auditId} updates to CRM/Client`,
      );
      throw error;
    }
  }

  /**
   * Read the preserved assessment/report for correction follow-up.
   * Call this after reverification, resubmission, or any NC closure.
   */
  async refreshAuditOutputs(
    auditId: string,
    manager?: EntityManager,
  ): Promise<{
    score: Awaited<ReturnType<AuditOutputEngineService['calculateAuditScore']>>;
    report: Awaited<
      ReturnType<AuditOutputEngineService['generateReportVersion']>
    >;
  }> {
    const args: [string, EntityManager?] = manager
      ? [auditId, manager]
      : [auditId];
    const score = await this.calculateAuditScore(...args);
    const report = await this.generateReportVersion(...args);
    if (report.pdfBuffer && report.publishable)
      await this.publishToCrmAndClient(...args);

    // Push to notification center
    const audit = await (
      manager?.getRepository(AuditEntity) ?? this.auditRepo
    ).findOne({ where: { id: auditId } });
    if (
      audit &&
      !isTestAudit(audit) &&
      report.pdfBuffer &&
      report.publishable
    ) {
      await this.automationNotification.sendAuditReportReady(
        {
          auditId,
          auditCode: audit.auditCode || auditId.slice(0, 8),
          score: score.blendedScore,
          clientId: audit.clientId,
          branchId: audit.branchId,
        },
        manager,
      );
    }

    this.logger.log(
      `Audit output refreshed for ${auditId}, score=${score.blendedScore}`,
    );
    return { score, report };
  }

  /**
   * Get the latest (highest version) report for an audit.
   */
  async getLatestReport(auditId: string, publishedOnly = false): Promise<any> {
    const rows = await this.dataSource.query(
      `SELECT ar.*, u.name AS prepared_by_name
       FROM audit_reports ar
       LEFT JOIN users u ON u.id = ar.prepared_by_user_id
       WHERE ar.audit_id = $1${publishedOnly ? " AND ar.status = 'PUBLISHED' AND ar.held_at IS NULL AND ar.report_type = 'CLIENT'" : ''}
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1`,
      [auditId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      auditId: r.audit_id,
      versionNo: r.version_no,
      reportType: r.report_type,
      reportNumber: r.report_number,
      status: r.status,
      executiveSummary: r.executive_summary,
      scope: r.scope,
      methodology: r.methodology,
      findings: r.findings,
      recommendations: r.recommendations,
      docScore: r.doc_score,
      obsScore: r.obs_score,
      blendedScore: r.blended_score,
      scoreJson: r.score_json,
      preparedBy: r.prepared_by_name,
      preparedDate: r.prepared_date,
      approvedDate: r.approved_date,
      publishedDate: r.published_date,
      finalizedAt: r.finalized_at,
      createdAt: r.created_at,
    };
  }

  /**
   * Get full report history for an audit (all versions).
   */
  async getReportHistory(auditId: string): Promise<any[]> {
    const rows = await this.dataSource.query(
      `SELECT ar.*, u.name AS prepared_by_name
       FROM audit_reports ar
       LEFT JOIN users u ON u.id = ar.prepared_by_user_id
       WHERE ar.audit_id = $1
       ORDER BY ar.created_at DESC`,
      [auditId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      versionNo: (r.version_no as number | undefined) ?? null,
      reportType: r.report_type as string,
      status: r.status as string,
      blendedScore: (r.blended_score as number | null | undefined) ?? null,
      preparedBy: (r.prepared_by_name as string | null | undefined) ?? null,
      preparedDate: (r.prepared_date as string | null | undefined) ?? null,
      finalizedAt: (r.finalized_at as string | null | undefined) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  /**
   * Get CRM-level audit summaries for all clients assigned to a CRM.
   */
  async getCrmAuditSummaries(crmUserId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT c.id AS client_id, c.client_name AS client_name,
              COUNT(a.id)::int AS total_audits,
              COUNT(*) FILTER (WHERE a.status IN ('COMPLETED','CLOSED'))::int AS completed,
              COUNT(*) FILTER (WHERE a.status IN ('IN_PROGRESS','OPEN','SUBMITTED','CORRECTION_PENDING','REVERIFICATION_PENDING'))::int AS in_progress,
              COUNT(*) FILTER (WHERE a.status = 'PLANNED')::int AS scheduled,
              COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled,
              COUNT(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED'))::int AS scored_audits,
              COALESCE(SUM(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED')),0)::float AS score_total,
              ROUND(AVG(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED')),1)::float AS avg_score
       FROM clients c
       LEFT JOIN audits a ON a.client_id = c.id AND ${actualAuditSql('a')}
       WHERE COALESCE(c.is_deleted,false) = false
         AND EXISTS (SELECT 1 FROM client_assignments_current cac
           WHERE cac.client_id = c.id AND cac.assigned_to_user_id = $1 AND cac.assignment_type = 'CRM')
       GROUP BY c.id, c.client_name
       ORDER BY c.client_name`,
      [crmUserId],
    );
  }

  /**
   * Get Client-level audit summaries for a client (optionally per branch).
   */
  async getClientAuditSummaries(
    clientId: string,
    branchIds?: string[],
  ): Promise<any[]> {
    const aggregates = `COUNT(a.id)::int AS total_audits,
      COUNT(*) FILTER (WHERE a.status IN ('COMPLETED','CLOSED'))::int AS completed,
      COUNT(*) FILTER (WHERE a.status IN ('IN_PROGRESS','OPEN','SUBMITTED','CORRECTION_PENDING','REVERIFICATION_PENDING'))::int AS in_progress,
      COUNT(*) FILTER (WHERE a.status = 'PLANNED')::int AS scheduled,
      COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled,
      COUNT(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED'))::int AS scored_audits,
      COALESCE(SUM(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED')),0)::float AS score_total,
      ROUND(AVG(a.score) FILTER (WHERE a.status IN ('COMPLETED','CLOSED')),1)::float AS avg_score,
      MAX(a.updated_at) AS last_audit_date`;
    return this.dataSource.query(
      `WITH scoped_audits AS (
        SELECT a.* FROM audits a WHERE a.client_id = $1 AND ${actualAuditSql('a')}
        ${
          branchIds
            ? `AND (a.branch_id = ANY($2::uuid[]) OR (
          cardinality($2::uuid[]) > 0 AND a.branch_id IS NULL AND (
            a.contractor_user_id IS NULL OR EXISTS (SELECT 1 FROM branch_contractor bc
              WHERE bc.branch_id = ANY($2::uuid[]) AND bc.contractor_user_id = a.contractor_user_id))))`
            : ''
        }
      ) SELECT b.id AS branch_id, b.branchname AS branch_name, ${aggregates}
       FROM client_branches b
       LEFT JOIN scoped_audits a ON a.branch_id = b.id
       WHERE b.clientid = $1 AND b.deletedat IS NULL
         ${branchIds ? 'AND b.id = ANY($2::uuid[])' : ''}
       GROUP BY b.id, b.branchname
       UNION ALL
       SELECT NULL::uuid AS branch_id, 'Company-wide' AS branch_name, ${aggregates}
       FROM scoped_audits a WHERE a.branch_id IS NULL HAVING COUNT(a.id) > 0
       ORDER BY branch_name`,
      branchIds ? [clientId, branchIds] : [clientId],
    );
  }
}
