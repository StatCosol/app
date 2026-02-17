import { Controller, Get, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'PAYROLL', 'ADMIN')
@Controller({ path: 'legitx/dashboard', version: '1' })
export class LegitxDashboardController {
  constructor(private readonly dashboardService: LegitxDashboardService) {}

  @Get()
  async base(
    @Req() req: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSummary(req.user?.id, query, req.user?.clientId ?? null);
  }

  @Get('summary')
  async summary(
    @Req() req: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSummary(req.user?.id, query, req.user?.clientId ?? null);
  }
}
