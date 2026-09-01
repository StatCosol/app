import {
  Controller,
  Get,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'List auditors for CRM' })
  @Get('auditors')
  listAuditors() {
    return this.usersService.listActiveUsersByRoleCode('AUDITOR');
  }

  /**
   * clientId is required, not optional. Omitting it used to skip the client
   * filter entirely and return every contractor across every tenant — and
   * ScopeGuard could not catch it, because it only validates a clientId that
   * is actually present. With the parameter mandatory, the guard checks it
   * against this CRM's assignments on every call.
   */
  @ApiOperation({
    summary: 'List contractors for a client assigned to this CRM',
  })
  @Get('contractors')
  listContractors(@Query('clientId', new ParseUUIDPipe()) clientId: string) {
    return this.usersService.listActiveUsersByRoleCode('CONTRACTOR', clientId);
  }
}
