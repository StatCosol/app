import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegisterLayout } from './register-layouts';
import { RegisterRow } from './register-workbook';

export async function registerContractors(
  ds: DataSource,
  clientId: string,
  branchId: string,
) {
  return ds.query(
    `SELECT u.id,u.name FROM branch_contractor bc JOIN users u ON u.id=bc.contractor_user_id AND u.is_active=true WHERE bc.client_id=$1 AND bc.branch_id=$2 ORDER BY u.name`,
    [clientId, branchId],
  );
}
export async function assertRegisterContractor(
  ds: DataSource,
  clientId: string,
  branchId: string,
  contractorId: string,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      contractorId,
    )
  )
    throw new BadRequestException('Select a valid contractor');
  const contractor = (await registerContractors(ds, clientId, branchId)).find(
    (c: any) => c.id === contractorId,
  );
  if (!contractor)
    throw new ForbiddenException(
      'Contractor is not assigned to this client and branch',
    );
  return contractor;
}
export async function contractorRegisterSource(
  ds: DataSource,
  layout: RegisterLayout,
  clientId: string,
  branchId: string,
  contractorId: string,
  year: number,
  month: number,
) {
  const contractor = await assertRegisterContractor(
    ds,
    clientId,
    branchId,
    contractorId,
  );
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const start = period + '-01',
    end = period + '-' + new Date(Date.UTC(year, month, 0)).getUTCDate();
  const params = [clientId, branchId, contractorId, period];
  if (layout.baseFormNumber === 'I') {
    const workers = await ds.query(
      `SELECT employee_code,name,gender,father_name,date_of_birth::text,date_of_joining::text,designation,phone,uan,pan,esic,aadhaar,bank_account,date_of_exit::text,exit_reason,skill_category FROM contractor_employees WHERE client_id=$1 AND branch_id=$2 AND contractor_user_id=$3 AND status IN ('ACTIVE','LEFT') AND (date_of_joining IS NULL OR date_of_joining <= $5::date) AND (date_of_exit IS NULL OR date_of_exit >= $4::date) ORDER BY employee_code LIMIT 501`,
      [clientId, branchId, contractorId, start, end],
    );
    if (!workers.length || workers.length > 500)
      throw new BadRequestException(
        'The selected contractor must have 1 to 500 enrolled workers for this period',
      );
    const mapping: Record<string, string> = {
      employee_code: 'employee_1',
      name: 'employee_2',
      gender: 'employee_4',
      father_name: 'employee_5',
      date_of_birth: 'employee_6',
      date_of_joining: 'employee_10',
      designation: 'employee_11',
      skill_category: 'employee_12',
      phone: 'employee_17',
      uan: 'employee_18',
      pan: 'employee_19',
      esic: 'employee_23',
      aadhaar: 'employee_24',
      bank_account: 'employee_25',
      date_of_exit: 'employee_31',
      exit_reason: 'employee_32',
    };
    return {
      rows: workers.map((w: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(mapping)
            .filter(([k]) => w[k] != null)
            .map(([k, v]) => [v, String(w[k])]),
        ),
      ),
      contractorName: contractor.name,
      notice:
        'Enrolled workers for the selected contractor only. Complete missing particulars and verify employment dates, pay and addresses against employer records.',
    };
  }
  if (layout.baseFormNumber === 'IX') {
    const [batch] = await ds.query(
      `SELECT id,approved_rows_snapshot,reviewed_at FROM contractor_attendance_batches WHERE client_id=$1 AND branch_id=$2 AND contractor_user_id=$3 AND period_month=$4 AND is_current AND status='APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL`,
      params,
    );
    if (
      !batch ||
      !Array.isArray(batch.approved_rows_snapshot) ||
      !batch.approved_rows_snapshot.length ||
      batch.approved_rows_snapshot.length > 500
    )
      throw new BadRequestException(
        'Select contractor attendance approved by the branch for this period',
      );
    const rows: RegisterRow[] = batch.approved_rows_snapshot.map(
      (r: any, i: number) => ({
        serial: i + 1,
        employeeCode: r.employee_code,
        name: r.employee_name,
        ...(r.days_worked != null ? { daysWorked: r.days_worked } : {}),
        ...(r.ot_hours != null ? { otHours: r.ot_hours } : {}),
      }),
    );
    return {
      rows,
      sourceReference: 'Attendance batch ' + batch.id,
      contractorName: contractor.name,
      notice:
        'Branch-approved contractor totals only. This attendance snapshot does not retain approved In/Out times; complete every daily timing or absence/holiday entry from supporting attendance evidence before generation. Missing overtime is not assumed to be zero.',
    };
  }
  if (!layout.payrollPrefill)
    throw new BadRequestException(
      'This form does not support contractor payroll as a source',
    );
  const [version] = await ds.query(
    `SELECT id,rows_snapshot,status FROM contractor_payroll_versions WHERE client_id=$1 AND branch_id=$2 AND contractor_user_id=$3 AND period_month=$4 AND is_current AND status IN ('CRM_APPROVED','VERIFIED_LOCKED')`,
    params,
  );
  if (
    !version ||
    !Array.isArray(version.rows_snapshot) ||
    !version.rows_snapshot.length ||
    version.rows_snapshot.length > 500
  )
    throw new BadRequestException(
      'No published contractor payroll exists for this branch and period',
    );
  const allowed = new Set(layout.fields.map((f) => f.key));
  const rows: RegisterRow[] = version.rows_snapshot.map((r: any, i: number) => {
    if (r.matchStatus !== 'MATCHED')
      throw new BadRequestException(
        'Resolve contractor payroll mismatches before preparing registers',
      );
    const gross = r.totalEarnings ?? r.grossWage,
      net = r.netSalary,
      pf = r.pfDeduction,
      esi = r.esiDeduction;
    if (
      [gross, net, pf, esi].some(
        (v) =>
          v == null ||
          String(v).trim() === '' ||
          !Number.isFinite(Number(v)) ||
          Number(v) < 0,
      )
    )
      throw new BadRequestException(
        'Published payroll is missing required monetary evidence',
      );
    const deductions = Math.round((Number(gross) - Number(net)) * 100) / 100;
    const others =
      Math.round((deductions - Number(pf) - Number(esi)) * 100) / 100;
    if (deductions < 0 || others < 0)
      throw new BadRequestException(
        'Published payroll deductions do not reconcile',
      );
    const values: RegisterRow = {
      serial: i + 1,
      employeeCode: r.employeeCode,
      name: r.employeeName,
      designation: r.calculationSnapshot?.designation ?? '',
      uan: r.calculationSnapshot?.uan ?? '',
      frequency: 'Monthly',
      wagePeriod: start + ' to ' + end,
      daysWorked: r.daysWorked,
      gross,
      net,
      deductions,
      pf,
      esi,
      ...(layout.baseFormNumber === 'V' ? { otherDeductions: others } : {}),
      ...(r.calculationSnapshot?.overtimeHours != null
        ? { otHours: r.calculationSnapshot.overtimeHours }
        : {}),
    };
    return Object.fromEntries(
      Object.entries(values).filter(([k, v]) => allowed.has(k) && v != null),
    );
  });
  return {
    rows,
    sourceReference: 'Published payroll ' + version.id,
    contractorName: contractor.name,
    notice:
      'Published contractor payroll snapshot. Total wages include payable monthly earnings. Complete wage-rate splits, bank/payment evidence and any absent deduction breakdown; employer contributions are never employee deductions.',
  };
}
