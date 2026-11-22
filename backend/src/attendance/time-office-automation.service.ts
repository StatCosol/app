import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Put,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { operationalDate } from '../common/operational-date';
import {
  TimeOfficeFollowupsService,
  FollowupDeferredException,
  FollowupResolvedException,
} from './time-office-followups';

export class TimeOfficeAutomationDto {
  @IsBoolean() enabled: boolean;
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays: number[];
}

@Injectable()
export class TimeOfficeAutomationService {
  private readonly logger = new Logger(TimeOfficeAutomationService.name);
  constructor(
    private readonly db: DataSource,
    private readonly followups: TimeOfficeFollowupsService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  private async ensureSettings(clientId: string) {
    await this.db.query(
      `INSERT INTO time_office_automation_settings(client_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [clientId],
    );
  }

  async settings(user: ReqUser) {
    if (!user.clientId)
      throw new ForbiddenException('Company assignment required');
    await this.ensureSettings(user.clientId);
    const [settings] = await this.db.query(
      'SELECT * FROM time_office_automation_settings WHERE client_id=$1',
      [user.clientId],
    );
    const issues = await this.db.query(
      `SELECT c.attendance_date::text, e.employee_code, e.name, c.last_error
      FROM time_office_followup_cases c JOIN employees e ON e.id=c.employee_id AND e.client_id=c.client_id
      WHERE c.client_id=$1 AND c.resolved_at IS NULL AND c.last_error IS NOT NULL
      ORDER BY c.last_attempt_at DESC LIMIT 50`,
      [user.clientId],
    );
    const [counts] = await this.db.query(
      `SELECT count(*) FILTER(WHERE reminded_at IS NOT NULL AND resolved_at IS NULL AND escalated_at IS NULL)::int AS awaiting_correction,
      count(*) FILTER(WHERE escalated_at IS NOT NULL AND resolved_at IS NULL)::int AS escalated,
      count(*) FILTER(WHERE last_error IS NOT NULL AND resolved_at IS NULL)::int AS delivery_issues
      FROM time_office_followup_cases WHERE client_id=$1`,
      [user.clientId],
    );
    return {
      ...settings,
      starts_on: operationalDate(new Date(settings.starts_on)),
      ...counts,
      issues,
    };
  }

  async save(user: ReqUser, input: TimeOfficeAutomationDto) {
    if (user.roleCode !== 'TIME_OFFICE_MANAGER' || !user.clientId)
      throw new ForbiddenException(
        'Only Time Office Managers can change automation settings',
      );
    await this.ensureSettings(user.clientId);
    await this.db.query(
      `UPDATE time_office_automation_settings SET enabled=$2, weekly_off_days=$3,
      updated_by=$4, updated_at=now() WHERE client_id=$1`,
      [user.clientId, input.enabled, input.weeklyOffDays, user.id],
    );
    return this.settings(user);
  }

  @Cron('0 */15 * * * *', { timeZone: 'Asia/Kolkata', waitForCompletion: true })
  async tick(now = new Date()) {
    const clients = await this.db
      .query(`SELECT DISTINCT u.client_id FROM users u JOIN roles r ON r.id=u.role_id
      JOIN clients c ON c.id=u.client_id WHERE r.code IN ('TIME_OFFICE_EXECUTIVE','TIME_OFFICE_MANAGER')
      AND u.is_active=true AND u.deleted_at IS NULL AND c.is_active=true AND c.is_deleted=false AND c.deleted_at IS NULL`);
    for (const { client_id: clientId } of clients) {
      try {
        if (
          !(await this.entitlements.hasModule(clientId, 'EMPLOYEE_ATTENDANCE'))
        )
          continue;
        await this.ensureSettings(clientId);
        await this.processCompany(clientId, now);
      } catch (error) {
        this.logger.error(
          `Automatic attendance follow-up failed for company ${clientId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.db
          .query(
            `UPDATE time_office_automation_settings SET last_error=$2 WHERE client_id=$1`,
            [
              clientId,
              'Automatic follow-up run failed. Please contact support.',
            ],
          )
          .catch(() => undefined);
      }
    }
  }

  async processCompany(clientId: string, now: Date) {
    const lock = this.db.createQueryRunner();
    await lock.connect();
    let acquired = false;
    try {
      const [result] = await lock.query(
        `SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked`,
        [`time-office-auto:${clientId}`],
      );
      acquired = result.locked;
      if (!acquired) return;
      const [policy] = await this.db.query(
        'SELECT * FROM time_office_automation_settings WHERE client_id=$1',
        [clientId],
      );
      if (!policy?.enabled) return;
      const [actor] = await this.db.query(
        `SELECT u.id, u.client_id AS "clientId", r.code AS "roleCode" FROM users u
        JOIN roles r ON r.id=u.role_id WHERE u.client_id=$1 AND u.is_active=true AND u.deleted_at IS NULL
        AND r.code IN ('TIME_OFFICE_EXECUTIVE','TIME_OFFICE_MANAGER') ORDER BY (r.code='TIME_OFFICE_MANAGER') DESC, u.id LIMIT 1`,
        [clientId],
      );
      if (!actor) return;
      // Seven-day catch-up for outages; do not send a backlog from before activation.
      await this.db.query(
        `INSERT INTO time_office_followup_cases(client_id,employee_id,attendance_date)
        SELECT e.client_id,e.id,d.day::date FROM employees e CROSS JOIN
          generate_series(GREATEST($2::date,$3::date-7),$3::date-1,interval '1 day') d(day)
        LEFT JOIN attendance_records a ON a.client_id=e.client_id AND a.employee_id=e.id AND a.date=d.day::date
        WHERE e.client_id=$1 AND e.is_active=true AND e.approval_status='APPROVED'
          AND (e.date_of_joining IS NULL OR e.date_of_joining<=d.day::date)
          AND (e.date_of_exit IS NULL OR e.date_of_exit>=d.day::date)
          AND (a.id IS NULL OR (a.status IN ('PRESENT','HALF_DAY') AND (a.check_in IS NULL OR a.check_out IS NULL)))
        ON CONFLICT DO NOTHING`,
        [clientId, policy.starts_on, operationalDate(now)],
      );
      // Fair batches keep large companies from starving older delivery issues.
      const cases = await this.db.query(
        `SELECT *, attendance_date::text AS date FROM time_office_followup_cases
        WHERE client_id=$1 AND resolved_at IS NULL ORDER BY last_attempt_at ASC NULLS FIRST,attendance_date,employee_id LIMIT 500`,
        [clientId],
      );
      for (const item of cases) {
        const key = [clientId, item.employee_id, item.date];
        try {
          // Recheck corrections even after escalation, without sending another message.
          const [state] = await this.db.query(
            `SELECT e.is_active, a.id,a.status,a.check_in,a.check_out,
            EXISTS(SELECT 1 FROM leave_applications l WHERE l.client_id=e.client_id AND l.employee_id=e.id
              AND l.status='APPROVED' AND $3::date BETWEEN l.from_date AND l.to_date) AS on_leave,
            EXISTS(SELECT 1 FROM holiday_calendar h WHERE h.client_id=e.client_id AND h.holiday_date=$3::date
              AND (h.branch_id=e.branch_id OR (h.branch_id IS NULL AND (h.state_code IS NULL OR h.state_code=b.statecode)))) AS holiday
            FROM employees e LEFT JOIN client_branches b ON b.id=e.branch_id AND b.clientid=e.client_id
            LEFT JOIN attendance_records a ON a.client_id=e.client_id AND a.employee_id=e.id AND a.date=$3
            WHERE e.client_id=$1 AND e.id=$2`,
            key,
          );
          const isWeeklyOff =
            !state?.id &&
            policy.weekly_off_days.includes(
              new Date(`${item.date}T00:00:00Z`).getUTCDay(),
            );
          if (
            !state?.is_active ||
            state.on_leave ||
            state.holiday ||
            isWeeklyOff ||
            (state.id &&
              !(
                ['PRESENT', 'HALF_DAY'].includes(state.status) &&
                (!state.check_in || !state.check_out)
              ))
          ) {
            throw new FollowupResolvedException(
              'Attendance corrected or non-working day recorded',
            );
          }
          if (
            item.reminded_at &&
            (item.escalated_at ||
              now.getTime() <
                new Date(item.reminded_at).getTime() + 24 * 3600_000)
          )
            continue;
          const response = await this.followups.send(
            actor,
            {
              employeeId: item.employee_id,
              date: item.date,
              target: item.reminded_at ? 'BRANCH' : 'EMPLOYEE',
            },
            { now, weeklyOffDays: policy.weekly_off_days },
          );
          if (!response.firstNotificationAt)
            throw new BadRequestException(
              'Notification delivery was not recorded',
            );
          const column = item.reminded_at ? 'escalated_at' : 'reminded_at';
          await this.db.query(
            `UPDATE time_office_followup_cases SET ${column}=COALESCE(${column},$4),last_error=NULL
            WHERE client_id=$1 AND employee_id=$2 AND attendance_date=$3`,
            [...key, response.firstNotificationAt],
          );
        } catch (error) {
          if (error instanceof FollowupDeferredException) continue;
          if (
            error instanceof FollowupResolvedException ||
            error instanceof ForbiddenException
          ) {
            await this.db.query(
              `UPDATE time_office_followup_cases SET resolved_at=$4,last_error=NULL WHERE client_id=$1 AND employee_id=$2 AND attendance_date=$3`,
              [...key, now],
            );
          } else {
            const message =
              error instanceof BadRequestException
                ? error.message
                : 'Notification delivery failed. The system will retry.';
            await this.db.query(
              `UPDATE time_office_followup_cases SET last_error=$4 WHERE client_id=$1 AND employee_id=$2 AND attendance_date=$3`,
              [...key, message],
            );
          }
        } finally {
          await this.db.query(
            `UPDATE time_office_followup_cases SET last_attempt_at=$4 WHERE client_id=$1 AND employee_id=$2 AND attendance_date=$3`,
            [...key, now],
          );
        }
      }
      await this.db.query(
        `UPDATE time_office_automation_settings SET last_run_at=$2,last_error=NULL WHERE client_id=$1`,
        [clientId, now],
      );
    } finally {
      try {
        if (acquired)
          await lock.query(
            `SELECT pg_advisory_unlock(hashtextextended($1,0))`,
            [`time-office-auto:${clientId}`],
          );
      } finally {
        await lock.release();
      }
    }
  }
}

@Controller({ path: 'client/attendance/time-office/automation', version: '1' })
@Roles('TIME_OFFICE_EXECUTIVE', 'TIME_OFFICE_MANAGER')
export class TimeOfficeAutomationController {
  constructor(private readonly service: TimeOfficeAutomationService) {}
  @Get() get(@CurrentUser() user: ReqUser) {
    return this.service.settings(user);
  }
  @Put()
  @Roles('TIME_OFFICE_MANAGER')
  save(@CurrentUser() user: ReqUser, @Body() body: TimeOfficeAutomationDto) {
    return this.service.save(user, body);
  }
}
