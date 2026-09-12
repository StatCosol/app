import { BadRequestException } from '@nestjs/common';

export const MONEY_FIELDS = [
  'gross_earnings',
  'net_pay',
  'pf_employee',
  'esi_employee',
] as const;
export type MoneyField = (typeof MONEY_FIELDS)[number];
export interface RegisterRow {
  employeeCode: string;
  line: number;
  values: Partial<Record<MoneyField, string | null>>;
}
export interface ExpectedRow {
  employeeCode: string;
  values: Record<MoneyField, string | null>;
}

/** Bounded RFC4180-style parser. Source line numbers include quoted newlines. */
export function parseRegister(buffer: Buffer, month: string) {
  if (!buffer.length || buffer.length > 1024 * 1024)
    throw new BadRequestException('Choose a non-empty CSV file up to 1 MB.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('CSV must use UTF-8 encoding.');
  }
  if (text.includes('\0'))
    throw new BadRequestException('Binary files are not supported.');
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const finish = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim()))
      records.push({ cells, line: start });
    if (records.length > 5001)
      throw new BadRequestException('Limit the register to 5,000 employees.');
    cells = [];
    cell = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += ch;
        if (ch === '\n') line++;
      }
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
      closed = false;
      if (cells.length > 6)
        throw new BadRequestException(`Too many columns at line ${start}.`);
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      finish();
      line++;
      start = line;
    } else if (ch === '"' && cell === '' && !closed) {
      quoted = true;
    } else {
      if (closed || ch === '"')
        throw new BadRequestException(`Invalid CSV quoting at line ${line}.`);
      cell += ch;
    }
  }
  if (quoted)
    throw new BadRequestException('CSV contains an unclosed quoted value.');
  finish();
  if (records.length < 2)
    throw new BadRequestException(
      'Include a header and at least one employee.',
    );
  const headers = records[0].cells.map((h) => h.trim().toLowerCase());
  const allowed = ['employee_code', 'period', ...MONEY_FIELDS];
  if (
    new Set(headers).size !== headers.length ||
    headers.some((h) => !allowed.includes(h))
  ) {
    throw new BadRequestException(
      'Use the template headers without duplicate or additional columns.',
    );
  }
  for (const required of [
    'employee_code',
    'period',
    'gross_earnings',
    'net_pay',
  ]) {
    if (!headers.includes(required))
      throw new BadRequestException(`Missing column: ${required}.`);
  }
  const fields = MONEY_FIELDS.filter((field) => headers.includes(field));
  const codes = new Set<string>();
  const rows: RegisterRow[] = records.slice(1).map((record) => {
    if (record.cells.length !== headers.length)
      throw new BadRequestException(
        `Column count differs at line ${record.line}.`,
      );
    const get = (header: string) =>
      record.cells[headers.indexOf(header)].trim();
    const employeeCode = get('employee_code');
    if (
      !employeeCode ||
      employeeCode.length > 50 ||
      /[\r\n\t]/.test(employeeCode)
    )
      throw new BadRequestException(
        `Invalid employee code at line ${record.line}.`,
      );
    if (codes.has(employeeCode))
      throw new BadRequestException(
        `Duplicate employee code at line ${record.line}.`,
      );
    codes.add(employeeCode);
    if (get('period') !== month)
      throw new BadRequestException(
        `The reporting period at line ${record.line} must be ${month}.`,
      );
    const values: RegisterRow['values'] = {};
    for (const field of fields) {
      const value = get(field);
      if (!value) {
        values[field] = null;
        continue;
      }
      if (paise(value) === null)
        throw new BadRequestException(
          `Invalid ${field} at line ${record.line}. Use plain amounts with up to two decimal places, without currency symbols or separators.`,
        );
      values[field] = value;
    }
    return { employeeCode, line: record.line, values };
  });
  return {
    rows,
    fields,
    uncheckedFields: MONEY_FIELDS.filter((field) => !fields.includes(field)),
  };
}

/** Integer paise avoids hiding one-paisa differences through floating rounding. */
export function paise(value: string | null | undefined): bigint | null {
  if (value == null || !/^-?\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -amount : amount;
}

export function money(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function reconcileRegister(
  expected: ExpectedRow[],
  uploaded: ReturnType<typeof parseRegister>,
) {
  if (!expected.length)
    throw new BadRequestException(
      'This payroll run has no employee amounts to compare.',
    );
  if (new Set(expected.map((row) => row.employeeCode)).size !== expected.length)
    throw new BadRequestException(
      'Payroll contains duplicate employee codes. Resolve them before comparing.',
    );
  const actualByCode = new Map(
    uploaded.rows.map((row) => [row.employeeCode, row]),
  );
  const expectedByCode = new Map(
    expected.map((row) => [row.employeeCode, row]),
  );
  const codes = [
    ...new Set([...expectedByCode.keys(), ...actualByCode.keys()]),
  ].sort();
  const rows = codes.map((employeeCode) => {
    const baseline = expectedByCode.get(employeeCode);
    const source = actualByCode.get(employeeCode);
    const comparisons = uploaded.fields.map((field) => {
      const expectedAmount = paise(baseline?.values[field]);
      const actualAmount = paise(source?.values[field]);
      return {
        field,
        expected: expectedAmount === null ? null : money(expectedAmount),
        actual: actualAmount === null ? null : money(actualAmount),
        difference:
          expectedAmount === null || actualAmount === null
            ? null
            : money(actualAmount - expectedAmount),
        state:
          expectedAmount === null || actualAmount === null
            ? 'UNKNOWN'
            : expectedAmount === actualAmount
              ? 'MATCH'
              : 'MISMATCH',
      };
    });
    const status = !baseline
      ? 'EXTRA_IN_FILE'
      : !source
        ? 'MISSING_IN_FILE'
        : comparisons.some((c) => c.state === 'MISMATCH')
          ? 'MISMATCH'
          : comparisons.some((c) => c.state === 'UNKNOWN')
            ? 'UNVERIFIABLE'
            : 'MATCH';
    return {
      employeeCode,
      sourceLine: source?.line ?? null,
      status,
      comparisons,
    };
  });
  const totals = uploaded.fields.map((field) => {
    const sum = (values: (string | null | undefined)[]) => {
      const amounts = values.map(paise);
      return {
        amount: amounts.some((a) => a === null)
          ? null
          : money(amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n)),
        missingValues: amounts.filter((a) => a === null).length,
      };
    };
    return {
      field,
      expected: sum(expected.map((row) => row.values[field])),
      actual: sum(uploaded.rows.map((row) => row.values[field])),
    };
  });
  return {
    fields: uploaded.fields,
    uncheckedFields: uploaded.uncheckedFields,
    rows,
    totals,
    summary: {
      payrollEmployees: expected.length,
      fileEmployees: uploaded.rows.length,
      matched: rows.filter((r) => r.status === 'MATCH').length,
      mismatched: rows.filter((r) => r.status === 'MISMATCH').length,
      missingInFile: rows.filter((r) => r.status === 'MISSING_IN_FILE').length,
      extraInFile: rows.filter((r) => r.status === 'EXTRA_IN_FILE').length,
      unverifiable: rows.filter((r) =>
        r.comparisons.some((c) => c.state === 'UNKNOWN'),
      ).length,
    },
  };
}
