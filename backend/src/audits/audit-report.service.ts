import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { generateAuditReportPdfBuffer } from './utils/report-pdf';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';

@Injectable()
export class AuditReportService {
  private auditReportColumnsCache: {
    scope: boolean;
    methodology: boolean;
    selectedObservationIds: boolean;
    finalizedAt: boolean;
  } | null = null;

  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private assertCrm(user: ReqUser) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  async getReportStatusForAuditor(user: ReqUser, id: string) {
    const audit = await this.ensureAuditorAuditAccess(user, id);
    return this.buildReportStatus(audit);
  }

  async getForCrm(user: ReqUser, id: string) {
    this.assertCrm(user);
    const audit = await this.repo.findOne({
      where: { id },
      relations: ['client', 'contractorUser', 'assignedAuditor'],
    });
    if (!audit) throw new NotFoundException('Audit not found');

    // Verify CRM is assigned to this client
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      audit.clientId,
      user.userId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
    return audit;
  }

  private async buildReportStatus(audit: AuditEntity) {
    const latestReport = await this.getLatestReportRow(audit.id);
    if (!latestReport) {
      return {
        auditId: audit.id,
        stage: 'NOT_STARTED',
        status: null,
        updatedAt: null,
        finalizedAt: null,
      };
    }
    const status = String(latestReport.status || '').toUpperCase();
    const stage =
      status === 'DRAFT'
        ? 'DRAFT'
        : ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(status)
          ? 'FINAL'
          : 'NOT_STARTED';
    return {
      auditId: audit.id,
      stage,
      status,
      updatedAt: latestReport.updated_at || null,
      finalizedAt: latestReport.finalized_at || null,
    };
  }

  async getReportStatusForCrm(user: ReqUser, id: string) {
    const audit = await this.getForCrm(user, id);
    const latestReport = await this.getLatestReportRow(id);
    if (!latestReport) {
      return {
        auditId: audit.id,
        stage: 'NOT_STARTED',
        status: null,
        updatedAt: null,
        finalizedAt: null,
      };
    }

    const status = String(latestReport.status || '').toUpperCase();
    const stage =
      status === 'DRAFT'
        ? 'DRAFT'
        : ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(status)
          ? 'FINAL'
          : 'NOT_STARTED';

    return {
      auditId: audit.id,
      stage,
      status,
      updatedAt: latestReport.updated_at || null,
      finalizedAt: latestReport.finalized_at || null,
    };
  }

  async approveReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Only SUBMITTED reports can be approved. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'APPROVED',
           approved_by_user_id = $2,
           approved_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [current.id, user.userId],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'APPROVED',
      remarks: remarks || null,
    };
  }

  async publishReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be published. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports
       SET status = 'PUBLISHED',
           approved_by_user_id = COALESCE(approved_by_user_id, $2),
           approved_date = COALESCE(approved_date, CURRENT_DATE),
           published_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE id = $1`,
      [current.id, user.userId],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'PUBLISHED',
      remarks: remarks || null,
    };
  }

  async sendBackReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    if (!remarks?.trim()) {
      throw new BadRequestException('remarks are required to send back report');
    }

    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be sent back. Current status: ${status}`,
      );
    }

    const availableCols = await this.getAuditReportColumnsAvailability();
    const draftSet = availableCols.finalizedAt
      ? "status = 'DRAFT', finalized_at = NULL, updated_at = NOW()"
      : "status = 'DRAFT', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${draftSet}
       WHERE id = $1`,
      [current.id],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status: 'DRAFT',
      remarks: remarks.trim(),
      action: 'SENT_BACK',
    };
  }

  async holdReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    const audit = await this.getForCrm(user, auditId);
    const rows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const current = rows[0];
    if (!current) {
      throw new BadRequestException('No report draft found for this audit');
    }

    const status = String(current.status || '').toUpperCase();
    if (!['SUBMITTED', 'APPROVED'].includes(status)) {
      throw new BadRequestException(
        `Only SUBMITTED/APPROVED reports can be held. Current status: ${status}`,
      );
    }

    await this.dataSource.query(
      `UPDATE audit_reports SET updated_at = NOW() WHERE id = $1`,
      [current.id],
    );

    return {
      auditId: audit.id,
      reportId: current.id,
      status,
      held: true,
      remarks: remarks || null,
    };
  }

  async getReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();

    const scopeSelect = availableCols.scope
      ? 'ar.scope AS "scope",'
      : 'NULL::text AS "scope",';
    const methodologySelect = availableCols.methodology
      ? 'ar.methodology AS "methodology",'
      : 'NULL::text AS "methodology",';
    const selectedObsSelect = availableCols.selectedObservationIds
      ? 'ar.selected_observation_ids AS "selectedObservationIds",'
      : 'NULL::jsonb AS "selectedObservationIds",';
    const finalizedAtSelect = availableCols.finalizedAt
      ? 'ar.finalized_at AS "finalizedAt",'
      : 'NULL::timestamp AS "finalizedAt",';

    const rows = await this.dataSource.query(
      `SELECT
         ar.id AS "reportId",
         ar.audit_id AS "auditId",
         ar.report_type AS "reportType",
         ar.status AS "status",
         ar.executive_summary AS "executiveSummary",
         ${scopeSelect}
         ${methodologySelect}
         ar.findings AS "findings",
         ar.recommendations AS "recommendations",
         ${selectedObsSelect}
         ${finalizedAtSelect}
         ar.updated_at AS "updatedAt"
       FROM audit_reports ar
       WHERE ar.audit_id = $1
       ORDER BY ar.updated_at DESC, ar.created_at DESC
       LIMIT 1`,
      [auditId],
    );

    return this.mapReportRow(
      audit.id,
      rows[0] ?? null,
      audit.updatedAt || null,
    );
  }

  async saveReportDraftForAuditor(
    user: ReqUser,
    auditId: string,
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot edit report after audit completion',
      );
    }

    const selectedObservationIds = Array.isArray(dto.selectedObservationIds)
      ? [
          ...new Set(
            dto.selectedObservationIds
              .map((x) => String(x).trim())
              .filter(Boolean),
          ),
        ]
      : [];
    const version = dto.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL';
    const availableCols = await this.getAuditReportColumnsAvailability();

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const existing = existingRows[0] || null;
    const userId = user.userId || user.id;

    if (!existing) {
      const insertColumns = [
        'audit_id',
        'report_type',
        'executive_summary',
        'findings',
        'recommendations',
      ];
      const insertValues: unknown[] = [
        auditId,
        version,
        dto.executiveSummary || null,
        dto.findings || null,
        dto.recommendations || null,
      ];

      if (availableCols.scope) {
        insertColumns.splice(3, 0, 'scope');
        insertValues.splice(3, 0, dto.scope || null);
      }

      if (availableCols.methodology) {
        const idx = 4 + Number(availableCols.scope);
        insertColumns.splice(idx, 0, 'methodology');
        insertValues.splice(idx, 0, dto.methodology || null);
      }

      if (availableCols.selectedObservationIds) {
        const idx =
          5 + Number(availableCols.scope) + Number(availableCols.methodology);
        insertColumns.splice(idx, 0, 'selected_observation_ids');
        insertValues.splice(idx, 0, JSON.stringify(selectedObservationIds));
      }

      insertColumns.push(
        'status',
        'prepared_by_user_id',
        'prepared_date',
        'updated_at',
      );
      insertValues.push('DRAFT', userId || null);

      const placeholders = insertColumns.map((col, i) => {
        if (col === 'prepared_date') return 'CURRENT_DATE';
        if (col === 'updated_at') return 'NOW()';
        if (col === 'selected_observation_ids') return `$${i + 1}::jsonb`;
        return `$${i + 1}`;
      });

      await this.dataSource.query(
        `INSERT INTO audit_reports
          (${insertColumns.join(', ')})
         VALUES
          (${placeholders.join(', ')})`,
        insertValues,
      );
    } else {
      const status = String(existing.status || '').toUpperCase();
      if (['APPROVED', 'PUBLISHED'].includes(status)) {
        throw new BadRequestException(
          'Cannot edit approved or published report',
        );
      }
      if (status !== 'DRAFT') {
        throw new BadRequestException('Reopen the report before editing');
      }

      const updates: string[] = ['report_type = $1', 'executive_summary = $2'];
      const params: unknown[] = [version, dto.executiveSummary || null];

      if (availableCols.scope) {
        params.push(dto.scope || null);
        updates.push(`scope = $${params.length}`);
      }

      if (availableCols.methodology) {
        params.push(dto.methodology || null);
        updates.push(`methodology = $${params.length}`);
      }

      params.push(dto.findings || null);
      updates.push(`findings = $${params.length}`);

      params.push(dto.recommendations || null);
      updates.push(`recommendations = $${params.length}`);

      if (availableCols.selectedObservationIds) {
        params.push(JSON.stringify(selectedObservationIds));
        updates.push(`selected_observation_ids = $${params.length}::jsonb`);
      }

      params.push(existing.id);

      await this.dataSource.query(
        `UPDATE audit_reports
         SET
           ${updates.join(',\n           ')},
           updated_at = NOW()
         WHERE id = $${params.length}`,
        params,
      );
    }

    return this.getReportForAuditor(user, auditId);
  }

  async finalizeReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException('Audit is already completed');
    }

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    let existing = existingRows[0] || null;
    const userId = user.userId || user.id;

    if (!existing) {
      await this.dataSource.query(
        `INSERT INTO audit_reports
          (audit_id, report_type, status, prepared_by_user_id, prepared_date, updated_at)
         VALUES
          ($1, 'INTERNAL', 'DRAFT', $2, CURRENT_DATE, NOW())`,
        [auditId, userId || null],
      );
      const postInsert = await this.dataSource.query(
        `SELECT id, status
         FROM audit_reports
         WHERE audit_id = $1
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [auditId],
      );
      existing = postInsert[0] || null;
    }

    const status = String(existing?.status || '').toUpperCase();
    if (['APPROVED', 'PUBLISHED'].includes(status)) {
      throw new BadRequestException(
        'Cannot finalize approved or published report',
      );
    }
    if (status !== 'DRAFT') {
      return this.getReportForAuditor(user, auditId);
    }

    const finalizeSet = availableCols.finalizedAt
      ? "status = 'SUBMITTED', finalized_at = NOW(), updated_at = NOW()"
      : "status = 'SUBMITTED', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${finalizeSet}
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async reopenReportForAuditor(user: ReqUser, auditId: string) {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const availableCols = await this.getAuditReportColumnsAvailability();
    if (String(audit.status || '').toUpperCase() === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot reopen report after audit completion',
      );
    }

    const existingRows = await this.dataSource.query(
      `SELECT id, status
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    const existing = existingRows[0] || null;
    if (!existing) {
      throw new NotFoundException('Audit report draft not found');
    }

    const status = String(existing.status || '').toUpperCase();
    if (status === 'DRAFT') {
      return this.getReportForAuditor(user, auditId);
    }
    if (['APPROVED', 'PUBLISHED'].includes(status)) {
      throw new BadRequestException(
        'Cannot reopen approved or published report',
      );
    }
    if (status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reopen report in ${status} status`);
    }

    const reopenSet = availableCols.finalizedAt
      ? "status = 'DRAFT', finalized_at = NULL, updated_at = NOW()"
      : "status = 'DRAFT', updated_at = NOW()";

    await this.dataSource.query(
      `UPDATE audit_reports
       SET ${reopenSet}
       WHERE id = $1`,
      [existing.id],
    );

    return this.getReportForAuditor(user, auditId);
  }

  async exportReportPdfForAuditor(
    user: ReqUser,
    auditId: string,
  ): Promise<Buffer> {
    const audit = await this.ensureAuditorAuditAccess(user, auditId);
    const report = await this.getReportForAuditor(user, auditId);
    if (report.stage !== 'FINAL') {
      throw new BadRequestException('Only finalized reports can be exported');
    }

    const selectedIds = Array.isArray(report.selectedObservationIds)
      ? report.selectedObservationIds
      : [];

    const obsQb = this.observationRepo
      .createQueryBuilder('obs')
      .leftJoinAndSelect('obs.category', 'category')
      .where('obs.auditId = :auditId', { auditId })
      .orderBy('obs.sequenceNumber', 'ASC')
      .addOrderBy('obs.createdAt', 'ASC');

    if (selectedIds.length) {
      obsQb.andWhere('obs.id IN (:...selectedIds)', { selectedIds });
    }

    const observations = await obsQb.getMany();
    const version = report.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL';

    return generateAuditReportPdfBuffer({
      auditId: report.auditId,
      auditCode: audit.auditCode || audit.id,
      clientName: audit.client?.clientName || null,
      branchName: audit.branch?.branchName || null,
      periodCode: audit.periodCode || null,
      version,
      stage: 'FINAL',
      updatedAt: report.updatedAt,
      finalizedAt: report.finalizedAt,
      executiveSummary: report.executiveSummary || '',
      scope: report.scope || '',
      methodology: report.methodology || '',
      findings: report.findings || '',
      recommendations: report.recommendations || '',
      observations: observations.map((o) => ({
        sequenceNumber: o.sequenceNumber ?? null,
        observation: o.observation || '',
        clause: o.clause || null,
        risk: o.risk || null,
        status: o.status || 'OPEN',
        recommendation: o.recommendation || null,
      })),
    });
  }

  private async ensureAuditorAuditAccess(
    user: ReqUser,
    auditId: string,
  ): Promise<AuditEntity> {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({
      where: { id: auditId },
      relations: ['client', 'branch'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    const callerId = user?.userId || user?.id;
    if (audit.assignedAuditorId !== callerId) {
      throw new ForbiddenException('Not your audit');
    }
    return audit;
  }

  private mapReportRow(
    auditId: string,
    row: {
      reportId?: string;
      auditId?: string;
      reportType?: string;
      status?: string;
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: unknown;
      updatedAt?: Date | string | null;
      finalizedAt?: Date | string | null;
    } | null,
    fallbackUpdatedAt: Date | null,
  ) {
    if (!row) {
      return {
        reportId: null,
        auditId,
        stage: 'DRAFT',
        version: 'INTERNAL',
        executiveSummary: '',
        scope: '',
        methodology: '',
        findings: '',
        recommendations: '',
        selectedObservationIds: [] as string[],
        updatedAt: fallbackUpdatedAt,
        finalizedAt: null,
      };
    }

    const status = String(row.status || '').toUpperCase();
    const stage = ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(status)
      ? 'FINAL'
      : 'DRAFT';
    const version =
      String(row.reportType || '').toUpperCase() === 'CLIENT'
        ? 'CLIENT'
        : 'INTERNAL';

    let selectedObservationIds: string[] = [];
    const rawSelected = row.selectedObservationIds;
    if (Array.isArray(rawSelected)) {
      selectedObservationIds = rawSelected.map((x: unknown) => String(x));
    } else if (typeof rawSelected === 'string') {
      try {
        const parsed = JSON.parse(rawSelected);
        if (Array.isArray(parsed)) {
          selectedObservationIds = parsed.map((x: unknown) => String(x));
        }
      } catch {
        selectedObservationIds = [];
      }
    }

    return {
      reportId: row.reportId || null,
      auditId: row.auditId || auditId,
      stage,
      version,
      executiveSummary: row.executiveSummary || '',
      scope: row.scope || '',
      methodology: row.methodology || '',
      findings: row.findings || '',
      recommendations: row.recommendations || '',
      selectedObservationIds,
      updatedAt: row.updatedAt || fallbackUpdatedAt,
      finalizedAt: row.finalizedAt || null,
    };
  }

  async getLatestReportRow(auditId: string): Promise<{
    status?: string;
    updated_at?: string | null;
    finalized_at?: string | null;
  } | null> {
    const rows = await this.dataSource.query(
      `SELECT *
       FROM audit_reports
       WHERE audit_id = $1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [auditId],
    );
    return rows[0] || null;
  }

  private async getAuditReportColumnsAvailability(): Promise<{
    scope: boolean;
    methodology: boolean;
    selectedObservationIds: boolean;
    finalizedAt: boolean;
  }> {
    if (this.auditReportColumnsCache) {
      return this.auditReportColumnsCache;
    }

    const rows: Array<{ column_name?: string }> = await this.dataSource.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'audit_reports'
         AND column_name IN ('scope', 'methodology', 'selected_observation_ids', 'finalized_at')`,
    );

    const names = new Set(rows.map((r) => String(r.column_name || '')));
    this.auditReportColumnsCache = {
      scope: names.has('scope'),
      methodology: names.has('methodology'),
      selectedObservationIds: names.has('selected_observation_ids'),
      finalizedAt: names.has('finalized_at'),
    };

    return this.auditReportColumnsCache;
  }
}
