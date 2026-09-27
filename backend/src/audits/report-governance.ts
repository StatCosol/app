import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type ReportAction = 'approve' | 'publishAdmin' | 'publishCrm';
type ReportState = { id: string; status: string; held_at?: unknown };

// Access checks belong to the caller. Every approval/publication shares this
// conditional write so a concurrent hold cannot bypass governance.
export async function transitionGovernedReport(
  dataSource: Pick<DataSource, 'query'>,
  report: ReportState,
  action: ReportAction,
  actorId: string | null = null,
): Promise<void> {
  if (report.held_at)
    throw new BadRequestException('Release the report hold first');
  const rules = {
    approve: {
      allowed: ['SUBMITTED'],
      condition: "status = 'SUBMITTED'",
      assignment:
        "status = 'APPROVED', approved_by_user_id = $2, approved_date = CURRENT_DATE",
      verb: 'approved',
    },
    publishAdmin: {
      allowed: ['APPROVED'],
      condition: "status = 'APPROVED'",
      assignment: "status = 'PUBLISHED', published_date = CURRENT_DATE",
      verb: 'published',
    },
    publishCrm: {
      allowed: ['SUBMITTED', 'APPROVED'],
      condition: "status IN ('SUBMITTED', 'APPROVED')",
      assignment:
        "status = 'PUBLISHED', approved_by_user_id = COALESCE(approved_by_user_id, $2), approved_date = COALESCE(approved_date, CURRENT_DATE), published_date = CURRENT_DATE",
      verb: 'published',
    },
  }[action];
  if (!rules.allowed.includes(report.status)) {
    throw new BadRequestException(
      `Only ${rules.allowed.join('/')} reports can be ${rules.verb}. Current status: ${report.status}`,
    );
  }
  const changed = await dataSource.query(
    `WITH changed AS (UPDATE audit_reports
     SET ${rules.assignment}, updated_at = NOW()
     WHERE id = $1 AND held_at IS NULL AND ${rules.condition}
     RETURNING id) SELECT id FROM changed`,
    action === 'publishAdmin' ? [report.id] : [report.id, actorId],
  );
  if (!changed.length)
    throw new BadRequestException('Report changed; reload before continuing');
}
