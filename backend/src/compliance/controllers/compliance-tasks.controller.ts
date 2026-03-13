import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller({ path: 'compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'ADMIN')
export class ComplianceTasksPortalController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('tasks')
  listTasks(@Req() req: any, @Query() q: any) {
    return this.complianceService.crmListTasks(req.user, q);
  }
}
