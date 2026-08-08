const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

const ncDelegates = `  /** List NCs for an audit (auditor view). */
  async listNcsForAudit(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForAudit(user, auditId);
  }

  /** List NCs assigned to the calling vendor/contractor. */
  async listNcsForVendor(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForVendor(user, auditId);
  }

  async getNonCompliancesForAudit(user: ReqUser, auditId: string) {
    return this.ncService.getNonCompliancesForAudit(user, auditId);
  }

  async getReverificationList(user: ReqUser) {
    return this.ncService.getReverificationList(user);
  }

  async reviewCorrectedDocument(
    user: ReqUser,
    ncId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remark?: string,
  ) {
    return this.ncService.reviewCorrectedDocument(user, ncId, decision, remark);
  }

  async getRepeatNcAnalytics(user: ReqUser, clientId: string) {
    return this.ncService.getRepeatNcAnalytics(user, clientId);
  }

  async listOverdueNcsForAuditor(user: ReqUser) {
    return this.ncService.listOverdueNcsForAuditor(user);
  }

  async getNonCompliancesForContractor(user: ReqUser) {
    return this.ncService.getNonCompliancesForContractor(user);
  }

  async uploadCorrectedFile(
    user: ReqUser,
    ncId: string,
    file: {
      path: string;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    return this.ncService.uploadCorrectedFile(user, ncId, file);
  }
`;

function replaceRange(startLine, endLine, replacement) {
  const startIdx = lines.findIndex((l, i) => {
    if (i + 1 < startLine) return false;
    return true;
  });
}

// Replace listNcsForAudit block (line 2620 comment through 2673)
function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const replacements = [
  {
    start: findLine((l) => l.includes('/** List NCs for an audit')),
    end: findLine((l) => l.includes('/** Phase 4: Export preliminary')),
    insert: `  /** List NCs for an audit (auditor view). */
  async listNcsForAudit(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForAudit(user, auditId);
  }

`,
  },
  {
    start: findLine((l) => l.includes('/** List NCs assigned to the calling vendor')),
    end: findLine((l) => l.includes('async submitAudit(')),
    insert: `  /** List NCs assigned to the calling vendor/contractor. */
  async listNcsForVendor(user: ReqUser, auditId: string) {
    return this.ncService.listNcsForVendor(user, auditId);
  }

`,
  },
  {
    start: findLine((l) => l.includes('//  NON-COMPLIANCE TRACKING')),
    end: findLine((l) => l.includes('// ─── Submission History')),
    insert: `  // ═══════════════════════════════════════════════════════════════
  //  NON-COMPLIANCE TRACKING — delegated to AuditNcService
  // ═══════════════════════════════════════════════════════════════

  async getNonCompliancesForAudit(user: ReqUser, auditId: string) {
    return this.ncService.getNonCompliancesForAudit(user, auditId);
  }

  async getReverificationList(user: ReqUser) {
    return this.ncService.getReverificationList(user);
  }

  async reviewCorrectedDocument(
    user: ReqUser,
    ncId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remark?: string,
  ) {
    return this.ncService.reviewCorrectedDocument(user, ncId, decision, remark);
  }

  async getRepeatNcAnalytics(user: ReqUser, clientId: string) {
    return this.ncService.getRepeatNcAnalytics(user, clientId);
  }

  async listOverdueNcsForAuditor(user: ReqUser) {
    return this.ncService.listOverdueNcsForAuditor(user);
  }

`,
  },
  {
    start: findLine((l) => l.includes('//  CONTRACTOR / BRANCH NC VISIBILITY')),
    end: findLine((l) => l.includes('// ─── Audit Info')),
    insert: `  // ═══════════════════════════════════════════════════════════════
  //  CONTRACTOR / BRANCH NC VISIBILITY — delegated to AuditNcService
  // ═══════════════════════════════════════════════════════════════

  async getNonCompliancesForContractor(user: ReqUser) {
    return this.ncService.getNonCompliancesForContractor(user);
  }

  async uploadCorrectedFile(
    user: ReqUser,
    ncId: string,
    file: {
      path: string;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    return this.ncService.uploadCorrectedFile(user, ncId, file);
  }

`,
  },
];

// Apply from bottom to top so indices stay valid
for (let r = replacements.length - 1; r >= 0; r--) {
  const { start, end, insert } = replacements[r];
  if (start < 0 || end < 0) {
    console.error('Failed to find range', r, start, end);
    process.exit(1);
  }
  lines.splice(start, end - start, insert.trimEnd());
}

fs.writeFileSync(src, lines.join('\n'));
console.log('Updated audits.service.ts with NC delegates');
