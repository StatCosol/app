import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscalationEntity } from './entities/escalation.entity';
import { RiskService } from '../risk/risk.service';

/**
 * Daily cron (3 AM) — auto-escalation engine.
 * Triggers escalation if: riskScore >= 75 AND
 * (overdue SLA >= 1 OR expired registrations exist)
 */
@Injectable()
export class EscalationCronService {
  private readonly logger = new Logger(EscalationCronService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly riskService: RiskService,
    @InjectRepository(EscalationEntity)
    private readonly escRepo: Repository<EscalationEntity>,
  ) {}

  @Cron('0 0 3 * * *') // 3 AM daily
  async run(): Promise<void> {
    this.logger.log('Starting auto-escalation check...');

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const branches: any[] = await this.ds.query(
      `SELECT id, clientid, branchname FROM client_branches WHERE isdeleted = false AND status = 'ACTIVE'`,
    );

    let escalated = 0;

    for (const b of branches) {
      try {
        const risk = await this.riskService.calculateBranchRisk(b.id, month);
        if (risk < 75) continue;

        // Count overdue SLA tasks
        const overdueRows: any[] = await this.ds.query(
          `SELECT COUNT(*)::int AS cnt FROM sla_tasks
           WHERE branch_id = $1 AND deleted_at IS NULL AND status <> 'CLOSED'
           AND due_date < NOW()`,
          [b.id],
        );
        const overdue = overdueRows[0]?.cnt || 0;

        // Count expired registrations
        const expiredRows: any[] = await this.ds.query(
          `SELECT COUNT(*)::int AS cnt FROM branch_registrations
           WHERE branch_id = $1 AND status <> 'DELETED'
           AND expiry_date IS NOT NULL AND expiry_date < NOW()`,
          [b.id],
        );
        const expiredRegs = expiredRows[0]?.cnt || 0;

        const shouldEscalate = overdue > 0 || expiredRegs > 0;
        if (!shouldEscalate) continue;

        // Check if open escalation already exists
        const existing = await this.escRepo.findOne({
          where: { clientId: b.clientid, branchId: b.id, status: 'OPEN' },
        });
        if (existing) continue;

        const reason = `High Risk (${risk}%) + Overdue SLA(${overdue}) + ExpiredRegs(${expiredRegs})`;

        await this.escRepo.save({
          clientId: b.clientid,
          branchId: b.id,
          reason,
          riskScore: risk,
          slaOverdueCount: overdue,
          status: 'OPEN',
        });

        escalated++;
        this.logger.log(
          `Escalation created for branch ${b.branchname || b.id}: ${reason}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Escalation check failed for branch ${b.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Auto-escalation complete: ${escalated} new escalations from ${branches.length} branches.`,
    );
  }
}
