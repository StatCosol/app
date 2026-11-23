import {
  actualAuditSql,
  actualContractorDocumentSql,
  isTestAudit,
} from '../common/actual-records';

type AuditScope = {
  id: string;
  clientId: string;
  branchId?: string | null;
  contractorUserId?: string | null;
  auditType?: string;
  notes?: string | null;
  auditCode?: string | null;
};
type QueryConnection = { query(sql: string, parameters?: any[]): Promise<any> };

/** Reused by individual and batch scheduling; caller owns the transaction. */
export async function carryForwardAuditDocuments(
  db: QueryConnection,
  audit: AuditScope,
): Promise<void> {
  if (!audit?.id || !audit.clientId) return;
  const test = isTestAudit(audit);
  const previous = await db.query(
    `SELECT a.id FROM audits a
    WHERE a.client_id=$1 AND a.id<>$2
      AND a.branch_id IS NOT DISTINCT FROM $3::uuid
      AND a.contractor_user_id IS NOT DISTINCT FROM $4::uuid
      AND ($5::text IS NULL OR a.audit_type::text=$5)
      AND ${test ? `NOT ${actualAuditSql('a')}` : actualAuditSql('a')}
    ORDER BY a.created_at DESC,a.id DESC LIMIT 1`,
    [
      audit.clientId,
      audit.id,
      audit.branchId || null,
      audit.contractorUserId || null,
      audit.auditType || null,
    ],
  );
  if (!previous.length) return;
  await db.query(
    `INSERT INTO contractor_documents (
    contractor_user_id,client_id,branch_id,doc_type,title,audit_id,observation_id,
    file_name,file_path,file_type,file_size,uploaded_by_user_id,status,doc_month,expiry_date,
    reviewed_by_user_id,reviewed_at,review_notes,uploaded_by_role,acting_on_behalf,original_owner_role)
    SELECT d.contractor_user_id,d.client_id,d.branch_id,d.doc_type,
      CASE WHEN $3::boolean THEN 'TEST ONLY — ' || COALESCE(d.title,'Carried-forward evidence') ELSE d.title END,
      $1::uuid,NULL::uuid,d.file_name,d.file_path,d.file_type,d.file_size,d.uploaded_by_user_id,
      CASE WHEN d.status='APPROVED' THEN 'APPROVED' ELSE 'PENDING_REVIEW' END,
      d.doc_month,d.expiry_date,
      CASE WHEN d.status='APPROVED' THEN d.reviewed_by_user_id ELSE NULL END,
      CASE WHEN d.status='APPROVED' THEN d.reviewed_at ELSE NULL END,
      CASE WHEN d.status='APPROVED' THEN 'Carried forward (previously approved)'
        WHEN d.status='REJECTED' THEN 'Carried forward as pending — was REJECTED in prior audit'
        ELSE 'Carried forward — corrected re-upload pending review' END,
      d.uploaded_by_role,d.acting_on_behalf,d.original_owner_role
    FROM contractor_documents d WHERE d.audit_id=$2
      AND d.client_id=$4 AND d.branch_id IS NOT DISTINCT FROM $5::uuid
      AND ($6::uuid IS NULL OR d.contractor_user_id=$6)
      AND d.status IN ('APPROVED','REJECTED','PENDING_REVIEW')
      AND ($3::boolean OR ${actualContractorDocumentSql('d')})
      AND NOT EXISTS (SELECT 1 FROM contractor_documents existing
        WHERE existing.audit_id=$1 AND existing.contractor_user_id=d.contractor_user_id
          AND existing.doc_type=d.doc_type AND existing.file_path IS NOT DISTINCT FROM d.file_path)`,
    [
      audit.id,
      previous[0].id,
      test,
      audit.clientId,
      audit.branchId || null,
      audit.contractorUserId || null,
    ],
  );
}
