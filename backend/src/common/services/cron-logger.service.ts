import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CronExecutionLogEntity } from '../entities/cron-execution-log.entity';

@Injectable()
export class CronLoggerService {
  private readonly logger = new Logger(CronLoggerService.name);

  constructor(private readonly ds: DataSource) {}

  /** Call at the start of a cron job — returns the log id. */
  async start(jobName: string): Promise<string> {
    const repo = this.ds.getRepository(CronExecutionLogEntity);
    const log = repo.create({
      jobName,
      startedAt: new Date(),
      status: 'RUNNING',
    });
    const saved = await repo.save(log);
    return saved.id;
  }

  /** Mark a cron run as successful. */
  async succeed(logId: string, itemsProcessed = 0): Promise<void> {
    await this.ds.getRepository(CronExecutionLogEntity).update(logId, {
      status: 'SUCCESS',
      finishedAt: new Date(),
      itemsProcessed,
    });
  }

  /** Mark a cron run as failed. */
  async fail(logId: string, error: unknown): Promise<void> {
    const msg = error instanceof Error ? error.message : String(error);
    await this.ds.getRepository(CronExecutionLogEntity).update(logId, {
      status: 'FAILED',
      finishedAt: new Date(),
      errorMessage: msg.slice(0, 4000),
    });
    this.logger.error(`Cron job ${logId} failed: ${msg}`);
  }
}
