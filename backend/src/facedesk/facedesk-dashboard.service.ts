import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const BUSINESS_TZ_OFFSET_MIN = 330;

function businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
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

@Injectable()
export class FaceDeskDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private branchClause(
    params: unknown[],
    branchIds: string[] | null,
    column: string,
  ): string {
    if (branchIds === null) return '';
    if (branchIds.length === 0) return 'AND FALSE';
    params.push(branchIds);
    return `AND ${column} = ANY($${params.length}::uuid[])`;
  }

  /** Admin dashboard cards. Branch-scoped when branchIds provided. */
  async cards(clientId: string, branchIds: string[] | null = null) {
    const { start, end } = businessDayBoundsUtc(new Date());

    const empParams: unknown[] = [clientId];
    const empBranch = this.branchClause(empParams, branchIds, 'e.branch_id');
    const [emp] = await this.dataSource.query<
      Array<{ total: string; enrolled: string }>
    >(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE p.enrollment_status = 'ENROLLED')::int AS enrolled
         FROM employees e
         LEFT JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
        WHERE e.client_id = $1 AND e.is_active = true ${empBranch}`,
      empParams,
    );
    const totalEmployees = Number(emp?.total ?? 0);
    const enrolled = Number(emp?.enrolled ?? 0);

    const attParams: unknown[] = [clientId, start, end];
    const attBranch = this.branchClause(attParams, branchIds, 'branch_id');
    const [attendance] = await this.dataSource.query<
      Array<{ present: string; punches: string }>
    >(
      `SELECT count(DISTINCT employee_id)::int AS present,
              count(*)::int AS punches
         FROM facedesk_attendance_logs
        WHERE client_id = $1 AND punch_time >= $2 AND punch_time < $3
          AND attendance_status IN ('MARKED','APPROVED') ${attBranch}`,
      attParams,
    );
    const [failed] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_attendance_failed_attempts
        WHERE client_id = $1 AND attempted_at >= $2 AND attempted_at < $3 ${attBranch}`,
      attParams,
    );

    const dupeParams: unknown[] = [clientId];
    let dupeBranch = '';
    if (branchIds !== null) {
      if (branchIds.length === 0) {
        dupeBranch = 'AND FALSE';
      } else {
        dupeParams.push(branchIds);
        dupeBranch = `AND EXISTS (
          SELECT 1 FROM facedesk_employee_face_profiles p
           WHERE p.client_id = d.client_id
             AND p.employee_id = d.new_employee_id
             AND (
               (p.subject_type = 'EMPLOYEE' AND EXISTS (
                 SELECT 1 FROM employees e
                  WHERE e.id = p.employee_id AND e.client_id = p.client_id
                    AND e.branch_id = ANY($${dupeParams.length}::uuid[])
               ))
               OR (p.subject_type = 'CONTRACTOR' AND EXISTS (
                 SELECT 1 FROM contractor_employees ce
                  WHERE ce.id = p.employee_id AND ce.client_id = p.client_id
                    AND ce.branch_id = ANY($${dupeParams.length}::uuid[])
               ))
             )
        )`;
      }
    }
    const [dupes] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_face_duplicate_alerts d
        WHERE d.client_id = $1 AND d.status = 'PENDING' ${dupeBranch}`,
      dupeParams,
    );
    const reviewParams: unknown[] = [clientId];
    const reviewBranch = this.branchClause(
      reviewParams,
      branchIds,
      'branch_id',
    );
    const [review] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_attendance_review_queue
        WHERE client_id = $1 AND status = 'PENDING' ${reviewBranch}`,
      reviewParams,
    );
    const deviceParams: unknown[] = [clientId];
    const deviceBranch = this.branchClause(
      deviceParams,
      branchIds,
      'branch_id',
    );
    const [devices] = await this.dataSource.query<
      Array<{ online: string; offline: string; last_sync: Date | null }>
    >(
      `SELECT count(*) FILTER (WHERE device_status = 'ONLINE')::int AS online,
              count(*) FILTER (WHERE device_status <> 'ONLINE')::int AS offline,
              max(last_sync_time) AS last_sync
         FROM facedesk_kiosk_devices WHERE client_id = $1
          AND device_status <> 'REVOKED' ${deviceBranch}`,
      deviceParams,
    );

    const todayPresent = Number(attendance?.present ?? 0);
    return {
      totalEmployees,
      enrolledEmployees: enrolled,
      pendingEnrollment: totalEmployees - enrolled,
      todayPresent,
      todayPunches: Number(attendance?.punches ?? 0),
      todayAbsent: Math.max(0, enrolled - todayPresent),
      failedAttemptsToday: Number(failed?.n ?? 0),
      duplicateAlertsPending: Number(dupes?.n ?? 0),
      reviewQueuePending: Number(review?.n ?? 0),
      devicesOnline: Number(devices?.online ?? 0),
      devicesOffline: Number(devices?.offline ?? 0),
      lastSyncTime: devices?.last_sync ?? null,
    };
  }
}
