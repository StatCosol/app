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
    start: findLine((l) => l.includes('async exportPreliminaryReportPdf')),
    end: findLine((l) => l.includes('/** List NCs assigned to the calling vendor')),
    insert: `  async exportPreliminaryReportPdf(user: ReqUser, auditId: string): Promise<Buffer> {
    return this.auditorDashboardService.exportPreliminaryReportPdf(user, auditId);
  }`,
  },
  {
    start: findLine((l) => l.includes('async generateChecklistFromCompliance')),
    end: findLine((l) => l.includes('//  NON-COMPLIANCE TRACKING — delegated')),
    insert: `  async generateChecklistFromCompliance(user: ReqUser, auditId: string) {
    return this.checklistService.generateChecklistFromCompliance(user, auditId);
  }`,
  },
  {
    start: findLine((l) => l.includes('// ─── Submission History')),
    end: findLine((l) => l.includes('/** Dashboard "Today / Upcoming Scheduled Audits"')),
    insert: `  async getSubmissionHistory(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getSubmissionHistory(user, auditId);
  }

  async getDocumentReviews(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getDocumentReviews(user, auditId);
  }

  async getAuditorDashboardSummary(user: ReqUser) {
    return this.auditorDashboardService.getAuditorDashboardSummary(user);
  }

  async getAuditorUpcomingAudits(user: ReqUser) {
    return this.auditorDashboardService.getAuditorUpcomingAudits(user);
  }

  async getAuditorRecentSubmitted(user: ReqUser) {
    return this.auditorDashboardService.getAuditorRecentSubmitted(user);
  }`,
  },
  {
    start: findLine((l) => l.includes('// ─── Audit Info')),
    end: findLine((l) => l.includes('//  OPEN WORKSPACE FROM SCHEDULE')),
    insert: `  async getAuditInfo(user: ReqUser, auditId: string) {
    return this.auditorDashboardService.getAuditInfo(user, auditId);
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
console.log('Updated audits.service.ts with checklist/dashboard delegates');
