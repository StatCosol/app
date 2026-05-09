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
 * Options endpoints for CRM role.
 * Returns only the clients assigned to this CRM user.
 */
@ApiTags('Options')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/options', version: '1' })
@Roles('CRM')
export class CrmOptionsController {
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
