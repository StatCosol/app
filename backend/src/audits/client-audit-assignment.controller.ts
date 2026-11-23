import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import {
  ClientAuditAssignmentDto,
  ClientAuditAssignmentService,
} from './client-audit-assignment.service';

@Controller({ path: 'crm/audits/client-assignment', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class ClientAuditAssignmentController {
  constructor(private readonly service: ClientAuditAssignmentService) {}
  @Post('preview')
  preview(@CurrentUser() user: ReqUser, @Body() dto: ClientAuditAssignmentDto) {
    return this.service.preview(user, dto);
  }
  @Post()
  assign(@CurrentUser() user: ReqUser, @Body() dto: ClientAuditAssignmentDto) {
    return this.service.assign(user, dto);
  }
}
