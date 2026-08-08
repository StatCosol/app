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

const start = findLine((l) => l.includes('// ─── Auditor: List Documents for Audit'));
const end = findLine((l) => l.includes('// ─── Auditor: Submit Audit'));

const delegates = `  // ─── Document review — delegated to AuditDocumentReviewService ───

  async listDocumentsForAudit(user: ReqUser, auditId: string) {
    return this.documentReviewService.listDocumentsForAudit(user, auditId);
  }

  async reviewDocumentForAudit(
    user: ReqUser,
    auditId: string,
    docId: string,
    decision: 'COMPLIED' | 'NON_COMPLIED',
    remarks?: string,
    sourceTable?: string,
  ) {
    return this.documentReviewService.reviewDocumentForAudit(
      user,
      auditId,
      docId,
      decision,
      remarks,
      sourceTable,
    );
  }`;

lines.splice(start, end - start, delegates);

let text = lines.join('\n');
if (!text.includes('AuditDocumentReviewService')) {
  text = text.replace(
    "import { AuditListingService } from './audit-listing.service';",
    "import { AuditListingService } from './audit-listing.service';\nimport { AuditDocumentReviewService } from './audit-document-review.service';",
  );
  text = text.replace(
    'private readonly listingService: AuditListingService,',
    'private readonly listingService: AuditListingService,\n    private readonly documentReviewService: AuditDocumentReviewService,',
  );
}

fs.writeFileSync(src, text);
console.log('audits.service document review delegates applied');
