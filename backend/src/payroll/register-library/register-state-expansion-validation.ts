import type { RegisterLayout } from './register-layouts';
import type { RegisterInput, RegisterRow } from './register-workbook';

export function validateExpandedState(
  source: string,
  form: string,
  layout: RegisterLayout,
  input: RegisterInput,
): string[] {
  if (layout.particularsMode !== 'COMMON') return [];
  const errors: string[] = [];
  const details = input.particulars;
  const validDate = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!details || typeof details !== 'object' || Array.isArray(details))
    errors.push('Complete the establishment details and authentication fields');
  else {
    const keys = new Set(layout.particulars!.map((f) => f.key));
    if (Object.keys(details).some((k) => !keys.has(k)))
      errors.push('Establishment details contain fields from another form');
    for (const field of layout.particulars!) {
      const v = details[field.key];
      if (v === undefined || v === null || String(v).trim() === '') {
        if (field.required) errors.push(field.label + ' is required');
        continue;
      }
      if (field.type === 'date' && !validDate(v))
        errors.push(field.label + ' must be a valid YYYY-MM-DD date');
      if (field.type === 'text' && (typeof v !== 'string' || v.length > 2000))
        errors.push(field.label + ' must be text (maximum 2000 characters)');
      if (
        ['number', 'money'].includes(field.type) &&
        (!/^\d+(\.\d{1,2})?$/.test(String(v)) || Number(v) > 1e10)
      )
        errors.push(
          field.label +
            ' must be a non-negative number with at most two decimals',
        );
      if (field.key.startsWith('headcount') && !Number.isInteger(Number(v)))
        errors.push(field.label + ' must be a whole count');
      if (field.type === 'date' && validDate(v) && String(v) > input.issueDate)
        errors.push(field.label + ' is after the issue date');
    }
    const ym = input.year + '-' + String(input.month).padStart(2, '0');
    for (const key of ['wageFrom', 'wageTo', 'workDate'])
      if (details[key] && String(details[key]).slice(0, 7) !== ym)
        errors.push(key + ' must fall within the selected month');
    if (
      details.wageFrom &&
      details.wageTo &&
      String(details.wageFrom) > String(details.wageTo)
    )
      errors.push('Wage period ends before it starts');
  }
  if (!Array.isArray(input.rows)) return errors;
  const sum = (row: RegisterRow, keys: string[]) =>
    keys.reduce((n, k) => n + Math.round(Number(row[k]) * 100), 0);
  const validAmount = (row: RegisterRow, keys: string[]) =>
    keys.every(
      (k) =>
        row[k] !== undefined &&
        String(row[k]).trim() !== '' &&
        Number.isFinite(Number(row[k])),
    );
  const dates = new Set<string>();
  const serials = new Set<number>();
  for (const [i, row] of input.rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const fail = (s: string) => errors.push('Record ' + (i + 1) + ': ' + s);
    const equation = (left: string[], right: string[]) => {
      if (
        validAmount(row, [...left, ...right]) &&
        Math.abs(sum(row, left) - sum(row, right)) > 1
      )
        fail(
          left.join(' + ') + ' does not reconcile with ' + right.join(' + '),
        );
    };
    if (layout.fields.some((f) => f.key === 'serial')) {
      const serial = Number(row.serial);
      if (!Number.isInteger(serial) || serial < 1 || serials.has(serial))
        fail('serial must be a unique positive whole number');
      serials.add(serial);
    }
    for (const field of layout.fields.filter((f) => f.type === 'date')) {
      const value = row[field.key];
      const futureLeavePeriod =
        source === 'wbs' &&
        form === 'J' &&
        [
          'appliedFrom',
          'appliedTo',
          'grantedFrom',
          'grantedTo',
          'refusedFrom',
          'refusedTo',
        ].includes(field.key);
      if (
        !futureLeavePeriod &&
        value &&
        validDate(value) &&
        String(value) > input.issueDate
      )
        fail(field.label + ' is after the issue date');
      if (
        ['exitDate', 'permanentDate', 'service480Date', 'suspension'].includes(
          field.key,
        ) &&
        value &&
        row.joiningDate &&
        String(value) < String(row.joiningDate)
      )
        fail(field.label + ' precedes joining');
    }
    if (
      row.birthDate &&
      row.joiningDate &&
      String(row.birthDate) > String(row.joiningDate)
    )
      fail('date of birth follows joining');
    for (const field of layout.fields.filter((f) => f.type === 'text')) {
      if (String(row[field.key] ?? '').length > 400)
        fail(
          field.label +
            ' must be at most 400 characters; keep supporting detail in the referenced evidence',
        );
    }
    const maxDays = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
    if (source === 'kas') {
      equation(
        ['gross'],
        [
          'basic',
          'da',
          'hra',
          'conveyance',
          'medical',
          'attendanceBonus',
          'special',
          'overtime',
          'holidayWages',
          'maternity',
          'otherEarnings',
          'subsistence',
        ],
      );
      equation(
        ['deductions'],
        [
          'esi',
          'pf',
          'pt',
          'tds',
          'society',
          'insurance',
          'advance',
          'fine',
          'damage',
          'otherDeductions',
        ],
      );
      equation(['gross'], ['net', 'deductions']);
      if (!['M', 'F', 'MALE', 'FEMALE'].includes(String(row.sex).toUpperCase()))
        fail('sex must be male or female as prescribed');
    }
    if (source === 'aps' && form === 'XXIII') {
      equation(['gross'], ['normalWages', 'overtime']);
      if (Number(row.net) > Number(row.gross))
        fail('actual wages paid exceeds gross wages');
    }
    if (source === 'tns' || source === 'tn') {
      if (form === 'W' || form === '15') {
        equation(
          ['gross'],
          ['basic', 'da', 'hra', 'allowances', 'overtime', 'leaveHolidayWages'],
        );
        equation(['gross'], ['net', 'deductions']);
        equation(
          ['advanceOpening', 'advancePaid'],
          ['advanceRecovered', 'advanceClosing'],
        );
        equation(
          ['damageOpening', 'damageImposed'],
          ['damageRecovered', 'damageClosing'],
        );
        if (Number(row.unpaid) > Number(row.net))
          fail('unpaid accumulations exceed net wages');
        if (form === '15')
          equation(
            ['deductions'],
            [
              'pf',
              'esi',
              'lwf',
              'advanceRecovered',
              'damageRecovered',
              'otherDeductions',
            ],
          );
      }
      if (form === 'X' || form === '15') {
        equation(
          ['earnedOpening', 'earnedAccrued'],
          ['earnedUsed', 'earnedClosing'],
        );
        equation(['medicalOpening'], ['medicalUsed', 'medicalClosing']);
        equation(['otherOpening'], ['otherUsed', 'otherClosing']);
      }
    }
    if (source === 'wbs' && form === 'J') {
      if (
        !['PRIVILEGE', 'SICK', 'CASUAL', 'MATERNITY'].includes(
          String(row.leaveType),
        )
      )
        fail('choose a prescribed leave section');
      for (const [a, b] of [
        ['appliedFrom', 'appliedTo'],
        ['grantedFrom', 'grantedTo'],
        ['refusedFrom', 'refusedTo'],
      ]) {
        if (!!row[a] !== !!row[b])
          fail(a + ' and ' + b + ' must be supplied together');
        if (row[a] && row[b] && String(row[b]) < String(row[a]))
          fail(b + ' precedes ' + a);
      }
      if (row.refusedFrom && !String(row.refusalReason || '').trim())
        fail('explain why leave was refused');
    }
    if (source === 'wbs' && form === 'W')
      equation(['gross'], ['basic', 'da', 'allowances']);
    if (source === 'hrs' && form === 'D')
      equation(['gross'], ['ordinary', 'overtime']);
    if (
      source === 'hrs' &&
      form === 'E' &&
      Number(row.deducted) > Number(row.wages)
    )
      fail('deduction exceeds wages payable');
    if (source === 'hrs' && form === 'C') {
      if (
        String(row.workDate).slice(0, 7) !==
        input.year + '-' + String(input.month).padStart(2, '0')
      )
        fail('daily entry must be in the selected month');
      if (dates.has(String(row.workDate)))
        fail('duplicate date for this employee');
      dates.add(String(row.workDate));
      if (
        Number(row.workingHours) > 24 ||
        Number(row.spreadTotal) > 24 ||
        Number(row.otHours) > 24
      )
        fail('daily hours cannot exceed 24');
    }
    if (
      source === 'kas' ||
      (source === 'tns' && form === 'V') ||
      (source === 'tn' && form === '25')
    ) {
      for (let day = 1; day <= 31; day++) {
        const v = String(row['day' + day + 'Status'] ?? '').trim();
        if (day <= maxDays && !v)
          fail(
            'day ' +
              day +
              ' requires actual attendance or a reviewed absence/holiday code',
          );
        if (
          (source === 'tns' || source === 'tn') &&
          day <= maxDays &&
          v &&
          ![
            'H',
            'FH',
            'NH',
            'EL',
            'ML',
            'HW',
            'MBL',
            'SH',
            'SP',
            'LOP',
          ].includes(v) &&
          !(/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 24)
        )
          fail(
            'day ' +
              day +
              ' requires hours (0–24) or a prescribed Tamil Nadu attendance code',
          );
        const shift = String(row['day' + day + 'Shift'] ?? '').trim();
        if (
          source === 'tn' &&
          day <= maxDays &&
          /^\d+(\.\d{1,2})?$/.test(v) &&
          Number(v) > 0 &&
          !shift
        )
          fail('day ' + day + ' requires the actual shift');
        if (day > maxDays && (v || shift))
          fail('day ' + day + ' does not exist in this month');
      }
      for (const k of ['daysWorked', 'payableDays', 'lopDays'])
        if (Number(row[k]) > maxDays) fail(k + ' exceeds calendar days');
    }
    for (const k of ['instalments'])
      if (row[k] !== undefined && !Number.isInteger(Number(row[k])))
        fail(k + ' must be a whole count');
    for (const [a, b] of [
      ['imposedDate', 'realisedDate'],
      ['advanceDate', 'recoveredDate'],
      ['deductionDate', 'utilisationDate'],
    ])
      if (row[a] && row[b] && String(row[b]) < String(row[a]))
        fail(b + ' precedes ' + a);
  }
  if (
    source === 'wbs' &&
    form === 'M' &&
    details &&
    input.rows.every((r) => r && validAmount(r, ['net']))
  ) {
    const total = input.rows.reduce(
      (n, r) => n + Math.round(Number(r.net) * 100),
      0,
    );
    if (Math.abs(total - Math.round(Number(details.certifiedPaid) * 100)) > 1)
      errors.push(
        'Certified payment total must equal the payments recorded in Form M',
      );
  }
  if (
    source === 'hrs' &&
    form === 'C' &&
    details &&
    input.rows.every((r) => r && validAmount(r, ['otHours']))
  ) {
    const overtime = input.rows.reduce(
      (n, r) => n + Math.round(Number(r.otHours) * 100),
      0,
    );
    if (
      Math.abs(overtime - Math.round(Number(details.monthOvertime) * 100)) > 1
    )
      errors.push('Monthly overtime must equal the daily overtime entries');
  }
  return errors;
}
