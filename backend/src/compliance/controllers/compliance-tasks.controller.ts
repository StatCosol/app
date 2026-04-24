import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Compliance Tasks')
@ApiBearerAuth()
@Controller({ path: 'compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM', 'ADMIN')
export class ComplianceTasksPortalController {
  constructor(private readonly complianceService: ComplianceService) {}

  @ApiOperation({ summary: 'List compliance tasks for CRM/Admin' })
  @Get('tasks')
  listTasks(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.complianceService.crmListTasks(user, q);
  }
}
