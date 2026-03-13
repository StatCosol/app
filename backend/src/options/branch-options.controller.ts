import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AccessScopeService,
  ReqUser,
  BranchOption,
} from '../access/access-scope.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Options endpoint for BRANCH_DESK role.
 * Returns a single BranchOption for the user's assigned branch.
 */
@ApiTags('Options')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/options', version: '1' })
@Roles('BRANCH_DESK', 'CLIENT')
export class BranchOptionsController {
  constructor(private readonly scope: AccessScopeService) {}

  /** Returns the single branch this desk user is locked to */
  @ApiOperation({ summary: 'Get Self' })
  @Get('self')
  async getSelf(@CurrentUser() user: ReqUser): Promise<BranchOption> {
    const branches = await this.scope.listAllowedBranches(user);
    // BRANCH_DESK is always locked to exactly one branch
    return branches[0] ?? { id: '', branchName: '' };
  }
}
