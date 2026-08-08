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

const ranges = [
  [findLine((l) => l.includes('// ─── CRM: list audits')), findLine((l) => l.includes('async getReadinessForAuditor'))],
  [findLine((l) => l.includes('async listForAuditor(')), findLine((l) => l.includes('async getReportForAuditor'))],
  [findLine((l) => l.includes('async listForClient(')), findLine((l) => l.includes('// ─── Branch Audit KPI'))],
  [findLine((l) => l.includes('private ensurePeriod')), findLine((l) => l.includes('// ─── Audit Scoring'))],
  [findLine((l) => l.includes('async listContractorsForAuditor')), findLine((l) => l.includes('// ─── Auditor: List Documents'))],
  [findLine((l) => l.includes('async getUploadLockForContractor')), findLine((l) => l.includes('// ─── Auditor: Force-Complete'))],
  [findLine((l) => l.includes('async getDashboardAudits(')), findLine((l) => l.includes('//  CONTRACTOR / BRANCH NC VISIBILITY'))],
];

const delegates = `  // ─── Listing / KPI — delegated to AuditListingService ───

  async listForCrm(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
      clientId?: string;
      auditType?: string;
    },
  ) {
    return this.listingService.listForCrm(user, q);
  }

  async getForCrm(user: ReqUser, id: string) {
    return this.listingService.getForCrm(user, id);
  }

  async assignAuditorForCrm(
    user: ReqUser,
    auditId: string,
    dto: {
      assignedAuditorId?: string;
      dueDate?: string | null;
      notes?: string | null;
    },
  ) {
    return this.listingService.assignAuditorForCrm(user, auditId, dto);
  }

  async getReadinessForCrm(user: ReqUser, id: string) {
    return this.listingService.getReadinessForCrm(user, id);
  }

  async listForAuditor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      frequency?: string;
      status?: string;
      year?: number | string;
      clientId?: string;
      contractorUserId?: string;
      branchId?: string;
    },
  ) {
    return this.listingService.listForAuditor(user, q);
  }

  async listForContractor(
    user: ReqUser,
    q: {
      page?: number | string;
      pageSize?: number | string;
      status?: string;
      year?: number | string;
    },
  ) {
    return this.listingService.listForContractor(user, q);
  }

  async getForAuditor(user: ReqUser, id: string) {
    return this.listingService.getForAuditor(user, id);
  }

  async listForClient(
    user: ReqUser,
    q: { frequency?: string; status?: string; year?: number | string },
  ) {
    return this.listingService.listForClient(user, q);
  }

  async getSummaryForClient(user: ReqUser) {
    return this.listingService.getSummaryForClient(user);
  }

  async getBranchAuditKpi(branchId: string, from: string, to: string) {
    return this.listingService.getBranchAuditKpi(branchId, from, to);
  }

  async getBranchAuditKpiSingle(branchId: string, periodCode: string) {
    return this.listingService.getBranchAuditKpiSingle(branchId, periodCode);
  }

  async listContractorsForAuditor(user: ReqUser, clientId: string) {
    return this.listingService.listContractorsForAuditor(user, clientId);
  }

  async getUploadLockForContractor(user: ReqUser, auditId: string) {
    return this.listingService.getUploadLockForContractor(user, auditId);
  }

  async getDashboardAudits(
    user: ReqUser,
    tab: string,
    filters: {
      clientId?: string;
      auditType?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    return this.listingService.getDashboardAudits(user, tab, filters);
  }`;

// Remove extracted blocks from bottom to top
for (let i = ranges.length - 1; i >= 0; i--) {
  const [start, end] = ranges[i];
  if (start < 0 || end < 0) {
    console.error('Bad range', i, start, end);
    process.exit(1);
  }
  lines.splice(start, end - start);
}

const insertAt = findLine((l) => l.includes('async getReadinessForAuditor'));
lines.splice(insertAt, 0, delegates);

let text = lines.join('\n');
text = text.replace(
  /export interface BranchAuditKpiItem \{[\s\S]*?\}\n\n/,
  "export type { BranchAuditKpiItem } from './audit-listing.service';\n\n",
);

if (!text.includes('AuditListingService')) {
  text = text.replace(
    "import { AuditReportService } from './audit-report.service';",
    "import { AuditReportService } from './audit-report.service';\nimport { AuditListingService } from './audit-listing.service';",
  );
  text = text.replace(
    'private readonly reportService: AuditReportService,',
    'private readonly reportService: AuditReportService,\n    private readonly listingService: AuditListingService,',
  );
}

fs.writeFileSync(src, text);
console.log('audits.service listing delegates applied');
