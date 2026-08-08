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
}
