import { BadRequestException } from '@nestjs/common';

export type PayslipLayoutRow =
  | { type: 'COMPONENT'; code: string; label: string }
  | {
      type: 'TOTAL';
      key: 'GROSS_EARNINGS' | 'TOTAL_DEDUCTIONS' | 'NET_PAY';
      label: string;
    };
export type PayslipLayout = {
  sections: {
    key: 'EARNINGS' | 'DEDUCTIONS' | 'SUMMARY';
    title: string;
    rows: PayslipLayoutRow[];
    totals: PayslipLayoutRow[];
  }[];
  settings: {
    enabled: boolean;
    showRates: false;
    showUnits: false;
    currency: 'INR';
  };
};

export function defaultPayslipLayout(): PayslipLayout {
  return {
    sections: [
      {
        key: 'EARNINGS',
        title: 'Earnings',
        rows: [],
        totals: [
          { type: 'TOTAL', key: 'GROSS_EARNINGS', label: 'Gross Earnings' },
        ],
      },
      {
        key: 'DEDUCTIONS',
        title: 'Deductions',
        rows: [],
        totals: [
          { type: 'TOTAL', key: 'TOTAL_DEDUCTIONS', label: 'Total Deductions' },
        ],
      },
      {
        key: 'SUMMARY',
        title: 'Summary',
        rows: [{ type: 'TOTAL', key: 'NET_PAY', label: 'Net Pay' }],
        totals: [],
      },
    ],
    settings: {
      enabled: false,
      showRates: false,
      showUnits: false,
      currency: 'INR',
    },
  };
}

export function validatePayslipLayout(
  input: any,
  codes?: ReadonlySet<string>,
): PayslipLayout {
  const fail = (message: string): never => {
    throw new BadRequestException(message);
  };
  const text = (value: unknown, name: string): string => {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 80 ||
      Array.from(value).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return fail(`${name} must contain 1-80 printable characters`);
    return value.trim();
  };
  if (!input || !Array.isArray(input.sections) || input.sections.length !== 3)
    return fail('Layout requires earnings, deductions and summary sections');
  const settings = input.settings || {};
  if (
    (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') ||
    (settings.currency !== undefined && settings.currency !== 'INR') ||
    (settings.showRates !== undefined && settings.showRates !== false) ||
    (settings.showUnits !== undefined && settings.showUnits !== false)
  )
    return fail(
      'Only INR amounts are supported; rates and units are not available',
    );
  const seenSections = new Set<string>();
  const seenCodes = new Set<string>();
  const seenTotals = new Set<string>();
  const expectedTotals: Record<string, string> = {
    EARNINGS: 'GROSS_EARNINGS',
    DEDUCTIONS: 'TOTAL_DEDUCTIONS',
    SUMMARY: 'NET_PAY',
  };
  const sections = input.sections.map((section: any) => {
    if (
      !section ||
      !Object.hasOwn(expectedTotals, section.key) ||
      seenSections.has(section.key)
    )
      return fail(
        'Layout section keys must be unique: EARNINGS, DEDUCTIONS, SUMMARY',
      );
    seenSections.add(section.key);
    const parseRows = (
      rows: unknown,
      totalsOnly = false,
    ): PayslipLayoutRow[] => {
      if (!Array.isArray(rows) || rows.length > 50)
        return fail('Each section supports at most 50 rows');
      return rows.map((row: any) => {
        const label = text(row?.label, 'Row label');
        if (row?.type === 'TOTAL') {
          if (
            row.key !== expectedTotals[section.key] ||
            seenTotals.has(row.key)
          )
            return fail(
              'Each section must contain its matching total exactly once',
            );
          seenTotals.add(row.key);
          return { type: 'TOTAL', key: row.key, label };
        }
        if (row?.type !== 'COMPONENT' || totalsOnly)
          return fail('Unsupported layout row type');
        const code = text(row.code, 'Component code');
        if (!/^[A-Z0-9_]{1,60}$/.test(code) || seenCodes.has(code))
          return fail('Component codes must be valid and unique');
        if (codes && !codes.has(code))
          return fail(`Component code not enabled for client: ${code}`);
        seenCodes.add(code);
        return { type: 'COMPONENT', code, label };
      });
    };
    return {
      key: section.key,
      title: text(section.title, 'Section title'),
      rows: parseRows(section.rows ?? []),
      totals: parseRows(section.totals ?? [], true),
    };
  });
  if (seenTotals.size !== 3)
    return fail('Gross earnings, total deductions and net pay are required');
  return {
    sections,
    settings: {
      enabled: settings.enabled === true,
      showRates: false,
      showUnits: false,
      currency: 'INR',
    },
  };
}

export function renderPayslipLayout(
  doc: PDFKit.PDFDocument,
  layout: PayslipLayout,
  values: ReadonlyMap<string, number>,
  totals: { GROSS_EARNINGS: number; TOTAL_DEDUCTIONS: number; NET_PAY: number },
): void {
  const x = doc.page.margins.left;
  const width = doc.page.width - x - doc.page.margins.right;
  const amountWidth = 130;
  const labelWidth = width - amountWidth - 16;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 24;
  const money = (value: number) => {
    if (!Number.isFinite(value))
      throw new BadRequestException('Payslip contains an invalid amount');
    return (
      'Rs.' +
      value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };
  for (const section of layout.sections) {
    doc.font('Helvetica-Bold').fontSize(10);
    const headingHeight = Math.max(
      25,
      doc.heightOfString(section.title, { width: width - 16 }) + 14,
    );
    const heading = () => {
      const y = doc.y;
      doc.rect(x, y, width, headingHeight).fill('#edf2f1');
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#183e37')
        .text(section.title, x + 8, y + 7, { width: width - 16 });
      doc.y = y + headingHeight + 4;
    };
    if (doc.y + headingHeight + 48 > bottom()) doc.addPage();
    heading();
    for (const row of [...section.rows, ...section.totals]) {
      const value =
        row.type === 'TOTAL' ? totals[row.key] : values.get(row.code);
      const amount = value === undefined ? '-' : money(value);
      doc
        .font(row.type === 'TOTAL' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10);
      const height = Math.max(
        24,
        doc.heightOfString(row.label, { width: labelWidth }) + 12,
      );
      if (doc.y + height > bottom()) {
        doc.addPage();
        heading();
      }
      doc
        .font(row.type === 'TOTAL' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor('#111111');
      const y = doc.y;
      doc.text(row.label, x + 8, y + 6, { width: labelWidth });
      doc.text(amount, x + width - amountWidth, y + 6, {
        width: amountWidth - 8,
        align: 'right',
      });
      doc
        .moveTo(x, y + height)
        .lineTo(x + width, y + height)
        .strokeColor('#d7dedc')
        .lineWidth(0.5)
        .stroke();
      doc.y = y + height;
    }
    doc.y += 12;
  }
  doc.font('Helvetica').fillColor('#000000');
}
