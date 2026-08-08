import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { generatePreliminaryReportPdfBuffer } from './utils/report-pdf';
import { AuditEntity } from './entities/audit.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';

@Injectable()
export class AuditAuditorDashboardService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  /** Phase 4: Export preliminary findings PDF (auditor + post-publish only). */
  async exportPreliminaryReportPdf(
    user: ReqUser,
    auditId: string,
  ): Promise<Buffer> {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({
      where: { id: auditId },
      relations: ['client', 'branch'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (!audit.preliminaryPublishedAt) {
      throw new BadRequestException(
        'Preliminary findings have not been published yet',
      );
    }
    const ncs = await this.ncRepo.find({
      where: { auditId },
      order: { createdAt: 'ASC' },
    });
    const visible = ncs.filter((n) => !!n.publishedAt);
    const earliestDeadline =
      visible
        .map((n) => n.vendorWindowUntil)
        .filter((d): d is string => !!d)
        .sort()[0] || null;
    return generatePreliminaryReportPdfBuffer({
      auditId: audit.id,
      auditCode: audit.auditCode || audit.id,
      clientName: audit.client?.clientName || null,
      branchName: audit.branch?.branchName || null,
      periodCode: audit.periodCode || null,
      publishedAt: audit.preliminaryPublishedAt,
      vendorWindowDays: audit.vendorWindowDays || 6,
      vendorWindowUntil: earliestDeadline,
      ncs: visible.map((n) => ({
        documentName: n.documentName,
        remark: n.remark,
        status: n.status,
        vendorWindowUntil: n.vendorWindowUntil,
        isRecurring: !!n.isRecurring,
        recurrenceCount: n.recurrenceCount ?? null,
      })),
    });
  }

  async getSubmissionHistory(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');

    const reviews = await this.docReviewRepo.find({
      where: { auditId },
      order: { reviewedAt: 'DESC' },
    });

    // Group by version rounds
    const versions = new Map<number, any[]>();
    for (const r of reviews) {
      if (!versions.has(r.version)) versions.set(r.version, []);
      versions.get(r.version)!.push(r);
    }

    const history = Array.from(versions.entries()).map(([ver, items]) => ({
      version: ver,
      reviewCount: items.length,
      complied: items.filter((i) => i.complianceMark === 'COMPLIED').length,
      nonComplied: items.filter((i) => i.complianceMark === 'NON_COMPLIED')
        .length,
      latestReviewAt: items.reduce(
        (max, i) => (i.reviewedAt > max ? i.reviewedAt : max),
        items[0].reviewedAt,
      ),
    }));

    return {
      auditId,
      submissions: history.sort((a, b) => a.version - b.version),
    };
  }

  // ─── Document Reviews History ──────────────────────────────────
  async getDocumentReviews(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');

    return this.docReviewRepo.find({
      where: { auditId },
      order: { reviewedAt: 'DESC' },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUDITOR DASHBOARD SUMMARY
  // ═══════════════════════════════════════════════════════════════

  async getAuditorDashboardSummary(user: ReqUser) {
    this.assertAuditor(user);
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "totalAssigned",
         COUNT(*) FILTER (WHERE status = 'PLANNED')::int AS "pending",
         COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS "inProgress",
         COUNT(*) FILTER (WHERE status IN ('SUBMITTED','COMPLETED'))::int AS "submitted",
         COUNT(*) FILTER (WHERE status IN ('CORRECTION_PENDING','REVERIFICATION_PENDING'))::int AS "reverificationPending",
         COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS "closed"
       FROM audits
       WHERE assigned_auditor_id = $1 AND status != 'CANCELLED'`,
      [user.userId],
    );
    return (
      rows[0] || {
        totalAssigned: 0,
        pending: 0,
        inProgress: 0,
        submitted: 0,
        reverificationPending: 0,
        closed: 0,
      }
    );
  }

  async getAuditorUpcomingAudits(user: ReqUser) {
    this.assertAuditor(user);
    return this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.period_code AS "periodCode", a.due_date AS "dueDate",
              a.scheduled_date AS "scheduledDate", a.status,
              c.client_name AS "clientName",
              cb.branchname AS "branchName",
              cu.name AS "contractorName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       WHERE a.assigned_auditor_id = $1
         AND a.status IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')
       ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
      [user.userId],
    );
  }

  async getAuditorRecentSubmitted(user: ReqUser) {
    this.assertAuditor(user);
    return this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.score, a.submitted_at AS "submittedAt", a.status,
              c.client_name AS "clientName",
              COALESCE(cb.branchname, cu.name) AS "entityName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       WHERE a.assigned_auditor_id = $1
         AND a.status IN ('SUBMITTED','COMPLETED','CLOSED')
       ORDER BY a.submitted_at DESC NULLS LAST
       LIMIT 20`,
      [user.userId],
    );
  }

  async getAuditInfo(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const rows = await this.dataSource.query(
      `SELECT a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
              a.frequency, a.period_year AS "periodYear", a.period_code AS "periodCode",
              a.status, a.score, a.due_date AS "dueDate",
              a.scheduled_date AS "scheduledDate", a.submitted_at AS "submittedAt",
              a.final_remark AS "finalRemark", a.notes,
              a.created_at AS "createdAt",
              c.client_name AS "clientName", c.id AS "clientId",
              cb.branchname AS "branchName", cb.id AS "branchId",
              cu.name AS "contractorName", cu.id AS "contractorUserId",
              au.name AS "auditorName",
              sby.name AS "scheduledByName"
       FROM audits a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_branches cb ON cb.id = a.branch_id
       LEFT JOIN users cu ON cu.id = a.contractor_user_id
       LEFT JOIN users au ON au.id = a.assigned_auditor_id
       LEFT JOIN users sby ON sby.id = a.scheduled_by_user_id
       WHERE a.id = $1 AND a.assigned_auditor_id = $2`,
      [auditId, user.userId],
    );
    if (!rows.length) throw new NotFoundException('Audit not found');
    return rows[0];
  }
}
