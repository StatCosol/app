import { BadRequestException } from '@nestjs/common';
import { AUDIT_CHECKLIST_TEMPLATES } from './audit-checklist-templates';

type AuditScope = {
  id?: string;
  auditType: string;
  clientId: string;
  contractorUserId?: string | null;
};
type QueryRunner = { query(sql: string, parameters?: any[]): Promise<any> };

export async function auditChecklistEntries(
  audit: AuditScope,
  db: QueryRunner,
): Promise<Array<[string, string?]>> {
  // For CONTRACTOR audits with a linked contractor, derive checklist from their
  // actual required document types so docType codes match uploaded documents
  // and auto-linking fires correctly.
  let entries: Array<[string, string?]> =
    AUDIT_CHECKLIST_TEMPLATES[audit.auditType] || [];

  if (audit.auditType === 'CONTRACTOR' && audit.contractorUserId) {
    const CONTRACTOR_DOC_LABELS: Record<string, string> = {
      WAGE_REGISTER: 'Wage Register',
      MUSTER_ROLL: 'Muster Roll',
      OT_REGISTER: 'Overtime (OT) Register',
      PF_CHALLAN: 'PF Challan',
      ESI_CHALLAN: 'ESI Challan',
      PT_CHALLAN: 'Professional Tax (PT) Challan',
      CLRA_LICENSE: 'CLRA License',
      PF_REGISTRATION: 'PF Registration',
      ESI_REGISTRATION: 'ESI Registration',
      WORK_ORDER: 'Work Order / Contract Agreement',
      REGISTER_OF_FINES: 'Register of Fines',
      REGISTER_OF_DEDUCTIONS: 'Register of Deductions',
      REGISTER_OF_ADVANCES: 'Register of Advances',
      EMPLOYMENT_REGISTER_F13: 'Register of Employment (Form-13)',
      HALF_YEARLY_RETURNS_F14: 'Half Yearly Returns (Form XIV)',
      SERVICE_CERTIFICATE: 'Service Certificates',
      EMPLOYMENT_CARDS: 'Employment Cards',
      WAGE_SLIPS: 'Wage Slips',
      BONUS_FORM_C: 'Bonus Register (Form C)',
      MUSTER_ROLL_REGISTER: 'Muster Roll Register',
    };
    const toLabel = (dt: string) =>
      CONTRACTOR_DOC_LABELS[dt] ??
      dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    // Standard monthly types always required
    const standardTypes = [
      'WAGE_REGISTER',
      'MUSTER_ROLL',
      'OT_REGISTER',
      'PF_CHALLAN',
      'ESI_CHALLAN',
      'PT_CHALLAN',
    ];

    // CRM-configured extras for this contractor
    const dbRows = await db.query(
      `SELECT DISTINCT doc_type FROM contractor_required_documents
         WHERE contractor_user_id = $1 AND client_id = $2 AND is_required = true`,
      [audit.contractorUserId, audit.clientId],
    );
    const extraTypes: string[] = (dbRows as { doc_type: string }[]).map(
      (r) => r.doc_type,
    );

    const allTypes = [...standardTypes];
    for (const dt of extraTypes) {
      if (!allTypes.includes(dt)) allTypes.push(dt);
    }

    entries = allTypes.map((dt) => [toLabel(dt), dt] as [string, string]);
  }

  return entries;
}

// Caller supplies a transaction. The lock makes start/retry/generate idempotent.
export async function ensureAuditChecklist(
  db: QueryRunner,
  audit: AuditScope & { id: string },
) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    'checklist:' + audit.id,
  ]);
  const existing = await db.query(
    'SELECT id FROM audit_checklist_items WHERE audit_id=$1 LIMIT 1',
    [audit.id],
  );
  if (existing.length) return { created: 0 };
  const entries = await auditChecklistEntries(audit, db);
  if (!entries.length)
    throw new BadRequestException(
      'No checklist template is available for this audit type',
    );
  for (const [index, [label, docType]] of entries.entries()) {
    await db.query(
      `INSERT INTO audit_checklist_items (audit_id,item_label,doc_type,is_required,sort_order,status)
      VALUES ($1,$2,$3,TRUE,$4,'PENDING')`,
      [audit.id, label, docType || null, index + 1],
    );
  }
  return { created: entries.length };
}
