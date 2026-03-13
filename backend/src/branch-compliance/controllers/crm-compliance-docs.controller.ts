import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import {
  ReviewComplianceDocDto,
  ChecklistQueryDto,
} from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/branch-compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** List documents pending review */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: ChecklistQueryDto) {
    return this.svc.listForCrmReview(req.user, q);
  }

  /** Approve or reject a document */
  @ApiOperation({ summary: 'Review' })
  @Patch(':id/review')
  review(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewComplianceDocDto,
  ) {
    return this.svc.reviewDocument(req.user, id, dto);
  }

  /** Get return master list (for filters) */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: any) {
    return this.svc.getReturnMaster(q);
  }

  /** Dashboard KPIs for CRM */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  dashboardKpis(@Req() req: any, @Query() q: any) {
    return this.svc.getCrmDashboardKpis(req.user, {
      companyId: q.companyId,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
    });
  }
}
