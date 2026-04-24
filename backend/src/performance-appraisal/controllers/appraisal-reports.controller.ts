import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { AppraisalReportsService } from '../services/appraisal-reports.service';

@ApiTags('Appraisal Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'appraisal/reports', version: '1' })
export class AppraisalReportsController {
  constructor(private readonly reportsService: AppraisalReportsService) {}

  @Get('branch-summary')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Branch-wise appraisal summary' })
  branchSummary(@CurrentUser() user: ReqUser, @Query('cycleId') cycleId?: string) {
    return this.reportsService.branchSummary(user.clientId!, cycleId);
  }

  @Get('department-summary')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Department-wise appraisal summary' })
  departmentSummary(@CurrentUser() user: ReqUser, @Query('cycleId') cycleId?: string) {
    return this.reportsService.departmentSummary(user.clientId!, cycleId);
  }

  @Get('recommendations')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Recommendation distribution' })
  recommendations(@CurrentUser() user: ReqUser, @Query('cycleId') cycleId?: string) {
    return this.reportsService.recommendations(user.clientId!, cycleId);
  }

  @Get('export')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Export appraisal data' })
  exportData(@CurrentUser() user: ReqUser, @Query('cycleId') cycleId?: string) {
    return this.reportsService.exportData(user.clientId!, cycleId);
  }
}
