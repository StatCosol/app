import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { AuditListService } from '../list-queries/audit-list.service';
import { CeoDashboardService } from './ceo-dashboard.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardized list endpoint for CEO portal.
 * CEO sees all branches (scope = 'all').
 */
@ApiTags('CEO')
@ApiBearerAuth('JWT')
@Controller({ path: 'ceo', version: '1' })
@Roles('CEO')
export class CeoListController {
  constructor(
    private readonly audits: AuditListService,
    private readonly ceoDashboard: CeoDashboardService,
  ) {}

  /** CEO branch workspace list */
  @ApiOperation({ summary: 'List Branches' })
  @Get('branches')
  listBranches(
    @Query()
    q: ScopedListQueryDto & {
      state?: string;
      riskBand?: string;
      client?: string;
    },
  ) {
    return this.ceoDashboard.getBranchWorkspaceList(q);
  }

  /** CEO branch workspace detail */
  @ApiOperation({ summary: 'Branch Detail' })
  @Get('branches/:branchId')
  async branchDetail(
    @Param('branchId') branchId: string,
    @Query('month') month?: string,
  ) {
    const detail = await this.ceoDashboard.getBranchWorkspaceDetail(branchId, {
      month,
    });
    if (!detail) {
      throw new NotFoundException('Branch not found');
    }
    return detail;
  }

  /** CEO audits overview */
  @ApiOperation({ summary: 'List Audits' })
  @Get('audits')
  listAudits(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.audits.list(user, q);
  }
}
