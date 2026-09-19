import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ExpiryTaskService } from '../services/expiry-task.service';
import { BranchAccessService } from '../../auth/branch-access.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Branch – Expiry Tasks')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/expiry-tasks', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class BranchExpiryController {
  constructor(
    private readonly expiryTaskService: ExpiryTaskService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @ApiOperation({ summary: 'List expiry tasks for branch user' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    // A company-wide (MASTER) user has no branch mappings, so the branch list
    // came back empty and they saw no expiry tasks at all. Decided by user
    // type, not by the list being empty: a BRANCH user with no mappings must
    // still see nothing, not the whole company.
    if (user.userType !== 'BRANCH' && user.clientId) {
      return this.expiryTaskService.listForClient(user.clientId);
    }
    const branchIds = await this.branchAccess.getUserBranchIds(user.userId);
    return this.expiryTaskService.listForBranch(branchIds);
  }
}
