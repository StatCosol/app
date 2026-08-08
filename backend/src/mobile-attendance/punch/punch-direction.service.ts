import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BiometricService } from '../../biometric/biometric.service';

const BUSINESS_TZ_OFFSET_MIN = 330;

/** Decisions that count as real attendance (cooldown, direction, day-complete). */
export const COUNTED_DECISIONS = `('AUTO','REVIEW_APPROVED')`;

@Injectable()
export class PunchDirectionService {
  private readonly logger = new Logger(PunchDirectionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly biometricService: BiometricService,
  ) {}

  businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
    const offsetMs = BUSINESS_TZ_OFFSET_MIN * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    const startLocalUtcMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
    const start = new Date(startLocalUtcMs - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  async resolveNextPunchDirection(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    subjectId: string,
    punchTime: Date,
    opts: { endExclusive?: Date } = {},
  ): Promise<'IN' | 'OUT'> {
    const { start, end: dayEnd } = this.businessDayBoundsUtc(punchTime);
    const end =
      opts.endExclusive && opts.endExclusive < dayEnd
        ? opts.endExclusive
        : dayEnd;

    const sql =
      subjectType === 'EMPLOYEE'
        ? `SELECT punch_time, direction
             FROM (
               SELECT punch_time, direction
                 FROM mobile_attendance_punches
                WHERE client_id = $1
                  AND employee_id = $2
                  AND punch_time >= $3
                  AND punch_time < $4
                  AND decision IN ${COUNTED_DECISIONS}
               UNION ALL
               SELECT punch_time, direction
                 FROM biometric_punches
                WHERE client_id = $1
                  AND employee_id = $2
                  AND punch_time >= $3
                  AND punch_time < $4
                  AND COALESCE(source, 'DEVICE') NOT IN ('MOBILE_KIOSK','MOBILE_ESS')
             ) t
            ORDER BY punch_time ASC`
        : `SELECT punch_time, direction
             FROM contractor_biometric_punches
            WHERE client_id = $1
              AND contractor_employee_id = $2
              AND punch_time >= $3
              AND punch_time < $4
              AND decision IN ${COUNTED_DECISIONS}
            ORDER BY punch_time ASC`;

    const todayRows = await this.dataSource.query<
      Array<{ punch_time: Date; direction: 'IN' | 'OUT' | 'AUTO' }>
    >(sql, [clientId, subjectId, start, end]);

    if (todayRows.length >= 2) {
      throw new BadRequestException('Attendance already completed for today');
    }

    return todayRows.length === 0 ? 'IN' : 'OUT';
  }

  async mirrorEmployeePunchToDailyAttendance(
    args: {
      clientId: string;
      branchId: string | null;
      employeeCode: string;
      punchTime: Date;
      direction: 'IN' | 'OUT' | 'AUTO';
      deviceId: string;
      source: 'MOBILE_KIOSK' | 'MOBILE_ESS';
    },
    manager?: EntityManager,
  ): Promise<void> {
    try {
      await this.biometricService.ingest(
        args.clientId,
        [
          {
            employeeCode: args.employeeCode,
            punchTime: args.punchTime.toISOString(),
            direction: args.direction,
            deviceId: args.deviceId,
            branchId: args.branchId ?? undefined,
            source: args.source,
          },
        ],
        true,
        manager,
      );
    } catch (err) {
      this.logger.error(
        [
          'accepted mobile attendance punch could not be mirrored to daily attendance',
          `client=${args.clientId}`,
          `employeeCode=${args.employeeCode}`,
          `device=${args.deviceId}`,
          `source=${args.source}`,
          `punchTime=${args.punchTime.toISOString()}`,
        ].join(' '),
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
