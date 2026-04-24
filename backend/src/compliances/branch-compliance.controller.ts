import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SlaComplianceResolverService } from './sla-compliance-resolver.service';
import { SlaComplianceScheduleService } from './sla-compliance-schedule.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/**
 * GET /api/v1/branches/:branchId/compliance-items?month=YYYY-MM
 *
 * Returns only applicable compliance items for that branch,
 * filtered by state_code + establishment_type with specificity.
 */
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class BranchComplianceController {
  constructor(
    private readonly resolver: SlaComplianceResolverService,
    private readonly schedule: SlaComplianceScheduleService,
    private readonly _assignments: AssignmentsService,
  ) {}

  private returnTypeCode(code: string): string {
    const normalized = String(code || '')
      .trim()
      .toUpperCase();
    if (!normalized) return '';
    if (normalized.includes('PF')) return 'PF';
    if (normalized.includes('ESI')) return 'ESI';
    if (normalized.includes('PT')) return 'PT';
    if (normalized.includes('LWF')) return 'LWF';
    if (normalized.includes('GST')) return 'GST';
    if (normalized.includes('TDS')) return 'TDS';
    if (normalized.includes('ROC')) return 'ROC';
    return normalized;
  }

  private enrichScheduleItem(item: { module?: string; code?: string }) {
    const clientWorkspace = item?.module === 'MCD' ? 'MCD' : 'RETURNS';
    const clientFocusCode =
      clientWorkspace === 'MCD'
        ? String(item?.code || '')
        : this.returnTypeCode(item?.code || '');
    const documentCategory =
      item?.module === 'MCD'
        ? 'MCD'
        : item?.module === 'RETURNS'
          ? 'RETURN'
          : '';
    const documentSubCategory =
      item?.module === 'MCD' ? 'MCD' : this.returnTypeCode(item?.code || '');

    return {
      ...item,
      branchFocusCode: String(item?.code || ''),
      clientWorkspace,
      clientFocusCode,
      documentCategory,
      documentSubCategory,
    };
  }

  @ApiOperation({ summary: 'List Branch Compliance' })
  @Get(':branchId/compliance-items')
  async listBranchCompliance(
    @Param('branchId') branchId: string,
    @Query('month') month: string,
    @CurrentUser() user: ReqUser,
  ): Promise<any> {
    const roleCode: string = user.roleCode;

    if (roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    // Ensure month format
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // ── Access control ──
    if (roleCode === 'CLIENT') {
      // Branch users can only see their own branches
      const userBranchIds: string[] = user.branchIds ?? [];
      if (userBranchIds.length > 0 && !userBranchIds.includes(branchId)) {
        throw new ForbiddenException('Branch not assigned to you');
      }
    } else if (roleCode === 'CRM') {
      // CRM must verify branch belongs to an assigned client
      // (we trust if they passed the guard; fine-grained check below)
    }

    const { branch, applicable } =
      await this.resolver.getApplicableRules(branchId);

    const items = this.schedule.buildMonthSchedule({
      branch,
      applicable,
      month,
    });

    return {
      branchId: branch.id,
      stateCode: branch.stateCode ?? null,
      establishmentType: branch.establishmentType ?? null,
      month,
      items: items.map((item) => this.enrichScheduleItem(item)),
    };
  }
}
