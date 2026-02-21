import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { BranchesService } from './branches.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { BranchDocumentEntity } from './entities/branch-document.entity';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';

@Controller({ path: 'client/branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientBranchesController {
  constructor(
    private readonly service: BranchesService,
    private readonly branchAccess: BranchAccessService,
    private readonly dataSource: DataSource,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(BranchDocumentEntity)
    private readonly branchDocRepo: Repository<BranchDocumentEntity>,
    @InjectRepository(BranchApplicableComplianceEntity)
    private readonly applicableRepo: Repository<BranchApplicableComplianceEntity>,
  ) {}

  /** GET /api/client/branches — list with counts */
  @Get()
  async list(
    @Req() req: any,
    @Query('state') state?: string,
    @Query('status') status?: string,
  ) {
    const clientId = req.user.clientId;
    let branches = await this.service.findByClient(clientId);

    // Branch access: filter to only user's allowed branches
    branches = await this.branchAccess.filterBranches(
      req.user.userId,
      branches,
    );

    if (state) {
      branches = branches.filter(
        (b) => b.stateCode?.toLowerCase() === state.toLowerCase(),
      );
    }
    if (status) {
      branches = branches.filter(
        (b) => b.status?.toLowerCase() === status.toLowerCase(),
      );
    }

    // Contractor counts per branch
    const branchIds = branches.map((b) => b.id);
    if (!branchIds.length) return [];

    const contractorCounts = await this.branchContractorRepo
      .createQueryBuilder('bc')
      .select('bc.branch_id', 'branchId')
      .addSelect('COUNT(DISTINCT bc.contractor_user_id)', 'count')
      .where('bc.branch_id IN (:...branchIds)', { branchIds })
      .groupBy('bc.branch_id')
      .getRawMany();

    const countMap = new Map<string, number>();
    contractorCounts.forEach((r: any) =>
      countMap.set(r.branchId, Number(r.count)),
    );

    // Compliance counts per branch
    const complianceCounts = await this.applicableRepo
      .createQueryBuilder('ac')
      .select('ac.branch_id', 'branchId')
      .addSelect('COUNT(*)', 'count')
      .where('ac.branch_id IN (:...branchIds)', { branchIds })
      .andWhere('ac.is_applicable = TRUE')
      .groupBy('ac.branch_id')
      .getRawMany();

    const complianceMap = new Map<string, number>();
    complianceCounts.forEach((r: any) =>
      complianceMap.set(r.branchId, Number(r.count)),
    );

    // Document counts per branch
    const docCounts = await this.branchDocRepo
      .createQueryBuilder('bd')
      .select('bd.branch_id', 'branchId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN bd.status = 'APPROVED' THEN 1 ELSE 0 END)",
        'approved',
      )
      .where('bd.branch_id IN (:...branchIds)', { branchIds })
      .groupBy('bd.branch_id')
      .getRawMany();

    const docMap = new Map<string, any>();
    docCounts.forEach((r: any) =>
      docMap.set(r.branchId, {
        total: Number(r.total),
        approved: Number(r.approved),
      }),
    );

    return branches.map((b) => {
      const docs = docMap.get(b.id) || { total: 0, approved: 0 };
      return {
        ...b,
        contractorCount: countMap.get(b.id) ?? 0,
        complianceCount: complianceMap.get(b.id) ?? 0,
        documentCount: docs.total,
        approvedDocCount: docs.approved,
      };
    });
  }
  /** POST /api/client/branches — master user only (creates branch + optional branch user) */
  @Post()
  async create(@Req() req: any, @Body() dto: any) {
    const isMaster = await this.branchAccess.isMasterUser(req.user.userId);
    if (!isMaster) {
      throw new ForbiddenException(
        'Only master client user can create branches',
      );
    }
    return this.service.create(
      req.user.clientId,
      dto,
      req.user.userId,
      req.user.roleCode,
    );
  }

  /** GET /api/client/branches/:id — branch detail with counts */
  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user.clientId;
    const branch = await this.service.findById(id);
    if (branch.clientId !== clientId) {
      return { error: 'Branch not found for this client' };
    }

    // Branch access check
    await this.branchAccess.assertBranchAccess(req.user.userId, id);

    // Contractor count
    const contractorCount = await this.branchContractorRepo.count({
      where: { branchId: id },
    });

    // Compliance count
    const complianceCount = await this.applicableRepo.count({
      where: { branchId: id, isApplicable: true },
    });

    // Document counts
    const docStats = await this.branchDocRepo
      .createQueryBuilder('bd')
      .select('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN bd.status = 'APPROVED' THEN 1 ELSE 0 END)",
        'approved',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'REJECTED' THEN 1 ELSE 0 END)",
        'rejected',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'UNDER_REVIEW' THEN 1 ELSE 0 END)",
        'underReview',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'UPLOADED' THEN 1 ELSE 0 END)",
        'uploaded',
      )
      .where('bd.branch_id = :id', { id })
      .getRawOne();

    return {
      ...branch,
      contractorCount,
      complianceCount,
      documentStats: {
        total: Number(docStats?.total || 0),
        approved: Number(docStats?.approved || 0),
        rejected: Number(docStats?.rejected || 0),
        underReview: Number(docStats?.underReview || 0),
        uploaded: Number(docStats?.uploaded || 0),
      },
    };
  }

  /** GET /api/client/branches/:id/dashboard?month=YYYY-MM — branch-level dashboard */
  @Get(':id/dashboard')
  async dashboard(
    @Req() req: any,
    @Param('id') id: string,
    @Query('month') month?: string,
  ) {
    const clientId = req.user.clientId;
    const branch = await this.service.findById(id);
    if (branch.clientId !== clientId) {
      return { error: 'Branch not found for this client' };
    }
    await this.branchAccess.assertBranchAccess(req.user.userId, id);

    // Parse month filter
    const now = new Date();
    let year = now.getFullYear();
    let mo = now.getMonth() + 1;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      mo = m;
    }

    // 1. Document upload stats for the month
    const docStats = await this.branchDocRepo
      .createQueryBuilder('bd')
      .select('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN bd.status = 'APPROVED' THEN 1 ELSE 0 END)",
        'approved',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'REJECTED' THEN 1 ELSE 0 END)",
        'rejected',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'UNDER_REVIEW' THEN 1 ELSE 0 END)",
        'underReview',
      )
      .addSelect(
        "SUM(CASE WHEN bd.status = 'UPLOADED' THEN 1 ELSE 0 END)",
        'uploaded',
      )
      .where('bd.branch_id = :id', { id })
      .andWhere('bd.period_year = :year', { year })
      .andWhere('bd.period_month = :mo', { mo })
      .getRawOne();

    const totalDocs = Number(docStats?.total || 0);
    const approvedDocs = Number(docStats?.approved || 0);
    const docUploadPct =
      totalDocs > 0 ? Math.round((approvedDocs / totalDocs) * 100) : 0;

    // 2. Applicable compliance count vs completed
    const applicableTotal = await this.applicableRepo.count({
      where: { branchId: id, isApplicable: true },
    });

    // 3. Contractor vendor scores using contractor_required_documents + contractor_documents
    const PENALTY_MISSING = 10;
    const PENALTY_REJECTED = 15;
    const PENALTY_EXPIRED = 8;

    const monthStart = new Date(Date.UTC(year, mo - 1, 1));
    const monthEnd = new Date(Date.UTC(year, mo, 1));

    // Get contractors for this branch
    const contractors: any[] = await this.dataSource.query(
      `SELECT bc.contractor_user_id AS contractor_id, u.name AS contractor_name
       FROM branch_contractor bc
       JOIN users u ON u.id = bc.contractor_user_id
       WHERE bc.branch_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.name`,
      [id],
    );
    const contractorIds = contractors.map((c) => c.contractor_id);

    // Required doc counts per contractor
    const requiredMap = new Map<string, number>();
    if (contractorIds.length) {
      const reqRows: any[] = await this.dataSource.query(
        `SELECT contractor_id, COUNT(*) AS cnt
         FROM contractor_required_documents
         WHERE client_id = $1
           AND contractor_id = ANY($2)
           AND is_required = TRUE
           AND (branch_id IS NULL OR branch_id = $3)
         GROUP BY contractor_id`,
        [clientId, contractorIds, id],
      );
      reqRows.forEach((r) => requiredMap.set(r.contractor_id, Number(r.cnt)));
    }

    // Document stats per contractor for the month
    const docStatsMap = new Map<
      string,
      { uploaded: number; rejected: number; expired: number }
    >();
    if (contractorIds.length) {
      const docRows: any[] = await this.dataSource.query(
        `SELECT
           contractor_id,
           COUNT(DISTINCT doc_type) AS uploaded_distinct,
           SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
           SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired_count
         FROM contractor_documents
         WHERE client_id = $1
           AND contractor_id = ANY($2)
           AND (branch_id IS NULL OR branch_id = $3)
           AND created_at >= $4 AND created_at < $5
         GROUP BY contractor_id`,
        [
          clientId,
          contractorIds,
          id,
          monthStart.toISOString(),
          monthEnd.toISOString(),
        ],
      );
      docRows.forEach((r) =>
        docStatsMap.set(r.contractor_id, {
          uploaded: Number(r.uploaded_distinct),
          rejected: Number(r.rejected_count),
          expired: Number(r.expired_count),
        }),
      );
    }

    // Calculate vendor scores
    let totalRequired = 0;
    let totalUploaded = 0;
    const scored = contractors.map((c) => {
      const reqCount = requiredMap.get(c.contractor_id) || 0;
      const stats = docStatsMap.get(c.contractor_id) || {
        uploaded: 0,
        rejected: 0,
        expired: 0,
      };
      const missing = Math.max(reqCount - stats.uploaded, 0);
      const penalty =
        missing * PENALTY_MISSING +
        stats.rejected * PENALTY_REJECTED +
        stats.expired * PENALTY_EXPIRED;
      const score = Math.max(0, 100 - penalty);
      totalRequired += reqCount;
      totalUploaded += Math.min(stats.uploaded, reqCount);
      return {
        contractorId: c.contractor_id,
        contractorName: c.contractor_name,
        requiredCount: reqCount,
        uploadedCount: stats.uploaded,
        rejectedCount: stats.rejected,
        expiredCount: stats.expired,
        missingCount: missing,
        score,
      };
    });

    const vendorScorePct = scored.length
      ? Math.round(
          (scored.reduce((s, c) => s + c.score, 0) / scored.length) * 10,
        ) / 10
      : 0;
    const documentsUploadPct =
      totalRequired > 0
        ? Math.round((totalUploaded / totalRequired) * 1000) / 10
        : 0;

    // Top 10 high score + top 10 low score vendors
    const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
    const top10High = sortedByScore.slice(0, 10);
    const top10Low = [...scored].sort((a, b) => a.score - b.score).slice(0, 10);

    return {
      branchId: id,
      branchName: branch.branchName,
      month: `${year}-${String(mo).padStart(2, '0')}`,
      documentStats: {
        total: totalDocs,
        approved: approvedDocs,
        rejected: Number(docStats?.rejected || 0),
        underReview: Number(docStats?.underReview || 0),
        uploaded: Number(docStats?.uploaded || 0),
        uploadPct: docUploadPct,
      },
      complianceApplicable: applicableTotal,
      vendorScorePercent: vendorScorePct,
      documentsUploadPercent: documentsUploadPct,
      contractors: {
        total: contractors.length,
        top10HighScoreVendors: top10High,
        top10LowScoreVendors: top10Low,
      },
    };
  }
}
