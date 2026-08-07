import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { HolidayCalendarEntity } from './entities/holiday-calendar.entity';
import { CreateHolidayDto } from './holiday-calendar.dto';

@Injectable()
export class HolidayCalendarService {
  private readonly logger = new Logger(HolidayCalendarService.name);

  constructor(
    @InjectRepository(HolidayCalendarEntity)
    private readonly repo: Repository<HolidayCalendarEntity>,
    private readonly ds: DataSource,
  ) {}

  /** List holidays for a client, optionally filtered to a year. */
  async list(clientId: string, year?: number) {
    const qb = this.repo
      .createQueryBuilder('h')
      .where('h.clientId = :clientId', { clientId })
      .orderBy('h.holidayDate', 'ASC');
    if (year) {
      qb.andWhere('EXTRACT(YEAR FROM h.holidayDate) = :year', { year });
    }
    return qb.getMany();
  }

  /** Add a single holiday (branch-specific, state-level, or client-wide). */
  async create(clientId: string, dto: CreateHolidayDto) {
    const date = this.normalizeDate(dto.holidayDate);
    if (!date) throw new BadRequestException('A valid holiday date is required');
    if (!dto.name?.trim())
      throw new BadRequestException('Holiday name is required');

    const entity = this.repo.create({
      clientId,
      branchId: dto.branchId || null,
      stateCode: dto.stateCode ? dto.stateCode.toUpperCase() : null,
      holidayDate: date,
      name: dto.name.trim(),
      isPaid: dto.isPaid ?? true,
    });
    return this.repo.save(entity);
  }

  async remove(clientId: string, id: string) {
    const row = await this.repo.findOne({ where: { id, clientId } });
    if (!row) throw new NotFoundException('Holiday not found');
    await this.repo.remove(row);
    return { success: true };
  }

  /**
   * Parse an uploaded Excel holiday list. Expected columns (with a header row):
   * Date | Holiday Name | State Code (optional) | Paid (optional Y/N).
   * State-level or client-wide holidays only; branch-specific ones use create().
   */
  async uploadFromExcel(
    clientId: string,
    file: Express.Multer.File,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    if (!file?.buffer) throw new BadRequestException('No file uploaded');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('The uploaded file has no sheets');

    const errors: string[] = [];
    const toInsert: Array<{
      clientId: string;
      branchId: null;
      stateCode: string | null;
      holidayDate: string;
      name: string;
      isPaid: boolean;
    }> = [];
    let skipped = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const dateCell = row.getCell(1).value;
      const nameCell = row.getCell(2).value;
      const stateCell = row.getCell(3).value;
      const paidCell = row.getCell(4).value;

      const rawDate =
        dateCell instanceof Date
          ? dateCell.toISOString().slice(0, 10)
          : String(dateCell ?? '').trim();
      const name = String(nameCell ?? '').trim();
      if (!rawDate && !name) return; // blank row

      const date = this.normalizeDate(rawDate);
      if (!date) {
        errors.push(`Row ${rowNumber}: invalid date "${rawDate}"`);
        skipped++;
        return;
      }
      if (!name) {
        errors.push(`Row ${rowNumber}: holiday name is missing`);
        skipped++;
        return;
      }
      const stateCode = String(stateCell ?? '').trim().toUpperCase() || null;
      const paidStr = String(paidCell ?? '').trim().toLowerCase();
      const isPaid = !(paidStr === 'n' || paidStr === 'no' || paidStr === 'false' || paidStr === 'unpaid');

      toInsert.push({
        clientId,
        branchId: null,
        stateCode,
        holidayDate: date,
        name,
        isPaid,
      });
    });

    if (!toInsert.length) {
      return { created: 0, skipped, errors };
    }

    // De-duplicate against existing rows (same client, date, state).
    let created = 0;
    for (const h of toInsert) {
      const exists = await this.repo.findOne({
        where: {
          clientId,
          holidayDate: h.holidayDate,
          stateCode: h.stateCode ?? IsNull(),
          branchId: IsNull(),
        },
      });
      if (exists) {
        skipped++;
        continue;
      }
      await this.repo.save(this.repo.create(h));
      created++;
    }

    return { created, skipped, errors };
  }

  /**
   * Mark the calendar's holidays onto attendance_records for a month: creates a
   * HOLIDAY record for in-scope employees who have no record that day, and
   * upgrades existing non-working records (ABSENT/WEEK_OFF/UNMARKED) to HOLIDAY.
   * Employees who actually worked (PRESENT/HALF_DAY/ON_LEAVE) are left untouched
   * so holiday-work stays detectable for the double-wage approval step.
   */
  async applyToAttendance(
    clientId: string,
    year: number,
    month: number,
    branchId?: string,
  ) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(
      new Date(year, month, 0).getDate(),
    ).padStart(2, '0')}`;

    // Employees matching a holiday's scope (branch / state / client-wide).
    const scopeJoin = `
      JOIN employees e ON e.client_id = h.client_id AND e.is_active = true
        AND (
          (h.branch_id IS NOT NULL AND e.branch_id = h.branch_id)
          OR (h.branch_id IS NULL AND h.state_code IS NOT NULL AND EXISTS (
                SELECT 1 FROM client_branches b
                WHERE b.id = e.branch_id AND UPPER(b.statecode) = h.state_code))
          OR (h.branch_id IS NULL AND h.state_code IS NULL)
        )`;
    const branchFilter = branchId ? 'AND e.branch_id = $4' : '';
    const params: any[] = [clientId, from, to];
    if (branchId) params.push(branchId);

    // 1) Insert HOLIDAY where the employee has no record that day.
    const inserted = await this.ds.query(
      `INSERT INTO attendance_records
         (id, client_id, branch_id, employee_id, employee_code, date, status, source, remarks)
       SELECT gen_random_uuid(), e.client_id, e.branch_id, e.id, e.employee_code,
              h.holiday_date, 'HOLIDAY', 'HOLIDAY_CALENDAR', h.name
       FROM holiday_calendar h
       ${scopeJoin}
       WHERE h.client_id = $1 AND h.holiday_date BETWEEN $2::date AND $3::date ${branchFilter}
         AND NOT EXISTS (
           SELECT 1 FROM attendance_records a
           WHERE a.employee_id = e.id AND a.date = h.holiday_date)
       RETURNING id`,
      params,
    );

    // 2) Upgrade existing non-working records to HOLIDAY.
    const updated = await this.ds.query(
      `UPDATE attendance_records a
       SET status = 'HOLIDAY',
           remarks = COALESCE(NULLIF(a.remarks, ''), h.name),
           source = 'HOLIDAY_CALENDAR',
           updated_at = NOW()
       FROM holiday_calendar h
       ${scopeJoin}
       WHERE a.employee_id = e.id AND a.date = h.holiday_date
         AND h.client_id = $1 AND h.holiday_date BETWEEN $2::date AND $3::date ${branchFilter}
         AND a.status IN ('ABSENT', 'WEEK_OFF', 'UNMARKED')
       RETURNING a.id`,
      params,
    );

    return {
      success: true,
      holidaysMarked: (inserted?.length ?? 0) + (updated?.length ?? 0),
      created: inserted?.length ?? 0,
      updated: updated?.length ?? 0,
    };
  }

  /**
   * List holiday-work: employees who were PRESENT/HALF_DAY on a day that is a
   * holiday in the calendar (for their scope). Surfaced at attendance→payroll
   * submission so HR can approve double wage.
   */
  async listHolidayWork(
    clientId: string,
    year: number,
    month: number,
    branchId?: string,
  ) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(
      new Date(year, month, 0).getDate(),
    ).padStart(2, '0')}`;
    const params: any[] = [clientId, from, to];
    const branchFilter = branchId ? 'AND a.branch_id = $4' : '';
    if (branchId) params.push(branchId);

    return this.ds.query(
      `SELECT a.id,
              a.employee_id   AS "employeeId",
              a.employee_code AS "employeeCode",
              e.name          AS "employeeName",
              b.branchname    AS "branchName",
              a.date::text    AS date,
              a.check_in      AS "checkIn",
              a.check_out     AS "checkOut",
              a.worked_hours  AS "workedHours",
              a.holiday_double_wage AS "doubleWage",
              h.name          AS "holidayName"
       FROM attendance_records a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN client_branches b ON b.id = a.branch_id
       JOIN holiday_calendar h
         ON h.client_id = a.client_id AND h.holiday_date = a.date
        AND (
          (h.branch_id IS NOT NULL AND h.branch_id = a.branch_id)
          OR (h.branch_id IS NULL AND h.state_code IS NOT NULL
              AND UPPER(b.statecode) = h.state_code)
          OR (h.branch_id IS NULL AND h.state_code IS NULL)
        )
       WHERE a.client_id = $1
         AND a.date BETWEEN $2::date AND $3::date
         AND a.status IN ('PRESENT', 'HALF_DAY') ${branchFilter}
       ORDER BY a.date ASC, e.name ASC`,
      params,
    );
  }

  /** Approve or decline double wage for the given attendance rows. */
  async setDoubleWageApproval(
    clientId: string,
    ids: string[],
    status: 'APPROVED' | 'DECLINED',
  ) {
    if (!ids?.length) throw new BadRequestException('No rows selected');
    if (!['APPROVED', 'DECLINED'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const res = await this.ds.query(
      `UPDATE attendance_records
       SET holiday_double_wage = $1, updated_at = NOW()
       WHERE client_id = $2 AND id = ANY($3::uuid[])`,
      [status, clientId, ids],
    );
    return { success: true, updated: res?.[1] ?? ids.length, status };
  }

  /** Per-employee count of APPROVED holiday-work days in a month (for payroll). */
  async getApprovedHolidayWorkDays(
    clientId: string,
    year: number,
    month: number,
  ): Promise<Record<string, number>> {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(
      new Date(year, month, 0).getDate(),
    ).padStart(2, '0')}`;
    const rows = await this.ds.query(
      `SELECT employee_id AS "employeeId", COUNT(*)::int AS days
       FROM attendance_records
       WHERE client_id = $1 AND date BETWEEN $2::date AND $3::date
         AND status IN ('PRESENT', 'HALF_DAY')
         AND holiday_double_wage = 'APPROVED'
       GROUP BY employee_id`,
      [clientId, from, to],
    );
    const map: Record<string, number> = {};
    for (const r of rows) map[r.employeeId] = Number(r.days) || 0;
    return map;
  }

  /** Accept ISO (YYYY-MM-DD) or common DD/MM/YYYY & DD-MM-YYYY; return ISO. */
  private normalizeDate(raw: string): string | null {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      return `${m[3]}-${mo}-${d}`;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }
}
