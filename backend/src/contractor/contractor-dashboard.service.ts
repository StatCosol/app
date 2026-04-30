import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchesService } from '../branches/branches.service';
import { UsersService, ContractorRow } from '../users/users.service';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { ContractorRequiredDocumentEntity } from './entities/contractor-required-document.entity';

const PENALTY_MISSING = 10;
const PENALTY_REJECTED = 15;
const PENALTY_EXPIRED = 8;

interface DocStats {
  uploadedDistinct: number;
  rejectedCount: number;
  expiredCount: number;
}

interface MonthlyDocStats {
  totalDocs: number;
  approvedDocs: number;
  rejectedDocs: number;
  pendingReviewDocs: number;
  uploadedDocs: number;
  expiredDocs: number;
  uploadedDistinct: number;
}

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

@Injectable()
export class ContractorDashboardService {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly usersService: UsersService,
    @InjectRepository(ContractorDocumentEntity)
    private readonly docRepo: Repository<ContractorDocumentEntity>,
    @InjectRepository(ContractorRequiredDocumentEntity)
    private readonly requiredRepo: Repository<ContractorRequiredDocumentEntity>,
  ) {}

  getMonthRange(month?: string) {
    return this.parseMonth(month);
  }

  private parseMonth(month?: string) {
    const now = new Date();
    if (!month)
      return {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
    const [y, m] = month.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12)
      throw new BadRequestException('Invalid month format, expected YYYY-MM');
    return {
      start: new Date(Date.UTC(y, m - 1, 1)),
      end: new Date(Date.UTC(y, m, 1)),
    };
  }

  private expandMonths(from?: string, to?: string): string[] {
    const now = new Date();
    const toMonth = to
      ? this.parseMonth(to).start
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const fromMonth = from
      ? this.parseMonth(from).start
      : new Date(
          Date.UTC(toMonth.getUTCFullYear(), toMonth.getUTCMonth() - 5, 1),
        );
    const months: string[] = [];
    const cursor = new Date(fromMonth);
    while (
      cursor <
      new Date(Date.UTC(toMonth.getUTCFullYear(), toMonth.getUTCMonth() + 1, 1))
    ) {
      months.push(monthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }

  private score(
    requiredCount: number,
    uploadedDistinct: number,
    rejected: number,
    expired: number,
  ) {
    const missing = Math.max(requiredCount - uploadedDistinct, 0);
    const penalty =
      missing * PENALTY_MISSING +
      rejected * PENALTY_REJECTED +
      expired * PENALTY_EXPIRED;
    const score = Math.max(0, 100 - penalty);
    return { score, missing };
  }

  private async getRequiredCounts(
    clientId: string,
    contractorIds: string[],
    branchIds?: string[],
  ) {
    if (!contractorIds.length) return new Map<string, number>();
    const qb = this.requiredRepo
      .createQueryBuilder('r')
      .select('r.contractor_user_id', 'contractorId')
      .addSelect('COUNT(*)', 'requiredCount')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.contractor_user_id IN (:...contractorIds)', {
        contractorIds,
      })
      .andWhere('r.is_required = TRUE');
    if (branchIds && branchIds.length) {
      qb.andWhere('(r.branch_id IS NULL OR r.branch_id IN (:...branchIds))', {
        branchIds,
      });
    }
    const rows = await qb.groupBy('r.contractor_user_id').getRawMany();
    const map = new Map<string, number>();
    rows.forEach((r: { contractorId: string; requiredCount: string }) =>
      map.set(String(r.contractorId), Number(r.requiredCount || 0)),
    );
    return map;
  }

  private async getDocStats(
    clientId: string,
    contractorIds: string[],
    branchIds: string[],
    start: Date,
    end: Date,
  ) {
    if (!contractorIds.length) return new Map<string, DocStats>();
    const qb = this.docRepo
      .createQueryBuilder('d')
      .select('d.contractor_user_id', 'contractorId')
      .addSelect('COUNT(DISTINCT d.doc_type)', 'uploadedDistinct')
      .addSelect(
        "SUM(CASE WHEN d.status = 'REJECTED' THEN 1 ELSE 0 END)",
        'rejectedCount',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'EXPIRED' THEN 1 ELSE 0 END)",
        'expiredCount',
      )
      .where('d.client_id = :clientId', { clientId })
      .andWhere('d.contractor_user_id IN (:...contractorIds)', {
        contractorIds,
      })
      .andWhere('d.created_at BETWEEN :start AND :end', { start, end });
    if (branchIds.length) {
      qb.andWhere('d.branch_id IN (:...branchIds)', { branchIds });
    }
    const rows = await qb.groupBy('d.contractor_user_id').getRawMany();
    const map = new Map<string, DocStats>();
    rows.forEach(
      (r: {
        contractorId: string;
        uploadedDistinct: string;
        rejectedCount: string;
        expiredCount: string;
      }) =>
        map.set(String(r.contractorId), {
          uploadedDistinct: Number(r.uploadedDistinct || 0),
          rejectedCount: Number(r.rejectedCount || 0),
          expiredCount: Number(r.expiredCount || 0),
        }),
    );
    return map;
  }

  private async getMonthlyDocCounts(
    clientId: string,
    contractorIds: string[],
    branchIds: string[],
    start: Date,
    end: Date,
  ) {
    if (!contractorIds.length) return new Map<string, MonthlyDocStats>();
    const qb = this.docRepo
      .createQueryBuilder('d')
      .select('d.contractor_user_id', 'contractorId')
      .addSelect('COUNT(*)', 'totalDocs')
      .addSelect(
        "SUM(CASE WHEN d.status = 'APPROVED' THEN 1 ELSE 0 END)",
        'approvedDocs',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'REJECTED' THEN 1 ELSE 0 END)",
        'rejectedDocs',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'PENDING_REVIEW' THEN 1 ELSE 0 END)",
        'pendingReviewDocs',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'UPLOADED' THEN 1 ELSE 0 END)",
        'uploadedDocs',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'EXPIRED' THEN 1 ELSE 0 END)",
        'expiredDocs',
      )
      .addSelect('COUNT(DISTINCT d.doc_type)', 'uploadedDistinct')
      .where('d.client_id = :clientId', { clientId })
      .andWhere('d.contractor_user_id IN (:...contractorIds)', {
        contractorIds,
      })
      .andWhere('d.created_at BETWEEN :start AND :end', { start, end });

    if (branchIds.length) {
      qb.andWhere('d.branch_id IN (:...branchIds)', { branchIds });
    }

    const rows = await qb.groupBy('d.contractor_user_id').getRawMany();
    const map = new Map<string, MonthlyDocStats>();
    rows.forEach(
      (r: {
        contractorId: string;
        totalDocs: string;
        approvedDocs: string;
        rejectedDocs: string;
        pendingReviewDocs: string;
        uploadedDocs: string;
        expiredDocs: string;
        uploadedDistinct: string;
      }) =>
        map.set(String(r.contractorId), {
          totalDocs: Number(r.totalDocs || 0),
          approvedDocs: Number(r.approvedDocs || 0),
          rejectedDocs: Number(r.rejectedDocs || 0),
          pendingReviewDocs: Number(r.pendingReviewDocs || 0),
          uploadedDocs: Number(r.uploadedDocs || 0),
          expiredDocs: Number(r.expiredDocs || 0),
          uploadedDistinct: Number(r.uploadedDistinct || 0),
        }),
    );
    return map;
  }

  async monthListStats(
    clientId: string,
    contractorIds: string[],
    branchIds: string[],
    start: Date,
    end: Date,
  ) {
    if (!contractorIds.length) return new Map<string, Record<string, number>>();
    const requiredMap = await this.getRequiredCounts(
      clientId,
      contractorIds,
      branchIds,
    );
    const docMap = await this.getMonthlyDocCounts(
      clientId,
      contractorIds,
      branchIds,
      start,
      end,
    );
    const riskMap = await this.getAuditRiskPoints(
      clientId,
      contractorIds,
      start,
      end,
    );

    const result = new Map<string, Record<string, number>>();
    contractorIds.forEach((id) => {
      const requiredCount = requiredMap.get(id) ?? 0;
      const doc = docMap.get(id) ?? {
        totalDocs: 0,
        approvedDocs: 0,
        rejectedDocs: 0,
        pendingReviewDocs: 0,
        uploadedDocs: 0,
        expiredDocs: 0,
        uploadedDistinct: 0,
      };
      const { score, missing } = this.score(
        requiredCount,
        doc.uploadedDistinct,
        doc.rejectedDocs,
        doc.expiredDocs,
      );
      const uploadPercent =
        requiredCount > 0
          ? Math.round((doc.uploadedDistinct / requiredCount) * 100)
          : 0;
      const ncPoints =
        missing * PENALTY_MISSING +
        doc.rejectedDocs * PENALTY_REJECTED +
        doc.expiredDocs * PENALTY_EXPIRED;
      const monthAuditRiskPoints = riskMap.get(id) ?? 0;

      result.set(id, {
        monthScore: score,
        monthUploadPercent: uploadPercent,
        monthDocCount: doc.totalDocs,
        monthApprovedCount: doc.approvedDocs,
        monthRejectedCount: doc.rejectedDocs,
        monthPendingCount: doc.pendingReviewDocs + doc.uploadedDocs,
        monthPendingReviewCount: doc.pendingReviewDocs,
        monthUploadedCount: doc.uploadedDocs,
        monthExpiredCount: doc.expiredDocs,
        monthMissingCount: missing,
        monthNcPoints: ncPoints,
        monthAuditRiskPoints,
      });
    });

    return result;
  }

  private dedupeContractors(rows: ContractorRow[]) {
    const seen = new Map<string, ContractorRow>();
    for (const r of rows) {
      if (!seen.has(r.id)) seen.set(r.id, r);
    }
    return Array.from(seen.values());
  }

  async clientOverview(
    clientId: string,
    month?: string,
    branchIdsOverride?: string[],
  ) {
    const { start, end } = this.parseMonth(month);

    let branches = await this.branchesService.findByClient(clientId);
    if (branchIdsOverride?.length) {
      const allow = new Set(branchIdsOverride.map(String));
      branches = branches.filter((b) => allow.has(String(b.id)));
    }

    const branchIds = branches.map((b) => b.id);
    const branchMap = new Map(branches.map((b) => [String(b.id), b]));

    if (!branchIds.length) {
      return {
        totalContractors: 0,
        uploadPercent: 0,
        accumulatedScore: 0,
        avgAuditRiskPoints: 0,
        top10Highest: [],
        top10Lowest: [],
      };
    }

    const contractorsRaw =
      await this.usersService.findContractorsByBranchIds(branchIds);
    const contractors = this.dedupeContractors(contractorsRaw);
    if (!contractors.length) {
      return {
        totalContractors: 0,
        uploadPercent: 0,
        accumulatedScore: 0,
        top10Highest: [],
        top10Lowest: [],
      };
    }

    const contractorIds = contractors.map((c) => c.id);
    const requiredMap = await this.getRequiredCounts(
      clientId,
      contractorIds,
      branchIds,
    );
    const docMap = await this.getDocStats(
      clientId,
      contractorIds,
      branchIds,
      start,
      end,
    );
    const riskMap = await this.getAuditRiskPoints(
      clientId,
      contractorIds,
      start,
      end,
    );

    const scored = contractors.map((c) => {
      const required = requiredMap.get(c.id) ?? 0;
      const doc = docMap.get(c.id) ?? {
        uploadedDistinct: 0,
        rejectedCount: 0,
        expiredCount: 0,
      };
      const { score, missing } = this.score(
        required,
        doc.uploadedDistinct,
        doc.rejectedCount,
        doc.expiredCount,
      );
      const uploadPercent =
        required > 0 ? Math.round((doc.uploadedDistinct / required) * 100) : 0;
      const auditRiskPoints = riskMap.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        branchId: c.branchId,
        branchName: c.branchId
          ? branchMap.get(String(c.branchId))?.branchName || null
          : null,
        score,
        uploadPercent,
        requiredCount: required,
        uploadedDistinct: doc.uploadedDistinct,
        missingCount: missing,
        rejectedCount: doc.rejectedCount,
        expiredCount: doc.expiredCount,
        auditRiskPoints,
      };
    });

    const totalRequired = scored.reduce((s, c) => s + c.requiredCount, 0);
    const totalUploaded = scored.reduce((s, c) => s + c.uploadedDistinct, 0);

    const uploadPercent =
      totalRequired > 0 ? Math.round((totalUploaded / totalRequired) * 100) : 0;
    const accumulatedScore = scored.length
      ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
      : 0;
    const avgAuditRiskPoints = scored.length
      ? Math.round(
          (scored.reduce((s, c) => s + c.auditRiskPoints, 0) / scored.length) *
            10,
        ) / 10
      : 0;

    const top10Highest = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const top10Lowest = [...scored]
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    return {
      totalContractors: contractors.length,
      uploadPercent,
      accumulatedScore,
      avgAuditRiskPoints,
      top10Highest,
      top10Lowest,
    };
  }

  async branchOverview(clientId: string, branchId: string, month?: string) {
    const { start, end } = this.parseMonth(month);
    const branches = await this.branchesService.findByClient(clientId);
    const allowed = branches.find((b) => String(b.id) === String(branchId));
    if (!allowed)
      throw new BadRequestException('Branch not found for this client');
    const branchIds = [allowed.id];

    const contractors =
      await this.usersService.findContractorsByBranchIds(branchIds);
    if (!contractors.length) {
      return {
        branchUploadPercent: 0,
        branchScore: 0,
        top10HighestInBranch: [],
        top10LowestInBranch: [],
      };
    }

    const contractorIds = contractors.map((c) => c.id);
    const requiredMap = await this.getRequiredCounts(
      clientId,
      contractorIds,
      branchIds,
    );
    const docMap = await this.getDocStats(
      clientId,
      contractorIds,
      branchIds,
      start,
      end,
    );
    const riskMap = await this.getAuditRiskPoints(
      clientId,
      contractorIds,
      start,
      end,
    );

    const scored = contractors.map((c) => {
      const required = requiredMap.get(c.id) ?? 0;
      const doc = docMap.get(c.id) ?? {
        uploadedDistinct: 0,
        rejectedCount: 0,
        expiredCount: 0,
      };
      const { score, missing } = this.score(
        required,
        doc.uploadedDistinct,
        doc.rejectedCount,
        doc.expiredCount,
      );
      const uploadPercent =
        required > 0 ? Math.round((doc.uploadedDistinct / required) * 100) : 0;
      const auditRiskPoints = riskMap.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        branchId: c.branchId,
        score,
        uploadPercent,
        requiredCount: required,
        uploadedDistinct: doc.uploadedDistinct,
        missingCount: missing,
        rejectedCount: doc.rejectedCount,
        expiredCount: doc.expiredCount,
        auditRiskPoints,
      };
    });

    const totalRequired = scored.reduce((s, c) => s + c.requiredCount, 0);
    const totalUploaded = scored.reduce((s, c) => s + c.uploadedDistinct, 0);

    const branchUploadPercent =
      totalRequired > 0 ? Math.round((totalUploaded / totalRequired) * 100) : 0;
    const branchScore = scored.length
      ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
      : 0;
    const branchAuditRiskPoints = scored.length
      ? Math.round(
          (scored.reduce((s, c) => s + c.auditRiskPoints, 0) / scored.length) *
            10,
        ) / 10
      : 0;

    const top10HighestInBranch = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const top10LowestInBranch = [...scored]
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    return {
      branchId: allowed.id,
      branchName: allowed.branchName || null,
      branchUploadPercent,
      branchScore,
      branchAuditRiskPoints,
      top10HighestInBranch,
      top10LowestInBranch,
    };
  }

  async contractorTrend(
    clientId: string,
    contractorId: string,
    from?: string,
    to?: string,
  ) {
    if (!contractorId)
      throw new BadRequestException('contractorId is required');
    const months = this.expandMonths(from, to);
    if (!months.length) return [];
    const firstMonth = this.parseMonth(months[0]);
    const lastMonth = this.parseMonth(months[months.length - 1]);
    const rangeStart = firstMonth.start;
    const rangeEnd = lastMonth.end;

    const requiredCount = await this.requiredRepo.count({
      where: { clientId, contractorUserId: contractorId, isRequired: true },
    });

    const rows = await this.docRepo
      .createQueryBuilder('d')
      .select("to_char(date_trunc('month', d.created_at), 'YYYY-MM')", 'month')
      .addSelect('COUNT(DISTINCT d.doc_type)', 'uploadedDistinct')
      .addSelect(
        "SUM(CASE WHEN d.status = 'REJECTED' THEN 1 ELSE 0 END)",
        'rejectedCount',
      )
      .addSelect(
        "SUM(CASE WHEN d.status = 'EXPIRED' THEN 1 ELSE 0 END)",
        'expiredCount',
      )
      .where('d.client_id = :clientId', { clientId })
      .andWhere('d.contractor_user_id = :contractorId', { contractorId })
      .andWhere('d.created_at BETWEEN :start AND :end', {
        start: rangeStart,
        end: rangeEnd,
      })
      .groupBy("to_char(date_trunc('month', d.created_at), 'YYYY-MM')")
      .getRawMany();

    const statMap = new Map<string, DocStats>();
    rows.forEach(
      (r: {
        month: string;
        uploadedDistinct: string;
        rejectedCount: string;
        expiredCount: string;
      }) =>
        statMap.set(String(r.month), {
          uploadedDistinct: Number(r.uploadedDistinct || 0),
          rejectedCount: Number(r.rejectedCount || 0),
          expiredCount: Number(r.expiredCount || 0),
        }),
    );

    // Audit risk points per month for this contractor
    const riskByMonth = await this.getAuditRiskPointsByMonth(
      clientId,
      contractorId,
      rangeStart,
      rangeEnd,
    );

    const timeline = months.map((m) => {
      const stat = statMap.get(m) || {
        uploadedDistinct: 0,
        rejectedCount: 0,
        expiredCount: 0,
      };
      const { score } = this.score(
        requiredCount,
        stat.uploadedDistinct,
        stat.rejectedCount,
        stat.expiredCount,
      );
      const uploadedPercent =
        requiredCount > 0
          ? Math.round((stat.uploadedDistinct / requiredCount) * 100)
          : 0;
      const missingCount = Math.max(requiredCount - stat.uploadedDistinct, 0);
      const ncPoints = stat.rejectedCount; // weight 1 for now
      const auditRiskPoints = riskByMonth.get(m) ?? 0;
      return {
        month: m,
        score,
        ncPoints,
        uploadedPercent,
        rejectedCount: stat.rejectedCount,
        missingCount,
        auditRiskPoints,
      };
    });

    return timeline;
  }

  /* ──────────────── Audit risk helpers ──────────────── */

  /**
   * Aggregate audit observation risk points per contractor.
   * Returns Map<contractorId, totalRiskPoints>.
   */
  private async getAuditRiskPoints(
    clientId: string,
    contractorIds: string[],
    start: Date,
    end: Date,
  ): Promise<Map<string, number>> {
    if (!contractorIds.length) return new Map();

    const rows: Array<{ contractorId: string; riskPoints: string }> =
      await this.docRepo.manager.query(
        `SELECT a.contractor_user_id AS "contractorId",
              SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 4
                       WHEN ao.risk = 'HIGH' THEN 3
                       WHEN ao.risk = 'MEDIUM' THEN 2
                       WHEN ao.risk = 'LOW' THEN 1
                       ELSE 0 END) AS "riskPoints"
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.client_id = $1
         AND a.contractor_user_id = ANY($2)
         AND ao.created_at >= $3
         AND ao.created_at < $4
       GROUP BY a.contractor_user_id`,
        [clientId, contractorIds, start, end],
      );

    const map = new Map<string, number>();
    rows.forEach((r) =>
      map.set(String(r.contractorId), Number(r.riskPoints || 0)),
    );
    return map;
  }

  /**
   * Aggregate audit observation risk points per month for a single contractor.
   * Returns Map<monthKey, totalRiskPoints>.
   */
  private async getAuditRiskPointsByMonth(
    clientId: string,
    contractorId: string,
    start: Date,
    end: Date,
  ): Promise<Map<string, number>> {
    const rows: Array<{ month: string; riskPoints: string }> =
      await this.docRepo.manager.query(
        `SELECT to_char(date_trunc('month', ao.created_at), 'YYYY-MM') AS "month",
              SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 4
                       WHEN ao.risk = 'HIGH' THEN 3
                       WHEN ao.risk = 'MEDIUM' THEN 2
                       WHEN ao.risk = 'LOW' THEN 1
                       ELSE 0 END) AS "riskPoints"
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.client_id = $1
         AND a.contractor_user_id = $2
         AND ao.created_at >= $3
         AND ao.created_at < $4
       GROUP BY to_char(date_trunc('month', ao.created_at), 'YYYY-MM')`,
        [clientId, contractorId, start, end],
      );

    const map = new Map<string, number>();
    rows.forEach((r) => map.set(String(r.month), Number(r.riskPoints || 0)));
    return map;
  }
}
