export interface RegisterField {
  key: string;
  label: string;
  type: 'text' | 'money' | 'number' | 'date';
  required: boolean;
}
export interface RegisterLayout {
  baseFormNumber: 'I' | 'IV' | 'V' | 'IX' | 'LEAVE' | 'EVENT' | 'MATERNITY';
  fields: RegisterField[];
  attendanceMode?: 'STATUS';
  omitPrefillFields?: string[];
  periodKind?: 'ANNUAL';
  manualOnly?: boolean;
  establishmentRequirement?: 'FACTORY_OR_CONSTRUCTION';
  individual: boolean;
  payrollPrefill: boolean;
}

const field = (
  key: string,
  label: string,
  type: RegisterField['type'] = 'text',
  required = true,
): RegisterField => ({ key, label, type, required });

const employee = [
  'Employee Code',
  'Name',
  'Surname',
  'Gender',
  'Father/Mother/Spouse Name',
  'Date of Birth',
  'Place of Birth',
  'Nationality',
  'Education Level',
  'Date of Joining',
  'Designation',
  'Category (HS/S/SS/US)',
  'Type of Employment (P/T/FT/T/B)',
  'Details of Posting',
  'Pay',
  'Promotion',
  'Mobile Number',
  'Universal Account Number (UAN)',
  'PAN',
  'Nominee (as per nomination)',
  'Details of Family',
  'EPS/NPS',
  'ESIC IP No.',
  'Aadhaar No.',
  'Bank Account Number',
  'Bank',
  'Branch (IFSC)',
  'Present Address',
  'Permanent Address',
  'Service Book No.',
  'Date of Exit',
  'Reason for Exit',
  'Mark of Identification',
  'Photo reference',
  'Specimen signature/thumb impression reference',
  'Remarks',
].map((label, i) =>
  field(
    'employee_' + (i + 1),
    i + 1 + '. ' + label,
    'text',
    [0, 1, 3, 4, 5, 9, 10, 11, 12, 14, 27, 28].includes(i),
  ),
);

const slip = [
  field('name', '1. Name of employee'),
  field('relativeName', '2. Father/Mother/Spouse Name'),
  field('designation', '3. Designation'),
  field('uan', '4. UAN', 'text', false),
  field('bankAccount', '5. Bank Account Number'),
  field('wagePeriod', '6. Wage period'),
  field('basicRate', '7(a). Rate of wages — Basic', 'money'),
  field('daRate', '7(b). Rate of wages — DA', 'money'),
  field('allowanceRate', '7(c). Rate of wages — Allowances', 'money'),
  field('daysWorked', '8. Total attendance/unit of work', 'number'),
  field('overtime', '9. Overtime wages', 'money'),
  field('gross', '10. Gross wages payable', 'money'),
  field('deductions', '11. Total deductions', 'money'),
  field('pf', '11(a). PF', 'money'),
  field('esi', '11(b). ESI', 'money'),
  field('otherDeductions', '11(c). Others', 'money'),
  field('net', '12. Net wages paid', 'money'),
  field('signature', 'Employer / Pay-in-charge signature', 'text', false),
];

const wage = [
  field('serial', '1. Serial number', 'number'),
  field('employeeCode', '2. Employee register serial / Employee code'),
  field('name', '3. Name of employee'),
  field('designation', '4. Designation'),
  field('department', '5. Department'),
  field('frequency', '6. Duration of payment'),
  field('wagePeriod', '7. Wage period from–to'),
  field('daysWorked', '8. Days worked', 'number'),
  field('otHours', '9. Overtime hours/production', 'number'),
  field('basicRate', '10. Wage rate — Basic', 'money'),
  field('daRate', '11. Wage rate — DA', 'money'),
  field('allowanceRate', '12. Wage rate — Allowances', 'money'),
  field('basic', '13. Wages earned — Basic', 'money'),
  field('da', '14. Wages earned — DA', 'money'),
  field('allowances', '15. Wages earned — Allowances', 'money'),
  field('overtime', '16. Overtime', 'money'),
  field('gross', '17. Total wages earned', 'money'),
  field('pf', '18. EPF', 'money'),
  field('esi', '19. ESIC', 'money'),
  field('society', '20. Society', 'money'),
  field('incomeTax', '21. Income tax', 'money'),
  field('insurance', '22. Insurance', 'money'),
  field('advances', '23. Advances', 'money'),
  field('fineRecovery', '24. Recovery of fine', 'money'),
  field('damageRecovery', '25. Recovery for damages/losses', 'money'),
  field('otherDeductions', '26. Other deductions', 'money'),
  field('deductions', '27. Total deductions', 'money'),
  field('net', '28. Net payment', 'money'),
  field('paymentDate', '29. Date of payment', 'date'),
  field('receipt', '30. Employee receipt / bank transaction ID'),
  field('fineReason', '31. Act/omission and date of fine', 'text', false),
  field('fineImposed', '32. Fine imposed', 'money'),
  field('damageReason', '33. Damage/loss caused', 'text', false),
  field('signature', '34. Employer / representative signature', 'text', false),
];

// The Central Gazette repeats column 28 on the continuation page and prints
// total deductions before Others. Preserve those printed labels independently.
const centralWage = [
  ...wage.slice(0, 25),
  { ...wage[26], label: '26. Total deductions' },
  { ...wage[25], label: '27. Others' },
  wage[27],
  ...wage
    .slice(28)
    .map((f, i) => ({ ...f, label: f.label.replace(/^\d+\./, 28 + i + '.') })),
];

const attendance = [
  field('serial', '1. Serial number', 'number'),
  field('employeeCode', '2. Employee code'),
  field('name', '3. Name'),
  field('designation', '4. Designation'),
  field('shift', '5. Shift'),
  field('department', '6. Place of work / section / department'),
  ...Array.from({ length: 31 }, (_, i) => [
    field('day' + (i + 1) + 'In', '7. Day ' + (i + 1) + ' — In', 'text', false),
    field(
      'day' + (i + 1) + 'Out',
      '7. Day ' + (i + 1) + ' — Out',
      'text',
      false,
    ),
    field(
      'day' + (i + 1) + 'Signature',
      '7. Day ' + (i + 1) + ' — Signature',
      'text',
      false,
    ),
  ]).flat(),
  field('daysWorked', '8. Total days worked', 'number'),
  field('otHours', '9. Total overtime hours', 'number'),
  field('tour', '10. Tour / outside assignment', 'text', false),
  field('signature', '11. Register keeper signature', 'text', false),
];

export function registerLayout(
  sourceId: string,
  formNumber: string,
): RegisterLayout | null {
  if (sourceId === 'uposh' && formNumber === '16')
    return {
      baseFormNumber: 'EVENT',
      individual: true,
      payrollPrefill: false,
      fields: [
        field('serial', '1. Serial number', 'number'),
        field(
          'reportDate',
          '2. Date of Form 10/11 report to Inspector-cum-Facilitator and notice to insurance authorities',
          'date',
        ),
        field('noticeTime', '3. Time of report and notice'),
        field(
          'injuredName',
          '4. Name and address of injured person',
          'text',
          false,
        ),
        field('sex', '5. Sex', 'text', false),
        field('age', '6. Age', 'number', false),
        field('esiNumber', '7. Insurance number', 'text', false),
        field(
          'assignment',
          '8. Shift, department and occupation',
          'text',
          false,
        ),
        field('eventDate', '9. Date of injury/dangerous occurrence', 'date'),
        field('eventTime', '10. Time of injury/dangerous occurrence'),
        field('eventPlace', '11. Place of injury/dangerous occurrence'),
        field('eventCause', '12. Cause of injury/dangerous occurrence'),
        field('eventNature', '13. Nature of injury/dangerous occurrence'),
        field(
          'activity',
          '14. What the injured person was doing at the time of injury',
          'text',
          false,
        ),
        field(
          'notifier',
          '15. Notice giver: name, occupation, address and signature/thumb impression',
        ),
        field(
          'signature',
          '16. Signature and designation of person making entry',
          'text',
          false,
        ),
        field(
          'witnesses',
          '17. Names, addresses and occupations of two witnesses',
        ),
        field(
          'returnDate',
          '18. Date injured person returned to work',
          'date',
          false,
        ),
        field(
          'insuranceOffice',
          '19. State Insurance Local Office to which injured person is attached',
          'text',
          false,
        ),
        field('remarks', '20. Remarks', 'text', false),
      ],
    };
  if (sourceId === 'laosh') {
    if (formNumber === 'I' || formNumber === 'IV')
      return registerLayout('ldw', formNumber);
    if (formNumber === '19')
      return {
        baseFormNumber: 'LEAVE',
        individual: true,
        payrollPrefill: false,
        periodKind: 'ANNUAL',
        manualOnly: true,
        fields: [
          field('name', '1. Name of employee'),
          field(
            'workerRegisterNumber',
            '2. Number in Adult/Adolescent Register',
          ),
          field('joiningDate', '3. Date of joining', 'date'),
          field('wageRate', '4. Wage rate', 'money'),
          field(
            'exitDate',
            '5. Date of resignation/superannuation/dismissal/death etc.',
            'date',
            false,
          ),
          field(
            'totalWorkedDays',
            '6. Total days worked during calendar year',
            'number',
          ),
          ...[
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ].map((month, i) =>
            field(
              'workedMonth' + (i + 1),
              '6. ' + month + ' — days worked',
              'number',
            ),
          ),
          field('earnedLeave', '7. Leave earned during the year', 'number'),
          field(
            'openingLeave',
            '8. Balance of leave from previous year',
            'number',
          ),
          field(
            'availableLeave',
            '9. Total number at credit in the end of year',
            'number',
          ),
          field('usedLeave', '10. Leave enjoyed during the year', 'number'),
          field(
            'encashedLeave',
            '11. Leave encashed during the year',
            'number',
          ),
          field(
            'closingLeave',
            '12. Balance leave at the end of the year',
            'number',
          ),
          field('remarks', '13. Remarks', 'text', false),
        ],
      };
    if (formNumber === '18')
      return {
        baseFormNumber: 'EVENT',
        individual: true,
        payrollPrefill: false,
        fields: [
          field(
            'eventDate',
            '1. Date of accident or dangerous occurrence',
            'date',
          ),
          field(
            'reportDate',
            '2. Date of report to authorities',
            'date',
            false,
          ),
          field(
            'eventNature',
            '3. Description of accident or dangerous occurrence',
          ),
          field(
            'injuredName',
            '4. Details of injured/deceased person, if any',
            'text',
            false,
          ),
          field(
            'returnDate',
            '5. Date injured person returned to duty',
            'date',
            false,
          ),
          field(
            'lostManHours',
            '6. Total man-hours lost due to accident/dangerous occurrence',
            'number',
          ),
        ],
      };
    return null;
  }
  if (sourceId === 'arosh' || sourceId === 'gjosh') {
    if (
      (sourceId === 'arosh' && formNumber === 'VIII') ||
      (sourceId === 'gjosh' && formNumber === '13')
    ) {
      const layout = registerLayout('gjw', 'I')!;
      return {
        ...layout,
        fields: layout.fields.map((f) => ({
          ...f,
          label:
            f.key === 'attendanceSignature'
              ? '19. Attendance signature'
              : f.label,
        })),
      };
    }
    if (sourceId === 'arosh' && formNumber === 'XI')
      return registerLayout('aposh', 'X');
    if (sourceId === 'arosh' && formNumber === 'X') {
      const layout = registerLayout('brosh', 'X')!;
      const byKey = new Map(layout.fields.map((f) => [f.key, f]));
      return {
        ...layout,
        fields: [
          'eventDate',
          'injuredName',
          'reportDate',
          'eventNature',
          'returnDate',
          'absenceDays',
        ].map((key, i) => ({
          ...byKey.get(key)!,
          label: `${i + 1}. ${byKey.get(key)!.label.replace(/^\d+\. /, '')}`,
        })),
      };
    }
    if (sourceId === 'gjosh' && formNumber === '22')
      return {
        baseFormNumber: 'EVENT',
        individual: true,
        payrollPrefill: false,
        establishmentRequirement: 'FACTORY_OR_CONSTRUCTION',
        fields: [
          field('serial', '1. Serial number', 'number'),
          field('reportDate', '2. Date of notice', 'date'),
          field('noticeTime', '2. Time of notice'),
          field(
            'injuredName',
            '3. Name and serial number in adult/child workers register',
            'text',
            false,
          ),
          field('esiNumber', '4. ESIC insurance number', 'text', false),
          field('eventDate', '5. Date of injury/dangerous occurrence', 'date'),
          field('eventTime', '6. Time of injury/dangerous occurrence'),
          field('eventPlace', '7. Place'),
          field(
            'eventCause',
            '8. Cause of accident/major accident/dangerous occurrence',
          ),
          field('eventNature', '9. Nature of injury/dangerous occurrence'),
          field(
            'activity',
            '10. What the injured person was doing at that notice',
            'text',
            false,
          ),
          field('notifier', '11. Name of person giving notice'),
          field(
            'witnesses',
            '12. Names, addresses and occupations of two witnesses',
          ),
          field('returnDate', '13. Date of return to work', 'date', false),
          field(
            'absenceDays',
            '14. Days absent including holidays and off days',
            'number',
            false,
          ),
          field(
            'signature',
            '15. Signature and designation of person making entry',
            'text',
            false,
          ),
          field('entryDate', '15. Date of entry', 'date'),
        ],
      };
    return null;
  }
  if (sourceId === 'rjosh') {
    // Rajasthan S.O.23, PDF pp.186–191 and 198. Arabic form numbers are intentional.
    const matching = (
      {
        '16': 'VIII',
        '17': 'VIII(A)',
        '18': 'VIII(B)',
        '19': 'XI',
        '20': 'VIII(C)',
        '24': 'X',
      } as Record<string, string>
    )[formNumber];
    if (!matching) return null;
    const layout = registerLayout('brosh', matching)!;
    return {
      ...layout,
      fields: [
        ...(['16', '17'].includes(formNumber)
          ? [field('establishmentDistrict', 'Establishment district')]
          : []),
        ...layout.fields.map((f) => ({
          ...f,
          label:
            formNumber === '24' && f.key === 'injuredName'
              ? '1. Name of injured/deceased person (if any)'
              : f.label,
        })),
      ],
    };
  }
  if (sourceId === 'brosh') {
    // Bihar final Gazette 699, pp.381–384 and 388: verified common fields, distinct identities.
    if (formNumber === 'VIII(C)')
      return {
        baseFormNumber: 'V',
        individual: true,
        payrollPrefill: true,
        fields: slip
          .filter((f) => f.key !== 'signature')
          .map((f) => ({
            ...f,
            label: f.key === 'relativeName' ? '2. Father/Spouse Name' : f.label,
          })),
      };
    const matching = (
      {
        VIII: 'VIII',
        'VIII(A)': 'VIII(A)',
        'VIII(B)': 'IX',
        X: 'XI',
        XI: 'X',
      } as Record<string, string>
    )[formNumber];
    if (!matching) return null;
    const layout = registerLayout('aposh', matching)!;
    return {
      ...layout,
      fields: layout.fields.map((f) => ({
        ...f,
        label:
          formNumber === 'X' && f.key === 'injuredName'
            ? '1. Name of injured person (if any)'
            : f.label,
      })),
    };
  }
  if (sourceId === 'aposh') {
    // AP Gazette 432, 7 August 2026, pp.449–453. These are not Central form identities.
    if (formNumber === 'VIII') {
      const fields = registerLayout('osh', 'XIII')!.fields.map((f) => ({
        ...f,
      }));
      fields.splice(16, 0, field('ppfNumber', 'PPF No.', 'text', false));
      return {
        baseFormNumber: 'I',
        individual: true,
        payrollPrefill: false,
        fields: fields.map((f, i) => ({
          ...f,
          label: `${i + 1}. ${f.key === 'employee_5' ? 'Father/Spouse Name' : f.key === 'employee_15' ? 'Scale of Pay' : f.label.replace(/^\d+\. /, '')}`,
        })),
      };
    }
    if (formNumber === 'VIII(A)')
      return {
        baseFormNumber: 'IX',
        individual: false,
        payrollPrefill: false,
        fields: attendance
          .filter((f) => !/^day\d+Signature$/.test(f.key))
          .map((f) => ({ ...f })),
      };
    if (formNumber === 'IX')
      return {
        baseFormNumber: 'IV',
        individual: true,
        payrollPrefill: true,
        fields: [
          field('frequency', 'Wage period frequency'),
          field('wagePeriod', 'Wage period from–to'),
          field('serial', '1. Serial number', 'number'),
          field('employeeCode', '2. Employee code number'),
          field('name', '3. Name'),
          field('designation', '4. Designation'),
          field('basicRate', '5(a). Rate of wage — Basic', 'money'),
          field('daRate', '5(b). Rate of wage — DA', 'money'),
          field(
            'allowanceRate',
            '5(c). Rate of wage — Other allowance',
            'money',
          ),
          field('totalRate', '5(d). Total rate of wage', 'money'),
          field('daysWorked', '6. Number of days worked', 'number'),
          field('otHours', '7. Overtime hours worked', 'number'),
          field('basic', '8(a). Wages earned — Basic', 'money'),
          field('da', '8(b). Wages earned — DA', 'money'),
          field('allowances', '8(c). Wages earned — Other allowance', 'money'),
          field('overtime', '8(d). Payment of overtime', 'money'),
          field('gross', '8(e). Total wages earned', 'money'),
          field('pf', '9(a). EPF', 'money'),
          field('esi', '9(b). ESIC', 'money'),
          field('society', '9(c). Society', 'money'),
          field('incomeTax', '9(d). Income tax', 'money'),
          field('insurance', '9(e). Insurance', 'money'),
          field('otherDeductions', '9(f). Others', 'money'),
          field('fineRecovery', '9(g). Recovery of fine', 'money'),
          field('damageRecovery', '9(h). Recovery of damages/losses', 'money'),
          field('deductions', '9. Total deductions', 'money'),
          field('net', '10. Net payment', 'money'),
          field('receipt', '11. Receipt by employee / bank transaction ID'),
          field('paymentDate', '12. Date of payment', 'date'),
          field(
            'signature',
            '13. Initials of employer/representative',
            'text',
            false,
          ),
          field('remarks', '14. Remarks', 'text', false),
        ],
      };
    if (formNumber === 'X') {
      const layout = registerLayout('osh', 'XX')!;
      return {
        ...layout,
        fields: layout.fields
          .filter((f) => !['carryForward', 'signature'].includes(f.key))
          .map((f) => ({
            ...f,
            label: f.key === 'remarks' ? '15. Remarks' : f.label,
          })),
      };
    }
    if (formNumber === 'XI') {
      const layout = registerLayout('osh', 'XIX')!;
      return {
        ...layout,
        fields: layout.fields
          .filter((f) => f.key !== 'signature')
          .map((f) => ({ ...f })),
      };
    }
    return null;
  }
  if (sourceId === 'upss' && formNumber === 'XXXVI') {
    // UP Gazette 27 August 2026, p.167: establishment heading, serial 1, groups 2–19 and signature.
    const layout = registerLayout('apss', 'XX')!;
    return {
      ...layout,
      fields: [
        field('establishmentName', 'Name of establishment'),
        field('serial', '1. Serial number', 'number'),
        ...layout.fields
          .filter(
            (f) => !['establishmentName', 'inspectorRemarks'].includes(f.key),
          )
          .map((f) =>
            f.key === 'signature'
              ? { ...f, label: 'Employer authentication' }
              : { ...f },
          ),
      ],
    };
  }
  if (
    (sourceId === 'apss' && formNumber === 'XX') ||
    (sourceId === 'brss' && formNumber === 'XXI')
  ) {
    // AP Gazette 345 pp.73–74 and Bihar Gazette 697 p.106 prescribe 21 groups.
    // Neither schedule has the Central form's separate ESIC/EPFO particulars.
    const central = registerLayout('ss', 'XXII')!;
    return {
      ...central,
      fields: central.fields
        .filter((f) => !['esiNumber', 'pfNumber'].includes(f.key))
        .map((f) => ({
          ...f,
          label: f.label.replace(/^\d+/, (n) =>
            String(Number(n) > 5 ? Number(n) - 2 : Number(n)),
          ),
        })),
    };
  }
  if (sourceId === 'ss' && formNumber === 'XXII')
    return {
      baseFormNumber: 'MATERNITY',
      individual: true,
      payrollPrefill: false,
      fields: [
        field('establishmentName', '1. Name of establishment'),
        field('name', '2. Woman employee name and father/husband name'),
        field('appointmentDate', '3. Date of appointment', 'date'),
        field(
          'esiNumber',
          '4. ESIC insurance number, if covered',
          'text',
          false,
        ),
        field(
          'pfNumber',
          '5. EPFO registration number, if covered',
          'text',
          false,
        ),
        field('natureOfWork', '6. Nature of work'),
        field('employmentMonth', '7(a). Employment month (YYYY-MM)'),
        field('employedDays', '7(b). Days employed', 'number'),
        field('laidOffDays', '7(c). Days laid off', 'number'),
        field('notEmployedDays', '7(d). Days not employed', 'number'),
        field('employmentRemarks', '7(e). Employment dates and remarks'),
        field('noticeDate', '8. Notice under section 62', 'date', false),
        field('dischargeDate', '9. Discharge/dismissal date', 'date', false),
        field(
          'pregnancyProofDate',
          '10. Date pregnancy proof produced',
          'date',
          false,
        ),
        field('birthDate', '11. Date of birth of child', 'date', false),
        field(
          'eventProofDate',
          '12. Date proof produced: delivery/miscarriage/termination/tubectomy/death/adoption',
          'date',
          false,
        ),
        field(
          'illnessProofDate',
          '13. Date illness proof produced under section 65',
          'date',
          false,
        ),
        ...[
          ['advance', '14. Maternity benefit in advance of expected delivery'],
          ['subsequent', '15. Subsequent maternity benefit'],
          ['bonus', '16. Medical bonus under section 64'],
          ['section65Leave', '17. Leave wages under section 65(1)/(3)'],
          ['section65Illness', '18. Leave wages under section 65(2)'],
        ].flatMap(([key, label]) => [
          field(key + 'Date', label + ' — payment date', 'date', false),
          field(key + 'Amount', label + ' — amount paid', 'money', false),
        ]),
        field(
          'illnessLeavePeriod',
          '18. Period of leave granted under section 65(2)',
          'text',
          false,
        ),
        field(
          'nominee',
          '19. Person nominated under section 62',
          'text',
          false,
        ),
        field(
          'deathPayment',
          '20. If woman dies: death date, recipient, amount and payment date',
          'text',
          false,
        ),
        field(
          'survivingChildPayment',
          '21. If child survives: recipient on behalf of child and period paid',
          'text',
          false,
        ),
        field('signature', '22. Employer authentication', 'text', false),
        field(
          'inspectorRemarks',
          '23. Reserved for Inspector-cum-Facilitator',
          'text',
          false,
        ),
      ],
    };
  // Bihar and Ladakh print Others instead of a separate Advances column.
  if (sourceId === 'brw' || sourceId === 'ldw') {
    if (formNumber !== 'IV') return registerLayout('cw', formNumber);
    const columns = [
      ...wage.slice(0, 22),
      wage[25],
      wage[23],
      wage[24],
      ...wage.slice(26),
    ];
    return {
      ...registerLayout('cw', 'IV')!,
      fields: columns.map((f, i) => ({
        ...f,
        label: `${i + 1}. ${f.label.replace(/^\d+\. /, '')}`,
      })),
    };
  }
  if (sourceId === 'upw') {
    if (formNumber === 'IX') return registerLayout('rjw', 'VII');
    if (formNumber === 'I')
      return {
        ...registerLayout('cw', 'IV')!,
        fields: centralWage.slice(1).map((f, i) => ({
          ...f,
          label: `${i + 1}. ${f.label.replace(/^\d+\. /, '')}`,
        })),
      };
    if (formNumber === 'II')
      return {
        ...registerLayout('rjw', 'IV')!,
        fields: [
          ...registerLayout('rjw', 'IV')!.fields,
          ...[6, 13, 14, 15, 19, 20, 21].map((k, i) => ({
            ...employee[k],
            label: `${i + 31}. ${employee[k].label.replace(/^\d+\. /, '')}`,
          })),
        ],
      };
    return null;
  }
  if (sourceId === 'skw' || sourceId === 'arw') {
    const layout = registerLayout('gjw', formNumber);
    if (!layout || formNumber !== 'I') return layout;
    return {
      ...layout,
      fields: layout.fields.map((f) =>
        f.key === 'attendanceSignature'
          ? { ...f, label: '19. Attendance signature' }
          : sourceId === 'arw' && f.key === 'fineImposed'
            ? { ...f, label: '13. Fine imposed / realized' }
            : sourceId === 'arw' && f.key === 'deductions'
              ? { ...f, label: '15. Deduction / realization from wages' }
              : f,
      ),
    };
  }
  if (sourceId === 'gjw') {
    if (formNumber === 'IV') return registerLayout('rjw', 'IV');
    if (formNumber === 'V') return registerLayout('rjw', 'VII');
    if (formNumber === 'I') {
      const keys = [
        'employeeCode',
        'name',
        'designation',
        'frequency',
        'wagePeriod',
        'daysWorked',
        'otHours',
        'basicRate',
        'daRate',
        'allowanceRate',
        'overtime',
        'fineReason',
        'fineImposed',
        'damageReason',
        'deductions',
        'net',
        'paymentDate',
      ];
      return {
        baseFormNumber: 'IV',
        individual: false,
        payrollPrefill: true,
        omitPrefillFields: ['designation'],
        fields: [
          ...keys.map((key, i) => {
            const f = wage.find((f) => f.key === key)!;
            return {
              ...f,
              label: `${i + 1}. ${key === 'designation' ? 'Designation / Department' : f.label.replace(/^\d+\. /, '')}`,
            };
          }),
          field('attendanceDate', '18. Attendance date', 'date'),
          field(
            'attendanceSignature',
            '19. Attendance signature (not required for electronic maintenance)',
            'text',
            false,
          ),
        ],
      };
    }
    return null;
  }
  if (sourceId === 'rjw') {
    if (formNumber === 'VII')
      return {
        ...registerLayout('cw', 'V')!,
        fields: slip.map((f) =>
          f.key === 'relativeName'
            ? { ...f, label: "2. Father's / Spouse name" }
            : f,
        ),
      };
    if (formNumber === 'IV') {
      const keys = [
        0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 16, 17, 18, 22, 23, 24, 25, 26,
        27, 28, 29, 30, 31, 32, 33, 34, 35,
      ];
      return {
        baseFormNumber: 'I',
        individual: true,
        payrollPrefill: false,
        fields: [
          field('serial', '1. Serial number', 'number'),
          ...keys.map((k, i) => ({
            ...employee[k],
            label: `${i + 2}. ${k === 4 ? "Father's / Spouse name" : employee[k].label.replace(/^\d+\. /, '')}`,
          })),
        ],
      };
    }
    if (formNumber === 'I') {
      const keys = [
        'employeeCode',
        'name',
        'designation',
        'frequency',
        'wagePeriod',
        'daysWorked',
        'otHours',
        'basicRate',
        'daRate',
        'allowanceRate',
        'overtime',
        'gross',
        'pf',
        'esi',
        'otherDeductions',
        'fineImposed',
        'fineReason',
        'damageReason',
        'damageRecovery',
        'deductions',
        'net',
        'paymentDate',
        'receipt',
      ];
      return {
        baseFormNumber: 'IV',
        individual: false,
        payrollPrefill: true,
        omitPrefillFields: ['name', 'designation'],
        fields: [
          ...keys.map((key, i) => {
            const f = wage.find((f) => f.key === key)!;
            return {
              ...f,
              label: `${i + 1}. ${key === 'name' ? "Name with father/husband's name" : key === 'designation' ? 'Designation / Department' : f.label.replace(/^\d+\. /, '')}`,
            };
          }),
          field('signature', 'Employer signature', 'text', false),
        ],
      };
    }
    if (formNumber === 'V')
      return {
        baseFormNumber: 'IX',
        attendanceMode: 'STATUS',
        individual: true,
        payrollPrefill: false,
        fields: [
          field('serial', '1. Serial number', 'number'),
          field('name', '2. Name of workman'),
          field('relativeName', "3. Father/husband's name"),
          field('designation', '4. Designation / Department'),
          ...Array.from({ length: 31 }, (_, i) =>
            field(
              `day${i + 1}Status`,
              `5. Attendance — day ${i + 1}`,
              'text',
              false,
            ),
          ),
          field('daysWorked', '6. Total days present', 'number'),
          field('restDays', '7. Rest days', 'number'),
          field('leaveDays', '8. Leave days', 'number'),
          field('paidDays', '9. Total days for which payment made', 'number'),
          field('otDates', '10. Dates of overtime'),
          field('otDetails', '11. Hours of overtime by date'),
          field('otHours', '12. Total overtime hours', 'number'),
          field('signature', 'Employer signature', 'text', false),
        ],
      };
    return null;
  }
  if (sourceId === 'osh' && formNumber === 'XIX')
    return {
      baseFormNumber: 'EVENT',
      individual: true,
      payrollPrefill: false,
      fields: [
        field(
          'injuredName',
          '1. Name of injured/deceased person (if any)',
          'text',
          false,
        ),
        field(
          'eventDate',
          '2. Date of accident or dangerous occurrence',
          'date',
        ),
        field(
          'reportDate',
          '3. Date reported to Inspector-cum-Facilitator',
          'date',
          false,
        ),
        field('eventNature', '4. Nature of accident or dangerous occurrence'),
        field('returnDate', '5. Date of return to work', 'date', false),
        field('absenceDays', '6. Days absent from work', 'number', false),
        field(
          'signature',
          '7. Employer/representative signature',
          'text',
          false,
        ),
      ],
    };
  if (sourceId === 'osh' && formNumber === 'XX')
    return {
      baseFormNumber: 'LEAVE',
      individual: true,
      payrollPrefill: false,
      fields: [
        field('part', 'Part I Adults / Part II Adolescents'),
        field('name', 'Name of worker'),
        field('department', 'Department'),
        field('relativeName', 'Father’s name'),
        field('serial', '1. Serial number', 'number'),
        field('employeeCode', 'Employee code (reference)'),
        field('workerRegisterSerial', '2. Serial number in workers register'),
        field('joiningDate', '3. Date of entry into service', 'date'),
        field('sickness', '4. Sickness and accidents — interruptions'),
        field('authorisedLeave', '5. Authorised leave — interruptions'),
        field('lockout', '6. Lockout or legal strike — interruptions'),
        field('unemployment', '7. Involuntary unemployment — interruptions'),
        field('otherInterruptions', '8. Other interruptions'),
        field('leaveDueFrom', '9. Leave due with effect from', 'date'),
        field(
          'leaveNotDesired',
          '10. Whether leave not desired during next 12 months',
        ),
        field(
          'leaveAllowedFrom',
          '11. Date from which leave allowed',
          'date',
          false,
        ),
        field('leaveWages', '12. Wages for leave paid', 'money'),
        field('dischargeDate', '13. Date of discharge', 'date', false),
        field(
          'inLieuPayment',
          '14. Date and amount paid in lieu of leave due',
          'text',
          false,
        ),
        field('carryForward', '15. Accumulated carry-forward leave', 'number'),
        field('remarks', '16. Remarks', 'text', false),
        field(
          'signature',
          'Employer/register keeper/representative signature',
          'text',
          false,
        ),
      ],
    };
  if (sourceId === 'osh') {
    const base = (
      { XIII: 'I', XIV: 'IX', XV: 'IV', XVI: 'V' } as Record<string, string>
    )[formNumber];
    if (!base) return null;
    const layout = registerLayout('cw', base)!;
    if (base === 'I') {
      const order = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 21, 20, 13,
        14, 15, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
      ];
      return {
        ...layout,
        fields: order.map((index, i) => ({
          ...employee[index],
          label: i + 1 + '. ' + employee[index].label.replace(/^\d+\. /, ''),
        })),
      };
    }
    if (base === 'IV')
      return {
        ...layout,
        fields: centralWage.map((f, i) => ({
          ...f,
          label: i + 1 + '. ' + f.label.replace(/^\d+\. /, ''),
        })),
      };
    if (base === 'IX')
      return {
        ...layout,
        fields: attendance.filter((f) => !/^day\d+Signature$/.test(f.key)),
      };
    return layout;
  }
  if (sourceId !== 'cw' && sourceId !== 'apw') return null;
  switch (formNumber) {
    case 'I':
      return {
        baseFormNumber: 'I',
        fields: employee,
        individual: true,
        payrollPrefill: false,
      };
    case 'IV':
      return {
        baseFormNumber: 'IV',
        fields: sourceId === 'cw' ? centralWage : wage,
        individual: false,
        payrollPrefill: true,
      };
    case 'V':
      return {
        baseFormNumber: 'V',
        fields: slip,
        individual: true,
        payrollPrefill: true,
      };
    case 'IX':
      return {
        baseFormNumber: 'IX',
        fields: attendance,
        individual: true,
        payrollPrefill: false,
      };
    default:
      return null;
  }
}
