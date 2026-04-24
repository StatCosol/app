import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompliancesService } from './compliances.service';
import { ChecklistStatus } from '../common/enums';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceController {
  constructor(
    private readonly compliancesService: CompliancesService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    const crmUserId = user.userId;
    const clientId = typeof q.clientId === 'string' ? q.clientId : undefined;
    const branchId = typeof q.branchId === 'string' ? q.branchId : undefined;
    const status: ChecklistStatus | 'all' =
      q.status === 'PENDING' ||
      q.status === 'COMPLETED' ||
      q.status === 'OVERDUE'
        ? (q.status as ChecklistStatus)
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
