import type { RegisterField, RegisterLayout } from './register-layouts';

const f = (
  key: string,
  label: string,
  type: RegisterField['type'] = 'text',
  required = true,
): RegisterField => ({ key, label, type, required });

// Keep source column numbers, including the numbering error printed in TS III.
// The Shops binding does not assert that repealed Acts share this current obligation.
export function stateShopsLayout(
  source: string,
  number: string,
  act?: string,
): RegisterLayout | null {
  if (source === 'tsi' && number === 'II + III' && act === 'TS_SHOPS_1988') {
    return {
      baseFormNumber: 'STATE',
      individual: false,
      payrollPrefill: false,
      manualOnly: true,
      particularsTitle:
        'Form II — Integrated register: establishment particulars',
      capacityRequired: true,
      employeeRows: 'TABLE',
      particulars: [
        f('establishmentName', '1(a). Name of establishment'),
        f('establishmentAddress', '1(b). Address'),
        f('telephone', '1(c). Telephone number(s)'),
        f('fax', '1(d). Fax number(s) / not applicable'),
        f('mobile', '1(e). Mobile number'),
        f('business', '2(a). Nature of business'),
        f('location', '2(b). Location of work'),
        f('wageOrder', '2(c). Applicable minimum-wage GO number and date'),
        f(
          'principalEmployer',
          '3. Employer / principal employer name and address',
        ),
        f('contractors', '4. Contractors engaged / explicitly none'),
        f(
          'registrations',
          '5. Act-wise registration/licence numbers, issue and renewal dates',
        ),
        f('regularWorkers', '6. Regular workers', 'number'),
        f('contractWorkers', '6. Contract workers', 'number'),
        ...[
          'Permanent',
          'Temporary',
          'Trainee',
          'Apprentice',
          'Contract',
          'Total',
        ].flatMap((category) =>
          ['Male', 'Female'].map((sex) =>
            f(
              'category' + category + sex,
              '6(i). ' + category + ' — ' + sex,
              'number',
            ),
          ),
        ),
        ...[
          'HighlySkilled',
          'Skilled',
          'SemiSkilled',
          'Unskilled',
          'Total',
        ].flatMap((category) =>
          ['Male', 'Female'].map((sex) =>
            f(
              'class' + category + sex,
              '6(ii). ' +
                category.replace(/([a-z])([A-Z])/g, '$1 $2') +
                ' — ' +
                sex,
              'number',
            ),
          ),
        ),
        f('adolescentMale', '6(iii). Adolescents (14–18) — male', 'number'),
        f('adolescentFemale', '6(iii). Adolescents (14–18) — female', 'number'),
        f('cleaning', '7. Cleaning / whitewashing dates or not applicable'),
        f('inspections', '8. Act-wise inspection dates or explicitly none'),
        f(
          'inspectors',
          '9. Inspection team leaders: names/designations or not applicable',
        ),
        f('accidents', '10. Accident dates and times or explicitly none'),
        f('injured', '11. Workers injured', 'number'),
        f('deceased', '12. Workers died', 'number'),
        f('managerAddress', 'Form III. Employer / manager name and address'),
        f('employerSignatory', 'Form III. Employer/contractor signatory name'),
        f(
          'employerSignature',
          'Form III. Employer/contractor signature',
          'text',
          false,
        ),
        f(
          'peSignatory',
          'Form III. Principal-employer representative name (if contractor)',
          'text',
          false,
        ),
        f(
          'peDesignation',
          'Form III. Principal-employer representative designation',
          'text',
          false,
        ),
        f(
          'peSignature',
          'Form III. Principal-employer representative signature',
          'text',
          false,
        ),
      ],
      fields: [
        f('serial', '1. Serial number', 'number'),
        f('name', '2. Worker name and ID/token number'),
        f('ageOrBirthDate', '3. Age / date of birth'),
        f('address', '4. Address'),
        f('educationSkill', '5. Education / skill'),
        f('sex', '6. Sex (M/F)'),
        f('relativeName', '7. Father/husband name'),
        f('nominee', '8. Nominee name and address'),
        f('designation', '9. Designation/category/nature of work'),
        f('daysWorked', '10. Days worked', 'number'),
        f('leaveCategory', '11. Leave category / none'),
        f('leaveDays', '12. Leave availed (days)', 'number'),
        f('leaveBalance', '13. Total balance leave', 'number'),
        f('wageRate', '14. Wage rate/pay or piece-rate/unit and basis'),
        f('allowances', '15. Other allowances', 'money'),
        f('otHours', '16. Overtime hours', 'number'),
        f('overtime', '17. Overtime wages', 'money'),
        f('maternity', '18. Maternity benefit', 'money'),
        f('otherAmount', '19. Other amount and description / none'),
        f('gross', '20. Total/gross wages/earnings', 'money'),
        f('advanceDetails', '21. Advances/loans: amount and purpose / none'),
        f('fine', '22. Fines deducted', 'money'),
        f(
          'otherDeductions',
          '23. Other deductions (EPF/ESI/Welfare Fund etc.)',
          'money',
        ),
        f(
          'net',
          '24. Net payable (source prints 14-(15+16+17); reconcile against actual earnings/deductions)',
          'money',
        ),
        f(
          'workerSignature',
          '25. Worker signature/thumb impression',
          'text',
          false,
        ),
        f('remarks', '26. Remarks', 'text', false),
      ],
    };
  }
  if (source !== 'mh') return null;
  if (number === 'Q')
    return {
      baseFormNumber: 'STATE',
      individual: false,
      payrollPrefill: false,
      manualOnly: true,
      fields: [
        f('serial', '1. Serial number', 'number'),
        f('name', '2. Full name of worker'),
        f('designation', '3. Designation and nature of work'),
        f('age', '4. Age', 'number'),
        f('sex', '5. Sex'),
        f('joiningDate', '6. Date of entry into service', 'date'),
        f('workingFrom', '7. Working hours — from'),
        f('workingTo', '7. Working hours — to'),
        f('restFrom', '8. Rest interval — from'),
        f('restTo', '8. Rest interval — to'),
        ...Array.from({ length: 31 }, (_, i) =>
          f(
            'day' + (i + 1) + 'Status',
            '9. Day ' + (i + 1) + ' — P/HD/A/L/WO/H',
            'text',
            false,
          ),
        ),
        f('daysWorked', '10. Total days worked', 'number'),
        f('minimumRate', '11. Minimum wage rate payable', 'money'),
        f(
          'pieceProduction',
          '12. Total production in case of piece rate',
          'number',
        ),
        f('actualWages', '13. Actual wages paid', 'money'),
        f('hra', '14. House rent allowance paid', 'money'),
        f('da', '15. Dearness allowance paid', 'money'),
        f('gross', '16. Gross amount payable', 'money'),
        f('otHours', '17. Overtime hours in month', 'number'),
        f('overtime', '18. Overtime earnings', 'money'),
        ...[
          'Provident fund contribution',
          'Family pension',
          'ESI contribution',
          'Professional tax',
          'Income tax',
          'Loan and interest',
          'Advances',
          'Other deductions',
          'Total deduction',
          'Net payable',
        ].map((label, i) =>
          f(
            [
              'pf',
              'pension',
              'esi',
              'pt',
              'incomeTax',
              'loanInterest',
              'advances',
              'otherDeductions',
              'deductions',
              'net',
            ][i],
            i + 19 + '. ' + label,
            'money',
          ),
        ),
        f('paymentDate', '29. Payment date', 'date'),
        f('bankAccount', '30. Worker bank account number'),
        f(
          'transferReference',
          '31. Cheque number/date or RTGS/NEFT transfer date',
        ),
        f('deposited', '32. Amount deposited', 'money'),
        f(
          'workerSignature',
          '33. Worker signature/thumb impression (if required)',
          'text',
          false,
        ),
        f(
          'signature',
          'Employer/authorised representative signature',
          'text',
          false,
        ),
      ],
    };
  if (number === 'O')
    return {
      baseFormNumber: 'STATE',
      pageBreakBefore: ['FestivalFrom'],
      individual: true,
      payrollPrefill: false,
      manualOnly: true,
      fields: [
        f('name', 'Worker name'),
        f('department', 'Department (if applicable)', 'text', false),
        f(
          'receipt',
          'Receipt of leave book — worker signature/thumb impression',
          'text',
          false,
        ),
        f('joiningDate', 'Date of entry into service', 'date'),
        f('leaveDueOn', '1. Accumulation — leave due on', 'date'),
        f('leaveDays', '1. Accumulation — number of days', 'number'),
        f('allowedFrom', '2. Leave allowed — from', 'date', false),
        f('allowedTo', '2. Leave allowed — to', 'date', false),
        f(
          'firstMoiety',
          '3. Payment for leave — first moiety date',
          'date',
          false,
        ),
        f(
          'secondMoiety',
          '4. Payment for leave — second moiety date',
          'date',
          false,
        ),
        f(
          'applicationDate',
          '5. Refused leave — application date',
          'date',
          false,
        ),
        f('refusalDate', '5. Date of refusal', 'date', false),
        f('refusalReason', '5. Reason for refusal', 'text', false),
        f('dischargeDate', '6. Discharge date', 'date', false),
        f(
          'dischargePaymentDate',
          '6. Payment in lieu on discharge — date',
          'date',
          false,
        ),
        f(
          'dischargePayment',
          '6. Payment in lieu on discharge — amount',
          'money',
          false,
        ),
        f(
          'workerSignature',
          '6. Worker signature/left thumb impression',
          'text',
          false,
        ),
        f('remarks', '7. Remarks', 'text', false),
        ...['Festival', 'Casual'].flatMap((kind) => [
          f(kind + 'From', kind + ' leave — period from', 'date'),
          f(kind + 'To', kind + ' leave — period to', 'date'),
          f(kind + 'Total', kind + ' leave — total', 'number'),
          f(kind + 'Used', kind + ' leave — availed', 'number'),
          f(kind + 'Balance', kind + ' leave — balance', 'number'),
          ...(kind === 'Festival'
            ? [
                f(
                  'festivalPayment',
                  'Festival leave — payment in lieu when called for work',
                  'money',
                ),
              ]
            : []),
          f(kind + 'Remarks', kind + ' leave — remarks', 'text', false),
        ]),
        f('authority', 'Authority name'),
        f('signature', 'Authority signature', 'text', false),
      ],
    };
  return null;
}
