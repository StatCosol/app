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

const replacements = [
  {
    start: findLine((l) => l.includes('async clientListRegistersRecords')),
    end: findLine((l) => l.includes('async getPayrollSummary')),
    insert: `  async clientListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    return this.registersService.clientListRegistersRecords(user, q);
  }

  async streamClientRegistersPack(user: ReqUser, q: Record<string, any>, res: Response) {
    return this.registersService.streamClientRegistersPack(user, q, res);
  }

  async clientUploadRegisterRecord(
    user: ReqUser,
    dto: ClientUploadRegisterRecordDto,
    file: Express.Multer.File,
  ) {
    return this.registersService.clientUploadRegisterRecord(user, dto, file);
  }

  async payrollUploadRegisterRecord(user: ReqUser, dto: any, file: Express.Multer.File) {
    return this.registersService.payrollUploadRegisterRecord(user, dto, file);
  }

  async payrollListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    return this.registersService.payrollListRegistersRecords(user, q);
  }

  async streamPayrollRegistersPack(user: ReqUser, q: Record<string, any>, res: Response) {
    return this.registersService.streamPayrollRegistersPack(user, q, res);
  }

  async payrollListRegistersFormatted(user: ReqUser, q: Record<string, any>) {
    return this.registersService.payrollListRegistersFormatted(user, q);
  }`,
  },
  {
    start: findLine((l) => l.includes('async downloadRegisterForPayroll')),
    end: findLine((l) => l.includes('async listPayrollRuns')),
    insert: `  async downloadRegisterForPayroll(user: ReqUser, registerId: string) {
    return this.registersService.downloadRegisterForPayroll(user, registerId);
  }

  async downloadRegisterForClient(user: ReqUser, registerId: string) {
    return this.registersService.downloadRegisterForClient(user, registerId);
  }`,
  },
  {
    start: findLine((l) => l.includes('// ── Register Approval')),
    end: findLine((l) => l.includes('// --- Templates listing ---')),
    insert: `  async approveRegister(user: ReqUser, registerId: string) {
    return this.registersService.approveRegister(user, registerId);
  }

  async rejectRegister(user: ReqUser, registerId: string, reason?: string) {
    return this.registersService.rejectRegister(user, registerId, reason);
  }

  async auditorListRegisters(user: ReqUser, q: Record<string, any>) {
    return this.registersService.auditorListRegisters(user, q);
  }

  async downloadRegisterForAuditor(user: ReqUser, registerId: string) {
    return this.registersService.downloadRegisterForAuditor(user, registerId);
  }`,
  },
];

for (let r = replacements.length - 1; r >= 0; r--) {
  const { start, end, insert } = replacements[r];
  if (start < 0 || end < 0) {
    console.error('Failed range', r, start, end);
    process.exit(1);
  }
  lines.splice(start, end - start, insert);
}

fs.writeFileSync(src, lines.join('\n'));
console.log('Updated payroll.service.ts with register delegates');
