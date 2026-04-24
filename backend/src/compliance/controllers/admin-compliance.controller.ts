import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.adminListTasks(user, q);
  }
}
