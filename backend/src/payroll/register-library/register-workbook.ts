import { registerReuseRule } from './register-reuse-rule';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import { REGISTER_FORMS, REGISTER_SOURCES } from './register-catalogue';
import { registerLayout } from './register-layouts';

export type RegisterRow = Record<string, string | number>;
export interface RegisterInput {
  branchId: string;
  contractorUserId?: string;
  supportingReference?: string;
  year: number;
  month: number;
  employer: string;
  owner: string;
  registrationNumber: string;
  employerPan: string;
  issueDate: string;
  rows: RegisterRow[];
}

export function definition(id: string) {
  const form = REGISTER_FORMS.find((f) => f.id === id);
  if (!form) throw new NotFoundException('Register not found');
  const layout = registerLayout(form.sourceId, form.formNumber);
  if (!layout || form.kind === 'AUTHORITY_REGISTER') {
    throw new BadRequestException(
      'This form is reference-only until its layout and data source are implemented',
    );
  }
  return {
    form,
    layout,
    reuseRule: registerReuseRule(form),
    leaveCalculationAvailable:
      form.sourceId === 'osh' && layout.baseFormNumber === 'LEAVE',
    schemaVersion: createHash('sha256')
      .update(JSON.stringify({ form, layout }))
      .digest('hex'),
  };
}

export function validateRegister(id: string, input: RegisterInput): string[] {
  const { form, layout } = definition(id);
  const errors: string[] = [];
  if (!input || typeof input !== 'object')
    return ['Register details are required'];
  for (const key of [
    'employer',
    'owner',
    'registrationNumber',
    'employerPan',
    'issueDate',
  ] as const) {
    if (
      typeof input[key] !== 'string' ||
      !input[key].trim() ||
      input[key].length > 300
    )
      errors.push(key + ' is required (maximum 300 characters)');
  }
  if (
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2100 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  )
    errors.push('Select a valid month and year');
  const validDate = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(input.issueDate))
    errors.push('Issue date must be a valid YYYY-MM-DD date');
  if (
    !Array.isArray(input.rows) ||
    input.rows.length === 0 ||
    input.rows.length > 500
  )
    return [
      ...errors,
      'Provide 1 to 500 records; an empty register is not an authenticated NIL declaration',
    ];
  if (
    input.supportingReference !== undefined &&
    (typeof input.supportingReference !== 'string' ||
      input.supportingReference.length > 1000)
  )
    errors.push('Supporting reference must be text (maximum 1000 characters)');
  if (
    ['EVENT', 'MATERNITY'].includes(layout.baseFormNumber) &&
    !String(input.supportingReference || '').trim()
  )
    errors.push(
      'An incident/report or authorised HR evidence reference is required',
    );
  const allowed = new Set(layout.fields.map((f) => f.key));
  const identities = new Set<string>();
  input.rows.forEach((row, i) => {
    const prefix = 'Record ' + (i + 1) + ': ';
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(prefix + 'invalid record');
      return;
    }
    if (Object.keys(row).some((k) => !allowed.has(k)))
      errors.push(prefix + 'contains fields from another form');
    for (const f of layout.fields) {
      const value = row[f.key];
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && !value.trim());
      if (missing) {
        if (f.required) errors.push(prefix + f.label + ' is required');
        continue;
      }
      if (
        !['string', 'number'].includes(typeof value) ||
        String(value).length > 2000
      ) {
        errors.push(
          prefix +
            f.label +
            ' must be plain text or a number (maximum 2000 characters)',
        );
        continue;
      }
      if (f.type === 'text' && typeof value !== 'string')
        errors.push(prefix + f.label + ' must be text to preserve identifiers');
      if (f.type === 'money' || f.type === 'number') {
        if (
          !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
          !Number.isFinite(Number(value)) ||
          Number(value) > 1e10
        )
          errors.push(
            prefix +
              f.label +
              ' must be a non-negative number with at most two decimals',
          );
      }
      if (f.type === 'date' && !validDate(value))
        errors.push(prefix + f.label + ' must be YYYY-MM-DD');
    }
    const identity =
      layout.baseFormNumber === 'LEAVE'
        ? ''
        : String(row.employeeCode || row.employee_1 || '').trim();
    if (identity && identities.has(identity))
      errors.push(prefix + 'duplicate employee code');
    if (identity) identities.add(identity);
    const money = (key: string) => Number(row[key]);
    const checkTotal = (total: string, parts: string[]) => {
      if (
        [total, ...parts].every(
          (k) =>
            row[k] !== '' && row[k] !== undefined && Number.isFinite(money(k)),
        )
      ) {
        const sum = parts.reduce((s, k) => s + Math.round(money(k) * 100), 0);
        if (Math.abs(Math.round(money(total) * 100) - sum) > 1)
          errors.push(prefix + total + ' does not match its component total');
      }
    };
    if (layout.baseFormNumber === 'IV' || layout.baseFormNumber === 'V') {
      const expectedPeriod =
        input.year +
        '-' +
        String(input.month).padStart(2, '0') +
        '-01 to ' +
        input.year +
        '-' +
        String(input.month).padStart(2, '0') +
        '-' +
        new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
      if (row.wagePeriod !== expectedPeriod)
        errors.push(
          prefix +
            'wage period must match the selected month: ' +
            expectedPeriod,
        );
      if (
        layout.baseFormNumber === 'IV' &&
        String(row.frequency).toLowerCase() !== 'monthly'
      )
        errors.push(
          prefix + 'this preparation flow supports monthly wage periods only',
        );
      checkTotal('gross', ['net', 'deductions']);
      checkTotal(
        'deductions',
        layout.baseFormNumber === 'V' || form.sourceId === 'rjw'
          ? [
              'pf',
              'esi',
              'otherDeductions',
              ...(form.sourceId === 'rjw' && layout.baseFormNumber === 'IV'
                ? ['fineImposed', 'damageRecovery']
                : []),
            ]
          : [
              'pf',
              'esi',
              'society',
              'incomeTax',
              'insurance',
              ...(['brw', 'ldw', 'aposh', 'brosh', 'rjosh'].includes(
                form.sourceId,
              )
                ? []
                : ['advances']),
              'fineRecovery',
              'damageRecovery',
              'otherDeductions',
            ],
      );
      if (layout.baseFormNumber === 'IV') {
        checkTotal('gross', ['basic', 'da', 'allowances', 'overtime']);
        if (['aposh', 'brosh', 'rjosh'].includes(form.sourceId)) {
          checkTotal('totalRate', ['basicRate', 'daRate', 'allowanceRate']);
          if (
            (money('fineRecovery') > 0 || money('damageRecovery') > 0) &&
            !String(input.supportingReference || '').trim()
          )
            errors.push(
              prefix +
                'fine/damage recovery requires supporting deduction evidence',
            );
        }
        if (money('fineImposed') > 0 && !String(row.fineReason || '').trim())
          errors.push(prefix + 'fine reason is required');
        if (
          money('damageRecovery') > 0 &&
          allowed.has('damageReason') &&
          !String(row.damageReason || '').trim()
        )
          errors.push(prefix + 'damage/loss reason is required');
      }
    }
    const days = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
    if (layout.baseFormNumber === 'MATERNITY') {
      const expectedMonth = `${input.year}-${String(input.month).padStart(2, '0')}`;
      if (row.employmentMonth !== expectedMonth)
        errors.push(prefix + 'employment month must match the selected period');
      if (
        Number(row.employedDays) +
          Number(row.laidOffDays) +
          Number(row.notEmployedDays) !==
        days
      )
        errors.push(
          prefix +
            'employment status days must cover this calendar month without overlap',
        );
      if (String(row.appointmentDate) > `${expectedMonth}-${days}`)
        errors.push(prefix + 'appointment cannot follow the register month');
      if (
        row.dischargeDate &&
        String(row.dischargeDate) < String(row.appointmentDate)
      )
        errors.push(prefix + 'discharge cannot precede appointment');
      if (
        validDate(row.appointmentDate) &&
        (!row.dischargeDate || validDate(row.dischargeDate))
      ) {
        const start = Math.max(
          Date.parse(`${expectedMonth}-01`),
          Date.parse(String(row.appointmentDate)),
        );
        const end = Math.min(
          Date.parse(`${expectedMonth}-${days}`),
          row.dischargeDate ? Date.parse(String(row.dischargeDate)) : Infinity,
        );
        const activeDays = Math.max(0, (end - start) / 86400000 + 1);
        if (Number(row.employedDays) + Number(row.laidOffDays) > activeDays)
          errors.push(
            prefix +
              'employed and laid-off days exceed the appointment/discharge period',
          );
      }
      if (String(row.inspectorRemarks || '').trim())
        errors.push(
          prefix +
            'Inspector-cum-Facilitator remarks must be left blank by the preparer',
        );
      for (const key of [
        'advance',
        'subsequent',
        'bonus',
        'section65Leave',
        'section65Illness',
      ]) {
        const amount = row[key + 'Amount'],
          date = row[key + 'Date'];
        if (Number(amount) > 0 && !date)
          errors.push(prefix + key + ' payment date is required');
        if (date && (amount === undefined || amount === null || amount === ''))
          errors.push(prefix + key + ' paid amount is required');
      }
      if (
        (row.section65IllnessDate || Number(row.section65IllnessAmount) > 0) &&
        !String(row.illnessLeavePeriod || '').trim()
      )
        errors.push(prefix + 'section 65(2) leave period is required');
    }
    if (layout.baseFormNumber === 'EVENT') {
      const monthPrefix =
        input.year + '-' + String(input.month).padStart(2, '0');
      if (
        typeof row.eventDate === 'string' &&
        !row.eventDate.startsWith(monthPrefix + '-')
      )
        errors.push(prefix + 'event date must be in the selected month');
      for (const key of ['reportDate', 'returnDate', 'entryDate'])
        if (row[key] && String(row[key]) < String(row.eventDate))
          errors.push(prefix + key + ' cannot precede the event');
      for (const key of ['noticeTime', 'eventTime']) {
        if (row[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(row[key])))
          errors.push(prefix + key + ' must use 24-hour HH:mm format');
      }
      if (
        row.reportDate === row.eventDate &&
        row.noticeTime &&
        row.eventTime &&
        String(row.noticeTime) < String(row.eventTime)
      )
        errors.push(
          prefix + 'notice time cannot precede the event on the same date',
        );
      if (
        row.returnDate &&
        (row.absenceDays === undefined || row.absenceDays === '')
      )
        errors.push(
          prefix +
            'days absent must be completed when return to work is recorded',
        );
    }
    if (layout.baseFormNumber === 'LEAVE') {
      if (!['ADULT', 'ADOLESCENT'].includes(String(row.part)))
        errors.push(prefix + 'part must be ADULT or ADOLESCENT');
      if (
        row.leaveAllowedFrom &&
        String(row.leaveAllowedFrom) < String(row.joiningDate)
      )
        errors.push(prefix + 'leave cannot precede joining');
    }
    if (row.daysWorked !== undefined && Number(row.daysWorked) > days)
      errors.push(prefix + 'days worked exceed the selected month');
    if (layout.baseFormNumber === 'IX' && layout.attendanceMode === 'STATUS') {
      for (let d = 1; d <= 31; d++) {
        const status = row[`day${d}Status`];
        if (
          d <= days &&
          !['P', 'HD', 'A', 'L', 'WO', 'H'].includes(String(status))
        )
          errors.push(prefix + `day ${d} requires P, HD, A, L, WO or H`);
        if (d > days && status)
          errors.push(prefix + `day ${d} does not exist in this month`);
      }
      const statuses = Array.from(
        { length: days },
        (_, i) => row[`day${i + 1}Status`],
      );
      const present = statuses.reduce<number>(
        (n, v) => n + (v === 'P' ? 1 : v === 'HD' ? 0.5 : 0),
        0,
      );
      if (Number(row.daysWorked) !== present)
        errors.push(prefix + 'days present do not match daily attendance');
      if (Number(row.restDays) !== statuses.filter((v) => v === 'WO').length)
        errors.push(prefix + 'rest days do not match daily attendance');
      if (Number(row.leaveDays) !== statuses.filter((v) => v === 'L').length)
        errors.push(prefix + 'leave days do not match daily attendance');
      if (Number(row.paidDays) > days)
        errors.push(prefix + 'paid days exceed this month');
    }
    if (layout.baseFormNumber === 'IX' && layout.attendanceMode !== 'STATUS') {
      for (let d = 1; d <= 31; d++) {
        const a = row['day' + d + 'In'],
          b = row['day' + d + 'Out'];
        if (d <= days && (!a || !b))
          errors.push(
            prefix +
              'day ' +
              d +
              ' needs attendance or an explicit absence/holiday code',
          );
        if (d > days && (a || b || row['day' + d + 'Signature']))
          errors.push(prefix + 'day ' + d + ' does not exist in this month');
      }
    }
  });
  return errors.slice(0, 150);
}

export async function registerWorkbook(
  id: string,
  input?: RegisterInput,
  context: Record<string, string> = {},
): Promise<Buffer> {
  const { form, layout, schemaVersion } = definition(id);
  const source = REGISTER_SOURCES[form.sourceId];
  const book = new ExcelJS.Workbook();
  book.creator = 'StatComPy';
  const rows: RegisterRow[] = input?.rows || [{}];
  const guide = book.addWorksheet('Identity and review');
  guide.columns = [{ width: 30 }, { width: 100 }];
  const metadata = {
    Status: input
      ? 'PREPARED — requires statutory review and authentication'
      : 'BLANK FORMAT — complete all applicable particulars',
    Jurisdiction: form.jurisdiction,
    Act: form.actCode,
    Rules: source.title,
    'Form number': form.formNumber,
    'Rule reference': form.ruleReference,
    Notification: source.notification,
    'Publication date': source.publicationDate || '',
    'Legal identity': form.id,
    'Schema version': schemaVersion,
    'Source URL': source.url,
    ...('corrigendumUrl' in source
      ? { 'Corrigendum URL': source.corrigendumUrl }
      : {}),
    'Source page': String(form.sourcePage || ''),
    'Source-specific requirements': form.notes || '',
    'Data purpose':
      layout.baseFormNumber === 'MATERNITY'
        ? 'Women employee and maternity evidence — authorised HR records'
        : layout.baseFormNumber === 'EVENT'
          ? 'Accident/dangerous-occurrence evidence'
          : layout.baseFormNumber === 'LEAVE'
            ? 'Leave with wages records'
            : layout.baseFormNumber === 'IX'
              ? 'Daily attendance — not reconstructed from payroll totals'
              : layout.baseFormNumber === 'I'
                ? 'Employee master — not a monthly payroll subset'
                : 'Monthly wages / payment',
    'Required review':
      'Confirm jurisdiction, applicability, supporting records and signatures before use. No automatic NIL declaration.',
    ...context,
    Establishment: context.establishment || '',
    Address: context.address || '',
    Employer: input?.employer || '',
    Owner: input?.owner || '',
    'Employer PAN/TAN': input?.employerPan || '',
    'Registration number': input?.registrationNumber || '',
    'Date of issue': input?.issueDate || '',
    'Supporting record reference': input?.supportingReference || '',
    Period: input
      ? input.year + '-' + String(input.month).padStart(2, '0')
      : '',
  };
  for (const [key, value] of Object.entries(metadata)) {
    const r = guide.addRow([key, value]);
    r.alignment = { vertical: 'top', wrapText: true };
    r.height = Math.max(32, Math.ceil(String(value).length / 80) * 16);
    r.getCell(1).font = { bold: true };
  }
  guide.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  guide.pageSetup.printArea = 'A1:B' + guide.rowCount;
  const isAttendance =
    layout.baseFormNumber === 'IX' && layout.attendanceMode !== 'STATUS';
  const dailySignature = layout.fields.some((f) =>
    /^day\d+Signature$/.test(f.key),
  );
  rows.forEach((row, index) => {
    const sheet = book.addWorksheet(
      'Form ' + form.formNumber + (index ? ' - ' + (index + 1) : ''),
    );
    const width = isAttendance ? 22 : layout.individual ? 2 : 8;
    for (let c = 1; c <= width; c++)
      sheet.getColumn(c).width = isAttendance
        ? 8
        : layout.individual
          ? c === 1
            ? 52
            : 65
          : 20;
    const banner = (text: string) => {
      const n = sheet.rowCount + 1;
      sheet.mergeCells(n, 1, n, width);
      const r = sheet.getRow(n);
      r.getCell(1).value = text;
      r.font = { bold: true, size: 11 };
      r.alignment = { wrapText: true };
      r.height = 32;
    };
    banner('FORM ' + form.formNumber + ' — ' + form.title);
    banner(source.title + ' | ' + form.ruleReference);
    banner(
      'Establishment: ' +
        (context.establishment || '') +
        ' | Employer: ' +
        (input?.employer || ''),
    );
    banner(
      'Owner: ' +
        (input?.owner || '') +
        ' | PAN/TAN: ' +
        (input?.employerPan || '') +
        ' | Registration: ' +
        (input?.registrationNumber || ''),
    );
    banner(
      'Period: ' +
        (input ? input.year + '-' + String(input.month).padStart(2, '0') : '') +
        ' | Date of issue: ' +
        (input?.issueDate || ''),
    );
    banner(
      'Record ' +
        (index + 1) +
        ' | ' +
        String(row.employeeCode || row.employee_1 || '') +
        ' | ' +
        String(row.name || row.employee_2 || ''),
    );
    if (isAttendance) {
      if (row.establishmentDistrict)
        banner('Establishment district: ' + row.establishmentDistrict);
      banner(
        'Designation: ' +
          (row.designation || '') +
          ' | Shift: ' +
          (row.shift || '') +
          ' | Place/department: ' +
          (row.department || ''),
      );
      for (const [start, end] of [
        [1, 11],
        [12, 21],
        [22, 31],
      ]) {
        const n = sheet.rowCount + 1;
        for (let d = start; d <= end; d++) {
          const c = (d - start) * 2 + 1;
          sheet.mergeCells(n, c, n, c + 1);
          sheet.getCell(n, c).value = 'Day ' + d;
          sheet.getCell(n + 1, c).value = 'In';
          sheet.getCell(n + 1, c + 1).value = 'Out';
          sheet.getCell(n + 2, c).value = row['day' + d + 'In'] || '';
          sheet.getCell(n + 2, c + 1).value = row['day' + d + 'Out'] || '';
          if (dailySignature) {
            sheet.mergeCells(n + 3, c, n + 3, c + 1);
            sheet.getCell(n + 3, c).value =
              'Signature: ' + (row['day' + d + 'Signature'] || '');
          }
        }
        for (let r = n; r <= n + (dailySignature ? 3 : 2); r++) {
          sheet.getRow(r).height = 28;
          sheet.getRow(r).alignment = { wrapText: true, vertical: 'middle' };
        }
      }
      banner(
        'Days worked: ' +
          (row.daysWorked ?? '') +
          ' | Overtime hours: ' +
          (row.otHours ?? ''),
      );
      banner(
        'Tour / outside assignment: ' +
          (row.tour || '') +
          ' | Register keeper signature: ' +
          (row.signature || ''),
      );
    } else if (layout.individual) {
      for (const f of layout.fields) {
        const r = sheet.addRow([
          f.label,
          (f.type === 'money' || f.type === 'number') &&
          row[f.key] !== undefined &&
          row[f.key] !== ''
            ? Number(row[f.key])
            : (row[f.key] ?? ''),
        ]);
        r.height = Math.max(
          26,
          Math.ceil(f.label.length / 45) * 15,
          Math.ceil(String(row[f.key] ?? '').length / 58) * 15,
        );
        r.alignment = { wrapText: true, vertical: 'top' };
        r.getCell(2).numFmt = f.type === 'money' ? '0.00' : '@';
      }
    } else {
      Array.from({ length: Math.ceil(layout.fields.length / 8) }, (_, i) =>
        layout.fields.slice(i * 8, (i + 1) * 8),
      ).forEach((fields, i) => {
        if (i > 0 && i % 3 === 0) sheet.getRow(sheet.rowCount).addPageBreak();
        banner('Part ' + (i + 1));
        const heading = sheet.addRow(fields.map((f) => f.label));
        heading.height = 90;
        heading.font = { bold: true };
        heading.alignment = { wrapText: true, vertical: 'middle' };
        const values = sheet.addRow(
          fields.map((f) =>
            (f.type === 'money' || f.type === 'number') &&
            row[f.key] !== undefined &&
            row[f.key] !== ''
              ? Number(row[f.key])
              : (row[f.key] ?? ''),
          ),
        );
        values.height = Math.max(
          36,
          ...fields.map(
            (f) => Math.ceil(String(row[f.key] ?? '').length / 18) * 14,
          ),
        );
        values.alignment = { wrapText: true, vertical: 'top' };
        fields.forEach(
          (f, c) =>
            (values.getCell(c + 1).numFmt = f.type === 'money' ? '0.00' : '@'),
        );
      });
    }
    sheet.eachRow((r) =>
      r.eachCell(
        { includeEmpty: true },
        (c) =>
          (c.border = {
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          }),
      ),
    );
    sheet.pageSetup = {
      paperSize: (isAttendance || !layout.individual
        ? 8
        : 9) as ExcelJS.PaperSize,
      orientation:
        isAttendance || !layout.individual ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:6',
    };
    sheet.headerFooter.oddFooter =
      'Form ' +
      form.formNumber +
      ' | ' +
      form.ruleReference +
      ' | Page &P of &N';
    sheet.views = [{ state: 'frozen', ySplit: 6 }];
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}
