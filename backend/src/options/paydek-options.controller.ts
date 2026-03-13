import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AccessScopeService,
  ReqUser,
  ClientOption,
  BranchOption,
} from '../access/access-scope.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Options endpoints for PAYDEK (payroll desk) role.
 * Scoped via CRM-style assignment (client_assignments.crm_user_id).
 */
@ApiTags('Options')
@ApiBearerAuth('JWT')
@Controller({ path: 'paydek/options', version: '1' })
@Roles('PAYDEK')
export class PaydekOptionsController {
  constructor(private readonly scope: AccessScopeService) {}

  @ApiOperation({ summary: 'Get Clients' })
  @Get('clients')
  getClients(@CurrentUser() user: ReqUser): Promise<ClientOption[]> {
    return this.scope.listAllowedClients(user);
  }

  @ApiOperation({ summary: 'Get Branches' })
  @Get('branches')
  getBranches(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
  ): Promise<BranchOption[]> {
    return this.scope.listAllowedBranches(user, clientId);
  }
}
