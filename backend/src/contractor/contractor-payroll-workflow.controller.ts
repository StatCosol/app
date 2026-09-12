import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ReqUser } from '../access/access-scope.service';
import { ContractorPayrollWorkflowService } from './contractor-payroll-workflow.service';

@Controller({ path: 'contractor-payroll/versions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'CONTRACTOR',
  'CRM',
  'AUDITOR',
  'CLIENT',
  'BRANCH_DESK',
  'ADMIN',
  'CCO',
  'CEO',
)
export class ContractorPayrollWorkflowController {
  constructor(private readonly workflow: ContractorPayrollWorkflowService) {}

  @Get('clients')
  clients(@CurrentUser() user: ReqUser) {
    return this.workflow.clients(user);
  }

  @Get()
  list(@CurrentUser() user: ReqUser, @Query() query: Record<string, string>) {
    return this.workflow.list(user, query);
  }

  @Post(':id/actions/:action')
  transition(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() body: { reason?: string },
  ) {
    return this.workflow.transition(user, id, action, body?.reason || '');
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflow.history(user, id);
  }

  @Get(':id/pack')
  async pack(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pack = await this.workflow.pack(user, id);
    const workbook = new ExcelJS.Workbook();
    const metadata = workbook.addWorksheet('Approval');
    metadata.addRows([
      ['Contractor payroll working pack', ''],
      ['Status', pack.version.status],
      ['Version', pack.version.version],
      ['Client', pack.version.clientId],
      ['Branch', pack.version.branchId || ''],
      ['Contractor', pack.version.contractorUserId],
      ['Period', pack.version.periodMonth],
      ['Employees', pack.version.employeeCount],
      ['Gross wage', pack.version.grossWage],
      ['Net salary', pack.version.netSalary],
      ['Exceptions', pack.version.exceptions],
      [
        'Scope',
        'Payroll calculations and review trail. Statutory filing, payment and bank proofs must be verified separately.',
      ],
    ]);
    metadata.columns = [{ width: 30 }, { width: 100 }];
    const definitions: Record<string, string[]> = {
      Payroll: [
        'employeeCode',
        'employeeName',
        'uan',
        'esic',
        'quotationId',
        'skillCategory',
        'daysWorked',
        'payableDailyWage',
        'basicWage',
        'otherEarnings',
        'grossWage',
        'totalEarnings',
        'pfDeduction',
        'esiDeduction',
        'ptDeduction',
        'lwfEmployeeDeduction',
        'netSalary',
        'totalEmployerContribution',
        'billingFees',
        'billingTotal',
      ],
      Attendance: ['employeeCode', 'employeeName', 'daysWorked'],
      'PF working': [
        'uan',
        'employeeCode',
        'employeeName',
        'pfWage',
        'pfDeduction',
        'pfEmployerContribution',
      ],
      'ESI working': [
        'esic',
        'esiWage',
        'employeeCode',
        'employeeName',
        'grossWage',
        'esiDeduction',
        'esiEmployerContribution',
      ],
      'PT and LWF working': [
        'employeeCode',
        'employeeName',
        'grossWage',
        'ptDeduction',
        'lwfEmployeeDeduction',
        'lwfEmployerContribution',
      ],
      Exceptions: [
        'employeeCode',
        'employeeName',
        'matchStatus',
        'mismatchReason',
      ],
    };
    for (const [name, keys] of Object.entries(definitions)) {
      const sheet = workbook.addWorksheet(name);
      sheet.columns = keys.map((key) => ({
        key,
        header: key.replace(/([A-Z])/g, ' $1'),
        width: 24,
      }));
      for (const row of pack.rows) {
        if (name === 'Exceptions' && row.matchStatus === 'MATCHED') continue;
        sheet.addRow(
          Object.fromEntries(
            keys.map((key) => [
              key,
              ['billingFees', 'billingTotal'].includes(key)
                ? ((row.calculationSnapshot?.result as any)?.[key] ?? '')
                : key === 'esiWage'
                  ? ((row.calculationSnapshot?.result as any)?.bases?.ESI_EMP ??
                    '')
                  : ['uan', 'esic', 'quotationId'].includes(key)
                    ? (row.calculationSnapshot?.[key] ?? '')
                    : (row[key as keyof typeof row] ?? ''),
            ]),
          ),
        );
      }
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const breakdown = workbook.addWorksheet('Quotation components');
    breakdown.columns = [
      'employeeCode',
      'quotationId',
      'component',
      'category',
      'amount',
    ].map((key) => ({ key, header: key, width: 24 }));
    for (const row of pack.rows) {
      const snapshot = row.calculationSnapshot as any;
      for (const component of snapshot?.rateCard?.components || [])
        breakdown.addRow({
          employeeCode: row.employeeCode,
          quotationId: snapshot.quotationId,
          component: component.label,
          category: component.category,
          amount: snapshot.result?.amounts?.[component.code],
        });
    }
    const history = workbook.addWorksheet('Review trail');
    history.columns = [
      'version',
      'action',
      'actorRole',
      'reason',
      'createdAt',
    ].map((key) => ({ key, header: key, width: key === 'reason' ? 80 : 25 }));
    history.addRows(pack.history);
    return new StreamableFile(Buffer.from(await workbook.xlsx.writeBuffer()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="contractor-payroll-${pack.version.periodMonth}-v${pack.version.version}.xlsx"`,
    });
  }
}
