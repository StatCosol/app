import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegisterRow } from './register-workbook';

/** Called only after the builder validates branch and statutory applicability. */
export async function registerOperationalSource(
  ds: DataSource,
  formNumber: string,
  clientId: string,
  branchId: string,
  year: number,
  month: number,
) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${days}`;
  if (formNumber === 'EVENT')
    throw new BadRequestException(
      'Enter this event from its incident/report evidence; attendance and payroll are not incident records',
    );
  if (formNumber === 'LEAVE') {
    const leaves = await ds.query(
      `SELECT e.employee_code,e.name,e.department,e.father_name,e.date_of_joining::text,l.id,l.from_date::text,l.to_date::text,l.total_days::text FROM leave_applications l JOIN employees e ON e.id=l.employee_id AND e.client_id=l.client_id WHERE l.client_id=$1 AND l.branch_id=$2 AND l.status='APPROVED' AND l.actioned_at IS NOT NULL AND l.leave_type='EL' AND l.from_date <= $4::date AND l.to_date >= $3::date ORDER BY e.employee_code,l.from_date LIMIT 501`,
      [clientId, branchId, start, end],
    );
    if (!leaves.length || leaves.length > 500)
      throw new BadRequestException(
        'Select a branch/period with 1 to 500 approved earned-leave applications, or enter the authenticated leave register manually',
      );
    return {
      rows: leaves.map((l: any, i: number) => ({
        serial: i + 1,
        employeeCode: l.employee_code,
        name: l.name,
        department: l.department || '',
        relativeName: l.father_name || '',
        joiningDate: l.date_of_joining || '',
        leaveAllowedFrom: l.from_date,
        remarks:
          'Approved earned leave ' +
          l.from_date +
          ' to ' +
          l.to_date +
          ' (' +
          l.total_days +
          ' days); application ' +
          l.id,
      })),
      notice:
        'Approved earned-leave applications overlapping this month. Application days are not treated as the statutory leave entitlement or carry-forward balance. Complete interruptions, leave-due dates, leave wages and year carry-forward from the authenticated leave ledger. Each application has a separate worker page; review overlapping periods.',
    };
  }
  if (formNumber === 'I') {
    const employees = await ds.query(
      `SELECT employee_code, name, gender, father_name, date_of_birth::text,
      date_of_joining::text, designation, phone, uan, pan, esic, aadhaar, bank_account, bank_name, ifsc,
      date_of_exit::text, exit_reason FROM employees
      WHERE client_id=$1 AND branch_id=$2 AND approval_status='APPROVED'
      AND (date_of_joining IS NULL OR date_of_joining <= $4::date)
      AND (date_of_exit IS NULL OR date_of_exit >= $3::date)
      AND (is_active=true OR date_of_exit IS NOT NULL)
      ORDER BY employee_code LIMIT 501`,
      [clientId, branchId, start, end],
    );
    if (!employees.length || employees.length > 500)
      throw new BadRequestException(
        'Choose a branch with 1 to 500 approved employee records',
      );
    const mapping: Record<string, string> = {
      employee_code: 'employee_1',
      name: 'employee_2',
      gender: 'employee_4',
      father_name: 'employee_5',
      date_of_birth: 'employee_6',
      date_of_joining: 'employee_10',
      designation: 'employee_11',
      phone: 'employee_17',
      uan: 'employee_18',
      pan: 'employee_19',
      esic: 'employee_23',
      aadhaar: 'employee_24',
      bank_account: 'employee_25',
      bank_name: 'employee_26',
      ifsc: 'employee_27',
      date_of_exit: 'employee_31',
      exit_reason: 'employee_32',
    };
    return {
      rows: employees.map((e: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(mapping)
            .filter(([key]) => e[key] != null)
            .map(([key, field]) => [field, String(e[key])]),
        ),
      ),
      notice:
        'Approved employee profiles from the selected branch. Complete missing particulars and verify historical postings, addresses, pay and authentication from supporting records. Contractor worker registers require their separate employer records.',
    };
  }
  if (formNumber !== 'IX')
    throw new BadRequestException(
      'No operational source is implemented for this form',
    );
  const records = await ds.query(
    `SELECT a.employee_id, a.employee_code, e.name, e.designation, e.department,
    a.date::text, a.status, a.check_in::text, a.check_out::text, a.overtime_hours::text
    FROM attendance_records a JOIN employees e ON e.id=a.employee_id AND e.client_id=a.client_id
    WHERE a.client_id=$1 AND a.branch_id=$2 AND a.date BETWEEN $3::date AND $4::date
      AND a.approval_status='APPROVED' AND a.approved_at IS NOT NULL AND a.approved_by_user_id IS NOT NULL
    ORDER BY a.employee_code, a.date LIMIT 15501`,
    [clientId, branchId, start, end],
  );
  if (!records.length || records.length > 15500)
    throw new BadRequestException(
      'No approved daily attendance, or this branch exceeds the 500 employee preparation limit',
    );
  const grouped = new Map<
    string,
    {
      row: RegisterRow;
      dates: Set<number>;
      worked: number;
      ot: number;
      validOt: boolean;
      complete: boolean;
    }
  >();
  const codes: Record<string, string> = {
    ABSENT: 'A',
    ON_LEAVE: 'L',
    HOLIDAY: 'H',
    WEEK_OFF: 'WO',
  };
  for (const record of records) {
    let group = grouped.get(record.employee_id);
    if (!group) {
      group = {
        row: {
          serial: grouped.size + 1,
          employeeCode: record.employee_code,
          name: record.name,
          designation: record.designation || '',
          department: record.department || '',
        },
        dates: new Set(),
        worked: 0,
        ot: 0,
        validOt: true,
        complete: true,
      };
      grouped.set(record.employee_id, group);
    }
    const day = Number(record.date.slice(8, 10));
    if (group.dates.has(day))
      throw new BadRequestException(
        'Duplicate daily attendance requires correction before preparation',
      );
    group.dates.add(day);
    const absence = codes[record.status];
    if (absence) {
      group.row[`day${day}In`] = absence;
      group.row[`day${day}Out`] = absence;
    } else if (['PRESENT', 'HALF_DAY'].includes(record.status)) {
      if (record.check_in) group.row[`day${day}In`] = record.check_in;
      if (record.check_out) group.row[`day${day}Out`] = record.check_out;
      group.worked += record.status === 'HALF_DAY' ? 0.5 : 1;
      if (!record.check_in || !record.check_out) group.complete = false;
    }
    if (!absence && !['PRESENT', 'HALF_DAY'].includes(record.status))
      group.complete = false;
    if (
      record.overtime_hours == null ||
      !Number.isFinite(Number(record.overtime_hours))
    )
      group.validOt = false;
    else group.ot += Number(record.overtime_hours);
  }
  if (grouped.size > 500)
    throw new BadRequestException(
      'This branch exceeds the 500 employee preparation limit',
    );
  const rows = [...grouped.values()].map((g) => {
    if (g.dates.size === days && g.complete) {
      g.row.daysWorked = g.worked;
      if (g.validOt) g.row.otHours = Math.round(g.ot * 100) / 100;
    }
    return g.row;
  });
  return {
    rows,
    notice:
      'Only approved employee daily attendance is included. Missing or unapproved days remain blank; complete and review them before generation. A=absent, L=leave, H=holiday, WO=weekly off. Totals are prefilled only for complete months. Shift, signatures and contractor attendance require their own supporting records.',
  };
}
