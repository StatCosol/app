import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegisterRow } from './register-workbook';

/** Rajasthan uses daily statuses, not Central in/out columns. Caller validates scope. */
export async function registerStatusAttendance(
  ds: DataSource,
  clientId: string,
  branchId: string,
  year: number,
  month: number,
) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${days}`;
  const records = await ds.query(
    `SELECT a.employee_id,e.name,e.father_name,e.designation,e.department,a.date::text,a.status,a.overtime_hours::text FROM attendance_records a JOIN employees e ON e.id=a.employee_id AND e.client_id=a.client_id WHERE a.client_id=$1 AND a.branch_id=$2 AND a.date BETWEEN $3::date AND $4::date AND a.approval_status='APPROVED' AND a.approved_at IS NOT NULL AND a.approved_by_user_id IS NOT NULL ORDER BY a.employee_id,a.date LIMIT 15501`,
    [clientId, branchId, start, end],
  );
  if (!records.length || records.length > 15500)
    throw new BadRequestException(
      'Select 1 to 500 workers with approved daily attendance',
    );
  const groups = new Map<
    string,
    {
      row: RegisterRow;
      dates: Set<number>;
      overtime: string[];
      hours: number;
      valid: boolean;
    }
  >();
  const codes: Record<string, string> = {
    PRESENT: 'P',
    HALF_DAY: 'HD',
    ABSENT: 'A',
    ON_LEAVE: 'L',
    WEEK_OFF: 'WO',
    HOLIDAY: 'H',
  };
  for (const r of records) {
    let g = groups.get(r.employee_id);
    if (!g) {
      g = {
        row: {
          serial: groups.size + 1,
          name: r.name,
          relativeName: r.father_name || '',
          designation: [r.designation, r.department]
            .filter(Boolean)
            .join(' / '),
        },
        dates: new Set(),
        overtime: [],
        hours: 0,
        valid: true,
      };
      groups.set(r.employee_id, g);
    }
    const day = Number(r.date.slice(8, 10));
    if (g.dates.has(day))
      throw new BadRequestException(
        'Duplicate daily attendance requires correction',
      );
    g.dates.add(day);
    if (codes[r.status]) g.row[`day${day}Status`] = codes[r.status];
    else g.valid = false;
    if (
      r.overtime_hours == null ||
      !Number.isFinite(Number(r.overtime_hours)) ||
      Number(r.overtime_hours) < 0
    )
      g.valid = false;
    else {
      g.hours += Number(r.overtime_hours);
      if (Number(r.overtime_hours) > 0)
        g.overtime.push(`${r.date}: ${r.overtime_hours}`);
    }
  }
  if (groups.size > 500)
    throw new BadRequestException('Prepare no more than 500 workers at a time');
  return {
    rows: [...groups.values()].map((g) => {
      if (g.valid && g.dates.size === days) {
        const statuses = Array.from(
          { length: days },
          (_, i) => g.row[`day${i + 1}Status`],
        );
        g.row.daysWorked = statuses.reduce<number>(
          (n, v) => n + (v === 'P' ? 1 : v === 'HD' ? 0.5 : 0),
          0,
        );
        g.row.restDays = statuses.filter((v) => v === 'WO').length;
        g.row.leaveDays = statuses.filter((v) => v === 'L').length;
        g.row.otHours = Math.round(g.hours * 100) / 100;
        g.row.otDates =
          g.overtime.map((v) => v.slice(0, 10)).join(', ') || 'None';
        g.row.otDetails = g.overtime.join('; ') || 'None';
      }
      return g.row;
    }),
    notice:
      'Approved daily statuses: P present, HD half-day, A absent, L leave, WO rest day, H holiday. Missing days remain blank. Verify paid days from payment evidence; they are not inferred from presence. Review overtime and worker particulars before generation.',
  };
}
