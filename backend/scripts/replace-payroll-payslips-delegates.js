const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
let lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const enrichStart = findLine((l) => l.includes('private async enrichLeaveAttendanceValues'));
const enrichEnd = findLine((l) => l.includes('private normalizeHeader'));
const empStart = findLine((l) => l.includes('async listPayrollRunEmployees'));
const payslipEnd = findLine((l) => l.includes('async approveRegister'));

const delegates = `  async listPayrollRunEmployees(user: ReqUser, runId: string) {
    return this.payslipsService.listPayrollRunEmployees(user, runId);
  }

  async generatePayslipPdfForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    return this.payslipsService.generatePayslipPdfForPayroll(user, runId, employeeId);
  }

  async downloadArchivedPayslipForPayroll(
    user: ReqUser,
    runId: string,
    employeeId: string,
  ) {
    return this.payslipsService.downloadArchivedPayslipForPayroll(user, runId, employeeId);
  }

  async archiveRunPayslips(user: ReqUser, runId: string) {
    return this.payslipsService.archiveRunPayslips(user, runId);
  }

  async streamPayslipsZip(user: ReqUser, runId: string, res: Response) {
    return this.payslipsService.streamPayslipsZip(user, runId, res);
  }

  async listPayslips(_user: ReqUser, q: Record<string, any>) {
    return this.payslipsService.listPayslips(_user, q);
  }`;

for (const [start, end] of [
  [enrichStart, enrichEnd],
  [empStart, payslipEnd],
].sort((a, b) => b[0] - a[0])) {
  lines.splice(start, end - start);
}

const insertAt = findLine((l) => l.includes('async downloadRegisterForClient'));
lines.splice(insertAt + 4, 0, delegates);

let text = lines.join('\n');
if (!text.includes('PayrollPayslipsService')) {
  text = text.replace(
    "import { PayrollRunsService } from './payroll-runs.service';",
    "import { PayrollRunsService } from './payroll-runs.service';\nimport { PayrollPayslipsService } from './payroll-payslips.service';",
  );
  text = text.replace(
    'private readonly runsService: PayrollRunsService,',
    'private readonly runsService: PayrollRunsService,\n    private readonly payslipsService: PayrollPayslipsService,',
  );
}

// approvePayrollRun should delegate archive to payslipsService
text = text.replace(
  'await this.archiveRunPayslips(user, runId);',
  'await this.payslipsService.archiveRunPayslips(user, runId);',
);

fs.writeFileSync(src, text);
console.log('payroll.service payslip delegates applied');
