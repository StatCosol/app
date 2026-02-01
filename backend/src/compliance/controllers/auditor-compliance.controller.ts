import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('api/auditor/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListTasks(req.user, q);
  }

  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.svc.auditorGetTaskDetail(req.user, id);
  }

  @Post('tasks/:id/report')
  shareReport(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { notes: string },
  ) {
    return this.svc.auditorShareReport(req.user, id, dto?.notes);
  }
}
