import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientDashboardService } from './client-dashboard.service';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'client-dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientStatsDashboardController {
  constructor(private readonly svc: ClientDashboardService) {}

  @ApiOperation({ summary: 'Get Pf Esi' })
  @Get('pf-esi-summary')
  getPfEsi(
    @CurrentUser() user: ReqUser,
    @Query() query: ClientDashboardQueryDto,
  ) {
    return this.svc.getPfEsiSummary(user, query);
  }

  @ApiOperation({ summary: 'Get Contractor Summary' })
  @Get('contractor-upload-summary')
  getContractorSummary(
    @CurrentUser() user: ReqUser,
    @Query() query: ClientDashboardQueryDto,
  ) {
    return this.svc.getContractorUploadSummary(user, query);
  }
}
