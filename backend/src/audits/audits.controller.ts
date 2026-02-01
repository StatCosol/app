import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAuditDto } from './dto/create-audit.dto';

@Controller('api/crm/audits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateAuditDto) {
    return this.svc.createForCrm(req.user, dto);
  }
}

@Controller('api/auditor/audits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listForAuditor(req.user, q);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(req.user, id);
  }
}
