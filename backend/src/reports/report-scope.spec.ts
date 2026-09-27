import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Response } from 'express';
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import { OperationalScopeService } from '../access/operational-scope.service';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { PdfReportController } from './pdf-report.controller';
import { PdfReportService } from './pdf-report.service';
import { ComplianceReportController } from './compliance-report.controller';
import { AuditReportController } from './audit-report.controller';
import { AssignmentReportController } from './assignment-report.controller';
import { ReportExportController } from './report-export.controller';
import { ReportExportService } from './report-export.service';

describe('Operational report scope', () => {
  const user = { id: 'user', userId: 'user', roleCode: 'CCO' } as ReqUser;
  let query: jest.Mock;
  let db: DataSource;
  let access: Record<string, jest.Mock>;
  let scope: OperationalScopeService;
  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    db = { query } as unknown as DataSource;
    access = {
      getScope: jest.fn().mockResolvedValue({ level: 'all' }),
      getCcoClientIds: jest.fn().mockResolvedValue(['company-a']),
      assertClientAllowed: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
    };
    scope = new OperationalScopeService(
      access as unknown as AccessScopeService,
    );
  });

  describe.each(['complianceSummary', 'riskHeatmap', 'dtss'] as const)(
    '%s PDF',
    (method) => {
      const response = () =>
        ({ set: jest.fn(), end: jest.fn() }) as unknown as Response;
      it('rejects a CCO outside the company before reading or rendering', async () => {
        const render = jest.fn();
        const controller = new PdfReportController(
          { [method]: render } as unknown as PdfReportService,
          db,
          scope,
        );
        await expect(
          controller[method](user, 'company-b', '2026-09', response()),
        ).rejects.toThrow(ForbiddenException);
        expect(query).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
      });

      it('rejects company-wide output for a branch user', async () => {
        access.getScope.mockResolvedValue({
          level: 'branches',
          clientId: 'company-a',
          branchIds: ['branch-a'],
        });
        const controller = new PdfReportController(
          {} as PdfReportService,
          db,
          scope,
        );
        await expect(
          controller[method](
            { ...user, roleCode: 'CLIENT' },
            'company-a',
            '2026-09',
            response(),
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(query).not.toHaveBeenCalled();
      });

      it('streams the report for an assigned company', async () => {
        const buffer = Buffer.from('mock-pdf');
        const render = jest.fn().mockResolvedValue(buffer);
        const pdf = {
          complianceSummary: render,
          riskHeatmap: render,
          dtssReport: render,
        };
        const end = jest.fn();
        const res = Object.assign(response(), { end });
        await new PdfReportController(
          pdf as unknown as PdfReportService,
          db,
          scope,
        )[method](user, 'company-a', '2026-09', res);
        expect(access.assertCcoClientAllowed).toHaveBeenCalledWith(
          user,
          'company-a',
        );
        expect(render).toHaveBeenCalled();
        expect(end).toHaveBeenCalledWith(buffer);
      });
    },
  );

  it.each([{ clientIds: ['company-a'] }, { clientIds: [] }])(
    'scopes all CCO JSON reports to %j',
    async ({ clientIds }) => {
      access.getCcoClientIds.mockResolvedValue(clientIds);
      await new ComplianceReportController(db, scope).summary(user);
      await new AuditReportController(db, scope).overdue(user);
      await new AssignmentReportController(db, scope).health(user);
      expect(query).toHaveBeenCalledTimes(3);
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('ANY($1::uuid[])');
        expect(params).toEqual([clientIds]);
      }
    },
  );

  it('preserves auditor ownership filtering', async () => {
    await new AuditReportController(db, scope).overdue({
      ...user,
      roleCode: 'AUDITOR',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('a.assigned_auditor_id = $1'),
      ['user'],
    );
    expect(query.mock.calls[0][0]).toContain(
      "a.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED')",
    );
    expect(query.mock.calls[0][0]).toContain('a.due_date < CURRENT_DATE');
  });

  it('preserves global administrator reporting', async () => {
    await new ComplianceReportController(db, scope).summary({
      ...user,
      roleCode: 'ADMIN',
    });
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('ANY('), []);
  });

  describe.each(['compliance', 'audits', 'assignments'] as const)(
    '%s workbook',
    (method) => {
      it.each([{ ids: ['company-a'] }, { ids: [] }])(
        'filters CCO rows before producing an XLSX (%j)',
        async ({ ids }) => {
          access.getCcoClientIds.mockResolvedValue(ids);
          const res = Object.assign(new PassThrough(), {
            setHeader: jest.fn(),
          });
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          const done = new Promise<void>((resolve, reject) => {
            res.on('end', resolve);
            res.on('error', reject);
          });
          await new ReportExportController(new ReportExportService(db), scope)[
            method
          ](user, res as unknown as Response);
          await done;
          expect(query).toHaveBeenCalledWith(
            expect.stringContaining('ANY($1::uuid[])'),
            [ids],
          );
          if (method === 'audits') {
            expect(query.mock.calls[0][0]).toContain(
              "a.status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED')",
            );
            expect(query.mock.calls[0][0]).toContain(
              'a.due_date < CURRENT_DATE',
            );
          }
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(Buffer.concat(chunks) as any);
          expect(workbook.worksheets).toHaveLength(1);
          expect(workbook.worksheets[0].rowCount).toBe(1);
          expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
        },
      );
    },
  );
});
