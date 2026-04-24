import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'PAYROLL', 'ADMIN')
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx/dashboard', version: '1' })
export class LegitxDashboardController {
  constructor(private readonly dashboardService: LegitxDashboardService) {}

  @ApiOperation({ summary: 'Base' })
  @Get()
  async base(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSummary(
      user?.id,
      query,
      user?.clientId ?? null,
    );
  }

  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  async summary(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSummary(
      user?.id,
      query,
      user?.clientId ?? null,
    );
  }
}
