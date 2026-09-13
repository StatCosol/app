export interface RegisterField {
  key: string;
  label: string;
  type: 'text' | 'money' | 'number' | 'date';
  required: boolean;
}
export interface RegisterLayout {
  baseFormNumber: 'I' | 'IV' | 'V' | 'IX';
  fields: RegisterField[];
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
