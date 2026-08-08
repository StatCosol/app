import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FaceDeskFailedAttemptEntity } from './entities/facedesk.entities';

const PIN_LOCKOUT_MIN = Number(process.env.FD_PIN_LOCKOUT_MIN ?? 5);

@Injectable()
export class FaceDeskFailedAttemptService {
  constructor(
    @InjectRepository(FaceDeskFailedAttemptEntity)
    private readonly failRepo: Repository<FaceDeskFailedAttemptEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async recordFailed(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    bestEmployeeId: string | null,
    bestConfidence: number | null,
    reason: string,
    photoUrl: string | null = null,
  ): Promise<FaceDeskFailedAttemptEntity> {
    return this.failRepo.save({
      clientId,
      branchId,
      deviceId,
      bestEmployeeId,
      bestConfidence,
      reason,
      photoUrl,
    });
  }

  async recentWrongPinCount(
    clientId: string,
    deviceId: string | null,
    branchId: string | null,
  ): Promise<number> {
    const since = new Date(Date.now() - PIN_LOCKOUT_MIN * 60 * 1000);
    const params: unknown[] = [clientId, since];
    let scope = '';
    if (deviceId) {
      params.push(deviceId);
      scope = `AND device_id = $3`;
    } else if (branchId) {
      params.push(branchId);
      scope = `AND branch_id = $3`;
    }
    const [row] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_attendance_failed_attempts
        WHERE client_id = $1 AND reason = 'WRONG_PIN'
          AND attempted_at >= $2 ${scope}`,
      params,
    );
    return Number(row?.n ?? 0);
  }
}
