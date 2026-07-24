export const SERVICE_MODULE_CODES = [
  'CONTRACTOR_AUDIT',
  'CONTRACTOR_PORTAL',
  'CONTRACTOR_DOCUMENTS',
  'CONTRACTOR_ATTENDANCE',
  'CONTRACTOR_FACE_ATTENDANCE',
  'PAYROLL',
  'EMPLOYEE_COMPLIANCE',
  'EMPLOYEE_ATTENDANCE',
  'MOBILE_ATTENDANCE',
  'APPRAISAL',
] as const;

export type ServiceModuleCode = (typeof SERVICE_MODULE_CODES)[number];

export const FULL_SERVICE_PACKAGE = 'FULL_SERVICE';
export const CUSTOM_SERVICES_PACKAGE = 'CUSTOM_SERVICES';
export const CONTRACTOR_AUDIT_ONLY_PACKAGE = 'CONTRACTOR_AUDIT_ONLY';

export const PACKAGE_MODULES: Record<string, ServiceModuleCode[]> = {
  [FULL_SERVICE_PACKAGE]: [...SERVICE_MODULE_CODES],
  [CUSTOM_SERVICES_PACKAGE]: [],
  [CONTRACTOR_AUDIT_ONLY_PACKAGE]: [
    'CONTRACTOR_AUDIT',
    'CONTRACTOR_PORTAL',
    'CONTRACTOR_DOCUMENTS',
    'CONTRACTOR_ATTENDANCE',
    'CONTRACTOR_FACE_ATTENDANCE',
  ],
};

export const SERVICE_PACKAGE_OPTIONS = [
  {
    code: FULL_SERVICE_PACKAGE,
    label: 'Full Service',
    description:
      'All employee, contractor, payroll, attendance, and appraisal services.',
    modules: PACKAGE_MODULES[FULL_SERVICE_PACKAGE],
  },
  {
    code: CUSTOM_SERVICES_PACKAGE,
    label: 'Custom Services',
    description: 'Select only the services approved for this client.',
    modules: PACKAGE_MODULES[CUSTOM_SERVICES_PACKAGE],
    allowCustomModules: true,
  },
  {
    code: CONTRACTOR_AUDIT_ONLY_PACKAGE,
    label: 'Contractor Audit Only',
    description: 'Contractor audit workspace with contractor portal support.',
    modules: PACKAGE_MODULES[CONTRACTOR_AUDIT_ONLY_PACKAGE],
  },
];

export const SERVICE_MODULE_OPTIONS: Array<{
  code: ServiceModuleCode;
  label: string;
  description: string;
}> = [
  {
    code: 'EMPLOYEE_COMPLIANCE',
    label: 'Client Compliance',
    description:
      'Employee statutory compliance, branches, registrations, returns, notices, and approvals.',
  },
  {
    code: 'EMPLOYEE_ATTENDANCE',
    label: 'Employee Attendance',
    description:
      'Employee attendance review and biometric attendance features.',
  },
  {
    code: 'MOBILE_ATTENDANCE',
    label: 'ESS Mobile Attendance',
    description:
      'Employee face attendance from personal phones, including ESS enrollment and review.',
  },
  {
    code: 'CONTRACTOR_DOCUMENTS',
    label: 'Contractor Documents',
    description:
      'Contractor document upload, review, dashboards, and document reports.',
  },
  {
    code: 'CONTRACTOR_AUDIT',
    label: 'Contractor Audit',
    description:
      'Contractor audits, audit observations, audit KPIs, and non-compliance tracking.',
  },
  {
    code: 'CONTRACTOR_PORTAL',
    label: 'Contractor Portal',
    description:
      'Contractor login workspace for assigned tasks, audits, documents, and employees.',
  },
  {
    code: 'CONTRACTOR_ATTENDANCE',
    label: 'Contractor Attendance',
    description:
      'Contractor attendance punches, review, and attendance reports.',
  },
  {
    code: 'CONTRACTOR_FACE_ATTENDANCE',
    label: 'Kiosk Attendance (PIN + Face)',
    description:
      'Shared FaceDesk kiosks using employee code and PIN followed by face verification.',
  },
  {
    code: 'PAYROLL',
    label: 'Payroll',
    description:
      'Payroll processing, salary structures, registers, and payslips.',
  },
  {
    code: 'APPRAISAL',
    label: 'Appraisal',
    description:
      'Performance appraisal cycles, templates, reviews, and approvals.',
  },
];
