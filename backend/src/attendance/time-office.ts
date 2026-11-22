import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Query,
} from '@nestjs/common';
import {
  TimeOfficeFollowupDto,
  TimeOfficeFollowupsService,
} from './time-office-followups';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

export { timeOfficeFilters } from './time-office-filters';
import { timeOfficeFilters } from './time-office-filters';

@Injectable()
export class TimeOfficeService {
  constructor(private readonly db: DataSource) {}

  async dashboard(user: ReqUser, query: Record<string, string>) {
    if (!user.clientId)
      throw new ForbiddenException('No company linked to this account');
    const f = timeOfficeFilters(query);
    const branches = await this.db.query(
      `SELECT id, branchname AS name FROM client_branches WHERE clientid=$1 AND isdeleted=false ORDER BY branchname`,
      [user.clientId],
    );
    if (f.branch && !branches.some((b: { id: string }) => b.id === f.branch))
      throw new ForbiddenException('Branch is not in your company');
    // Every joined source is tenant-scoped. The roster includes people without an attendance row.
    const roster = `SELECT e.id, e.employee_code, e.name, e.branch_id, COALESCE(b.branchname,'Unassigned branch') AS branch,
      b.statecode FROM employees e LEFT JOIN client_branches b ON b.id=e.branch_id AND b.clientid=e.client_id
      WHERE e.client_id=$1 AND (e.is_active=true OR e.date_of_exit >= ${f.view === 'leaves' ? "date_trunc('month',$2::date)::date" : '$2::date'})
      AND e.approval_status='APPROVED' AND (e.date_of_joining IS NULL OR e.date_of_joining <= ${f.view === 'leaves' ? "(date_trunc('month',$2::date)+interval '1 month - 1 day')::date" : '$2::date'})
      AND (e.date_of_exit IS NULL OR e.date_of_exit >= ${f.view === 'leaves' ? "date_trunc('month',$2::date)::date" : '$2::date'})
      AND ($3::uuid IS NULL OR e.branch_id=$3::uuid)
      AND ($4='' OR strpos(lower(e.name || ' ' || e.employee_code),lower($4))>0)`;
    const attendance = `SELECT r.*, a.check_in, a.check_out, a.worked_hours, a.approval_status,
      CASE WHEN a.id IS NOT NULL THEN a.status
        WHEN EXISTS (SELECT 1 FROM leave_applications l WHERE l.client_id=$1 AND l.employee_id=r.id
          AND l.status='APPROVED' AND $2::date BETWEEN l.from_date AND l.to_date) THEN 'ON_LEAVE'
        WHEN EXISTS (SELECT 1 FROM holiday_calendar h WHERE h.client_id=$1 AND h.holiday_date=$2::date
          AND (h.branch_id=r.branch_id OR (h.branch_id IS NULL AND (h.state_code IS NULL OR h.state_code=r.statecode)))) THEN 'HOLIDAY'
        ELSE 'NOT_MARKED' END AS status,
      CASE WHEN a.status IN ('PRESENT','HALF_DAY') AND a.check_in IS NOT NULL AND a.check_out IS NOT NULL
        AND a.worked_hours IS NOT NULL AND a.worked_hours < $5::numeric THEN true ELSE false END AS short_hours,
      CASE WHEN a.status IN ('PRESENT','HALF_DAY') AND (a.check_in IS NULL OR a.check_out IS NULL)
        THEN true ELSE false END AS incomplete
      FROM roster r LEFT JOIN attendance_records a ON a.employee_id=r.id AND a.client_id=$1 AND a.date=$2::date`;
    const leaves = `SELECT r.*, l.id AS leave_id, l.leave_type, l.from_date::text, l.to_date::text, l.total_days, l.status
      FROM roster r JOIN leave_applications l ON l.employee_id=r.id AND l.client_id=$1
      WHERE l.from_date <= (date_trunc('month',$2::date)+interval '1 month - 1 day')::date
        AND l.to_date >= date_trunc('month',$2::date)::date AND l.status <> 'DRAFT'`;
    const coff = `SELECT r.*, COALESCE(c.accrued,0) AS accrued, COALESCE(c.used,0) AS used,
      COALESCE(c.lapsed,0) AS lapsed, COALESCE(c.available,0) AS available
      FROM roster r LEFT JOIN LATERAL (SELECT
        SUM(CASE WHEN entry_type='ACCRUAL' THEN days ELSE 0 END) AS accrued,
        SUM(CASE WHEN entry_type='USED' THEN abs(days) ELSE 0 END) AS used,
        SUM(CASE WHEN entry_type='LAPSED' THEN abs(days) ELSE 0 END) AS lapsed,
        SUM(days) AS available FROM comp_off_ledger WHERE client_id=$1 AND employee_id=r.id AND entry_date <= $2::date) c ON true`;
    const body =
      f.view === 'attendance'
        ? attendance
        : f.view === 'leaves'
          ? leaves
          : coff;
    const condition =
      f.view === 'attendance'
        ? `($6='' OR ($6='SHORT_HOURS' AND short_hours) OR ($6='INCOMPLETE' AND incomplete) OR status=$6)`
        : `($6::text IS NOT NULL)`;
    const summary =
      f.view === 'attendance'
        ? `json_build_object('employees',count(*),'notMarked',count(*) FILTER (WHERE status='NOT_MARKED'),
          'shortHours',count(*) FILTER (WHERE short_hours),'incomplete',count(*) FILTER (WHERE incomplete),
          'onLeave',count(*) FILTER (WHERE status='ON_LEAVE'),'absent',count(*) FILTER (WHERE status='ABSENT'))`
        : f.view === 'leaves'
          ? `json_build_object('applications',count(*),'approved',count(*) FILTER (WHERE status='APPROVED'),
          'pending',count(*) FILTER (WHERE status IN ('PENDING','SUBMITTED')))`
          : `json_build_object('employees',count(*),'availableDays',COALESCE(sum(available),0),'usedDays',COALESCE(sum(used),0))`;
    // Cast $5 even in non-attendance views so PostgreSQL can infer every parameter type.
    const [result] = await this.db.query(
      `WITH roster AS (${roster}), data AS (${body}),
      filtered AS (SELECT * FROM data WHERE ${condition} AND $5::numeric > 0),
      page AS (SELECT * FROM filtered ORDER BY branch,name,employee_code${f.view === 'leaves' ? ',from_date,leave_id' : ''} LIMIT 50 OFFSET $7)
      SELECT (SELECT COALESCE(json_agg(page),'[]'::json) FROM page) AS rows,
        (SELECT count(*)::int FROM filtered) AS total, (SELECT ${summary} FROM data) AS summary`,
      [
        user.clientId,
        f.date,
        f.branch,
        f.search,
        f.hours,
        f.issue,
        (f.page - 1) * 50,
      ],
    );
    return { ...result, branches, page: f.page, pageSize: 50, date: f.date };
  }
}

@Controller({ path: 'client/attendance/time-office', version: '1' })
@Roles('TIME_OFFICE_EXECUTIVE', 'TIME_OFFICE_MANAGER')
export class TimeOfficeController {
  constructor(
    private readonly service: TimeOfficeService,
    private readonly followups: TimeOfficeFollowupsService,
  ) {}

  @Post('follow-up')
  followUp(@CurrentUser() user: ReqUser, @Body() body: TimeOfficeFollowupDto) {
    return this.followups.send(user, body);
  }

  @Get()
  dashboard(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.service.dashboard(user, query);
  }
}
