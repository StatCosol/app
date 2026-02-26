import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RiskService } from './risk.service';

/**
 * Daily cron (1 AM) to snapshot branch risk scores.
 * Stores one row per branch per day in branch_risk_snapshots.
 */
@Injectable()
export class RiskSnapshotCronService {
  private readonly logger = new Logger(RiskSnapshotCronService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly riskService: RiskService,
  ) {}

  @Cron('0 0 1 * * *') // 1 AM daily
  async snapshotDaily(): Promise<void> {
    this.logger.log('Starting daily risk snapshot...');

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const snapshotDate = now.toISOString().substring(0, 10);

    const branches: any[] = await this.ds.query(
      `SELECT id, clientid FROM client_branches WHERE isdeleted = false AND status = 'ACTIVE'`,
    );

    let count = 0;
    for (const b of branches) {
      try {
        const score = await this.riskService.calculateBranchRisk(b.id, month);

        await this.ds.query(
          `INSERT INTO branch_risk_snapshots (client_id, branch_id, snapshot_date, risk_score)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, snapshot_date)
           DO UPDATE SET risk_score = EXCLUDED.risk_score`,
          [b.clientid, b.id, snapshotDate, score],
        );
        count++;
      } catch (err: any) {
        this.logger.warn(`Snapshot failed for branch ${b.id}: ${err.message}`);
      }
    }

    this.logger.log(`Daily risk snapshot complete: ${count}/${branches.length} branches.`);
  }
}
