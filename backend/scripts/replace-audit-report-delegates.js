const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
let lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const replacements = [
  {
    start: findLine((l) => l.includes('async getReportStatusForAuditor')),
    end: findLine((l) => l.includes('private async buildReadinessSnapshot')),
    insert: `  async getReportStatusForAuditor(user: ReqUser, id: string) {
    return this.reportService.getReportStatusForAuditor(user, id);
  }

  private async buildReadinessSnapshot(audit: AuditEntity) {`,
  },
  {
    start: findLine((l) => l.includes('private async buildReportStatus')),
    end: findLine((l) => l.includes('async approveReportForCrm')),
    insert: '',
  },
  {
    start: findLine((l) => l.includes('async getReportStatusForCrm')),
    end: findLine((l) => l.includes('// ─── Audit Status Transitions')),
    insert: `  async getReportStatusForCrm(user: ReqUser, id: string) {
    return this.reportService.getReportStatusForCrm(user, id);
  }

  async approveReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.approveReportForCrm(user, auditId, remarks);
  }

  async publishReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.publishReportForCrm(user, auditId, remarks);
  }

  async sendBackReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.sendBackReportForCrm(user, auditId, remarks);
  }

  async holdReportForCrm(user: ReqUser, auditId: string, remarks?: string) {
    return this.reportService.holdReportForCrm(user, auditId, remarks);
  }`,
  },
  {
    start: findLine((l) => l.includes('async getReportForAuditor')),
    end: findLine((l) => l.includes('async listForClient')),
    insert: `  async getReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.getReportForAuditor(user, auditId);
  }

  async saveReportDraftForAuditor(
    user: ReqUser,
    auditId: string,
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    return this.reportService.saveReportDraftForAuditor(user, auditId, dto);
  }

  async finalizeReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.finalizeReportForAuditor(user, auditId);
  }

  async reopenReportForAuditor(user: ReqUser, auditId: string) {
    return this.reportService.reopenReportForAuditor(user, auditId);
  }

  async exportReportPdfForAuditor(user: ReqUser, auditId: string): Promise<Buffer> {
    return this.reportService.exportReportPdfForAuditor(user, auditId);
  }`,
  },
  {
    start: findLine((l) => l.includes('private async ensureAuditorAuditAccess')),
    end: findLine((l) => l.includes('// ─── Branch Audit KPI')),
    insert: '',
  },
];

for (let r = replacements.length - 1; r >= 0; r--) {
  const { start, end, insert } = replacements[r];
  if (start < 0 || end < 0) {
    console.error('Failed', r, start, end);
    process.exit(1);
  }
  if (insert === '' && r === 0) continue;
  if (insert.includes('buildReadinessSnapshot')) {
    lines.splice(start, end - start, insert);
    continue;
  }
  if (insert === '') {
    lines.splice(start, end - start);
    continue;
  }
  lines.splice(start, end - start, insert);
}

fs.writeFileSync(src, lines.join('\n'));
console.log('audits.service report delegates');
