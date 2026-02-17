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

@Controller({ path: 'auditor/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  // Lightweight summary list to avoid 404 when hitting base path
  @Get()
  root(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListTasks(req.user, q);
  }

  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListTasks(req.user, q);
  }

  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.svc.auditorGetTaskDetail(req.user, id);
  }

  // Read-only audit/compliance visibility for auditors
  @Get('docs')
  listDocs(@Req() req: any, @Query() filters: any) {
    return this.svc.auditorListDocs(req.user, filters);
  }
}
