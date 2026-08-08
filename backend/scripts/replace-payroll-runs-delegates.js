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

const delegates = `  async clientListPayrollRuns(user: ReqUser, q: Record<string, any>) {
    return this.runsService.clientListPayrollRuns(user, q);
  }

  async createPayrollRun(user: ReqUser, dto: CreatePayrollRunDto) {
    return this.runsService.createPayrollRun(user, dto);
  }

  async deleteDraftPayrollRun(user: ReqUser, runId: string) {
    return this.runsService.deleteDraftPayrollRun(user, runId);
  }

  async listPayrollRuns(user: ReqUser, q: Record<string, any>) {
    return this.runsService.listPayrollRuns(user, q);
  }

  async processPayrollRun(user: ReqUser, runId: string) {
    return this.runsService.processPayrollRun(user, runId);
  }

  async seedMarchEl(runId: string) {
    return this.runsService.seedMarchEl(runId);
  }

  async removeNotInSheet(runId: string) {
    return this.runsService.removeNotInSheet(runId);
  }`;

const ranges = [
  [findLine((l) => l.includes('async clientListPayrollRuns')), findLine((l) => l.includes('async clientUploadPayrollInputFile'))],
  [findLine((l) => l.includes('async createPayrollRun')), findLine((l) => l.includes('async uploadPayrollRunEmployees'))],
  [findLine((l) => l.includes('async listPayrollRuns')), findLine((l) => l.includes('async listPayrollRunEmployees'))],
  [findLine((l) => l.includes('async processPayrollRun')), findLine((l) => l.includes('async approvePayrollRun'))],
  [findLine((l) => l.includes('async seedMarchEl')), findLine((l) => l.includes('async removeNotInSheet')) + 30],
];

for (let i = ranges.length - 1; i >= 0; i--) {
  const [start, end] = ranges[i];
  if (start < 0 || end < 0) {
    console.error('bad range', i, start, end);
    process.exit(1);
  }
  lines.splice(start, end - start);
}

const insertAt = findLine((l) => l.includes('async clientUploadPayrollInputFile'));
lines.splice(insertAt, 0, delegates);

let text = lines.join('\n');
if (!text.includes('PayrollRunsService')) {
  text = text.replace(
    "import { PayrollInputService } from './payroll-input.service';",
    "import { PayrollInputService } from './payroll-input.service';\nimport { PayrollRunsService } from './payroll-runs.service';",
  );
  text = text.replace(
    'private readonly inputService: PayrollInputService,',
    'private readonly inputService: PayrollInputService,\n    private readonly runsService: PayrollRunsService,',
  );
}

fs.writeFileSync(src, text);
console.log('payroll.service runs delegates applied');
