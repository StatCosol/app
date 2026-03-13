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
 * Options endpoints for CLIENT (LegitX portal) users.
 * Clients see only their own branches — clientId is locked from the token.
 */
@ApiTags('Options')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/options', version: '1' })
@Roles('CLIENT')
export class ClientOptionsController {
  constructor(private readonly scope: AccessScopeService) {}

  /** Returns branches for the user's own client (MASTER = all, BRANCH = only assigned) */
  @ApiOperation({ summary: 'Get Branches' })
  @Get('branches')
  getBranches(@CurrentUser() user: ReqUser): Promise<BranchOption[]> {
    return this.scope.listAllowedBranches(user);
  }
}
