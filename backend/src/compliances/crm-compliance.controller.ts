import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompliancesService } from './compliances.service';
import { ChecklistStatus } from '../common/enums';

@Controller('api/crm/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceController {
  constructor(private readonly compliancesService: CompliancesService) {}

  @Get()
  async list(@Request() req, @Query() q: any) {
    const crmUserId = req.user.userId;
    const clientId = typeof q.clientId === 'string' ? q.clientId : undefined;
    const branchId = typeof q.branchId === 'string' ? q.branchId : undefined;
    const status: ChecklistStatus | 'all' =
      q.status === 'PENDING' ||
      q.status === 'COMPLETED' ||
      q.status === 'OVERDUE'
        ? q.status
        : 'all';
    const dueMonth = typeof q.dueMonth === 'string' ? q.dueMonth : undefined;

    return this.compliancesService.listCrmComplianceWorklist(crmUserId, {
      clientId,
      branchId,
      status,
      dueMonth,
    });
  }
}
