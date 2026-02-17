import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompliancesService } from './compliances.service';
import { ChecklistStatus } from '../common/enums';
import { AssignmentsService } from '../assignments/assignments.service';

@Controller({ path: 'crm/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceController {
  constructor(
    private readonly compliancesService: CompliancesService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

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

    if (clientId) {
      const ok = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        crmUserId,
      );
      if (!ok) {
        throw new ForbiddenException('Client is not assigned to this CRM user');
      }
    }

    return this.compliancesService.listCrmComplianceWorklist(crmUserId, {
      clientId,
      branchId,
      status,
      dueMonth,
    });
  }
}
