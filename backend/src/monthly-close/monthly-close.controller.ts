import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MonthlyCloseQueryDto } from './monthly-close.dto';
import { MonthlyCloseService } from './monthly-close.service';

@ApiTags('Monthly close')
@ApiBearerAuth('JWT')
@Controller({ path: 'monthly-close', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'CRM', 'ADMIN')
export class MonthlyCloseController {
  constructor(
    private readonly service: MonthlyCloseService,
    private readonly access: AccessScopeService,
  ) {}

  @Get('options')
  async options(@CurrentUser() user: ReqUser) {
    const clients = await this.access.listAllowedClients(user);
    return { clients };
  }

  @Get('branches')
  async branches(
    @CurrentUser() user: ReqUser,
    @Query('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return { branches: await this.access.listAllowedBranches(user, clientId) };
  }

  @Get()
  get(@CurrentUser() user: ReqUser, @Query() query: MonthlyCloseQueryDto) {
    return this.service.get(user, query);
  }
}
