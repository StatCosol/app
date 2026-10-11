import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { LicenceAlertsService } from './licence-alerts.service';

export class LicenceAlertsQuery {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

@Controller({ path: 'client/licence-alerts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK')
export class LicenceAlertsController {
  constructor(private readonly alerts: LicenceAlertsService) {}

  @Get()
  list(@CurrentUser() user: ReqUser, @Query() query: LicenceAlertsQuery) {
    return this.alerts.listForUser(user, query.branchId);
  }
}
