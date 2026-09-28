import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Res,
  Version,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { PdfReportService } from './pdf-report.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';

/**
 * /api/v1/reports/pdf
 *
 * Endpoints that stream back generated PDF report files.
 */
@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller('reports/pdf')
export class PdfReportController {
  constructor(
    private readonly pdf: PdfReportService,
    @InjectDataSource() private ds: DataSource,
    private readonly scope: OperationalScopeService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  /* ── Compliance Summary (per client) ── */

  @Version('1')
  @ApiOperation({ summary: 'Compliance Summary' })
  @Get('compliance/:clientId')
  @Roles('CRM', 'CLIENT', 'BRANCH_DESK', 'ADMIN', 'CCO', 'CEO')
  async complianceSummary(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const branchIds = await this.reportBranchIds(user, clientId, month);
    const name = await this.clientName(clientId);
    const buf = await this.pdf.complianceSummary(
      clientId,
      month,
      name,
      branchIds,
    );
    this.streamPdf(res, buf, `compliance-summary-${clientId}.pdf`);
  }

  /* ── CEO Dashboard ── */

  @Version('1')
  @ApiOperation({ summary: 'Ceo Dashboard' })
  @Get('ceo-dashboard')
  @Roles('CEO', 'ADMIN')
  async ceoDashboard(
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const clients = await this.ds.query(
      `SELECT id, client_name AS name FROM clients WHERE is_active = true AND is_deleted = false ORDER BY client_name`,
    );
    const buf = await this.pdf.ceoDashboard(clients, month);
    this.streamPdf(res, buf, `ceo-dashboard-${month || 'all'}.pdf`);
  }

  /* ── Risk Heatmap (per client) ── */

  @Version('1')
  @ApiOperation({ summary: 'Risk Heatmap' })
  @Get('risk-heatmap/:clientId')
  @Roles('CRM', 'CLIENT', 'BRANCH_DESK', 'ADMIN', 'CCO', 'CEO')
  async riskHeatmap(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const branchIds = await this.reportBranchIds(user, clientId, month);
    const name = await this.clientName(clientId);
    const buf = await this.pdf.riskHeatmap(clientId, month, name, branchIds);
    this.streamPdf(res, buf, `risk-heatmap-${clientId}.pdf`);
  }

  /* ── DTSS Report (per client + month) ── */

  @Version('1')
  @ApiOperation({ summary: 'Dtss' })
  @Get('dtss/:clientId')
  @Roles('CRM', 'CLIENT', 'BRANCH_DESK', 'ADMIN', 'CCO', 'CEO')
  async dtss(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Query('month') month: string,
    @Res() res: Response,
  ): Promise<void> {
    const branchIds = await this.reportBranchIds(user, clientId, month);
    const name = await this.clientName(clientId);
    const params: unknown[] = [clientId];
    if (month) params.push(month);
    if (branchIds) params.push(branchIds);
    const branchFilter = branchIds
      ? `AND b.clientid = $1 AND ct.branch_id = ANY($${params.length}::uuid[])`
      : '';

    // Fetch tasks for the month
    const tasks = await this.ds.query(
      `SELECT
         ct.id, ct.title, ct.status, ct.frequency, ct.due_date AS "dueDate",
         cm.law_name AS "lawName",
         b.branchname AS "branchName"
       FROM compliance_tasks ct
       LEFT JOIN client_branches b ON b.id = ct.branch_id
       LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
       WHERE ct.client_id = $1
         ${month ? "AND to_char(ct.due_date, 'YYYY-MM') = $2" : ''}
         ${branchFilter}
       ORDER BY ct.due_date`,
      params,
    );

    const buf = await this.pdf.dtssReport(
      clientId,
      month || 'All',
      tasks,
      name,
      branchIds !== undefined,
    );
    this.streamPdf(res, buf, `dtss-${clientId}-${month || 'all'}.pdf`);
  }

  /* ──────── helpers ──────── */

  private async reportBranchIds(
    user: ReqUser,
    clientId: string,
    month?: string,
  ): Promise<string[] | undefined> {
    if (
      month &&
      (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    ) {
      throw new BadRequestException(
        'month must use YYYY-MM with a valid calendar month',
      );
    }
    const scope = await this.scope.resolve(user, clientId);
    if (scope.level === 'branches') {
      if (!scope.branchIds?.length) {
        throw new ForbiddenException(
          'No branches are assigned for this report',
        );
      }
      await this.entitlements.assertModule(clientId, 'EMPLOYEE_COMPLIANCE');
      return scope.branchIds;
    }
    return undefined;
  }

  private async clientName(clientId: string): Promise<string> {
    const rows = await this.ds.query(
      `SELECT client_name FROM clients WHERE id = $1`,
      [clientId],
    );
    return rows[0]?.client_name || 'Client';
  }

  private streamPdf(res: Response, buf: Buffer, filename: string): void {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }
}
