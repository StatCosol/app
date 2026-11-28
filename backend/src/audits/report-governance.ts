import { archiveIssuedReport } from './issued-report';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type ReportAction = 'approve' | 'publishAdmin' | 'publishCrm';
type ReportState = { id: string; status: string; held_at?: unknown };

export function normalizeReportRemarks(remarks?: unknown): string | null {
  if (remarks == null) return null;
  if (typeof remarks !== 'string' || remarks.length > 2000)
    throw new BadRequestException(
      'Review remarks must be at most 2000 characters',
    );
  return remarks.trim() || null;
}

// Access checks belong to the caller. Every approval/publication shares this
// conditional write so a concurrent hold cannot bypass governance.
export async function transitionGovernedReport(
  dataSource: DataSource,
  report: ReportState,
  action: ReportAction,
  actorId: string | null = null,
  remarks?: string | null,
): Promise<void> {
  const savedRemarks = normalizeReportRemarks(remarks);
  return dataSource.transaction(async (manager) => {
    const [identity] = await manager.query(
      'SELECT audit_id FROM audit_reports WHERE id=$1',
      [report.id],
    );
    if (!identity) throw new BadRequestException('Report not found');
    await manager.query('SELECT id FROM audits WHERE id=$1 FOR UPDATE', [
      identity.audit_id,
    ]);
    const [locked] = await manager.query(
      'SELECT id,status,held_at FROM audit_reports WHERE id=$1 FOR UPDATE',
      [report.id],
    );
    if (!locked) throw new BadRequestException('Report not found');
    await transitionReportState(manager, locked, action, actorId);
    if (action !== 'approve')
      await archiveIssuedReport(manager, report.id, actorId);
    await manager.query(
      `INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,snapshot)
       SELECT 'AUDIT',audit_id,'STATUS_CHANGE',$2,
         jsonb_build_object('kind','REPORT_REVIEW','reportId',id,'revision',version_no,
           'decision',status,'remarks',$3::text)
       FROM audit_reports WHERE id=$1`,
      [report.id, actorId, savedRemarks],
    );
  });
}

/** Conditional state/date write; publication callers must also archive in their transaction. */
export async function transitionReportState(
  manager: Pick<DataSource, 'query'>,
  report: ReportState,
  action: ReportAction,
  actorId: string | null = null,
): Promise<void> {
  if (report.held_at)
    throw new BadRequestException('Release the report hold first');
  // These columns are calendar dates, not timestamps. Match the report's India
  // timezone before truncating so UTC deployments do not store yesterday.
  const rules = {
    approve: {
      allowed: ['SUBMITTED'],
      condition: "status = 'SUBMITTED'",
      assignment:
        "status = 'APPROVED', approved_by_user_id = $2, approved_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
      verb: 'approved',
    },
    publishAdmin: {
      allowed: ['APPROVED'],
      condition: "status = 'APPROVED'",
      assignment:
        "status = 'PUBLISHED', published_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
      verb: 'published',
    },
    publishCrm: {
      allowed: ['APPROVED'],
      condition: "status = 'APPROVED'",
      assignment:
        "status = 'PUBLISHED', published_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date",
      verb: 'published',
    },
  }[action];
  if (!rules.allowed.includes(report.status)) {
    throw new BadRequestException(
      `Only ${rules.allowed.join('/')} reports can be ${rules.verb}. Current status: ${report.status}`,
    );
  }
  const changed = await manager.query(
    `WITH changed AS (UPDATE audit_reports
     SET ${rules.assignment}, updated_at = NOW()
     WHERE id = $1 AND held_at IS NULL AND ${rules.condition}
     RETURNING id) SELECT id FROM changed`,
    action === 'approve' ? [report.id, actorId] : [report.id],
  );
  if (!changed.length)
    throw new BadRequestException('Report changed; reload before continuing');
}
