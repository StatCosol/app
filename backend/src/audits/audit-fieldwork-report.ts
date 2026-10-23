import { BadRequestException } from '@nestjs/common';
type Db = { query(sql: string, params?: any[]): Promise<any> };
/** Use audit-point decisions once fieldwork is in use; do not double-count uploads. */
export async function fieldworkScore(db: Db, auditId: string) {
  const [r] = await db.query(
    `SELECT COUNT(*) FILTER(WHERE status IN ('COMPLIED','NON_COMPLIED'))::int AS total, COUNT(*) FILTER(WHERE status='COMPLIED')::int AS complied, COUNT(*) FILTER(WHERE status='NON_COMPLIED')::int AS "nonComplied" FROM audit_checklist_items WHERE audit_id=$1 AND (EXISTS(SELECT 1 FROM audit_item_reviews WHERE audit_id=$1) OR EXISTS(SELECT 1 FROM audit_item_evidence WHERE audit_id=$1))`,
    [auditId],
  );
  return r?.total
    ? { ...r, score: Math.round((r.complied / r.total) * 100) }
    : null;
}
export async function fieldworkAppendix(
  db: Db,
  auditId: string,
): Promise<
  Array<{ label: string; status: string; remarks: string; evidence: string }>
> {
  return db.query(
    `SELECT i.item_label AS label,i.status,COALESCE(i.remarks,'') AS remarks,COALESCE((SELECT string_agg(e.file_name || ' [' || e.uploaded_role || ', revision ' || e.revision || '] - ' || e.description || CASE WHEN e.location IS NOT NULL THEN ' | Location: ' || e.location ELSE '' END, E'\n' ORDER BY e.created_at) FROM audit_item_evidence e WHERE e.item_id=i.id),'No files attached') AS evidence FROM audit_checklist_items i WHERE i.audit_id=$1 ORDER BY i.sort_order,i.created_at,i.id`,
    [auditId],
  );
}

export async function assertFieldworkReviewed(db: Db, auditId: string) {
  const rows = await db.query(
    `SELECT 1 FROM audit_checklist_items WHERE audit_id=$1 AND (status IN ('PENDING','UPLOADED') OR (automated_remarks IS NOT NULL AND NOT automation_reviewed)) AND (EXISTS(SELECT 1 FROM audit_item_reviews WHERE audit_id=$1) OR EXISTS(SELECT 1 FROM audit_item_evidence WHERE audit_id=$1)) LIMIT 1`,
    [auditId],
  );
  if (rows.length)
    throw new BadRequestException(
      'Review all audit evidence before finalizing the report.',
    );
}
