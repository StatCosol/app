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
            e.gender, e.father_name AS "relativeName", worked.amount AS "workedDays",
            overtime.amount AS "overtimeWages", e.address, e.education,
            e.skill_category AS "skillCategory", nominees.details AS nominee
       FROM payroll_run_employees re
       LEFT JOIN employees e ON e.id=re.employee_id AND e.client_id=re.client_id
         AND e.branch_id=re.branch_id AND e.approval_status='APPROVED'
       LEFT JOIN payroll_run_component_values worked ON worked.run_employee_id=re.id
         AND worked.run_id=re.run_id AND worked.component_code='WORKED_DAYS'
       LEFT JOIN payroll_run_component_values overtime ON overtime.run_employee_id=re.id
         AND overtime.run_id=re.run_id AND overtime.component_code='OT_AMOUNT'
       LEFT JOIN LATERAL (
         SELECT CASE WHEN bool_and(NULLIF(trim(m.member_name), '') IS NOT NULL
                           AND NULLIF(trim(m.address), '') IS NOT NULL)
           THEN string_agg(DISTINCT trim(m.member_name) || ' — ' || trim(m.address), '; '
             ORDER BY trim(m.member_name) || ' — ' || trim(m.address)) END AS details
         FROM (
           SELECT DISTINCT ON (n.nomination_type) n.id
           FROM employee_nominations n
           WHERE n.employee_id=e.id AND n.client_id=e.client_id
             AND n.branch_id=e.branch_id AND n.status='APPROVED'
           ORDER BY n.nomination_type, n.approved_at DESC NULLS LAST, n.created_at DESC, n.id DESC
         ) latest
         JOIN employee_nomination_members m ON m.nomination_id=latest.id
       ) nominees ON true
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
        address: p?.address,
        educationSkill: [p?.education, p?.skillCategory?.replace(/_/g, ' ')]
          .filter(Boolean)
          .join(' / '),
        nominee: p?.nominee,
        sex,
        daysWorked: p?.workedDays,
        otHours: e.otHours,
        overtime: p?.overtimeWages,
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
