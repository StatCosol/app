import type { RegisterField, RegisterLayout } from './register-layouts';

const f = (
  key: string,
  label: string,
  type: RegisterField['type'] = 'text',
  required = true,
): RegisterField => ({ key, label, type, required });
const columns = (
  items: Array<[string, string, RegisterField['type']?, boolean?]>,
) =>
  items.map(([key, label, type, required], i) =>
    f(key, i + 1 + '. ' + label, type, required),
  );
const signature = f(
  'employerSignature',
  'Employer / authorised signatory authentication reference',
  'text',
  false,
);
const common = [
  f('employerAddress', 'Employer name and full address'),
  signature,
];
const managers = [...common, f('manager', 'Manager / person in charge')];
const headcounts = [
  'Men',
  'Women',
  'MaleYoungPersons',
  'FemaleYoungPersons',
].map((k) =>
  f(
    'headcount' + k,
    'Total persons employed — ' + k.replace(/([a-z])([A-Z])/g, '$1 $2'),
    'number',
  ),
);
const period = [
  f('wageFrom', 'Wage period from', 'date'),
  f('wageTo', 'Wage period to', 'date'),
  f(
    'wageBasis',
    'Wage basis: monthly / fortnightly / weekly / daily / piece rated',
  ),
];
const holidays = [
  f('holidayApproval', 'Festival holiday approval proceedings number and date'),
  f('approvedHolidays', 'Approved festival holidays and dates'),
];
const table = (
  fields: RegisterField[],
  particulars: RegisterField[] = common,
  extra: Partial<RegisterLayout> = {},
): RegisterLayout => ({
  baseFormNumber: 'STATE',
  individual: false,
  manualOnly: true,
  payrollPrefill: false,
  employeeRows: 'TABLE',
  containsWages: fields.some((f) => f.type === 'money'),
  establishmentRequirement: 'SHOPS',
  particularsMode: 'COMMON',
  particularsTitle: 'Establishment details and authentication',
  particulars,
  fields,
  ...extra,
});
const tnEmployee = columns([
  ['serial', 'Serial number', 'number'],
  ['name', 'Name of employee'],
  ['employeeCode', 'Employee identification number'],
  ['gender', 'Gender'],
  ['relativeName', 'Father / spouse name'],
  ['birthDate', 'Date of birth', 'date'],
  ['joiningDate', 'Date of entry into service', 'date'],
  ['designation', 'Designation'],
  ['presentAddress', 'Present address'],
  ['permanentAddress', 'Permanent address'],
  ['pfNumber', 'Employee provident fund number', 'text', false],
  ['esiNumber', 'Employee State Insurance Corporation number', 'text', false],
  ['aadhaar', 'Aadhaar number', 'text', false],
  [
    'service480Date',
    'Date of completion of 480 days of service',
    'date',
    false,
  ],
  ['permanentDate', 'Date made permanent', 'date', false],
  ['suspension', 'Period of suspension', 'text', false],
  ['bank', 'Bank account, bank name, branch and IFSC'],
  ['photo', 'Photograph attachment reference', 'text', false],
  ['mobile', 'Mobile number', 'text', false],
  ['email', 'Email ID', 'text', false],
  [
    'signature',
    'Specimen signature / thumb impression reference',
    'text',
    false,
  ],
  ['exitDate', 'Date of exit', 'date', false],
  ['exitReason', 'Reason for exit', 'text', false],
  ['remarks', 'Remarks', 'text', false],
]);
const tnLeave = columns([
  ['serial', 'Serial number', 'number'],
  ['name', 'Name of employee'],
  ['employeeCode', 'Employee identification number'],
  ['earnedOpening', 'Earned leave — opening', 'number'],
  ['earnedAccrued', 'Earned leave — earned', 'number'],
  ['earnedUsed', 'Earned leave — availed', 'number'],
  ['earnedClosing', 'Earned leave — closing', 'number'],
  ['medicalOpening', 'Medical leave — opening', 'number'],
  ['medicalUsed', 'Medical leave — availed', 'number'],
  ['medicalClosing', 'Medical leave — closing', 'number'],
  ['otherOpening', 'Other leave — opening', 'number'],
  ['otherUsed', 'Other leave — availed', 'number'],
  ['otherClosing', 'Other leave — closing', 'number'],
  ['pregnancyNotice', 'Date of notice of pregnancy / delivery', 'date', false],
  [
    'maternityAdvance',
    'Maternity benefit advance amount and payment date',
    'text',
    false,
  ],
  [
    'maternitySubsequent',
    'Subsequent maternity benefit amount and payment date',
    'text',
    false,
  ],
  ['medicalBonus', 'Medical bonus amount and payment date', 'text', false],
  [
    'maternityLeave',
    'Leave with wages under sections 9 or 10 of Maternity Benefit Act',
    'text',
    false,
  ],
  ['nomination', 'Whether employee nomination received'],
  ['gratuity', 'Gratuity paid on exit', 'money'],
  ['remarks', 'Remarks', 'text', false],
]);
const tnWage = columns([
  ['serial', 'Serial number', 'number'],
  ['name', 'Name of employee'],
  ['employeeCode', 'Employee identification number'],
  ['daysWorked', 'Days worked', 'number'],
  ['basic', 'Basic wage', 'money'],
  ['da', 'Dearness allowance', 'money'],
  ['hra', 'House rent allowance', 'money'],
  ['allowances', 'Other allowances', 'money'],
  ['overtime', 'Overtime wages', 'money'],
  [
    'leaveHolidayWages',
    'Wages for EL / double wages for national festival holidays / accumulated leave (printed: Overtime Wages)',
    'money',
  ],
  ['gross', 'Gross wages', 'money'],
  ['pfReference', 'Provident Fund No. (as printed under deductions)'],
  [
    'esiReference',
    'Employee State Insurance Corporation No. (as printed under deductions)',
  ],
  ['lwf', 'Labour welfare fund', 'money'],
  ['advancePaid', 'Advance paid', 'money'],
  ['advanceOpening', 'Advance recovery pending — opening', 'money'],
  ['advanceRecovered', 'Advance recovered', 'money'],
  ['advanceClosing', 'Advance recovery pending — closing', 'money'],
  ['damageImposed', 'Deduction imposed on damages, loss or fines', 'money'],
  ['damageOpening', 'Deduction recovery pending — opening', 'money'],
  ['damageRecovered', 'Deduction made on damages, loss or fines', 'money'],
  ['damageClosing', 'Deduction recovery pending — closing', 'money'],
  ['otherDeductions', 'Other deductions', 'money'],
  ['deductions', 'Total deductions', 'money'],
  ['net', 'Net wages', 'money'],
  ['paymentDate', 'Date of payment', 'date', false],
  ['unpaid', 'Unpaid accumulations', 'money'],
  ['subsistence', 'Subsistence allowance rate and amount paid', 'text', false],
  [
    'receipt',
    'Employee receipt / bank transaction identity and date',
    'text',
    false,
  ],
  ['remarks', 'Remarks', 'text', false],
]);
const tnAttendance = [
  ...columns([
    ['serial', 'Serial number', 'number'],
    ['name', 'Name of employee'],
    ['employeeCode', 'Employee identification number'],
    ['workFrom', 'Time work commences'],
    ['restInterval', 'Rest interval — actual start and end times'],
    ['workTo', 'Time work ends'],
  ]),
  ...Array.from({ length: 31 }, (_, i) =>
    f(
      'day' + (i + 1) + 'Status',
      '7. Day ' + (i + 1) + '\nHours / code',
      'text',
      false,
    ),
  ),
  f('daysWorked', '8. Total days worked', 'number'),
  f('hoursWorked', '9. Total hours worked', 'number'),
  f('lopDays', '10. Days on loss of pay', 'number'),
  f(
    'nationalHolidayBenefit',
    '11. National holiday benefit (H / W/D / W/H / N/E or not applicable)',
  ),
  f(
    'festivalHolidayBenefit',
    '12. Festival holiday benefit (H / W/D / W/H / N/E or not applicable)',
  ),
  f('remarks', '13. Remarks', 'text', false),
];

export function expandedStateLayout(
  source: string,
  number: string,
): RegisterLayout | null {
  if (source === 'tn') return tamilNaduFactoryLayout(number);
  if (source === 'tns') {
    if (number === 'U') return table(tnEmployee);
    if (number === 'V')
      return table(tnAttendance, [...managers, ...period, ...holidays]);
    if (number === 'W')
      return table(tnWage, [
        ...managers,
        ...headcounts,
        ...period,
        f('allowanceNature', 'Nature of other allowances / explicitly none'),
        f(
          'deductionEvidence',
          'PF/ESI deduction amounts and supporting reference; the source labels columns 12–13 as numbers',
        ),
      ]);
    if (number === 'X') return table(tnLeave, managers);
  }
  if (source === 'kas' && number === 'T')
    return table(
      [
        ...columns([
          ['serial', 'Serial number', 'number'],
          ['name', 'Employee name and father / husband name'],
          ['sex', 'Male / female'],
          ['designation', 'Designation / department'],
          ['joiningDate', 'Date of joining', 'date'],
          ['esiNumber', 'ESI number', 'text', false],
          ['pfNumber', 'PF number', 'text', false],
          ['wageRate', 'Wages fixed including VDA', 'money'],
        ]),
        ...Array.from({ length: 31 }, (_, i) =>
          f(
            'day' + (i + 1) + 'Status',
            '9. Day ' + (i + 1) + '\nAttendance',
            'text',
            false,
          ),
        ),
        f('suspension', '9. Date of suspension, if any', 'date', false),
        f('payableDays', '10. Payable days', 'number'),
        f('otHours', '11. Total overtime hours', 'number'),
        ...columns([
          ['basic', 'Basic', 'money'],
          ['da', 'DA / VDA', 'money'],
          ['hra', 'HRA', 'money'],
          ['conveyance', 'Conveyance', 'money'],
          ['medical', 'Medical allowance', 'money'],
          ['attendanceBonus', 'Attendance bonus', 'money'],
          ['special', 'Special allowance', 'money'],
          ['overtime', 'OT', 'money'],
          ['holidayWages', 'NFH', 'money'],
          ['maternity', 'Maternity benefit', 'money'],
          ['otherEarnings', 'Other earnings', 'money'],
          ['subsistence', 'Subsistence allowance', 'money'],
          ['gross', 'Total earned wages', 'money'],
          ['esi', 'ESI', 'money'],
          ['pf', 'PF', 'money'],
          ['pt', 'PT', 'money'],
          ['tds', 'TDS', 'money'],
          ['society', 'Society', 'money'],
          ['insurance', 'Insurance', 'money'],
          ['advance', 'Salary advance', 'money'],
          ['fine', 'Fines', 'money'],
          ['damage', 'Damage / loss', 'money'],
          ['otherDeductions', 'Other deductions', 'money'],
          ['deductions', 'Total deductions', 'money'],
          ['net', 'Net payable', 'money'],
          ['paymentMode', 'Payment mode / cash / cheque number'],
          [
            'signature',
            'Employee signature / thumb impression reference',
            'text',
            false,
          ],
        ]).map((x, i) => ({
          ...x,
          label: i + 12 + '. ' + x.label.replace(/^\d+\. /, ''),
        })),
      ],
      [
        ...common,
        f(
          'attendanceLegend',
          'Attendance notation used; record actual daily evidence',
        ),
      ],
    );
  if (source === 'aps') {
    const employee: Array<[string, string, RegisterField['type']?, boolean?]> =
      [
        ['serial', 'Serial number', 'number'],
        ['name', 'Employee name'],
        ['relativeName', 'Father / husband name'],
      ];
    if (number === 'X')
      return table(
        columns([
          ...employee,
          ['offence', 'Act / omission for which fine imposed'],
          ['showCause', 'Whether cause shown and date'],
          ['wages', 'Total wages for the wage period', 'money'],
          ['fine', 'Amount of fine', 'money'],
          ['imposedDate', 'Date imposed', 'date'],
          ['realisedDate', 'Date realised', 'date', false],
          ['remarks', 'Remarks', 'text', false],
        ]),
      );
    if (number === 'XI')
      return table(
        columns([
          ...employee,
          ['damage', 'Damage or loss caused'],
          ['showCause', 'Whether cause shown and date'],
          ['deduction', 'Deduction imposed', 'money'],
          ['imposedDate', 'Date imposed', 'date'],
          ['instalments', 'Number of instalments', 'number'],
          ['realisedDate', 'Date total realised', 'date', false],
          ['remarks', 'Remarks', 'text', false],
        ]),
      );
    if (number === 'XII')
      return table(
        columns([
          ...employee,
          ['advance', 'Advance given', 'money'],
          ['advanceDate', 'Date advance given', 'date'],
          ['purpose', 'Purpose'],
          ['instalments', 'Number of instalments', 'number'],
          ['postponement', 'Postponement granted / none'],
          ['recoveredDate', 'Date total recovered', 'date', false],
          ['remarks', 'Remarks', 'text', false],
        ]),
      );
    if (number === 'XXIII')
      return table(
        columns([
          ['name', 'Employee name'],
          ['joiningDate', 'Date of appointment', 'date'],
          ['wageRate', 'Rate of wages', 'money'],
          ['normalWages', 'Normal wages earned', 'money'],
          ['overtime', 'Overtime wages', 'money'],
          ['gross', 'Gross wages payable', 'money'],
          ['deductionDetails', 'Deductions and reasons'],
          ['net', 'Actual wages paid', 'money'],
          ['paymentDate', 'Payment date', 'date', false],
          [
            'signature',
            'Employee signature / thumb impression reference',
            'text',
            false,
          ],
        ]),
        [...common, ...period],
      );
  }
  if (source === 'hrs') {
    if (number === 'D')
      return table(
        [
          f('name', 'Employee name'),
          f('relativeName', 'Father / husband name'),
          f('wageRate', 'Wages fixed', 'money'),
          f('arrears', 'Arrears from last month', 'money'),
          f('wagesDue', 'Wages due', 'money'),
          f('deductions', 'Deductions as shown in Form E', 'money'),
          f('advances', 'Advances made and dates'),
          f('net', 'Payments made', 'money'),
          f('signature', 'Employee signature reference', 'text', false),
          f('employerSignature', 'Employer signature reference', 'text', false),
          f('remarks', 'Remarks', 'text', false),
          f('ordinary', 'Wages earned during month — ordinary', 'money'),
          f('overtime', 'Wages earned during month — overtime', 'money'),
          f('gross', 'Total earned', 'money'),
          f('carried', 'Total carried over', 'money'),
          f('balance', 'Total balance', 'money'),
          f('stamp', 'Stamp reference', 'text', false),
        ],
        common,
        { individual: true, employeeRows: undefined },
      );
    if (number === 'E')
      return table(
        columns([
          ['serial', 'Serial number', 'number'],
          ['name', 'Employee name'],
          ['relativeName', 'Parentage'],
          ['wagePeriod', 'Wage period'],
          ['wages', 'Wages payable', 'money'],
          ['deducted', 'Amount deducted', 'money'],
          ['fault', 'Fault for which deductions made'],
          ['deductionDate', 'Date of deduction', 'date'],
          ['showCause', 'Whether employee showed cause against deduction'],
          ['utilisation', 'Amount and purpose for which utilised'],
          ['utilisationDate', 'Date of utilisation', 'date', false],
          ['balance', 'Balance with employer', 'money'],
          ['signature', 'Employee signature reference', 'text', false],
          ['employerSignature', 'Employer signature reference', 'text', false],
          ['remarks', 'Remarks', 'text', false],
        ]),
        [
          ...common,
          f('approvedActs', 'Acts and omissions approved by authorities'),
        ],
      );
    if (number === 'C')
      return table(
        [
          f('workDate', 'Date', 'date'),
          f('spreadFrom', 'Spread-over — from'),
          f('spreadTo', 'Spread-over — to'),
          f('spreadTotal', 'Spread-over — total hours', 'number'),
          f('restDate', 'Rest interval date', 'date'),
          f('restFrom', 'Rest and meals — from'),
          f('restTo', 'Rest and meals — to'),
          f('restTotal', 'Rest and meals — total hours', 'number'),
          f('workingHours', 'Total working hours', 'number'),
          f('otDate', 'Overtime date', 'date', false),
          f('otFrom', 'Overtime from', 'text', false),
          f('otTo', 'Overtime to', 'text', false),
          f('otHours', 'Overtime total hours', 'number'),
          f('leaveRemuneration', 'Leave remuneration due', 'money'),
          f('leaveDeduction', 'Leave deduction', 'money'),
          f('leaveApplication', 'Leave application date', 'date', false),
          f('leaveGrant', 'Leave grant date', 'date', false),
          f('employerSignature', 'Employer signature reference', 'text', false),
          f('signature', 'Employee signature reference', 'text', false),
          f('remarks', 'Remarks', 'text', false),
        ],
        [
          ...common,
          f('employeeName', 'Employee name'),
          f('relativeName', 'Father / husband name'),
          f('age', 'Age', 'number'),
          f('natureOfWork', 'Nature of work'),
          f(
            'employmentBasis',
            'Daily / monthly / contract / piece-rate employment and rate',
          ),
          f('joiningDate', 'Date of appointment', 'date'),
          f(
            'monthOvertime',
            'Total overtime employment hours during month',
            'number',
          ),
          f('monthLeave', 'Leave availed during month', 'number'),
        ],
      );
  }
  if (source === 'wbs') {
    if (number === 'J')
      return table(
        [
          f('name', 'Name of employee'),
          f('relativeName', "Father's name"),
          f('joiningDate', 'Date of appointment', 'date'),
          f(
            'leaveType',
            'Leave section: PRIVILEGE / SICK / CASUAL / MATERNITY',
          ),
          f('applicationDate', '1. Date of application', 'date'),
          f('appliedFrom', '2. Applied — from', 'date'),
          f('appliedTo', '2. Applied — to', 'date'),
          f('grantedFrom', '3. Leave granted — from', 'date', false),
          f('grantedTo', '3. Leave granted — to', 'date', false),
          f('balance', '4. Balance due', 'number'),
          f('refusedFrom', '5. Leave refused — from', 'date', false),
          f('refusedTo', '5. Leave refused — to', 'date', false),
          f('refusalReason', '5. Reasons for refusal', 'text', false),
          f('remarks', '6. Remarks', 'text', false),
          f(
            'signature',
            'Employer / shopkeeper signature reference',
            'text',
            false,
          ),
        ],
        common,
        { individual: true, employeeRows: undefined },
      );
    if (number === 'I')
      return table(
        columns([
          ['serial', 'Serial number', 'number'],
          ['name', 'Name of person employed'],
          ['workFrom', 'Employment commences'],
          ['restInterval', 'Rest interval — from and to'],
          ['workTo', 'Employment ceases'],
          ['hours', 'Hours worked excluding overtime', 'number'],
          ['signature', 'Employee signature reference', 'text', false],
        ]),
        [
          ...common,
          f('workDate', 'Date of daily register', 'date'),
          f('opening', 'Establishment opens at'),
          f('closing', 'Establishment closes at'),
        ],
      );
    if (number === 'M')
      return table(
        columns([
          ['name', 'Name of person employed'],
          ['wageRate', 'Rate of wages per month / week / day', 'money'],
          ['overtime', 'Additional overtime wages', 'money'],
          ['deductionDetails', 'Deductions and reasons'],
          ['net', 'Total paid as wages', 'money'],
          ['signature', 'Employee signature reference', 'text', false],
          ['remarks', 'Remarks / money-order payment details', 'text', false],
        ]),
        [
          ...common,
          ...period,
          f('paymentDate', 'Payment certification date', 'date'),
          f('certifiedPaid', 'Total amount certified paid', 'money'),
          f(
            'witnessOne',
            'First payment witness name and authentication reference',
          ),
          f(
            'witnessTwo',
            'Second payment witness name and authentication reference',
          ),
        ],
        {
          declaration:
            'Employer certification — authenticate after verification: I certify that on the payment date recorded below, in the presence of the witnesses recorded below, I paid the certified total in wages to the persons employed by me and each employee received the amount specified against their name. Employer signature: ____________________',
        },
      );
    if (number === 'U')
      return table(
        columns([
          ['serial', 'Serial number', 'number'],
          ['name', 'Name of person employed'],
          ['dates', 'Dates of overtime work'],
          ['dailyOvertime', 'Extent of overtime on each date'],
          ['otHours', 'Total overtime hours during month', 'number'],
        ]),
      );
    if (number === 'W')
      return table(
        columns([
          ['serial', 'Serial number', 'number'],
          ['name', 'Name of person employed'],
          ['relativeName', 'Father / husband name'],
          ['birthDate', 'Date of birth', 'date'],
          ['joiningDate', 'Date of appointment', 'date'],
          ['designation', 'Post / nature of job'],
          ['payScale', 'Scale of pay, if any', 'text', false],
          ['increment', 'Rate of increment', 'text', false],
          ['basic', 'Basic pay', 'money'],
          ['da', 'Dearness allowance', 'money'],
          ['allowances', 'Other allowances', 'money'],
          ['gross', 'Total wages per day / week / month', 'money'],
          ['remarks', 'Remarks', 'text', false],
          ['signature', 'Employee signature and date', 'text', false],
        ]),
        [...common, f('wageBasis', 'Mode of pay: daily / weekly / monthly')],
      );
  }
  return null;
}

export function tamilNaduFactoryLayout(number: string): RegisterLayout | null {
  const factoryExtra: Partial<RegisterLayout> = {
    establishmentRequirement: 'FACTORY',
  };
  if (number === '12') {
    const order = [
      0, 1, 2, 3, 4, 5, 8, 9, 12, 6, 7, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23,
    ];
    return table(
      order.map((k, i) => ({
        ...tnEmployee[k],
        label: i + 1 + '. ' + tnEmployee[k].label.replace(/^\d+\. /, ''),
      })),
      common,
      factoryExtra,
    );
  }
  const worker = f(
    'workerRegisterNumber',
    '2. Serial number in adult workers and young persons register',
  );
  const identity = [
    f('serial', '1. Serial number', 'number'),
    worker,
    f('name', '3. Worker name'),
    f('employeeCode', '4. Worker identity number'),
  ];
  if (number === '25')
    return table(
      [
        ...identity,
        f('workFrom', '5. Time work commences'),
        f('restInterval', '6. Rest interval'),
        f('workTo', '7. Time work ends'),
        f('shiftScheme', '8. Relay / scheme of shifts'),
        ...Array.from({ length: 31 }, (_, i) => [
          f(
            'day' + (i + 1) + 'Shift',
            '9. Day ' + (i + 1) + '\nShift',
            'text',
            false,
          ),
          f(
            'day' + (i + 1) + 'Status',
            '9. Day ' + (i + 1) + '\nHours / code',
            'text',
            false,
          ),
        ]).flat(),
        f('daysWorked', '10. Total days worked', 'number'),
        f('hoursWorked', '11. Total hours worked', 'number'),
        f('lopDays', '12. Days on loss of pay', 'number'),
        f('nationalHolidayBenefit', '13. Benefit for national holiday work'),
        f('festivalHolidayBenefit', '14. Benefit for festival holiday work'),
        f('remarks', '15. Remarks', 'text', false),
      ],
      [...common, ...period, ...holidays],
      factoryExtra,
    );
  if (number === '15') {
    const leave = [
      ...identity,
      ...tnLeave.slice(3).map((x, i) => ({
        ...x,
        key: x.key === 'remarks' ? 'leaveRemarks' : x.key,
        label: i + 5 + '. ' + x.label.replace(/^\d+\. /, ''),
      })),
    ];
    const wages = [
      ...identity,
      ...tnWage.slice(3).map((x, i) => ({
        ...x,
        key:
          x.key === 'pfReference'
            ? 'pf'
            : x.key === 'esiReference'
              ? 'esi'
              : x.key === 'remarks'
                ? 'wageRemarks'
                : x.key,
        type:
          x.key === 'pfReference' || x.key === 'esiReference'
            ? ('money' as const)
            : x.type,
        label:
          i +
          5 +
          '. ' +
          (x.key === 'pfReference'
            ? 'Provident Fund'
            : x.key === 'esiReference'
              ? 'Employees State Insurance'
              : x.key === 'leaveHolidayWages'
                ? 'Holiday wages (earned leave / national, festival and special holidays / other)'
                : x.label.replace(/^\d+\. /, '')),
      })),
    ];
    return table(
      [...leave, ...wages.slice(4)],
      [
        ...managers,
        ...headcounts,
        ...period,
        f('allowanceNature', 'Nature of other allowances / none'),
      ],
      {
        ...factoryExtra,
        tableParts: [
          {
            formNumber: '15 Part I',
            title: 'Leave and benefits',
            fields: leave,
          },
          {
            formNumber: '15 Part II',
            title: 'Wages and deductions',
            fields: wages,
          },
        ],
      },
    );
  }
  return null;
}
