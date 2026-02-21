import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientDashboardService } from './client-dashboard.service';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';

@Controller({ path: 'client-dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientStatsDashboardController {
  constructor(private readonly svc: ClientDashboardService) {}

  @Get('pf-esi-summary')
  getPfEsi(@Req() req: any, @Query() query: ClientDashboardQueryDto) {
    return this.svc.getPfEsiSummary(req.user, query);
  }

  @Get('contractor-upload-summary')
  getContractorSummary(
    @Req() req: any,
    @Query() query: ClientDashboardQueryDto,
  ) {
    return this.svc.getContractorUploadSummary(req.user, query);
  }
}
