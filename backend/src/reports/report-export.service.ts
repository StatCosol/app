import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import type { Response } from 'express';

@Injectable()
export class ReportExportService {
  constructor(private readonly ds: DataSource) {}

  private async sendWorkbook(
    res: Response,
    filename: string,
    build: (wb: ExcelJS.Workbook) => Promise<void>,
  ) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Statco';
    wb.created = new Date();

    await build(wb);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  }

  private header(ws: ExcelJS.Worksheet, cols: Array<Partial<ExcelJS.Column>>) {
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  async exportComplianceCoverage(res: Response) {
    return this.sendWorkbook(res, 'compliance-coverage.xlsx', async (wb) => {
      const ws = wb.addWorksheet('Coverage');
      this.header(ws, [
        { header: 'Client', key: 'client_name', width: 28 },
        { header: 'Branch', key: 'branch_name', width: 28 },
        { header: 'State', key: 'state_code', width: 10 },
        { header: 'Applicable', key: 'applicable_count', width: 14 },
        { header: 'Not Applicable', key: 'not_applicable_count', width: 16 },
        { header: 'Total', key: 'total_compliances', width: 10 },
        { header: 'Coverage %', key: 'compliance_percent', width: 14 },
      ]);

      const rows = await this.ds.query(
        `SELECT
            "clientName" AS client_name,
            "branchName" AS branch_name,
            "stateCode" AS state_code,
            applicable_count,
            not_applicable_count,
            total_compliances,
            compliance_percent
         FROM vw_compliance_coverage
         ORDER BY client_name, branch_name`,
      );

      rows.forEach((r: Record<string, unknown>) => ws.addRow(r));
      ws.getColumn('compliance_percent').numFmt = '0.00';
    });
  }

  async exportOverdueAudits(res: Response) {
    return this.sendWorkbook(res, 'overdue-audits.xlsx', async (wb) => {
      const ws = wb.addWorksheet('Overdue Audits');
      this.header(ws, [
        { header: 'Client', key: 'client_name', width: 28 },
        { header: 'Branch', key: 'branch_name', width: 28 },
        { header: 'Audit Type', key: 'audit_type', width: 18 },
        { header: 'Due Date', key: 'due_date', width: 14 },
        { header: 'Days Overdue', key: 'days_overdue', width: 14 },
        { header: 'Auditor', key: 'assigned_auditor', width: 26 },
      ]);

      const rows = await this.ds.query(
        `SELECT
            c."clientName" AS client_name,
            b."branchName" AS branch_name,
            a.audit_type,
            a.due_date,
            (now()::date - a.due_date::date) AS days_overdue,
            u.email AS assigned_auditor
         FROM audits a
         JOIN client_branches b ON b.id = a.branch_id
         JOIN clients c ON c.id = b."clientId"
         LEFT JOIN users u ON u.id = a.assigned_auditor_id
         WHERE a.status <> 'COMPLETED'
           AND a.due_date < now()
         ORDER BY days_overdue DESC`,
      );

      rows.forEach((r: Record<string, unknown>) => ws.addRow(r));
      ws.getColumn('due_date').numFmt = 'yyyy-mm-dd';
    });
  }

  async exportAssignmentHealth(res: Response) {
    return this.sendWorkbook(res, 'assignment-health.xlsx', async (wb) => {
      const ws = wb.addWorksheet('Assignments');
      this.header(ws, [
        { header: 'Client', key: 'client_name', width: 28 },
        { header: 'Type', key: 'assignment_type', width: 10 },
        { header: 'Assignee', key: 'assignee', width: 28 },
        { header: 'Start Date', key: 'start_date', width: 14 },
        { header: 'Rotation Due', key: 'rotation_due_date', width: 16 },
        { header: 'Days Past Due', key: 'days_past_due', width: 14 },
      ]);

      const rows = await this.ds.query(
        `SELECT
            c."clientName" AS client_name,
            ca.assignment_type,
            u.email AS assignee,
            ca.start_date,
            CASE
              WHEN ca.assignment_type = 'CRM'
                THEN ca.start_date + interval '365 days'
              ELSE ca.start_date + interval '120 days'
            END AS rotation_due_date,
            (now()::date - CASE
               WHEN ca.assignment_type = 'CRM'
                 THEN (ca.start_date + interval '365 days')::date
               ELSE (ca.start_date + interval '120 days')::date
             END) AS days_past_due
         FROM client_assignments_current ca
         JOIN clients c ON c.id = ca.client_id
         JOIN users u ON u.id = ca.assigned_to_user_id
         ORDER BY days_past_due DESC`,
      );

      rows.forEach((r: Record<string, unknown>) => ws.addRow(r));
      ws.getColumn('start_date').numFmt = 'yyyy-mm-dd';
      ws.getColumn('rotation_due_date').numFmt = 'yyyy-mm-dd';
    });
  }
}
