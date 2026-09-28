import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditFollowUpsService } from '../audit-follow-ups.service';

@Injectable()
export class AuditFollowUpsJob {
  private running = false;
  private readonly logger = new Logger(AuditFollowUpsJob.name);
  constructor(private readonly followUps: AuditFollowUpsService) {}

  @Cron('0 * * * * *', { name: 'audit-follow-up-recovery' })
  async handle() {
    if (this.running) return;
    this.running = true;
    try {
      await this.followUps.drain();
    } catch {
      this.logger.error(
        'Audit follow-up scan unavailable; jobs remain queued.',
      );
    } finally {
      this.running = false;
    }
  }
}
