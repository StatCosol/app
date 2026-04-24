import {
  Controller,
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
  ) {}

  /* ── Compliance Summary (per client) ── */

  @Version('1')
  @ApiOperation({ summary: 'Compliance Summary' })
  @Get('compliance/:clientId')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  async complianceSummary(
    @Param('clientId') clientId: string,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const name = await this.clientName(clientId);
    const buf = await this.pdf.complianceSummary(clientId, month, name);
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
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  async riskHeatmap(
    @Param('clientId') clientId: string,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const name = await this.clientName(clientId);
    const buf = await this.pdf.riskHeatmap(clientId, month, name);
    this.streamPdf(res, buf, `risk-heatmap-${clientId}.pdf`);
  }

  /* ── DTSS Report (per client + month) ── */

  @Version('1')
  @ApiOperation({ summary: 'Dtss' })
  @Get('dtss/:clientId')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  async dtss(
    @Param('clientId') clientId: string,
    @Query('month') month: string,
    @Res() res: Response,
  ): Promise<void> {
    const name = await this.clientName(clientId);

    // Fetch tasks for the month
    const tasks = await this.ds.query(
      `SELECT
         ct.id, ct.title, ct.status, ct.frequency, ct.due_date AS "dueDate",
         ct.law_name AS "lawName",
         b.branchname AS "branchName"
       FROM compliance_tasks ct
       LEFT JOIN client_branches b ON b.id = ct.branch_id
       WHERE ct.client_id = $1
         ${month ? "AND to_char(ct.due_date, 'YYYY-MM') = $2" : ''}
       ORDER BY ct.due_date`,
      month ? [clientId, month] : [clientId],
    );

    const buf = await this.pdf.dtssReport(
      clientId,
      month || 'All',
      tasks,
      name,
    );
    this.streamPdf(res, buf, `dtss-${clientId}-${month || 'all'}.pdf`);
  }

  /* ──────── helpers ──────── */

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
