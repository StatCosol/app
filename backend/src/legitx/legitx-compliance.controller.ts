import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegitxReadOnlyGuard } from '../auth/policies/legitx-readonly.guard';
import { LegitxComplianceService } from './legitx-compliance.service';
import { ComplianceQueryDto } from './dto/compliance-query.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, LegitxReadOnlyGuard)
@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'legitx', version: '1' })
export class LegitxComplianceController {
  constructor(private readonly svc: LegitxComplianceService) {}

  @ApiOperation({ summary: 'Compliance Status' })
  @Get('compliance-status')
  async complianceStatus(
    @Req() req: any,
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
      clientId: req.user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'List Mcd' })
  @Get('mcd')
  async listMcd(
    @Req() req: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getMcdList({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      status: q.status || null,
      clientId: req.user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'List Returns' })
  @Get('returns')
  async listReturns(
    @Req() req: any,
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
      clientId: req.user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'Download Return' })
  @Get('returns/:id/download')
  async downloadReturn(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.getReturnDownload(id, req.user?.clientId ?? null);
  }

  @ApiOperation({ summary: 'List Audits' })
  @Get('audits')
  async listAudits(
    @Req() req: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: ComplianceQueryDto,
  ) {
    const now = new Date();
    return this.svc.getAudits({
      month: q.month ?? now.getMonth() + 1,
      year: q.year ?? now.getFullYear(),
      branchId: q.branchId || null,
      status: q.status || null,
      clientId: req.user?.clientId ?? null,
    });
  }

  @ApiOperation({ summary: 'Download Audit Report' })
  @Get('audits/:auditId/report/download')
  async downloadAuditReport(
    @Req() req: any,
    @Param('auditId', new ParseUUIDPipe()) auditId: string,
  ) {
    return this.svc.getAuditReportDownload(auditId, req.user?.clientId ?? null);
  }

  @ApiOperation({ summary: 'Audit Observations' })
  @Get('audits/:auditId/observations')
  async auditObservations(
    @Req() req: any,
    @Param('auditId', new ParseUUIDPipe()) auditId: string,
  ) {
    return this.svc.getAuditObservations(auditId, req.user?.clientId ?? null);
  }
}
