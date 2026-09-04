import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const BUSINESS_TZ_OFFSET_MIN = Number(
  process.env.FD_BUSINESS_TZ_OFFSET_MIN ?? 330,
);

@Injectable()
export class FaceDeskPunchDirectionService {
  constructor(private readonly dataSource: DataSource) {}

  businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
    const offsetMs = BUSINESS_TZ_OFFSET_MIN * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    const startLocalUtcMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
    const start = new Date(startLocalUtcMs - offsetMs);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  async nextPunchType(
    clientId: string,
    employeeId: string,
    at: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(at);
    const [row] = await this.dataSource.query<Array<{ punch_type: string }>>(
      `SELECT punch_type FROM facedesk_attendance_logs
        WHERE client_id = $1 AND employee_id = $2
          AND punch_time >= $3 AND punch_time < $4
          AND attendance_status IN ('MARKED','APPROVED')
        ORDER BY punch_time DESC LIMIT 1`,
      [clientId, employeeId, start, end],
    );
    return row?.punch_type === 'IN' ? 'OUT' : 'IN';
  }

  async nextContractorDirection(
    clientId: string,
    contractorEmployeeId: string,
    at: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(at);
    const [row] = await this.dataSource.query<Array<{ direction: string }>>(
      `SELECT direction FROM contractor_biometric_punches
        WHERE client_id = $1 AND contractor_employee_id = $2
          AND punch_time >= $3 AND punch_time < $4
          AND decision IN ('AUTO','REVIEW_APPROVED')
        ORDER BY punch_time DESC LIMIT 1`,
      [clientId, contractorEmployeeId, start, end],
    );
    return row?.direction === 'IN' ? 'OUT' : 'IN';
  }

  /**
   * Minutes since this subject's previous punch, or null if they have none today.
   *
   * Punches alternate IN/OUT per business day, so a second capture moments after
   * the first does not read as a duplicate — it reads as the worker leaving the
   * instant they arrived, and the worked-hours report then pairs the two into a
   * zero-length shift. The kiosk holds capture for POST_PUNCH_HOLD_MS after a
   * punch, but that is a client-side timer: it does nothing about a second kiosk
   * seeing the same person, a device restart, or an offline batch replaying.
   *
   * Deliberately scoped to the business day, matching the direction queries
   * above — the first punch of a new day must never be refused because of one
   * late the night before.
   */
  async minutesSinceLastPunch(
    clientId: string,
    subjectId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    at: Date,
  ): Promise<number | null> {
    const { start, end } = this.businessDayBoundsUtc(at);
    // Upper-bounded by `at`, not just by the business day.
    //
    // Without that bound the newest punch of the day is returned even when it is
    // LATER than the punch being offered, and the subtraction below goes
    // negative — which is always under a positive gap, so the punch is refused.
    // An offline capture from 09:00 syncing after a stored 17:00 punch would be
    // rejected as "too soon" despite being eight hours apart, and
    // FaceDeskOfflineSyncService maps a rejection to DROPPED: the queue entry is
    // discarded and a real punch is lost for good.
    //
    // Strictly earlier, not `<=`: an offline retry carrying the same timestamp
    // must fall through to the insert so the offlineRef unique constraint
    // recognises it as the duplicate it is and answers "already recorded",
    // rather than being refused here and dropped.
    const sql =
      subjectType === 'CONTRACTOR'
        ? `SELECT punch_time FROM contractor_biometric_punches
            WHERE client_id = $1 AND contractor_employee_id = $2
              AND punch_time >= $3 AND punch_time < $4
              AND punch_time < $5
              AND decision IN ('AUTO','REVIEW_APPROVED')
            ORDER BY punch_time DESC LIMIT 1`
        : `SELECT punch_time FROM facedesk_attendance_logs
            WHERE client_id = $1 AND employee_id = $2
              AND punch_time >= $3 AND punch_time < $4
              AND punch_time < $5
              AND attendance_status IN ('MARKED','APPROVED')
            ORDER BY punch_time DESC LIMIT 1`;
    const [row] = await this.dataSource.query<Array<{ punch_time: Date }>>(
      sql,
      [clientId, subjectId, start, end, at],
    );
    if (!row?.punch_time) return null;
    const last = new Date(row.punch_time).getTime();
    return (at.getTime() - last) / 60000;
  }
}
