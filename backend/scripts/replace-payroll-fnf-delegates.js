const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
let content = fs.readFileSync(src, 'utf8');
const lines = content.split(/\r?\n/);

const startIdx = lines.findIndex((l) =>
  l.includes('// FULL & FINAL (F&F)'),
);
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('async processPayrollRun'));
if (startIdx < 0 || endIdx < 0) {
  console.error('Could not find FNF block', startIdx, endIdx);
  process.exit(1);
}

const delegates = `  // ====================
  // FULL & FINAL (F&F) — delegated to PayrollFnfService
  // ====================
  async listFnf(user: ReqUser, q: Record<string, any>) {
    return this.fnfService.listFnf(user, q);
  }

  async createFnf(user: ReqUser, dto: CreateFnfDto) {
    return this.fnfService.createFnf(user, dto);
  }

  async updateFnfStatus(user: ReqUser, fnfId: string, dto: UpdateFnfStatusDto) {
    return this.fnfService.updateFnfStatus(user, fnfId, dto);
  }

  async saveFnfBreakup(
    user: ReqUser,
    fnfId: string,
    body: {
      settlementBreakup: Record<string, number>;
      manualOverride?: boolean;
      remarks?: string;
    },
  ) {
    return this.fnfService.saveFnfBreakup(user, fnfId, body);
  }

  async getFnfDetail(user: ReqUser, fnfId: string) {
    return this.fnfService.getFnfDetail(user, fnfId);
  }

  async uploadFnfDocument(
    user: ReqUser,
    fnfId: string,
    file: {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType?: string;
    },
    docType: string,
    docName: string,
    remarks?: string,
  ) {
    return this.fnfService.uploadFnfDocument(
      user,
      fnfId,
      file,
      docType,
      docName,
      remarks,
    );
  }

  async listFnfDocuments(user: ReqUser, fnfId: string) {
    return this.fnfService.listFnfDocuments(user, fnfId);
  }

  async getFnfDocument(user: ReqUser, docId: string) {
    return this.fnfService.getFnfDocument(user, docId);
  }

  async deleteFnfDocument(user: ReqUser, docId: string) {
    return this.fnfService.deleteFnfDocument(user, docId);
  }

  async generateFnfDocumentPdf(
    user: ReqUser,
    fnfId: string,
    docType: string,
    override?: {
      pendingSalary?: number;
      leaveEncashment?: number;
      bonusArrears?: number;
      deductions?: number;
      recoveries?: number;
      settlementAmount?: number;
    },
  ) {
    return this.fnfService.generateFnfDocumentPdf(
      user,
      fnfId,
      docType,
      override,
    );
  }

`;

const newLines = [
  ...lines.slice(0, startIdx - 1),
  delegates.trimEnd(),
  '',
  ...lines.slice(endIdx),
];
fs.writeFileSync(src, newLines.join('\n'));
console.log('Replaced FNF block with delegates');
