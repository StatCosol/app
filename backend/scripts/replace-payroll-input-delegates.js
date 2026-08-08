const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
let lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const replacements = [
  {
    start: findLine((l) => l.includes('CLIENT_ALLOWED_TRANSITIONS')),
    end: findLine((l) => l.includes('async clientListPayrollRuns')),
    insert: `  async clientUpdatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUpdatePayrollInputStatusDto,
  ) {
    return this.inputService.clientUpdatePayrollInputStatus(user, payrollInputId, dto);
  }

  async clientGetPayrollInputStatusHistory(user: ReqUser, payrollInputId: string) {
    return this.inputService.clientGetPayrollInputStatusHistory(user, payrollInputId);
  }

  async clientCreatePayrollInput(user: ReqUser, dto: ClientCreatePayrollInputDto) {
    return this.inputService.clientCreatePayrollInput(user, dto);
  }

  async clientListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    return this.inputService.clientListPayrollInputs(user, q);
  }`,
  },
  {
    start: findLine((l) => l.includes('async clientUploadPayrollInputFile')),
    end: findLine((l) => l.includes('// ---------- Payroll Templates')),
    insert: `  async clientUploadPayrollInputFile(
    user: ReqUser,
    payrollInputId: string,
    dto: ClientUploadPayrollInputFileDto,
    file: Express.Multer.File,
  ) {
    return this.inputService.clientUploadPayrollInputFile(user, payrollInputId, dto, file);
  }

  async clientListPayrollInputFiles(user: ReqUser, payrollInputId: string) {
    return this.inputService.clientListPayrollInputFiles(user, payrollInputId);
  }

  async payrollListPayrollInputs(user: ReqUser, q: Record<string, any>) {
    return this.inputService.payrollListPayrollInputs(user, q);
  }`,
  },
  {
    start: findLine((l) => l.includes('// ---------- Payroll Templates')),
    end: findLine((l) => l.includes('async createPayrollRun')),
    insert: `  async payrollUploadClientTemplate(
    user: ReqUser,
    clientId: string,
    file: Express.Multer.File,
    dto: { effectiveFrom?: string; effectiveTo?: string },
  ) {
    return this.inputService.payrollUploadClientTemplate(user, clientId, file, dto);
  }

  async payrollGetClientTemplateMeta(user: ReqUser, clientId: string) {
    return this.inputService.payrollGetClientTemplateMeta(user, clientId);
  }

  async payrollDownloadClientTemplate(user: ReqUser, clientId: string) {
    return this.inputService.payrollDownloadClientTemplate(user, clientId);
  }

  async clientGetPayrollTemplateMeta(user: ReqUser) {
    return this.inputService.clientGetPayrollTemplateMeta(user);
  }

  async clientDownloadPayrollTemplate(user: ReqUser) {
    return this.inputService.clientDownloadPayrollTemplate(user);
  }

  async updatePayrollInputStatus(
    user: ReqUser,
    payrollInputId: string,
    dto: UpdatePayrollInputStatusDto,
  ) {
    return this.inputService.updatePayrollInputStatus(user, payrollInputId, dto);
  }

  async listPayrollInputFilesForPayroll(user: ReqUser, payrollInputId: string) {
    return this.inputService.listPayrollInputFilesForPayroll(user, payrollInputId);
  }

  async downloadPayrollInputFileForClient(user: ReqUser, fileId: string) {
    return this.inputService.downloadPayrollInputFileForClient(user, fileId);
  }

  async downloadPayrollInputFileForPayroll(user: ReqUser, fileId: string) {
    return this.inputService.downloadPayrollInputFileForPayroll(user, fileId);
  }`,
  },
  {
    start: findLine((l) => l.includes('// --- Templates listing ---')),
    end: findLine((l) => l.includes('// --- Payslips listing ---')),
    insert: `  async listTemplates() {
    return this.inputService.listTemplates();
  }`,
  },
];

for (let r = replacements.length - 1; r >= 0; r--) {
  const { start, end, insert } = replacements[r];
  if (start < 0 || end < 0) {
    console.error('Failed', r, start, end);
    process.exit(1);
  }
  lines.splice(start, end - start, insert);
}

fs.writeFileSync(src, lines.join('\n'));
console.log('payroll.service delegates');
