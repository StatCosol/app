export type DocumentRow = Record<string, string>;
export interface ReconciliationFinding {
  status: 'NC' | 'NEEDS_REVIEW';
  employeeCode?: string;
  field: string;
  expected?: string | number;
  submitted?: string | number;
  remark: string;
  page?: number;
}
const aliases: Record<string, string> = {
  ot_hours: 'overtimeHours',
  overtime_hours: 'overtimeHours',
  employee_code: 'employeeCode',
  contract_employee_id: 'employeeCode',
  employee_id: 'employeeCode',
  uan_id: 'uan',
  uan: 'uan',
  uan_number: 'uan',
  esi_wages: 'esiWage',
  esi_wage: 'esiWage',
  esi_id: 'esic',
  esi_number: 'esic',
  ip_number: 'esic',
  esic: 'esic',
  days_worked: 'daysWorked',
  payable_days: 'daysWorked',
  total_earnings: 'totalEarnings',
  gross_wages: 'grossWage',
  gross_salary: 'grossWage',
  gross_wage: 'grossWage',
  pf_wage: 'pfWage',
  pf_wages: 'pfWage',
  epf_wages: 'pfWage',
  pf_employee: 'pfDeduction',
  employee_pf: 'pfDeduction',
  pf_deduction: 'pfDeduction',
  esi_employee: 'esiDeduction',
  employee_esi: 'esiDeduction',
  esi_deduction: 'esiDeduction',
  net_pay: 'netSalary',
  net_salary: 'netSalary',
  net_wages: 'netSalary',
  take_home: 'netSalary',
};
export function normalizeHeader(text: string) {
  const key = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return aliases[key] || key;
}
export function comparePayrollDocument(
  rows: DocumentRow[],
  payroll: any[],
  kind: 'WAGE' | 'ATTENDANCE' | 'PF' | 'ESI',
) {
  const findings: ReconciliationFinding[] = [];
  if (!rows.length)
    return {
      status: 'NEEDS_REVIEW',
      findings: [
        {
          status: 'NEEDS_REVIEW',
          field: 'document',
          remark: 'No supported employee rows could be extracted',
        },
      ],
    };
  const required =
    kind === 'ATTENDANCE'
      ? ['daysWorked']
      : kind === 'PF'
        ? ['uan', 'pfWage', 'pfDeduction']
        : kind === 'ESI'
          ? ['esic', 'esiWage', 'esiDeduction']
          : [
              'daysWorked',
              'grossWage',
              'pfDeduction',
              'esiDeduction',
              'netSalary',
            ];
  const indexes: Record<string, Map<string, any[]>> = {
    employeeCode: new Map(),
    uan: new Map(),
    esic: new Map(),
  };
  for (const p of payroll)
    for (const field of Object.keys(indexes)) {
      const key = String(
        field === 'employeeCode'
          ? p.employeeCode || ''
          : p.calculationSnapshot?.[field] || '',
      ).trim();
      if (key) indexes[field].set(key, [...(indexes[field].get(key) || []), p]);
    }
  const counts: Record<string, Map<string, number>> = {
    uan: new Map(),
    esic: new Map(),
  };
  for (const row of rows)
    for (const field of Object.keys(counts)) {
      if (row[field])
        counts[field].set(row[field], (counts[field].get(row[field]) || 0) + 1);
    }
  const seen = new Set<string>();
  let uncertainCoverage = false;
  for (const row of rows) {
    const exact = (a: unknown, b: unknown) =>
      (typeof a === 'string' || typeof a === 'number'
        ? String(a).trim()
        : '') ===
      (typeof b === 'string' || typeof b === 'number' ? String(b).trim() : '');
    const matches =
      (row.employeeCode
        ? indexes.employeeCode.get(row.employeeCode.trim())
        : row.uan
          ? indexes.uan.get(row.uan.trim())
          : row.esic
            ? indexes.esic.get(row.esic.trim())
            : []) || [];
    if (matches.length !== 1) {
      const uncertain =
        matches.length > 1 ||
        !(row.employeeCode || row.uan || row.esic) ||
        !!row._uncertainIdentifier;
      uncertainCoverage ||= uncertain;
      findings.push({
        status: uncertain ? 'NEEDS_REVIEW' : 'NC',
        field: 'employee',
        submitted: row.employeeCode || row.uan || row.esic || '',
        remark:
          matches.length > 1
            ? 'Ambiguous employee identifier'
            : 'Employee identifier missing or not present in generated payroll',
        page: Number(row._page) || undefined,
      });
      continue;
    }
    const p = matches[0],
      code = p.employeeCode;
    if (row._uncertainIdentifier)
      findings.push({
        status: 'NEEDS_REVIEW',
        employeeCode: code,
        field: 'identifiers',
        remark:
          'Numeric spreadsheet identifier: verify original UAN/ESI digits and leading zeros',
      });
    for (const field of ['uan', 'esic']) {
      const value = row[field];
      if (value && (counts[field].get(value) || 0) > 1)
        findings.push({
          status: 'NC',
          employeeCode: code,
          field,
          submitted: value,
          remark: 'Identifier occurs in more than one uploaded employee row',
        });
      if (value && (indexes[field].get(value)?.length || 0) > 1)
        findings.push({
          status: 'NEEDS_REVIEW',
          employeeCode: code,
          field,
          remark:
            'Identifier is assigned to multiple payroll employees; correct enrollment first',
        });
    }
    if (
      kind !== 'ATTENDANCE' &&
      (!p.calculationSnapshot ||
        typeof p.calculationSnapshot.pfApplicable !== 'boolean' ||
        typeof p.calculationSnapshot.esiApplicable !== 'boolean')
    )
      findings.push({
        status: 'NEEDS_REVIEW',
        employeeCode: code,
        field: 'identifiers',
        remark:
          'Payroll snapshot lacks verified PF/ESI applicability and identifiers',
      });
    if (seen.has(code)) {
      findings.push({
        status: 'NC',
        employeeCode: code,
        field: 'duplicate',
        remark: 'Employee appears more than once',
      });
      continue;
    }
    seen.add(code);
    const fields = new Set([
      ...required,
      ...(row.totalEarnings != null ? ['totalEarnings'] : []),
      ...(kind === 'ATTENDANCE' && row.overtimeHours != null
        ? ['overtimeHours']
        : []),
      ...(p.calculationSnapshot?.pfApplicable ? ['uan'] : []),
      ...(p.calculationSnapshot?.esiApplicable ? ['esic'] : []),
    ]);
    for (const field of fields) {
      const identifier = field === 'uan' || field === 'esic';
      // PF and ESI-only statements cannot be required to contain the other scheme identifier.
      if (
        (kind === 'PF' && field === 'esic') ||
        (kind === 'ESI' && field === 'uan') ||
        (kind === 'ATTENDANCE' && identifier)
      )
        continue;
      const expected = identifier
        ? p.calculationSnapshot?.[field]
        : field === 'overtimeHours'
          ? p.calculationSnapshot?.overtimeHours
          : field === 'esiWage'
            ? p.calculationSnapshot?.result?.bases?.ESI_EMP
            : p[field];
      const value = row[field];
      if (expected == null || value == null || value.trim() === '') {
        findings.push({
          status: 'NEEDS_REVIEW',
          employeeCode: code,
          field,
          remark: 'Required value missing in document or payroll snapshot',
          page: Number(row._page) || undefined,
        });
        continue;
      }
      const number = Number(value.replace(/,/g, ''));
      if (
        !identifier &&
        (!Number.isFinite(number) || !Number.isFinite(Number(expected)))
      ) {
        findings.push({
          status: 'NEEDS_REVIEW',
          employeeCode: code,
          field,
          submitted: value,
          remark: 'Unreadable numeric value',
        });
        continue;
      }
      const mismatch = identifier
        ? !exact(expected, value)
        : Math.abs(
            Math.round(Number(expected) * 100) - Math.round(number * 100),
          ) > 0;
      if (mismatch)
        findings.push({
          status: 'NC',
          employeeCode: code,
          field,
          expected,
          submitted: value,
          remark: 'Uploaded value differs from generated payroll',
          page: Number(row._page) || undefined,
        });
    }
  }
  for (const p of payroll) {
    if (
      (kind === 'PF' && p.calculationSnapshot?.pfApplicable === false) ||
      (kind === 'ESI' && p.calculationSnapshot?.esiApplicable === false)
    )
      continue;
    if (!seen.has(p.employeeCode))
      findings.push({
        status: uncertainCoverage ? 'NEEDS_REVIEW' : 'NC',
        employeeCode: p.employeeCode,
        field: 'missingEmployee',
        remark: uncertainCoverage
          ? 'Verify employee coverage after resolving unreadable or ambiguous identifiers'
          : 'Payroll employee is missing from the uploaded document',
      });
  }
  if (!rows.length)
    findings.push({
      status: 'NEEDS_REVIEW',
      field: 'document',
      remark: 'No supported employee rows could be extracted',
    });
  return {
    status: findings.some((f) => f.status === 'NC')
      ? 'NC'
      : findings.length
        ? 'NEEDS_REVIEW'
        : 'MATCHED',
    findings,
  };
}
