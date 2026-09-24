import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { AuditEntryService } from './audit-entry.service';
import { StartAuditEntryDto } from './dto/start-audit-entry.dto';

@Controller({ path: 'auditor/audit-entry', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditEntryController {
  constructor(private readonly entry: AuditEntryService) {}

  @Get('options')
  options(@CurrentUser() user: ReqUser) {
    return this.entry.options(user);
  }

  @Post()
  start(@CurrentUser() user: ReqUser, @Body() dto: StartAuditEntryDto) {
    return this.entry.start(user, dto);
  }
}
