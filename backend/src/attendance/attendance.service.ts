import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
  DataSource,
  SelectQueryBuilder,
  ObjectLiteral,
} from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceEntity } from './entities/attendance.entity';
import { AttendanceMismatchEntity } from './entities/attendance-mismatch.entity';
import { AttendanceAuditLogEntity } from './entities/attendance-audit-log.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricPunchEntity } from '../biometric/entities/biometric-punch.entity';
import { BiometricService } from '../biometric/biometric.service';
import { Workbook } from 'exceljs';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceEntity)
    private readonly repo: Repository<AttendanceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(AttendanceMismatchEntity)
    private readonly mismatchRepo: Repository<AttendanceMismatchEntity>,
    @InjectRepository(AttendanceAuditLogEntity)
    private readonly auditRepo: Repository<AttendanceAuditLogEntity>,
    private readonly ds: DataSource,
    private readonly biometricService: BiometricService,
  ) {}

  private applyBranchScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    allowedBranchIds: string[] | null = null,
  ): boolean {
    if (!allowedBranchIds) return true;
    if (!allowedBranchIds.length) return false;
    qb.andWhere(`${alias}.branch_id IN (:...allowedBranchIds)`, {
      allowedBranchIds,
    });
    return true;
  }

  private assertBranchAllowed(
    branchId: string | null | undefined,
    allowedBranchIds: string[] | null = null,
  ): void {
    if (!allowedBranchIds) return;
    if (!branchId) {
      throw new ForbiddenException(
        'Employee is not assigned to a branch and cannot be accessed with a branch-scoped account',
      );
    }
    if (!allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException(
        'Attendance record is outside your branch scope',
      );
    }
  }

  private assertRequestedBranchAllowed(
    branchId: string | null | undefined,
    allowedBranchIds: string[] | null = null,
  ): void {
    if (!allowedBranchIds || !branchId) return;
    if (!allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Branch not in scope');
    }
  }

  private resetApproval(record: AttendanceEntity): void {
    record.approvalStatus = 'PENDING';
    record.approvedByUserId = null;
    record.approvedAt = null;
    record.rejectionReason = null;
  }

  /** Mark attendance for a single employee/date */
  async markAttendance(
    clientId: string,
    body: {
      employeeId: string;
      date: string;
      status: AttendanceEntity['status'];
      checkIn?: string;
      checkOut?: string;
      workedHours?: number;
      overtimeHours?: number;
      remarks?: string;
    },
    allowedBranchIds: string[] | null = null,
  ) {
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    this.assertBranchAllowed(emp.branchId, allowedBranchIds);

    const existing = await this.repo.findOne({
      where: { clientId, employeeId: body.employeeId, date: body.date },
    });

    if (existing) {
      this.assertBranchAllowed(existing.branchId, allowedBranchIds);
      existing.status = body.status;
      if (body.checkIn !== undefined) existing.checkIn = body.checkIn;
      if (body.checkOut !== undefined) existing.checkOut = body.checkOut;
      if (body.workedHours !== undefined)
        existing.workedHours = String(body.workedHours);
      if (body.overtimeHours !== undefined)
        existing.overtimeHours = String(body.overtimeHours);
      if (body.remarks !== undefined) existing.remarks = body.remarks;
      this.resetApproval(existing);
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({
        clientId,
        branchId: emp.branchId,
        employeeId: body.employeeId,
        employeeCode: emp.employeeCode,
        date: body.date,
        status: body.status,
        checkIn: body.checkIn ?? null,
        checkOut: body.checkOut ?? null,
        workedHours: body.workedHours != null ? String(body.workedHours) : null,
        overtimeHours: String(body.overtimeHours ?? 0),
        remarks: body.remarks ?? null,
        source: 'MANUAL',
      }),
    );
  }

  /** Bulk mark attendance for multiple employees on a date */
  async bulkMark(
    clientId: string,
    body: {
      date: string;
      entries: {
        employeeId: string;
        status: AttendanceEntity['status'];
        checkIn?: string;
        checkOut?: string;
        workedHours?: number;
        overtimeHours?: number;
        remarks?: string;
      }[];
    },
    allowedBranchIds: string[] | null = null,
  ) {
    // Validate all entries before writing any — prevents partial saves when
    // a branch-scope or not-found error would otherwise leave earlier entries committed.
    for (const entry of body.entries) {
      const emp = await this.empRepo.findOne({
        where: { id: entry.employeeId, clientId },
      });
      if (!emp)
        throw new NotFoundException(`Employee ${entry.employeeId} not found`);
      this.assertBranchAllowed(emp.branchId, allowedBranchIds);
    }

    const results: { employeeId: string; status: string }[] = [];
    for (const entry of body.entries) {
      await this.markAttendance(
        clientId,
        { ...entry, date: body.date },
        allowedBranchIds,
      );
      results.push({ employeeId: entry.employeeId, status: 'saved' });
    }
    return { date: body.date, saved: results.length, results };
  }

  /** Get attendance for a date range */
  async list(params: {
    clientId: string;
    branchId?: string;
    employeeId?: string;
    from: string;
    to: string;
    allowedBranchIds?: string[] | null;
  }) {
    await this.biometricService.processRange(
      params.clientId,
      params.from,
      params.to,
      false,
    );

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.client_id = :clientId', { clientId: params.clientId })
      .andWhere('a.date BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.employee_code', 'ASC');

    this.assertRequestedBranchAllowed(params.branchId, params.allowedBranchIds);
    if (params.branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId: params.branchId });
    } else if (!this.applyBranchScope(qb, 'a', params.allowedBranchIds)) {
      return [];
    }
    if (params.employeeId) {
      qb.andWhere('a.employee_id = :employeeId', {
        employeeId: params.employeeId,
      });
    }

    return qb.getMany();
  }

  /** Monthly summary for payroll integration */
  async getMonthlySummary(params: {
    clientId: string;
    branchId?: string;
    year: number;
    month: number;
    approvedOnly?: boolean;
    allowedBranchIds?: string[] | null;
  }) {
    const firstDay = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const lastDay = new Date(params.year, params.month, 0);
    const toDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const totalDays = lastDay.getDate();

    await this.biometricService.processRange(
      params.clientId,
      firstDay,
      toDate,
      false,
    );

    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.employee_id', 'employeeId')
      .addSelect('a.employee_code', 'employeeCode')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'PRESENT')", 'daysPresent')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'ABSENT')", 'daysAbsent')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'HALF_DAY')", 'halfDays')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'ON_LEAVE')", 'daysOnLeave')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'HOLIDAY')", 'holidays')
      .addSelect("COUNT(*) FILTER (WHERE a.status = 'WEEK_OFF')", 'weekOffs')
      .addSelect(
        'COALESCE(SUM(CAST(a.overtime_hours AS numeric)), 0)',
        'totalOvertimeHours',
      )
      .where('a.client_id = :clientId', { clientId: params.clientId })
      .andWhere('a.date BETWEEN :from AND :to', { from: firstDay, to: toDate })
      .groupBy('a.employee_id')
      .addGroupBy('a.employee_code');

    this.assertRequestedBranchAllowed(params.branchId, params.allowedBranchIds);
    if (params.branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId: params.branchId });
    } else if (!this.applyBranchScope(qb, 'a', params.allowedBranchIds)) {
      return [];
    }
    if (params.approvedOnly) {
      qb.andWhere("a.approval_status = 'APPROVED'");
    }

    const rows = await qb.getRawMany();

    return rows.map((r) => {
      const present = Number(r.daysPresent) + Number(r.halfDays) * 0.5;
      const lop = Math.max(
        0,
        totalDays -
          present -
          Number(r.holidays) -
          Number(r.weekOffs) -
          Number(r.daysOnLeave),
      );
      return {
        employeeId: r.employeeId,
        employeeCode: r.employeeCode,
        totalDays,
        daysPresent: Number(r.daysPresent),
        halfDays: Number(r.halfDays),
        daysAbsent: Number(r.daysAbsent),
        daysOnLeave: Number(r.daysOnLeave),
        holidays: Number(r.holidays),
        weekOffs: Number(r.weekOffs),
        effectivePresent: present,
        lopDays: lop,
        totalOvertimeHours: Number(r.totalOvertimeHours),
      };
    });
  }

  /** Attendance mismatches for review workbench */
  async getMismatches(params: {
    clientId: string;
    branchId?: string;
    year: number;
    month: number;
    allowedBranchIds?: string[] | null;
  }) {
    const firstDay = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const lastDay = new Date(params.year, params.month, 0);
    const toDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const rows = await this.list({
      clientId: params.clientId,
      branchId: params.branchId,
      from: firstDay,
      to: toDate,
      allowedBranchIds: params.allowedBranchIds,
    });

    const issues: Array<{
      key: string;
      employeeId: string;
      employeeCode: string;
      date: string;
      issue: string;
      detail: string;
      severity: 'HIGH' | 'MEDIUM';
      resolved: boolean;
    }> = [];

    for (const row of rows) {
      const status = String(row.status || '').toUpperCase();
      const checkInMissing = !String(row.checkIn || '').trim();
      const checkOutMissing = !String(row.checkOut || '').trim();
      const workedHours = Number(row.workedHours || 0);

      if (
        (status === 'PRESENT' || status === 'HALF_DAY') &&
        (checkInMissing || checkOutMissing)
      ) {
        issues.push({
          key: `${row.id}-clock`,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          date: row.date,
          issue: 'Missing Check Time',
          detail: `Check-in: ${row.checkIn || '-'}, Check-out: ${row.checkOut || '-'}`,
          severity: 'HIGH',
          resolved: false,
        });
      }

      if (status === 'PRESENT' && workedHours <= 0) {
        issues.push({
          key: `${row.id}-hours`,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          date: row.date,
          issue: 'Invalid Worked Hours',
          detail: `Worked hours is ${row.workedHours ?? 0}`,
          severity: 'MEDIUM',
          resolved: false,
        });
      }
    }

    return issues;
  }

  /** LOP preview rows for payroll handoff */
  async getLopPreview(params: {
    clientId: string;
    branchId?: string;
    year: number;
    month: number;
    allowedBranchIds?: string[] | null;
  }) {
    const summary = await this.getMonthlySummary(params);
    return summary
      .filter((row) => Number(row.lopDays || 0) > 0)
      .sort((a, b) => Number(b.lopDays || 0) - Number(a.lopDays || 0));
  }

  /** Seed weekly-offs and holidays for a month (utility) */
  async seedDefaults(
    clientId: string,
    branchId: string | null,
    year: number,
    month: number,
    weeklyOffDays: number[] = [0], // 0=Sunday
    allowedBranchIds: string[] | null = null,
  ) {
    this.assertRequestedBranchAllowed(branchId, allowedBranchIds);
    if (allowedBranchIds && !branchId) {
      if (!allowedBranchIds.length)
        return { created: 0, employees: 0, days: 0 };
      if (allowedBranchIds.length === 1) {
        branchId = allowedBranchIds[0];
      } else {
        throw new ForbiddenException('Branch is required for scoped users');
      }
    }
    const lastDay = new Date(year, month, 0).getDate();
    const employees = await this.empRepo.find({
      where: {
        clientId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
    });

    let created = 0;
    for (let d = 1; d <= lastDay; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = dateObj.getDay();
      const isOff = weeklyOffDays.includes(dayOfWeek);

      for (const emp of employees) {
        const exists = await this.repo.findOne({
          where: { clientId, employeeId: emp.id, date: dateStr },
        });
        if (exists) continue;

        await this.repo.save(
          this.repo.create({
            clientId,
            branchId: emp.branchId,
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            date: dateStr,
            status: isOff ? 'WEEK_OFF' : 'ABSENT',
            source: 'MANUAL',
          }),
        );
        created++;
      }
    }
    return { created, employees: employees.length, days: lastDay };
  }

  // ── Daily Attendance with Employee Names ───────────────────
  /** List daily attendance records with employee names for branch/client review */
  async listDaily(params: {
    clientId: string;
    date: string;
    branchId?: string;
    approvalStatus?: string;
    allowedBranchIds?: string[] | null;
  }) {
    // Reconcile accepted FaceDesk punches first. The ingest is idempotent and
    // also backfills punches captured before real-time FaceDesk ingest existed.
    await this.biometricService.syncFaceDeskRange(
      params.clientId,
      params.date,
      params.date,
    );
    // reprocess=true: always reconcile corrected punches before showing the review grid
    await this.biometricService.processRange(
      params.clientId,
      params.date,
      params.date,
      true,
    );

    const qb = this.ds
      .createQueryBuilder()
      .select([
        'a.id            AS "id"',
        'a.employee_id   AS "employeeId"',
        'a.employee_code AS "employeeCode"',
        'a.branch_id     AS "branchId"',
        'a.date          AS "date"',
        'a.status        AS "status"',
        'a.check_in      AS "checkIn"',
        'a.check_out     AS "checkOut"',
        'a.worked_hours   AS "workedHours"',
        'a.overtime_hours AS "overtimeHours"',
        'a.remarks       AS "remarks"',
        'a.source        AS "source"',
        'a.capture_method AS "captureMethod"',
        'a.self_marked   AS "selfMarked"',
        'a.check_in_lat  AS "checkInLat"',
        'a.check_in_lng  AS "checkInLng"',
        'a.check_out_lat AS "checkOutLat"',
        'a.check_out_lng AS "checkOutLng"',
        'a.short_work_reason AS "shortWorkReason"',
        'a.approval_status   AS "approvalStatus"',
        'a.approved_by_user_id AS "approvedByUserId"',
        'a.approved_at   AS "approvedAt"',
        'a.rejection_reason AS "rejectionReason"',
        'e.name          AS "employeeName"',
        'b.branchname    AS "branchName"',
      ])
      .from('attendance_records', 'a')
      .leftJoin('employees', 'e', 'e.id = a.employee_id')
      .leftJoin('client_branches', 'b', 'b.id = a.branch_id')
      .where('a.client_id = :clientId', { clientId: params.clientId })
      .andWhere('a.date = :date', { date: params.date })
      .orderBy('e.name', 'ASC')
      .addOrderBy('a.employee_code', 'ASC');

    this.assertRequestedBranchAllowed(params.branchId, params.allowedBranchIds);
    if (params.branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId: params.branchId });
    } else if (
      !this.applyBranchScope(qb as any, 'a', params.allowedBranchIds)
    ) {
      return [];
    }
    if (params.approvalStatus) {
      qb.andWhere('a.approval_status = :approvalStatus', {
        approvalStatus: params.approvalStatus,
      });
    }

    const rows = await qb.getRawMany();
    // Attach every ESS check-in/out punch for the day so field/sales staff who
    // visited multiple sites show all their punches (each with its location).
    return this.attachDayPunches(rows, params.clientId, params.date);
  }

  /**
   * Group the day's ess_attendance_punches by employee and attach them to the
   * matching daily rows as a `punches` array (each with a Google Maps link).
   */
  private async attachDayPunches(
    rows: any[],
    clientId: string,
    date: string,
  ): Promise<any[]> {
    if (!rows.length) return rows;
    let punchRows: any[] = [];
    try {
      punchRows = await this.ds.query(
        `SELECT employee_id AS "employeeId", punch_type AS "punchType",
                extract(epoch FROM punch_time) AS epoch,
                latitude, longitude, accuracy, capture_method AS "captureMethod"
         FROM ess_attendance_punches
         WHERE client_id = $1 AND date = $2::date
         ORDER BY punch_time ASC, created_at ASC`,
        [clientId, date],
      );
    } catch {
      // Table may not exist yet on a brand-new deploy — degrade gracefully.
      return rows.map((r) => ({ ...r, punches: [] }));
    }

    const byEmp = new Map<string, any[]>();
    for (const p of punchRows) {
      const lat = p.latitude != null ? Number(p.latitude) : null;
      const lng = p.longitude != null ? Number(p.longitude) : null;
      const local = new Date((Number(p.epoch) + 330 * 60) * 1000); // IST
      const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(
        local.getUTCMinutes(),
      ).padStart(2, '0')}:${String(local.getUTCSeconds()).padStart(2, '0')}`;
      const entry = {
        punchType: p.punchType,
        time,
        latitude: lat,
        longitude: lng,
        accuracy: p.accuracy != null ? Number(p.accuracy) : null,
        captureMethod: p.captureMethod,
        mapUrl:
          lat != null && lng != null
            ? `https://www.google.com/maps?q=${lat},${lng}`
            : null,
      };
      const list = byEmp.get(p.employeeId) || [];
      list.push(entry);
      byEmp.set(p.employeeId, list);
    }

    return rows.map((r) => ({ ...r, punches: byEmp.get(r.employeeId) || [] }));
  }

  /**
   * Build a downloadable Excel report of the day's attendance. Produces two
   * sheets: a per-employee daily summary and a punch-level log where each
   * location is a clickable Google Maps hyperlink (field/sales staff visits).
   */
  async buildDailyReport(params: {
    clientId: string;
    date: string;
    branchId?: string;
    allowedBranchIds?: string[] | null;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.listDaily({
      clientId: params.clientId,
      date: params.date,
      branchId: params.branchId,
      allowedBranchIds: params.allowedBranchIds,
    });

    const wb = new Workbook();
    wb.creator = 'StatCo';
    wb.created = new Date();

    // ── Sheet 1: Daily summary (one row per employee) ──
    const summary = wb.addWorksheet('Daily Summary');
    summary.columns = [
      { header: 'Employee', key: 'employeeName', width: 26 },
      { header: 'Code', key: 'employeeCode', width: 14 },
      { header: 'Branch', key: 'branchName', width: 22 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'First In', key: 'checkIn', width: 12 },
      { header: 'Last Out', key: 'checkOut', width: 12 },
      { header: 'Worked Hours', key: 'workedHours', width: 14 },
      { header: 'OT Hours', key: 'overtimeHours', width: 12 },
      { header: 'Punches', key: 'punchCount', width: 10 },
    ];
    for (const r of rows) {
      summary.addRow({
        employeeName: r.employeeName || '',
        employeeCode: r.employeeCode || '',
        branchName: r.branchName || '',
        status: r.status || '',
        checkIn: r.checkIn || '',
        checkOut: r.checkOut || '',
        workedHours: r.workedHours || '',
        overtimeHours: r.overtimeHours || '',
        punchCount: (r.punches || []).length,
      });
    }
    summary.getRow(1).font = { bold: true };

    // Helpers shared by the visit/punch sheets.
    const setLocationCell = (row: any, key: string, p: any) => {
      if (!p) return;
      const cell = row.getCell(key);
      if (p.latitude != null && p.longitude != null) {
        const text = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
        if (p.mapUrl) {
          cell.value = { text, hyperlink: p.mapUrl };
          cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
        } else {
          cell.value = text;
        }
      } else {
        cell.value = 'No location';
      }
    };
    const durationStr = (a?: string | null, b?: string | null): string => {
      if (!a || !b) return '';
      const pa = String(a).split(':').map(Number);
      const pb = String(b).split(':').map(Number);
      if (pa.length < 2 || pb.length < 2) return '';
      let secs =
        (pb[0] * 3600 + pb[1] * 60 + (pb[2] || 0)) -
        (pa[0] * 3600 + pa[1] * 60 + (pa[2] || 0));
      if (secs < 0) secs += 24 * 3600; // overnight
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // ── Sheet 2: Visits — each IN→OUT pair as one location-wise row ──
    const visits = wb.addWorksheet('Visits (In-Out)');
    visits.columns = [
      { header: 'Employee', key: 'employeeName', width: 26 },
      { header: 'Code', key: 'employeeCode', width: 14 },
      { header: 'Branch', key: 'branchName', width: 20 },
      { header: 'Visit', key: 'visit', width: 7 },
      { header: 'In Time', key: 'inTime', width: 11 },
      { header: 'In Location', key: 'inLoc', width: 28 },
      { header: 'Out Time', key: 'outTime', width: 11 },
      { header: 'Out Location', key: 'outLoc', width: 28 },
      { header: 'Duration', key: 'duration', width: 11 },
    ];
    visits.getRow(1).font = { bold: true };

    for (const r of rows) {
      const punches = r.punches || [];
      let openIn: any = null;
      let visitNo = 0;
      const emit = (inP: any, outP: any) => {
        visitNo += 1;
        const row = visits.addRow({
          employeeName: r.employeeName || '',
          employeeCode: r.employeeCode || '',
          branchName: r.branchName || '',
          visit: visitNo,
          inTime: inP ? inP.time : '',
          inLoc: '',
          outTime: outP ? outP.time : '',
          outLoc: outP ? '' : '(still in)',
          duration: durationStr(inP?.time, outP?.time),
        });
        setLocationCell(row, 'inLoc', inP);
        if (outP) setLocationCell(row, 'outLoc', outP);
      };
      for (const p of punches) {
        if (p.punchType === 'IN') {
          if (openIn) emit(openIn, null); // prior IN never closed
          openIn = p;
        } else if (p.punchType === 'OUT') {
          emit(openIn, p); // openIn may be null (OUT without IN)
          openIn = null;
        }
      }
      if (openIn) emit(openIn, null); // trailing open IN
    }

    // ── Sheet 3: Punch log (one row per check-in/out, location hyperlinked) ──
    const log = wb.addWorksheet('Punch Log');
    log.columns = [
      { header: 'Employee', key: 'employeeName', width: 26 },
      { header: 'Code', key: 'employeeCode', width: 14 },
      { header: 'Branch', key: 'branchName', width: 22 },
      { header: 'Type', key: 'punchType', width: 8 },
      { header: 'Time', key: 'time', width: 12 },
      { header: 'Method', key: 'captureMethod', width: 14 },
      { header: 'Location', key: 'location', width: 34 },
      { header: 'Accuracy (m)', key: 'accuracy', width: 13 },
    ];
    log.getRow(1).font = { bold: true };

    for (const r of rows) {
      for (const p of r.punches || []) {
        const row = log.addRow({
          employeeName: r.employeeName || '',
          employeeCode: r.employeeCode || '',
          branchName: r.branchName || '',
          punchType: p.punchType,
          time: p.time,
          captureMethod: p.captureMethod || '',
          location:
            p.latitude != null && p.longitude != null
              ? `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`
              : 'No location',
          accuracy: p.accuracy != null ? Math.round(p.accuracy) : '',
        });
        // Make the location cell a clickable Google Maps hyperlink.
        if (p.mapUrl) {
          const cell = row.getCell('location');
          cell.value = {
            text: `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`,
            hyperlink: p.mapUrl,
          };
          cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
        }
      }
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filename: `attendance-${params.date}.xlsx`,
    };
  }

  /** Edit an attendance record (status, check-in/out, hours, remarks) */
  async editRecord(
    clientId: string,
    recordId: string,
    body: {
      status: AttendanceEntity['status'];
      checkIn?: string;
      checkOut?: string;
      workedHours?: number;
      overtimeHours?: number;
      remarks?: string;
    },
    allowedBranchIds: string[] | null = null,
    actorUserId: string | null = null,
  ) {
    const record = await this.repo.findOne({
      where: { id: recordId, clientId },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    this.assertBranchAllowed(record.branchId, allowedBranchIds);

    const before = {
      status: record.status,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      workedHours: record.workedHours,
      overtimeHours: record.overtimeHours,
      remarks: record.remarks,
      approvalStatus: record.approvalStatus,
    };

    record.status = body.status;
    if (body.checkIn !== undefined) record.checkIn = body.checkIn || null;
    if (body.checkOut !== undefined) record.checkOut = body.checkOut || null;
    if (body.workedHours !== undefined)
      record.workedHours = String(body.workedHours);
    if (body.overtimeHours !== undefined)
      record.overtimeHours = String(body.overtimeHours);
    if (body.remarks !== undefined) record.remarks = body.remarks || null;

    this.resetApproval(record);
    const saved = await this.repo.save(record);

    await this.auditRepo.save(
      this.auditRepo.create({
        attendanceId: saved.id,
        clientId: saved.clientId,
        employeeId: saved.employeeId,
        date: saved.date,
        action: 'EDIT',
        actorUserId: actorUserId,
        beforeSnapshot: before,
        afterSnapshot: {
          status: saved.status,
          checkIn: saved.checkIn,
          checkOut: saved.checkOut,
          workedHours: saved.workedHours,
          overtimeHours: saved.overtimeHours,
          remarks: saved.remarks,
          approvalStatus: saved.approvalStatus,
        },
      }),
    );

    return saved;
  }

  /** Bulk approve attendance records */
  async approveRecords(
    clientId: string,
    ids: string[],
    userId: string,
    allowedBranchIds: string[] | null = null,
  ) {
    const records = await this.repo.find({
      where: { clientId, id: In(ids) },
    });
    if (!records.length) throw new NotFoundException('No records found');
    if (records.length !== ids.length) {
      throw new NotFoundException(
        `${ids.length - records.length} record(s) not found or do not belong to this client`,
      );
    }
    records.forEach((record) =>
      this.assertBranchAllowed(record.branchId, allowedBranchIds),
    );

    const now = new Date();
    for (const rec of records) {
      const before = { approvalStatus: rec.approvalStatus };
      rec.approvalStatus = 'APPROVED';
      rec.approvedByUserId = userId;
      rec.approvedAt = now;
      rec.rejectionReason = null;
      await this.auditRepo.save(
        this.auditRepo.create({
          attendanceId: rec.id,
          clientId: rec.clientId,
          employeeId: rec.employeeId,
          date: rec.date,
          action: 'APPROVE',
          actorUserId: userId,
          beforeSnapshot: before,
          afterSnapshot: { approvalStatus: 'APPROVED' },
        }),
      );
    }
    await this.repo.save(records);
    return { approved: records.length };
  }

  /** Bulk reject attendance records */
  async rejectRecords(
    clientId: string,
    ids: string[],
    userId: string,
    reason?: string,
    allowedBranchIds: string[] | null = null,
  ) {
    const records = await this.repo.find({
      where: { clientId, id: In(ids) },
    });
    if (!records.length) throw new NotFoundException('No records found');
    if (records.length !== ids.length) {
      throw new NotFoundException(
        `${ids.length - records.length} record(s) not found or do not belong to this client`,
      );
    }
    records.forEach((record) =>
      this.assertBranchAllowed(record.branchId, allowedBranchIds),
    );

    const now = new Date();
    for (const rec of records) {
      const before = { approvalStatus: rec.approvalStatus };
      rec.approvalStatus = 'REJECTED';
      rec.approvedByUserId = userId;
      rec.approvedAt = now;
      rec.rejectionReason = reason || null;
      await this.auditRepo.save(
        this.auditRepo.create({
          attendanceId: rec.id,
          clientId: rec.clientId,
          employeeId: rec.employeeId,
          date: rec.date,
          action: 'REJECT',
          actorUserId: userId,
          beforeSnapshot: before,
          afterSnapshot: {
            approvalStatus: 'REJECTED',
            rejectionReason: reason ?? null,
          },
          note: reason ?? null,
        }),
      );
    }
    await this.repo.save(records);
    await this.notifyRejectedEmployees(records, reason);
    return { rejected: records.length };
  }

  /** Delete wrong attendance records and their source biometric/face punches. */
  async deleteRecords(
    clientId: string,
    ids: string[],
    allowedBranchIds: string[] | null = null,
  ) {
    const records = await this.repo.find({
      where: { clientId, id: In(ids) },
    });
    if (!records.length) throw new NotFoundException('No records found');
    records.forEach((record) =>
      this.assertBranchAllowed(record.branchId, allowedBranchIds),
    );

    const recordIds = records.map((r) => r.id);

    return this.ds.transaction(async (manager) => {
      const punchDelete = await manager
        .getRepository(BiometricPunchEntity)
        .delete({
          clientId,
          attendanceId: In(recordIds),
        });

      const attendanceDelete = await manager
        .getRepository(AttendanceEntity)
        .delete({
          clientId,
          id: In(recordIds),
        });

      return {
        deleted: attendanceDelete.affected ?? 0,
        deletedPunches: punchDelete.affected ?? 0,
      };
    });
  }

  // ── Fix #6: Employee rejection notifications ────────────────
  private async notifyRejectedEmployees(
    records: AttendanceEntity[],
    reason?: string,
  ): Promise<void> {
    if (!records.length) return;
    try {
      for (const rec of records) {
        const body = reason
          ? `Your attendance for ${rec.date} was rejected: ${reason}`
          : `Your attendance for ${rec.date} was rejected.`;
        await this.ds.query(
          `INSERT INTO employee_notifications
             (id, client_id, employee_id, type, title, body, ref_type, ref_id, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'ATTENDANCE_REJECTED',
                   'Attendance Rejected', $3, 'attendance_records', $4::uuid, NOW())
           ON CONFLICT DO NOTHING`,
          [rec.clientId, rec.employeeId, body, rec.id],
        );
      }
    } catch {
      // Notifications table may not exist yet — log but don't fail the rejection
      this.logger.warn(
        'Could not insert rejection notifications (table may not exist yet)',
      );
    }
  }

  // ── Fix #1: Persisted mismatch detection via nightly cron ──
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async detectMismatchesNightly(): Promise<void> {
    this.logger.log('Running nightly attendance mismatch detection job…');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().slice(0, 10);

      // Get distinct clientIds with attendance records yesterday
      const clients = await this.ds.query<Array<{ client_id: string }>>(
        `SELECT DISTINCT client_id FROM attendance_records WHERE date = $1`,
        [dateStr],
      );

      let total = 0;
      for (const { client_id } of clients) {
        const count = await this.persistMismatchesForDate(client_id, dateStr);
        total += count;
      }
      this.logger.log(`Mismatch detection complete. ${total} issues upserted.`);
    } catch (err) {
      this.logger.error('Nightly mismatch detection failed', err);
    }
  }

  async persistMismatchesForDate(
    clientId: string,
    date: string,
  ): Promise<number> {
    const rows = await this.repo.find({
      where: { clientId, date },
    });

    let upserted = 0;
    for (const row of rows) {
      const status = String(row.status || '').toUpperCase();
      const issues: Array<{
        type: string;
        detail: string;
        severity: 'HIGH' | 'MEDIUM';
      }> = [];

      if (
        (status === 'PRESENT' || status === 'HALF_DAY') &&
        (!row.checkIn || !row.checkOut)
      ) {
        issues.push({
          type: 'MISSING_CHECK_TIME',
          detail: `Check-in: ${row.checkIn ?? '-'}, Check-out: ${row.checkOut ?? '-'}`,
          severity: 'HIGH',
        });
      }

      if (status === 'PRESENT' && Number(row.workedHours ?? 0) <= 0) {
        issues.push({
          type: 'INVALID_WORKED_HOURS',
          detail: `Worked hours is ${row.workedHours ?? 0}`,
          severity: 'MEDIUM',
        });
      }

      for (const issue of issues) {
        await this.ds.query(
          `INSERT INTO attendance_mismatches
             (id, client_id, branch_id, employee_id, employee_code, date,
              issue_type, detail, severity, resolved, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, $7, $8, false, NOW(), NOW())
           ON CONFLICT (client_id, employee_id, date, issue_type)
           DO UPDATE SET detail = EXCLUDED.detail, severity = EXCLUDED.severity, updated_at = NOW()
           WHERE attendance_mismatches.resolved = false`,
          [
            clientId,
            row.branchId,
            row.employeeId,
            row.employeeCode,
            row.date,
            issue.type,
            issue.detail,
            issue.severity,
          ],
        );
        upserted++;
      }
    }
    return upserted;
  }

  /** Resolve a persisted mismatch */
  async resolveMismatch(
    clientId: string,
    mismatchId: string,
    userId: string,
    note?: string,
  ): Promise<AttendanceMismatchEntity> {
    const record = await this.mismatchRepo.findOne({
      where: { id: mismatchId, clientId },
    });
    if (!record) throw new NotFoundException('Mismatch not found');
    record.resolved = true;
    record.resolvedBy = userId;
    record.resolvedAt = new Date();
    record.resolutionNote = note ?? null;
    return this.mismatchRepo.save(record);
  }

  /** List persisted mismatches */
  async listPersistedMismatches(params: {
    clientId: string;
    branchId?: string;
    year: number;
    month: number;
    resolved?: boolean;
    allowedBranchIds?: string[] | null;
  }): Promise<AttendanceMismatchEntity[]> {
    const firstDay = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const lastDay = new Date(params.year, params.month, 0);
    const toDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    const qb = this.mismatchRepo
      .createQueryBuilder('m')
      .where('m.client_id = :clientId', { clientId: params.clientId })
      .andWhere('m.date BETWEEN :from AND :to', { from: firstDay, to: toDate })
      .orderBy(
        `CASE m.severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
        'ASC',
      )
      .addOrderBy('m.date', 'ASC');

    if (params.branchId) {
      qb.andWhere('m.branch_id = :branchId', { branchId: params.branchId });
    } else if (params.allowedBranchIds?.length) {
      qb.andWhere('m.branch_id IN (:...allowedBranchIds)', {
        allowedBranchIds: params.allowedBranchIds,
      });
    }

    if (params.resolved !== undefined) {
      qb.andWhere('m.resolved = :resolved', { resolved: params.resolved });
    }

    return qb.getMany();
  }

  // ── Fix #8: Short work day escalation ───────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async escalateShortWorkDays(): Promise<void> {
    this.logger.log('Running short-work-day escalation job…');
    try {
      const gracedays = Number(process.env.SHORT_WORK_GRACE_DAYS ?? 2);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - gracedays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const standardHours = Number(process.env.STANDARD_WORK_HOURS ?? 9);

      // Find PRESENT records where workedHours < standard and no short_work_reason, older than grace period
      const rows = await this.ds.query<
        Array<{
          id: string;
          client_id: string;
          employee_id: string;
          employee_code: string;
          branch_id: string | null;
          date: string;
          worked_hours: string;
        }>
      >(
        `SELECT id, client_id, employee_id, employee_code, branch_id, date, worked_hours
         FROM attendance_records
         WHERE status = 'PRESENT'
           AND worked_hours IS NOT NULL
           AND worked_hours::numeric < $1
           AND short_work_reason IS NULL
           AND date < $2::date`,
        [standardHours, cutoffStr],
      );

      for (const row of rows) {
        await this.ds.query(
          `INSERT INTO attendance_mismatches
             (id, client_id, branch_id, employee_id, employee_code, date,
              issue_type, detail, severity, resolved, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5::date,
                   'SHORT_WORK_NO_REASON', $6, 'MEDIUM', false, NOW(), NOW())
           ON CONFLICT (client_id, employee_id, date, issue_type)
           DO UPDATE SET detail = EXCLUDED.detail, updated_at = NOW()
           WHERE attendance_mismatches.resolved = false`,
          [
            row.client_id,
            row.branch_id,
            row.employee_id,
            row.employee_code,
            row.date,
            `Worked ${Number(row.worked_hours).toFixed(1)}h < ${standardHours}h standard with no reason provided`,
          ],
        );
      }

      this.logger.log(`Short-work escalation: flagged ${rows.length} records.`);
    } catch (err) {
      this.logger.error('Short-work escalation job failed', err);
    }
  }

  // ── Fix #7: Payroll handoff validation ──────────────────────
  async validatePayrollHandoff(params: {
    clientId: string;
    branchId?: string;
    year: number;
    month: number;
    allowedBranchIds?: string[] | null;
  }): Promise<{
    canProceed: boolean;
    unresolvedHigh: number;
    issues: AttendanceMismatchEntity[];
  }> {
    const issues = await this.listPersistedMismatches({
      ...params,
      resolved: false,
    });
    const highSeverity = issues.filter((i) => i.severity === 'HIGH');
    return {
      canProceed: highSeverity.length === 0,
      unresolvedHigh: highSeverity.length,
      issues,
    };
  }

  // ── Fix #3: Audit log query ─────────────────────────────────
  async getAuditLog(
    clientId: string,
    attendanceId: string,
  ): Promise<AttendanceAuditLogEntity[]> {
    return this.auditRepo.find({
      where: { clientId, attendanceId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Approval stats for a given day */
  async getApprovalStats(
    clientId: string,
    date: string,
    branchId?: string,
    allowedBranchIds: string[] | null = null,
  ) {
    await this.biometricService.syncFaceDeskRange(clientId, date, date);
    await this.biometricService.processRange(clientId, date, date, true);

    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.approval_status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('a.client_id = :clientId', { clientId })
      .andWhere('a.date = :date', { date })
      .groupBy('a.approval_status');

    this.assertRequestedBranchAllowed(branchId, allowedBranchIds);
    if (branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId });
    } else if (!this.applyBranchScope(qb, 'a', allowedBranchIds)) {
      return { total: 0, pending: 0, approved: 0, rejected: 0 };
    }

    const rows = await qb.getRawMany();
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) {
      const cnt = Number(r.count);
      stats.total += cnt;
      if (r.status === 'PENDING') stats.pending = cnt;
      else if (r.status === 'APPROVED') stats.approved = cnt;
      else if (r.status === 'REJECTED') stats.rejected = cnt;
    }
    return stats;
  }
}
