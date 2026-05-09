import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegitxReadOnlyGuard } from '../auth/policies/legitx-readonly.guard';
import { LegitxComplianceService } from './legitx-compliance.service';
import { ComplianceQueryDto } from './dto/compliance-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@UseGuards(JwtAuthGuard, LegitxReadOnlyGuard)
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx', version: '1' })
export class LegitxComplianceController {
  constructor(private readonly svc: LegitxComplianceService) {}

  @ApiOperation({ summary: 'Compliance Status' })
  @Get('compliance-status')
  async complianceStatus(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getComplianceStatus({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      lawType: q.lawType || null,
      status: q.status || null,
      clientId: user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'List Mcd' })
  @Get('mcd')
  async listMcd(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getMcdList({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      status: q.status || null,
      clientId: user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'List Returns' })
  @Get('returns')
  async listReturns(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getReturns({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      lawType: q.lawType || null,
      status: q.status || null,
      clientId: user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'Download Return' })
  @Get('returns/:id/download')
  async downloadReturn(
    @CurrentUser() user: ReqUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.getReturnDownload(id, user?.clientId ?? null);
  }

  @ApiOperation({ summary: 'List Audits' })
  @Get('audits')
  async listAudits(
    @CurrentUser() user: ReqUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getAudits({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      status: q.status || null,
      clientId: user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'Download Audit Report' })
  @Get('audits/:auditId/report/download')
  async downloadAuditReport(
    @CurrentUser() user: ReqUser,
    @Param('auditId', new ParseUUIDPipe()) auditId: string,
  ) {
    return this.svc.getAuditReportDownload(auditId, user?.clientId ?? null);
  }

  @ApiOperation({ summary: 'Audit Observations' })
  @Get('audits/:auditId/observations')
  async auditObservations(
    @CurrentUser() user: ReqUser,
    @Param('auditId', new ParseUUIDPipe()) auditId: string,
  ) {
    return this.svc.getAuditObservations(auditId, user?.clientId ?? null);
  }
}
