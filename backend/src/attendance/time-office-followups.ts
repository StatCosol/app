import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { IsIn, IsString, IsUUID, Matches } from 'class-validator';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { timeOfficeFilters } from './time-office-filters';
import { automaticReminderDue } from './time-office-automation-time';

export class FollowupResolvedException extends BadRequestException {}
export class FollowupDeferredException extends BadRequestException {}

export class TimeOfficeFollowupDto {
  @IsUUID() employeeId: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsIn(['EMPLOYEE', 'BRANCH']) target: 'EMPLOYEE' | 'BRANCH';
}

@Injectable()
export class TimeOfficeFollowupsService {
  constructor(private readonly db: DataSource) {}

  async send(
    user: ReqUser,
    input: TimeOfficeFollowupDto,
    automatic?: { now: Date; weeklyOffDays: number[] },
  ) {
    if (!user.clientId || !user.id)
      throw new ForbiddenException('Company assignment required');
    timeOfficeFilters({ date: input.date });
    return this.db.transaction(async (manager) => {
      // Serialize retries for this employee/day, including requests from different Time Office users.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`time-office:${user.clientId}:${input.employeeId}:${input.date}`],
      );
      const [employee] = await manager.query(
        `SELECT e.id, e.name, e.employee_code, e.branch_id,
          a.id AS attendance_id, a.status, a.check_in, a.check_out,
          EXISTS(SELECT 1 FROM leave_applications l WHERE l.employee_id=e.id AND l.client_id=e.client_id
            AND l.status='APPROVED' AND $3::date BETWEEN l.from_date AND l.to_date) AS on_leave,
          EXISTS(SELECT 1 FROM holiday_calendar h WHERE h.client_id=e.client_id AND h.holiday_date=$3::date
            AND (h.branch_id=e.branch_id OR (h.branch_id IS NULL AND (h.state_code IS NULL OR h.state_code=b.statecode)))) AS holiday
        FROM employees e LEFT JOIN client_branches b ON b.id=e.branch_id AND b.clientid=e.client_id
        LEFT JOIN attendance_records a ON a.employee_id=e.id AND a.client_id=e.client_id AND a.date=$3::date
        WHERE e.id=$1 AND e.client_id=$2 AND e.approval_status='APPROVED'
          AND (e.is_active=true OR e.date_of_exit >= $3::date)
          AND (e.date_of_joining IS NULL OR e.date_of_joining <= $3::date)
          AND (e.date_of_exit IS NULL OR e.date_of_exit >= $3::date)`,
        [input.employeeId, user.clientId, input.date],
      );
      if (!employee)
        throw new ForbiddenException(
          'Employee is not available in your company for this date',
        );
      const incomplete =
        ['PRESENT', 'HALF_DAY'].includes(employee.status) &&
        (!employee.check_in || !employee.check_out);
      if (
        employee.on_leave ||
        employee.holiday ||
        (employee.attendance_id && !incomplete)
      ) {
        throw new FollowupResolvedException(
          'Attendance no longer needs a missed-punch follow-up. Refresh the register.',
        );
      }
      if (automatic) {
        const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
        if (
          !employee.attendance_id &&
          automatic.weeklyOffDays.includes(weekday)
        ) {
          throw new FollowupResolvedException(
            'Configured weekly off; no reminder required',
          );
        }
        const [shift] = await manager.query(
          `SELECT start_time::text, end_time::text, grace_out_min
          FROM attendance_shifts WHERE client_id=$1 AND employee_id=$2 AND active=true`,
          [user.clientId, employee.id],
        );
        if (!automaticReminderDue(input.date, automatic.now, shift)) {
          throw new FollowupDeferredException(
            'Shift or next-morning reminder window has not finished',
          );
        }
      }
      const recipients =
        input.target === 'EMPLOYEE'
          ? await manager.query(
              `SELECT u.id, u.name, r.code FROM users u JOIN roles r ON r.id=u.role_id
            WHERE u.client_id=$1 AND u.employee_id=$2 AND r.code='EMPLOYEE'
              AND u.is_active=true AND u.deleted_at IS NULL ORDER BY u.id`,
              [user.clientId, employee.id],
            )
          : await manager.query(
              `SELECT DISTINCT u.id, u.name, r.code FROM users u JOIN roles r ON r.id=u.role_id
            JOIN user_branches ub ON ub.user_id=u.id
            WHERE u.client_id=$1 AND ub.branch_id=$2 AND u.is_active=true AND u.deleted_at IS NULL
              AND ((r.code='CLIENT' AND u.user_type='BRANCH') OR r.code IN ('BRANCH_DESK','BRANCH_MANAGER')) ORDER BY u.id`,
              [user.clientId, employee.branch_id],
            );
      if (!recipients.length)
        throw new BadRequestException(
          input.target === 'EMPLOYEE'
            ? 'No active ESS login is linked to this employee. Ask Admin to provision the employee login.'
            : 'No active branch manager / branch user is assigned to this branch. Ask Admin to update the branch assignment.',
        );
      let sent = 0;
      let existing = 0;
      let firstNotificationAt: Date | null = null;
      const subject = `${input.target === 'BRANCH' ? 'Attendance escalation' : 'Missed attendance reminder'}: ${employee.employee_code} · ${input.date}`;
      const message =
        `${employee.name} (${employee.employee_code}) has ${incomplete ? 'an incomplete attendance punch' : 'no attendance record'} on ${input.date}. ` +
        (input.target === 'BRANCH'
          ? 'Please review with the employee and arrange the required attendance correction.'
          : 'Please review your attendance and contact your branch manager for correction if you forgot to mark attendance.') +
        ' If this was a weekly off or another non-working day, please confirm that in your reply. This is a review request, not an absence or pay deduction.';
      for (const recipient of recipients) {
        const key = `time-office:${input.target}:${employee.id}:${input.date}:${recipient.id}`;
        const [prior] = await manager.query(
          'SELECT id, created_at FROM notifications WHERE client_id=$1 AND source_key=$2',
          [user.clientId, key],
        );
        if (prior) {
          const at = new Date(prior.created_at);
          if (!firstNotificationAt || at < firstNotificationAt)
            firstNotificationAt = at;
          existing++;
          continue;
        }
        const [notification] = await manager.query(
          `INSERT INTO notifications
          (created_by_user_id,created_by_role,query_type,subject,client_id,branch_id,status,priority,assigned_to_user_id,assigned_to_role,source_key)
          VALUES ($1,$2,'SYSTEM',$3,$4,$5,'OPEN',$6,$7,$8,$9) RETURNING id, created_at`,
          [
            user.id,
            automatic ? 'SYSTEM' : user.roleCode,
            subject,
            user.clientId,
            employee.branch_id,
            input.target === 'BRANCH' ? 1 : 2,
            recipient.id,
            recipient.code,
            key,
          ],
        );
        const at = new Date(notification.created_at);
        if (!firstNotificationAt || at < firstNotificationAt)
          firstNotificationAt = at;
        await manager.query(
          `INSERT INTO notification_messages (notification_id,sender_user_id,message)
          VALUES ($1,$2,$3)`,
          [
            notification.id,
            user.id,
            (automatic ? 'Automatic Time Office follow-up. ' : '') + message,
          ],
        );
        sent++;
      }
      return {
        sent,
        existing,
        firstNotificationAt,
        recipients: recipients.map((r: { name: string }) => r.name),
      };
    });
  }
}
