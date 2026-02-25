import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../users/users.service';
import { ContractorDocumentsService } from './contractor-documents.service';
import { ContractorDashboardService } from './contractor-dashboard.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { BranchAccessService } from '../auth/branch-access.service';

@Controller({ path: 'client/contractors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientContractorsController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly usersService: UsersService,
    private readonly contractorDocsService: ContractorDocumentsService,
    private readonly dashboardService: ContractorDashboardService,
    private readonly branchAccess: BranchAccessService,
    @InjectRepository(ContractorDocumentEntity)
    private readonly docRepo: Repository<ContractorDocumentEntity>,
  ) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('month') month?: string,
  ) {
    const clientId = req.user.clientId;

    // Get branches for this client and apply branch-access filtering
    let branches = await this.branchesService.findByClient(clientId);
    branches = await this.branchAccess.filterBranches(
      req.user.userId,
      branches,
    );

    // Optional branch filter must be within allowed branches
    const branchIds = branchId
      ? branches
          .filter((b) => String(b.id) === String(branchId))
          .map((b) => b.id)
      : branches.map((b) => b.id);

    if (branchId && branchIds.length === 0) {
      throw new ForbiddenException('You do not have access to this branch');
    }
    if (!branchIds.length) return [];

    // Get all contractors linked to these branches
    const contractors =
      await this.usersService.findContractorsByBranchIds(branchIds);

    // Dedupe in case multiple branch links returned
    const contractorMap = new Map<string, any>();
    contractors.forEach((c: any) => {
      if (!contractorMap.has(String(c.id))) {
        contractorMap.set(String(c.id), c);
      }
    });
    const uniqueContractors = Array.from(contractorMap.values());
    if (!uniqueContractors.length) return [];

    const { start, end } = this.dashboardService.getMonthRange(month);
    const contractorIds = uniqueContractors.map((c: any) => c.id);
    const monthStats = await this.dashboardService.monthListStats(
      clientId,
      contractorIds,
      branchIds,
      start,
      end,
    );

    // Document stats per contractor (scoped to allowed branches)
    const stats = await this.docRepo
      .createQueryBuilder('d')
      .select('d.contractor_user_id', 'contractorId')
      .addSelect('COUNT(*)', 'totalDocs')
      .addSelect(
        `SUM(CASE WHEN d.status = 'APPROVED' THEN 1 ELSE 0 END)`,
        'approvedDocs',
      )
      .addSelect(
        `SUM(CASE WHEN d.status = 'REJECTED' THEN 1 ELSE 0 END)`,
        'rejectedDocs',
      )
      .addSelect(
        `SUM(CASE WHEN d.status = 'PENDING_REVIEW' THEN 1 ELSE 0 END)`,
        'pendingReviewDocs',
      )
      .addSelect(
        `SUM(CASE WHEN d.status = 'UPLOADED' THEN 1 ELSE 0 END)`,
        'uploadedDocs',
      )
      .addSelect('MAX(d.created_at)', 'lastUploadedAt')
      .where('d.client_id = :clientId', { clientId })
      .andWhere('d.branch_id IN (:...branchIds)', { branchIds })
      .groupBy('d.contractor_user_id')
      .getRawMany();

    const statMap = new Map<string, any>();
    stats.forEach((s: any) => statMap.set(String(s.contractorId), s));

    return uniqueContractors.map((c) => {
      const s = statMap.get(String(c.id)) || {};
      const m = monthStats.get(String(c.id)) || {};
      return {
        ...c,
        totalDocs: Number(s.totalDocs || 0),
        approvedDocs: Number(s.approvedDocs || 0),
        rejectedDocs: Number(s.rejectedDocs || 0),
        pendingReviewDocs: Number(s.pendingReviewDocs || 0),
        uploadedDocs: Number(s.uploadedDocs || 0),
        lastUploadedAt: s.lastUploadedAt || null,
        monthScore: m.monthScore ?? null,
        monthUploadPercent: m.monthUploadPercent ?? 0,
        monthDocCount: m.monthDocCount ?? Number(s.totalDocs || 0),
        monthApprovedCount: m.monthApprovedCount ?? Number(s.approvedDocs || 0),
        monthRejectedCount: m.monthRejectedCount ?? Number(s.rejectedDocs || 0),
        monthPendingCount:
          m.monthPendingCount ??
          Number((s.pendingReviewDocs || 0) + (s.uploadedDocs || 0)),
        monthPendingReviewCount:
          m.monthPendingReviewCount ?? Number(s.pendingReviewDocs || 0),
        monthUploadedCount: m.monthUploadedCount ?? Number(s.uploadedDocs || 0),
        monthExpiredCount: m.monthExpiredCount ?? 0,
        monthMissingCount: m.monthMissingCount ?? 0,
        monthNcPoints: m.monthNcPoints ?? 0,
        auditRiskPoints: m.monthAuditRiskPoints ?? 0,
      };
    });
  }

  @Get('documents')
  async documents(@Req() req: any, @Query() q: any) {
    const clientId = req.user.clientId;

    // Enforce branch scope for branch users
    const allowed = await this.branchAccess.getAllowedBranchIds(
      req.user.userId,
      clientId,
    );

    if (allowed !== 'ALL') {
      // If caller passed a branchId, it must be one of allowed branches
      if (q?.branchId && !allowed.includes(String(q.branchId))) {
        throw new ForbiddenException('You do not have access to this branch');
      }
      // If no branchId passed, scope to allowed list (usually 1 branch)
      if (!q?.branchId) {
        q.branchIds = allowed;
      }
    }

    return this.contractorDocsService.listByClient(req.user, {
      clientId,
      ...q,
    });
  }

  @Get('dashboard')
  async dashboard(@Req() req: any, @Query('month') month?: string) {
    const clientId = req.user.clientId;
    const allowed = await this.branchAccess.getAllowedBranchIds(
      req.user.userId,
      clientId,
    );
    const branchIds = allowed === 'ALL' ? undefined : allowed;
    return this.dashboardService.clientOverview(clientId, month, branchIds);
  }

  @Get('dashboard/branch/:branchId')
  async branchDashboard(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Query('month') month?: string,
  ) {
    await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    return this.dashboardService.branchOverview(
      req.user.clientId,
      branchId,
      month,
    );
  }

  @Get('dashboard/contractor/:contractorId')
  async contractorDashboard(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const clientId = req.user.clientId;

    // Ensure contractor belongs to an allowed branch for branch users
    const allowed = await this.branchAccess.getAllowedBranchIds(
      req.user.userId,
      clientId,
    );
    if (allowed !== 'ALL') {
      const contractors =
        await this.usersService.findContractorsByBranchIds(allowed);
      const ok = contractors.some(
        (c: any) => String(c.id) === String(contractorId),
      );
      if (!ok)
        throw new ForbiddenException(
          'You do not have access to this contractor',
        );
    }

    return this.dashboardService.contractorTrend(
      clientId,
      contractorId,
      from,
      to,
    );
  }
}
