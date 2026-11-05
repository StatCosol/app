import { ENTRY_CATEGORIES } from './statutory-audit-entry.catalogue';
import { BadRequestException } from '@nestjs/common';
type Db = { query(sql: string, params?: any[]): Promise<any> };
/** Use audit-point decisions once fieldwork is in use; do not double-count uploads. */
export async function fieldworkScore(db: Db, auditId: string) {
  const [r] = await db.query(
    `SELECT COUNT(*) FILTER(WHERE status IN ('COMPLIED','NON_COMPLIED'))::int AS total, COUNT(*) FILTER(WHERE status='COMPLIED')::int AS complied, COUNT(*) FILTER(WHERE status='NON_COMPLIED')::int AS "nonComplied", (EXISTS(SELECT 1 FROM audit_item_reviews WHERE audit_id=$1) OR EXISTS(SELECT 1 FROM audit_item_evidence WHERE audit_id=$1)) AS managed FROM audit_checklist_items WHERE audit_id=$1 AND (EXISTS(SELECT 1 FROM audit_item_reviews WHERE audit_id=$1) OR EXISTS(SELECT 1 FROM audit_item_evidence WHERE audit_id=$1))`,
    [auditId],
  );
  return r?.managed
    ? { ...r, score: r.total ? Math.round((r.complied / r.total) * 100) : 100 }
    : null;
}
export async function fieldworkAppendix(
  db: Db,
  auditId: string,
): Promise<
  Array<{ label: string; status: string; remarks: string; evidence: string }>
> {
  const fieldwork = await db.query(
    `SELECT i.item_label AS label,i.status,COALESCE(i.remarks,'') AS remarks,COALESCE((SELECT string_agg(e.file_name || ' [' || e.uploaded_role || ', revision ' || e.revision || '] - ' || e.description || CASE WHEN e.location IS NOT NULL THEN ' | Location: ' || e.location ELSE '' END, E'\n' ORDER BY e.created_at) FROM audit_item_evidence e WHERE e.item_id=i.id),'No files attached') AS evidence FROM audit_checklist_items i WHERE i.audit_id=$1 ORDER BY i.sort_order,i.created_at,i.id`,
    [auditId],
  );
  const statutory = await db.query(
    `SELECT a.item_id,a.answer,a.status,a.remarks,e.filename AS evidence,d.filename AS document,d.revision,d.review_status FROM audit_entry_answers a LEFT JOIN audit_entry_evidence e ON e.audit_id=a.audit_id AND e.item_id=a.item_id LEFT JOIN LATERAL (SELECT filename,revision,review_status FROM audit_entry_documents WHERE audit_id=a.audit_id AND item_id=a.item_id ORDER BY revision DESC LIMIT 1) d ON true WHERE a.audit_id=$1 ORDER BY a.item_id`,
    [auditId],
  );
  const points = new Map(
    ENTRY_CATEGORIES.flatMap((c) =>
      c.items.map((p) => [p.id, { ...p, category: c.name }] as const),
    ),
  );
  return [
    ...fieldwork,
    ...statutory.map((row) => {
      const point = points.get(row.item_id);
      return {
        label: point
          ? point.category + ' / ' + point.serial + ': ' + point.description
          : row.item_id,
        status: row.status,
        remarks: [row.answer, row.remarks].filter(Boolean).join(' — '),
        evidence:
          [
            row.evidence,
            row.document
              ? row.document +
                ' [Auditee, version ' +
                row.revision +
                ', ' +
                row.review_status +
                ']'
              : null,
          ]
            .filter(Boolean)
            .join('; ') || 'No files attached',
      };
    }),
  ];
}

export async function assertFieldworkReviewed(db: Db, auditId: string) {
  const rows = await db.query(
    `SELECT 1 FROM audit_checklist_items WHERE audit_id=$1 AND (status IN ('PENDING','UPLOADED') OR (automated_remarks IS NOT NULL AND NOT automation_reviewed)) LIMIT 1`,
    [auditId],
  );
  if (rows.length)
    throw new BadRequestException(
      'Review all audit evidence before finalizing the report.',
    );
}
