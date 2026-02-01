import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('api/client/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.clientListTasks(req.user, q);
  }
}
