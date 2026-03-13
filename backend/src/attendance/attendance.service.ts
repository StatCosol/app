import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceEntity)
    private readonly repo: Repository<AttendanceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
  ) {}

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
  ) {
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const existing = await this.repo.findOne({
      where: { employeeId: body.employeeId, date: body.date },
    });

    if (existing) {
      existing.status = body.status;
      if (body.checkIn !== undefined) existing.checkIn = body.checkIn;
      if (body.checkOut !== undefined) existing.checkOut = body.checkOut;
      if (body.workedHours !== undefined)
        existing.workedHours = String(body.workedHours);
      if (body.overtimeHours !== undefined)
        existing.overtimeHours = String(body.overtimeHours);
      if (body.remarks !== undefined) existing.remarks = body.remarks;
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
        remarks?: string;
      }[];
    },
  ) {
    const results: { employeeId: string; status: string }[] = [];
    for (const entry of body.entries) {
      await this.markAttendance(clientId, {
        ...entry,
        date: body.date,
      });
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
  }) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.client_id = :clientId', { clientId: params.clientId })
      .andWhere('a.date BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.employee_code', 'ASC');

    if (params.branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId: params.branchId });
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
  }) {
    const firstDay = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const lastDay = new Date(params.year, params.month, 0);
    const toDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const totalDays = lastDay.getDate();

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

    if (params.branchId) {
      qb.andWhere('a.branch_id = :branchId', { branchId: params.branchId });
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
  }) {
    const firstDay = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
    const lastDay = new Date(params.year, params.month, 0);
    const toDate = `${params.year}-${String(params.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const rows = await this.list({
      clientId: params.clientId,
      branchId: params.branchId,
      from: firstDay,
      to: toDate,
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
  ) {
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
          where: { employeeId: emp.id, date: dateStr },
        });
        if (exists) continue;

        await this.repo.save(
          this.repo.create({
            clientId,
            branchId: emp.branchId,
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            date: dateStr,
            status: isOff ? 'WEEK_OFF' : 'PRESENT',
            source: 'MANUAL',
          }),
        );
        created++;
      }
    }
    return { created, employees: employees.length, days: lastDay };
  }
}
