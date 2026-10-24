import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { changeAuditSchedule } from './audit-schedule-actions';

export async function requestAuditAction(
  db: DataSource,
  user: ReqUser,
  id: string,
  action: 'CANCEL' | 'DELETE',
  reason: string,
  isAssigned: (clientId: string, userId: string) => Promise<boolean>,
) {
  if (!['CRM', 'ADMIN'].includes(user.roleCode))
    throw new ForbiddenException(
      'Only CRM or Admin can request a schedule action',
    );
  if (!['CANCEL', 'DELETE'].includes(action))
    throw new BadRequestException('Invalid audit action');
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (note.length < 5 || note.length > 2000)
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
        'This audit is no longer eligible for the requested action',
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
        'Submitted or approved reports must retain their review workflow',
      );
    const pending = await manager.query(
      "SELECT id FROM audit_action_requests WHERE audit_id=$1 AND status='PENDING_CCO'",
      [id],
    );
    if (pending.length)
      throw new BadRequestException(
        'An action for this audit is already awaiting CCO approval',
      );
    const [context] = await manager.query(
      `SELECT c.client_name AS "clientName",b.branchname AS "branchName",u.name AS "contractorName" FROM audits a LEFT JOIN clients c ON c.id=a.client_id LEFT JOIN client_branches b ON b.id=a.branch_id LEFT JOIN users u ON u.id=a.contractor_user_id WHERE a.id=$1`,
      [id],
    );
    const [request] = await manager.query(
      `INSERT INTO audit_action_requests(audit_id,client_id,action,reason,requested_by,audit_snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,status`,
      [
        id,
        audit.client_id,
        action,
        note,
        user.userId,
        JSON.stringify({ ...audit, ...context }),
      ],
    );
    return {
      ...request,
      auditId: id,
      message: 'Request sent to CCO; the audit is unchanged',
    };
  });
}

export async function reviewAuditAction(
  db: DataSource,
  user: ReqUser,
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
  note: string,
  assertScope: (clientId: string) => Promise<void>,
) {
  if (user.roleCode !== 'CCO')
    throw new ForbiddenException('CCO approval only');
  if (!['APPROVE', 'REJECT'].includes(decision))
    throw new BadRequestException('Invalid decision');
  const reviewNote = typeof note === 'string' ? note.trim() : '';
  if (reviewNote.length < 5 || reviewNote.length > 2000)
    throw new BadRequestException(
      'Enter a review note between 5 and 2000 characters',
    );
  return db.transaction(async (manager) => {
    const [ref] = await manager.query(
      'SELECT audit_id FROM audit_action_requests WHERE id=$1',
      [requestId],
    );
    if (!ref) throw new NotFoundException('Request not found');
    // Shared ordering with finalization: lock audit before request/report rows.
    const [audit] = await manager.query(
      'SELECT * FROM audits WHERE id=$1 FOR UPDATE',
      [ref.audit_id],
    );
    const [request] = await manager.query(
      'SELECT * FROM audit_action_requests WHERE id=$1 FOR UPDATE',
      [requestId],
    );
    await assertScope(request.client_id);
    if (request.status !== 'PENDING_CCO')
      throw new BadRequestException('This request has already been reviewed');
    if (request.requested_by === user.userId)
      throw new ForbiddenException('A different CCO must review this request');
    if (decision === 'APPROVE') {
      if (!audit)
        throw new BadRequestException(
          'Audit no longer exists; reject this request',
        );
      for (const key of [
        'client_id',
        'branch_id',
        'contractor_user_id',
        'audit_type',
        'period_code',
      ]) {
        if ((audit[key] ?? null) !== (request.audit_snapshot[key] ?? null))
          throw new BadRequestException(
            'Audit scope changed; reject this request and ask CRM to resubmit',
          );
      }
      const transactionSource = {
        transaction: (callback) => callback(manager),
      } as DataSource;
      await changeAuditSchedule(
        transactionSource,
        user,
        request.audit_id,
        request.action,
        request.reason,
        async () => false,
      );
    }
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await manager.query(
      `UPDATE audit_action_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_note=$4 WHERE id=$1`,
      [requestId, status, user.userId, reviewNote],
    );
    await manager.query(
      `INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,snapshot) VALUES('AUDIT',$1,'STATUS_CHANGE',$2,$3::jsonb)`,
      [
        request.audit_id,
        user.userId,
        JSON.stringify({
          operation: 'REVIEW_AUDIT_ACTION',
          requestId,
          requestedBy: request.requested_by,
          action: request.action,
          status,
          reviewNote,
        }),
      ],
    );
    return { id: requestId, status };
  });
}
