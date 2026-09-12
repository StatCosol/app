import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';
import { operationalDate } from '../../common/operational-date';

/** One filing and task for each registration expiry, shared by every trigger. */
@Injectable()
export class RenewalFilingEngineService {
  private readonly logger = new Logger(RenewalFilingEngineService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
  ) {}

  async generateRenewalFilings() {
    const today = operationalDate();
    const registrations = await this.dataSource.query(
      `SELECT br.id AS reg_id, br.type AS registration_type,
      br.expiry_date::text AS expiry_date, br.branch_id, br.client_id, b.branchname,
      br.expiry_date - $1::date AS days_left
      FROM branch_registrations br JOIN client_branches b ON b.id=br.branch_id AND b.clientid=br.client_id
      JOIN clients c ON c.id=br.client_id
      WHERE br.expiry_date BETWEEN $1::date AND $1::date + 60
        AND br.status='ACTIVE' AND b.isactive=true AND c.is_deleted=false`,
      [today],
    );
    let filingsCreated = 0,
      tasksCreated = 0,
      skipped = 0;
    for (const reg of registrations) {
      const result = await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) => {
          // Lock the branch/type/expiry as legacy filings did not record registration IDs.
          const returnType = `RENEWAL-${(reg.registration_type || 'REG').toUpperCase().replace(/\s+/g, '_')}`;
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [
              JSON.stringify([
                'renewal',
                reg.client_id,
                reg.branch_id,
                returnType,
                reg.expiry_date,
              ]),
            ],
          );
          const links = await manager.query(
            `SELECT cr.* FROM registration_renewal_links l
          JOIN compliance_returns cr ON cr.id=l.filing_id WHERE l.registration_id=$1 AND l.expiry_date=$2::date`,
            [reg.reg_id, reg.expiry_date],
          );
          let filing = links[0],
            created = false;
          if (!filing) {
            const legacy = await manager.query(
              `SELECT cr.* FROM compliance_returns cr
            WHERE client_id=$1 AND branch_id=$2 AND return_type=$3 AND due_date=$4::date AND is_deleted=false
              AND NOT EXISTS (SELECT 1 FROM registration_renewal_links l WHERE l.filing_id=cr.id)
            ORDER BY created_at,id`,
              [reg.client_id, reg.branch_id, returnType, reg.expiry_date],
            );
            if (
              legacy.length > 1 ||
              (legacy.length === 1 &&
                registrations.filter(
                  (other) =>
                    other.client_id === reg.client_id &&
                    other.branch_id === reg.branch_id &&
                    other.expiry_date === reg.expiry_date &&
                    other.registration_type === reg.registration_type,
                ).length > 1)
            ) {
              this.logger.warn(
                `Ambiguous legacy renewal filings need review for registration ${reg.reg_id}`,
              );
              return { created: false, task: false, skipped: true };
            }
            filing = legacy[0];
            if (!filing) {
              [filing] = await manager.query(
                `INSERT INTO compliance_returns
              (client_id,branch_id,law_type,return_type,period_year,period_month,period_label,due_date,status,created_by_role)
              VALUES ($1,$2,'RENEWAL',$3,$4,$5,$6,$7,'PENDING','SYSTEM') RETURNING *`,
                [
                  reg.client_id,
                  reg.branch_id,
                  returnType,
                  Number(reg.expiry_date.slice(0, 4)),
                  Number(reg.expiry_date.slice(5, 7)),
                  `Renewal — ${reg.registration_type}`.slice(0, 200),
                  reg.expiry_date,
                ],
              );
              created = true;
            }
            await manager.query(
              `INSERT INTO registration_renewal_links (registration_id,expiry_date,filing_id) VALUES ($1,$2,$3)`,
              [reg.reg_id, reg.expiry_date, filing.id],
            );
          }
          // A removed filing requires explicit recovery; a scan must not undo that action.
          if (filing.is_deleted)
            return { created: false, task: false, skipped: true };
          const terminal = ['APPROVED', 'NOT_APPLICABLE'].includes(
            filing.status,
          );
          const existing = await manager.query(
            `SELECT id FROM system_tasks WHERE reference_type='RENEWAL_FILING'
          AND reference_id=$1 AND assigned_role='BRANCH' AND client_id=$2 AND branch_id=$3`,
            [filing.id, reg.client_id, reg.branch_id],
          );
          if (!terminal)
            await this.taskEngine.createTask(
              {
                module: 'RENEWAL',
                referenceId: filing.id,
                referenceType: 'RENEWAL_FILING',
                assignedRole: 'BRANCH',
                clientId: reg.client_id,
                branchId: reg.branch_id,
                reuseTerminal: true,
                title: `Renew: ${reg.registration_type}`,
                description: `${reg.registration_type} at ${reg.branchname} expires on ${reg.expiry_date}. Upload renewal proof through the filing.`,
                dueDate: new Date(reg.expiry_date),
                priority:
                  reg.days_left <= 7
                    ? 'CRITICAL'
                    : reg.days_left <= 15
                      ? 'HIGH'
                      : 'MEDIUM',
              },
              manager,
            );
          // Retire only the exact legacy expiry activity once its canonical filing exists.
          // History is kept and the replacement is recorded; this does not approve anything.
          await manager.query(
            `UPDATE system_tasks SET status='CANCELLED', updated_at=now(),
          description=COALESCE(description,'') || $5
          WHERE reference_type='REGISTRATION_EXPIRY' AND reference_id=$1 AND client_id=$2 AND branch_id=$3
            AND due_date=$4::date AND status NOT IN ('CLOSED','CANCELLED')`,
            [
              reg.reg_id,
              reg.client_id,
              reg.branch_id,
              reg.expiry_date,
              `\nSuperseded by renewal filing ${filing.id}.`,
            ],
          );
          return {
            created,
            task: !terminal && !existing.length,
            skipped: !created,
          };
        },
      );
      if (result.created) filingsCreated++;
      if (result.task) tasksCreated++;
      if (result.skipped) skipped++;
    }
    return { filingsCreated, tasksCreated, skipped };
  }
}
