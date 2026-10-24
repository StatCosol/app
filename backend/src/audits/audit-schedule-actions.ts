import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';

/** Schedule actions retain a snapshot and never delete audit work. */
export async function changeAuditSchedule(
  db: DataSource,
  user: ReqUser,
  id: string,
  action: 'CANCEL' | 'DELETE',
  reason: string,
  isAssigned: (clientId: string, userId: string) => Promise<boolean>,
) {
  if (!['CRM', 'ADMIN'].includes(user.roleCode))
    throw new ForbiddenException(
      'Only the assigned CRM or administrator can manage audit schedules',
    );
  const explanation = typeof reason === 'string' ? reason.trim() : '';
  if (explanation.length < 5 || explanation.length > 2000)
    throw new BadRequestException(
      'Enter a reason between 5 and 2000 characters',
    );
  return db.transaction(async (manager) => {
    const [audit] = await manager.query(
      'SELECT * FROM audits WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (!audit) throw new NotFoundException('Audit not found');
    if (
      user.roleCode === 'CRM' &&
      !(await isAssigned(audit.client_id, user.userId))
    )
      throw new ForbiddenException('Client not assigned to this CRM');
    if (
      !(
        action === 'DELETE' ? ['PLANNED'] : ['PLANNED', 'IN_PROGRESS']
      ).includes(audit.status)
    )
      throw new BadRequestException(
        action === 'DELETE'
          ? 'Only an unused planned audit can be deleted. Cancel an active audit instead.'
          : 'Only planned or in-progress audits can be cancelled. Returned, submitted and completed audits must retain their review workflow.',
      );
    const reports = await manager.query(
      'SELECT status FROM audit_reports WHERE audit_id=$1',
      [id],
    );
    if (
      reports.some((r) =>
        ['SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(r.status),
      )
    )
      throw new BadRequestException(
        'This audit has a submitted or approved report and cannot be cancelled or deleted',
      );
    if (action === 'DELETE') {
      // Conservative: even an initialized checklist counts as audit work.
      // Also protect legacy documents that do not have a foreign key to audits.
      await manager.query(
        'LOCK TABLE contractor_documents IN SHARE ROW EXCLUSIVE MODE',
      );
      const activity = await manager.query(
        `
        SELECT 1 FROM audit_checklist_items WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_item_evidence WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_item_reviews WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_observations WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_document_reviews WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_non_compliances WHERE audit_id=$1
        UNION ALL SELECT 1 FROM audit_resubmissions WHERE audit_id=$1
        UNION ALL SELECT 1 FROM contractor_documents WHERE audit_id=$1
        UNION ALL SELECT 1 FROM ai_audit_observations WHERE audit_id=$1
        LIMIT 1`,
        [id],
      );
      if (
        activity.length ||
        reports.length ||
        audit.submitted_at ||
        audit.preliminary_published_at ||
        audit.score != null
      )
        throw new BadRequestException(
          'This audit has checklist work, evidence or reports. Use Cancel audit to preserve its records.',
        );
    }
    await manager.query(
      `INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,snapshot)
      VALUES ('AUDIT',$1,'STATUS_CHANGE',$2,$3::jsonb)`,
      [
        id,
        user.userId,
        JSON.stringify({
          performedRole: user.roleCode,
          reason: explanation,
          before: audit,
          after: { status: action === 'DELETE' ? 'DELETED' : 'CANCELLED' },
          operation:
            action === 'DELETE' ? 'DELETE_UNUSED_SCHEDULE' : 'CANCEL_AUDIT',
        }),
      ],
    );
    // Prevent the originating calendar slot from restarting a removed audit.
    if (audit.schedule_id)
      await manager.query(
        "UPDATE audit_schedules SET status='CANCELLED',updated_at=NOW() WHERE id=$1",
        [audit.schedule_id],
      );
    if (action === 'DELETE') {
      await manager.query('DELETE FROM audits WHERE id=$1', [id]);
    } else {
      await manager.query(
        `UPDATE audits SET status='CANCELLED',upload_lock_from=NULL,upload_lock_until=NULL,
        notes=concat_ws(E'\\n',nullif(notes,''),$2::text),updated_at=NOW() WHERE id=$1`,
        [id, `Cancellation reason: ${explanation}`],
      );
    }
    return { id, status: action === 'DELETE' ? 'DELETED' : 'CANCELLED' };
  });
}
