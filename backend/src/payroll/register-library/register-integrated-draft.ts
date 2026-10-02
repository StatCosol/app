import { DataSource } from 'typeorm';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { ClientEntity } from '../../clients/entities/client.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { RegisterRow } from './register-workbook';

// Called only after the builder has checked applicability, access, approved run
// and exact client/branch/period. Unknown evidence stays absent, never NIL/zero.
export async function integratedRegisterDraft(
  ds: DataSource,
  branch: BranchEntity,
  run: PayrollRunEntity,
  employees: PayrollRunEmployeeEntity[],
) {
  const defaults = await integratedRegisterDefaults(ds, branch);
  const profiles = await ds.query(
    `SELECT re.id AS "runEmployeeId", e.date_of_birth::text AS "birthDate",
            e.gender, e.father_name AS "relativeName"
       FROM payroll_run_employees re
       JOIN employees e ON e.id=re.employee_id AND e.client_id=re.client_id
         AND e.branch_id=re.branch_id AND e.approval_status='APPROVED'
       WHERE re.run_id=$1 AND re.client_id=$2 AND re.branch_id=$3`,
    [run.id, branch.clientId, branch.id],
  );
  const byId = new Map(profiles.map((p: any) => [p.runEmployeeId, p]));
  const rows: RegisterRow[] = employees.map((e, i) => {
    const p: any = byId.get(e.id);
    const gender = String(p?.gender || '').toUpperCase();
    const sex = ['M', 'MALE'].includes(gender)
      ? 'M'
      : ['F', 'FEMALE'].includes(gender)
        ? 'F'
        : undefined;
    return Object.fromEntries(
      Object.entries({
        serial: i + 1,
        name: [e.employeeName, e.employeeCode].filter(Boolean).join(' — '),
        designation: e.designation,
        ageOrBirthDate: p?.birthDate,
        relativeName: p?.relativeName,
        sex,
        daysWorked: e.daysPresent,
        otHours: e.otHours,
        gross: e.grossEarnings,
        net: e.netPay,
      }).filter(([, value]) => value != null && value !== ''),
    );
  });
  return {
    rows,
    ...defaults,
    sourceRunId: run.id,
    sourceApprovedAt: run.approvedAt,
    sourceReference:
      'Approved payroll ' +
      run.id +
      ' (' +
      run.periodYear +
      '-' +
      String(run.periodMonth).padStart(2, '0') +
      '); current approved employee and branch profiles',
    notice:
      'Loaded ' +
      rows.length +
      ' workers from approved payroll. Review current profile details for this historical period. Complete the remaining establishment, leave, wage-rate, deduction and event evidence before generation. Headcounts and missing events are not inferred from this payroll batch.',
  };
}

export async function integratedRegisterDefaults(
  ds: DataSource,
  branch: BranchEntity,
) {
  const client = await ds.getRepository(ClientEntity).findOneBy({
    id: branch.clientId,
    isActive: true,
    isDeleted: false,
  });
  const present = (values: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(values).filter(
        ([, value]) => value != null && value !== '',
      ),
    );
  return {
    metadata: present({ employer: client?.clientName }),
    particulars: present({
      establishmentName: branch.branchName,
      establishmentAddress: branch.address,
      location: branch.address,
    }),
  };
}
