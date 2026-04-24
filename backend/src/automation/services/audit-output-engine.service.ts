import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AuditEntity } from '../../audits/entities/audit.entity';
import { AuditDocumentReviewEntity } from '../../audits/entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from '../../audits/entities/audit-non-compliance.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { AutomationNotificationService } from './automation-notification.service';
import { generateAuditReportPdfBuffer } from '../../audits/utils/report-pdf';

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
   * Recalculate audit score from document reviews.
   * Uses the same blended formula as submitAudit (50% observation + 50% document).
   */
  async calculateAuditScore(auditId: string): Promise<{
    auditId: string;
    docScore: number;
    obsScore: number;
    blendedScore: number;
    totalDocs: number;
    compliedDocs: number;
  }> {
    const audit = await this.auditRepo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    // Document compliance score
    const branchDocStats = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS complied
       FROM branch_documents
       WHERE branch_id = $1 AND client_id = $2
         AND reviewed_by IS NOT NULL AND status IN ('APPROVED','REJECTED')`,
      [
        audit.branchId || '00000000-0000-0000-0000-000000000000',
        audit.clientId,
      ],
    );
    const ctrDocStats = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS complied
       FROM contractor_documents WHERE audit_id = $1`,
      [auditId],
    );
    const bS = branchDocStats[0] || { total: 0, complied: 0 };
    const cS = ctrDocStats[0] || { total: 0, complied: 0 };
    const totalDocs = bS.total + cS.total;
    const compliedDocs = bS.complied + cS.complied;
    const docScore =
      totalDocs > 0 ? Math.round((compliedDocs / totalDocs) * 100) : 100;

    // Observation-based score (from audit_observations)
    const obsRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLIED')::int AS complied
       FROM audit_observations WHERE audit_id = $1`,
      [auditId],
    );
    const obs = obsRows[0] || { total: 0, complied: 0 };
    const obsScore =
      obs.total > 0 ? Math.round((obs.complied / obs.total) * 100) : 100;

    const blendedScore = Math.round((obsScore + docScore) / 2);

    // Update audit record
    audit.score = blendedScore;
    audit.scoreCalculatedAt = new Date();
    await this.auditRepo.save(audit);

    this.logger.log(
      `Score recalculated for audit ${auditId}: doc=${docScore}, obs=${obsScore}, blended=${blendedScore}`,
    );

    return {
      auditId,
      docScore,
      obsScore,
      blendedScore,
      totalDocs,
      compliedDocs,
    };
  }

  /**
   * Generate audit report version (hook point).
   * Connects to the existing report-pdf utility.
   */
  async generateReportVersion(auditId: string): Promise<{
    auditId: string;
    version: number;
    generatedAt: Date;
    pdfBuffer: Buffer | null;
  }> {
    const audit = await this.auditRepo.findOne({
      where: { id: auditId },
      relations: ['client', 'branch'],
    });
    if (!audit) throw new NotFoundException('Audit not found');

    // Count existing report versions
    const versionRows = await this.dataSource.query(
      `SELECT COALESCE(MAX(version_no), 0)::int AS max_version
       FROM document_versions
       WHERE document_id = (SELECT id::bigint FROM audits WHERE id = $1 LIMIT 1)
         AND document_type = 'AUDIT_REPORT'`,
      [auditId],
    );
    const nextVersion = (versionRows[0]?.max_version ?? 0) + 1;

    // Fetch the latest audit_reports record
    const reportRows = await this.dataSource.query(
      `SELECT ar.executive_summary, ar.scope, ar.methodology,
              ar.findings, ar.recommendations, ar.version AS report_version,
              ar.selected_observation_ids, ar.finalized_at, ar.updated_at
       FROM audit_reports ar
       WHERE ar.audit_id = $1
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const report = reportRows[0] ?? null;

    if (!report) {
      this.logger.warn(
        `No audit_reports record found for audit ${auditId}, skipping PDF generation`,
      );
      return {
        auditId,
        version: nextVersion,
        generatedAt: new Date(),
        pdfBuffer: null,
      };
    }

    // Fetch selected observations (or all if none selected)
    const selectedIds: string[] = Array.isArray(report.selected_observation_ids)
      ? report.selected_observation_ids
      : [];

    let obsQuery = `SELECT sequence_number, observation, clause, risk, status, recommendation
                    FROM audit_observations WHERE audit_id = $1`;
    const obsParams: unknown[] = [auditId];
    if (selectedIds.length) {
      obsQuery += ` AND id = ANY($2)`;
      obsParams.push(selectedIds);
    }
    obsQuery += ` ORDER BY sequence_number ASC, created_at ASC`;

    const obsRows = await this.dataSource.query(obsQuery, obsParams);

    // Generate PDF
    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await generateAuditReportPdfBuffer({
        auditId,
        auditCode: audit.auditCode || audit.id,
        clientName: audit.client?.clientName || null,
        branchName: audit.branch?.branchName || null,
        periodCode: audit.periodCode || null,
        version: report.report_version === 'CLIENT' ? 'CLIENT' : 'INTERNAL',
        stage: 'FINAL',
        updatedAt: report.updated_at,
        finalizedAt: report.finalized_at,
        executiveSummary: report.executive_summary || '',
        scope: report.scope || '',
        methodology: report.methodology || '',
        findings: report.findings || '',
        recommendations: report.recommendations || '',
        observations: (obsRows || []).map((o: { sequence_number: number | null; observation: string; clause: string | null; risk: string | null; status: string; recommendation: string | null }) => ({
          sequenceNumber: o.sequence_number ?? null,
          observation: o.observation || '',
          clause: o.clause || null,
          risk: o.risk || null,
          status: o.status || 'OPEN',
          recommendation: o.recommendation || null,
        })),
      });

      this.logger.log(
        `PDF generated for audit ${auditId}, version ${nextVersion}, ${pdfBuffer.length} bytes`,
      );
    } catch (err: any) {
      this.logger.error(
        `PDF generation failed for audit ${auditId}: ${err.message}`,
      );
    }

    return {
      auditId,
      version: nextVersion,
      generatedAt: new Date(),
      pdfBuffer,
    };
  }

  /**
   * Push audit results to CRM and Client via notifications.
   */
  async publishToCrmAndClient(auditId: string): Promise<void> {
    const audit = await this.auditRepo.findOne({ where: { id: auditId } });
    if (!audit) return;

    const auditCode = audit.auditCode || auditId.slice(0, 8);
    const scoreText = audit.score != null ? `${audit.score}%` : 'N/A';

    try {
      // Find CRM user assigned to this client
      const crmRows = await this.dataSource.query(
        `SELECT assigned_to_user_id FROM client_assignments_current
         WHERE client_id = $1 AND assignment_type = 'CRM'
           AND assigned_to_user_id IS NOT NULL
         LIMIT 1`,
        [audit.clientId],
      );
      const crmUserId =
        crmRows[0]?.assigned_to_user_id || audit.createdByUserId;

      // Notify CRM
      await this.notificationsService.createTicket(crmUserId, 'CRM', {
        queryType: 'COMPLIANCE',
        subject: `Audit Score Updated — ${auditCode} (${scoreText})`,
        message: `Audit ${auditCode} score has been recalculated to ${scoreText} after reverification.`,
        clientId: audit.clientId,
        branchId: audit.branchId || undefined,
      });

      // Find a client-portal user for this client
      const clientUserRows = await this.dataSource.query(
        `SELECT id FROM users
         WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 1`,
        [audit.clientId],
      );
      const clientUserId = clientUserRows[0]?.id || crmUserId;

      // Notify Client
      await this.notificationsService.createTicket(clientUserId, 'CLIENT', {
        queryType: 'AUDIT',
        subject: `Audit Report Updated — ${auditCode} (${scoreText})`,
        message: `Audit ${auditCode} has been updated. New score: ${scoreText}. View the latest report from your Audits page.`,
        clientId: audit.clientId,
        branchId: audit.branchId || undefined,
      });
    } catch {
      this.logger.warn(
        `Failed to publish audit ${auditId} updates to CRM/Client`,
      );
    }
  }

  /**
   * Full refresh: recalculate score, generate report, publish.
   * Call this after reverification, resubmission, or any NC closure.
   */
  async refreshAuditOutputs(auditId: string): Promise<{
    score: Awaited<ReturnType<AuditOutputEngineService['calculateAuditScore']>>;
    report: Awaited<
      ReturnType<AuditOutputEngineService['generateReportVersion']>
    >;
  }> {
    const score = await this.calculateAuditScore(auditId);
    const report = await this.generateReportVersion(auditId);
    await this.publishToCrmAndClient(auditId);

    // Push to notification center
    const audit = await this.auditRepo.findOne({ where: { id: auditId } });
    if (audit) {
      await this.automationNotification.sendAuditReportReady({
        auditId,
        auditCode: audit.auditCode || auditId.slice(0, 8),
        score: score.blendedScore,
        clientId: audit.clientId,
        branchId: audit.branchId,
      });
    }

    this.logger.log(
      `Audit output refreshed for ${auditId}, score=${score.blendedScore}`,
    );
    return { score, report };
  }

  /**
   * Get the latest (highest version) report for an audit.
   */
  async getLatestReport(auditId: string): Promise<any> {
    const rows = await this.dataSource.query(
      `SELECT ar.*, u.full_name AS prepared_by_name
       FROM audit_reports ar
       LEFT JOIN users u ON u.id = ar.prepared_by_user_id
       WHERE ar.audit_id = $1
       ORDER BY ar.version_no DESC, ar.created_at DESC
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
      `SELECT ar.id, ar.version_no, ar.report_type, ar.status,
              ar.blended_score, ar.prepared_date, ar.finalized_at,
              ar.created_at, u.full_name AS prepared_by_name
       FROM audit_reports ar
       LEFT JOIN users u ON u.id = ar.prepared_by_user_id
       WHERE ar.audit_id = $1
       ORDER BY ar.version_no DESC`,
      [auditId],
    );
    return rows.map((r: {
      id: string;
      version_no: number;
      report_type: string;
      status: string;
      blended_score: number | null;
      prepared_date: string | null;
      finalized_at: string | null;
      prepared_by_name: string | null;
      created_at: string;
    }) => ({
      id: r.id,
      versionNo: r.version_no,
      reportType: r.report_type,
      status: r.status,
      blendedScore: r.blended_score,
      preparedBy: r.prepared_by_name,
      preparedDate: r.prepared_date,
      finalizedAt: r.finalized_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get CRM-level audit summaries for all clients assigned to a CRM.
   */
  async getCrmAuditSummaries(crmUserId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT c.id AS client_id, c.client_name AS client_name,
              COUNT(a.id)::int AS total_audits,
              COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE a.status IN ('IN_PROGRESS','OPEN'))::int AS in_progress,
              COUNT(*) FILTER (WHERE a.status = 'SCHEDULED')::int AS scheduled,
              ROUND(AVG(a.score) FILTER (WHERE a.score IS NOT NULL))::int AS avg_score
       FROM client_assignments cac
       JOIN clients c ON c.id = cac.client_id
       LEFT JOIN audits a ON a.client_id = c.id
       WHERE cac.crm_user_id = $1
       GROUP BY c.id, c.client_name
       ORDER BY c.client_name`,
      [crmUserId],
    );
  }

  /**
   * Get Client-level audit summaries for a client (optionally per branch).
   */
  async getClientAuditSummaries(clientId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT b.id AS branch_id, b.branchname AS branch_name,
              COUNT(a.id)::int AS total_audits,
              COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE a.status IN ('IN_PROGRESS','OPEN'))::int AS in_progress,
              ROUND(AVG(a.score) FILTER (WHERE a.score IS NOT NULL))::int AS avg_score,
              MAX(a.updated_at) AS last_audit_date
       FROM client_branches b
       LEFT JOIN audits a ON a.branch_id = b.id
       WHERE b.clientid = $1 AND b.deletedat IS NULL
       GROUP BY b.id, b.branchname
       ORDER BY b.branchname`,
      [clientId],
    );
  }
}
