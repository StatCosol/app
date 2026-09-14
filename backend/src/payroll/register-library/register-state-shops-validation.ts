import type { RegisterLayout } from './register-layouts';
import type { RegisterInput } from './register-workbook';

export function validateStateShops(
  source: string,
  form: string,
  layout: RegisterLayout,
  input: RegisterInput,
): string[] {
  const errors: string[] = [];
  const details = input.particulars;
  if (
    layout.capacityRequired &&
    !['DIRECT_EMPLOYER', 'PRINCIPAL_EMPLOYER', 'CONTRACTOR'].includes(
      String(input.actingCapacity),
    )
  )
    errors.push(
      'Select the company capacity at this site; a Client login does not establish employer/contractor capacity',
    );
  if (!layout.capacityRequired && input.actingCapacity !== undefined)
    errors.push(
      'This format does not accept a different work-relationship context',
    );
  if (!layout.particulars) {
    if (
      details !== undefined &&
      (!details ||
        typeof details !== 'object' ||
        Array.isArray(details) ||
        Object.keys(details).length)
    )
      errors.push(
        'Establishment particulars from another form are not accepted',
      );
  } else if (
    !details ||
    typeof details !== 'object' ||
    Array.isArray(details)
  ) {
    errors.push(
      'Complete Form II establishment particulars; both parts are required',
    );
  } else {
    const keys = new Set(layout.particulars.map((f) => f.key));
    if (Object.keys(details).some((k) => !keys.has(k)))
      errors.push('Form II contains particulars from another form');
    for (const f of layout.particulars) {
      const v = details[f.key];
      if (v === undefined || v === null || String(v).trim() === '') {
        if (f.required) errors.push('Form II: ' + f.label + ' is required');
      } else if (f.type === 'number') {
        if (!/^\d+$/.test(String(v)) || Number(v) > 10000000)
          errors.push(
            'Form II: ' + f.label + ' must be a non-negative whole count',
          );
      } else if (typeof v !== 'string' || v.length > 2000)
        errors.push(
          'Form II: ' + f.label + ' must be text (maximum 2000 characters)',
        );
    }
    const count = (k: string) => Number(details[k]);
    const sum = (keys: string[]) => keys.reduce((n, k) => n + count(k), 0);
    for (const sex of ['Male', 'Female']) {
      if (
        count('categoryTotal' + sex) !==
        sum(
          ['Permanent', 'Temporary', 'Trainee', 'Apprentice', 'Contract'].map(
            (k) => 'category' + k + sex,
          ),
        )
      )
        errors.push(
          'Form II: category total does not match ' + sex + ' worker counts',
        );
      if (
        count('classTotal' + sex) !==
        sum(
          ['HighlySkilled', 'Skilled', 'SemiSkilled', 'Unskilled'].map(
            (k) => 'class' + k + sex,
          ),
        )
      )
        errors.push(
          'Form II: skill total does not match ' + sex + ' worker counts',
        );
      if (count('classTotal' + sex) !== count('categoryTotal' + sex))
        errors.push('Form II: category and skill totals disagree for ' + sex);
      if (count('adolescent' + sex) > count('categoryTotal' + sex))
        errors.push('Form II: adolescents exceed total ' + sex + ' workers');
    }
    if (
      count('contractWorkers') !==
      sum(['categoryContractMale', 'categoryContractFemale'])
    )
      errors.push('Form II: contract-worker counts disagree');
    if (
      sum(['regularWorkers', 'contractWorkers']) !==
      sum(['categoryTotalMale', 'categoryTotalFemale'])
    )
      errors.push(
        'Form II: regular/contract counts disagree with category totals',
      );
    if (
      (input.contractorUserId || input.actingCapacity === 'CONTRACTOR') &&
      (!String(details.peSignatory || '').trim() ||
        !String(details.peDesignation || '').trim())
    )
      errors.push(
        'Form III: identify the principal-employer representative for contractor certification',
      );
  }
  if (layout.baseFormNumber !== 'STATE' || !Array.isArray(input.rows))
    return errors;
  const serials = new Set<number>();
  for (const [i, row] of input.rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const prefix = 'Record ' + (i + 1) + ': ';
    const fail = (message: string) => errors.push(prefix + message);
    const amount = (key: string) => Math.round(Number(row[key]) * 100);
    const total = (key: string, parts: string[], extra = 0) => {
      const values = [key, ...parts].map((k) => amount(k));
      if (
        values.every(Number.isFinite) &&
        Math.abs(
          values[0] - values.slice(1).reduce((a, b) => a + b, 0) - extra,
        ) > 1
      )
        fail(key + ' does not reconcile');
    };
    const pair = (start: string, end: string) => {
      if (!!row[start] !== !!row[end])
        fail(start + ' and ' + end + ' must be supplied together');
      if (row[start] && row[end] && String(row[end]) < String(row[start]))
        fail(end + ' precedes ' + start);
    };
    if (layout.fields.some((f) => f.key === 'serial')) {
      const serial = Number(row.serial);
      if (!Number.isInteger(serial) || serial < 1 || serials.has(serial))
        fail('serial must be a unique positive whole number');
      serials.add(serial);
    }
    for (const f of layout.fields.filter((f) => f.type === 'date')) {
      if (row[f.key] && String(row[f.key]) > input.issueDate)
        fail(f.label + ' is after the issue date');
      if (
        f.key !== 'joiningDate' &&
        row[f.key] &&
        row.joiningDate &&
        String(row[f.key]) < String(row.joiningDate)
      )
        fail(f.label + ' precedes joining');
    }
    if (source === 'tsi') {
      if (!['M', 'F'].includes(String(row.sex)))
        fail('sex must be M or F as specified by the form');
      if (Number(row.net) > Number(row.gross))
        fail('net payable exceeds gross earnings');
      if (
        Number(row.fine) + Number(row.otherDeductions) >
        Number(row.gross) - Number(row.net) + 0.01
      )
        fail('recorded deductions exceed gross less net');
      if (
        Number(row.gross) -
          Number(row.net) -
          Number(row.fine) -
          Number(row.otherDeductions) >
          0.01 &&
        !String(row.remarks || '').trim()
      )
        fail(
          'explain additional advance/loan recovery in remarks and supporting evidence',
        );
    }
    if (source === 'mh' && form === 'Q') {
      for (const key of ['workingFrom', 'workingTo', 'restFrom', 'restTo'])
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row[key])))
          fail(key + ' must use HH:mm');
      const days = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
      let present = 0;
      for (let day = 1; day <= 31; day++) {
        const status = row['day' + day + 'Status'];
        if (
          day <= days &&
          !['P', 'HD', 'A', 'L', 'WO', 'H'].includes(String(status))
        )
          fail('day ' + day + ' requires P, HD, A, L, WO or H');
        if (day > days && status)
          fail('day ' + day + ' does not exist in this month');
        if (day <= days)
          present += status === 'P' ? 1 : status === 'HD' ? 0.5 : 0;
      }
      if (Number(row.daysWorked) !== present)
        fail('days worked do not match attendance');
      total('deductions', [
        'pf',
        'pension',
        'esi',
        'pt',
        'incomeTax',
        'loanInterest',
        'advances',
        'otherDeductions',
      ]);
      // Gross is printed before overtime earnings in Q; add overtime exactly once.
      total('net', ['gross', 'overtime'], -amount('deductions'));
      if (Number(row.deposited) > Number(row.net))
        fail('amount deposited exceeds net payable');
      if (!Number.isInteger(Number(row.age)))
        fail('age must be a whole number');
    }
    if (source === 'mh' && form === 'O') {
      pair('allowedFrom', 'allowedTo');
      pair('applicationDate', 'refusalDate');
      if (row.refusalDate && !String(row.refusalReason || '').trim())
        fail('refusal reason is required');
      if (row.dischargePaymentDate && !row.dischargeDate)
        fail('discharge date is required for payment in lieu');
      const hasAmount =
        row.dischargePayment !== undefined && row.dischargePayment !== '';
      if (!!row.dischargePaymentDate !== hasAmount)
        fail('discharge payment date and amount must be supplied together');
      if (
        row.dischargePaymentDate &&
        String(row.dischargePaymentDate) < String(row.dischargeDate)
      )
        fail('discharge payment precedes discharge');
      for (const kind of ['Festival', 'Casual']) {
        pair(kind + 'From', kind + 'To');
        total(kind + 'Total', [kind + 'Used', kind + 'Balance']);
      }
    }
  }
  return errors;
}
