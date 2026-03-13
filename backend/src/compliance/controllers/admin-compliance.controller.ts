import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.adminListTasks(req.user, q);
  }
}
