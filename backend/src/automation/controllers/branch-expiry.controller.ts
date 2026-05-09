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
    const branchIds = await this.branchAccess.getUserBranchIds(user.userId);
    return this.expiryTaskService.listForBranch(branchIds);
  }
}
