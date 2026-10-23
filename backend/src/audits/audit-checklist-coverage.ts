import type { AuditChecklistEntry } from './audit-checklist-templates';

// Operational prompts; determine applicability using current site/period criteria.
// Source notes: docs/reviews/2026-10-23/audit-checklist-coverage.md.
export const COMMON_AUDIT_CHECKS: AuditChecklistEntry[] = [
  [
    'Scope: Confirm activities, locations, workforce categories and review period',
    'AUDIT_SCOPE',
    'DOCUMENT',
  ],
  [
    'Applicability: Record current central/state rules, licence conditions, thresholds and justified exclusions',
    'AX_APPLICABILITY',
    'DOCUMENT',
  ],
  [
    'Sampling: Select representative shifts, workers, transactions and high-risk activities; record coverage',
    'AX_SAMPLE_PLAN',
    'DOCUMENT',
  ],
  [
    'Follow-up: Verify closure evidence and effectiveness of previous audit or inspection findings',
    'PREVIOUS_FINDINGS',
    'DOCUMENT',
  ],
  [
    'Evidence: Check dates, site identity, completeness, approvals and traceability of sampled records',
    'AX_EVIDENCE_INTEGRITY',
    'DOCUMENT',
  ],
];

export const AUDIT_CHECKLIST_COVERAGE: Record<string, AuditChecklistEntry[]> = {
  FACTORY: [
    [
      'Approvals: Match authorised capacity, processes, workforce and premises to actual operations',
      'AX_FACTORY_LICENCE_SCOPE',
      'DOCUMENT',
    ],
    [
      'Governance: Track statutory inspection notices, directions, owners and closure evidence',
      'AX_FACTORY_INSPECTIONS',
      'DOCUMENT',
    ],
    [
      'Governance: Verify responsible manager appointments and safety responsibilities',
      'AX_FACTORY_RESPONSIBILITY',
      'DOCUMENT',
    ],
    [
      'Risk: Review task and process risk assessments after changes and incidents',
      'AX_FACTORY_RISK_REVIEW',
      'DOCUMENT',
    ],
    [
      'Machinery: Observe guards, interlocks and emergency stops on sampled equipment',
      'AX_FACTORY_GUARDS',
      'SITE_INSPECTION',
    ],
    [
      'Maintenance: Verify lockout, isolation and stored-energy controls',
      'AX_FACTORY_ISOLATION',
      'SITE_INSPECTION',
    ],
    [
      'Lifting: Check examinations, safe working loads and operator competence',
      'AX_FACTORY_LIFTING_TESTS',
      'DOCUMENT',
    ],
    [
      'Lifting: Inspect hooks, slings, exclusion zones and displayed load limits',
      'AX_FACTORY_LIFTING_CONDITION',
      'SITE_INSPECTION',
    ],
    [
      'Pressure systems: Check examination certificates and relief-device tests',
      'AX_FACTORY_PRESSURE_SYSTEMS',
      'DOCUMENT',
    ],
    [
      'Chemicals: Inspect labels, segregation, containment and access to safety data sheets',
      'AX_FACTORY_CHEMICALS',
      'SITE_INSPECTION',
    ],
    [
      'Permits: Sample hot-work, confined-space and height permits and rescue arrangements',
      'AX_FACTORY_WORK_PERMITS',
      'DOCUMENT',
    ],
    [
      'Emergency: Walk exits, escape routes and assembly areas; verify access and signage',
      'AX_FACTORY_FIRE_ROUTES',
      'SITE_INSPECTION',
    ],
    [
      'Emergency: Review drill participation, response gaps and corrective actions',
      'AX_FACTORY_DRILLS',
      'DOCUMENT',
    ],
    [
      'Electrical: Review inspection, earthing and protective-device test records',
      'AX_FACTORY_ELECTRICAL_TESTS',
      'DOCUMENT',
    ],
    [
      'Electrical: Inspect exposed wiring, panel access and temporary supplies',
      'AX_FACTORY_ELECTRICAL_CONDITION',
      'SITE_INSPECTION',
    ],
    [
      'Health: Review noise, dust, fumes and heat exposure measurements and controls',
      'AX_FACTORY_EXPOSURE',
      'DOCUMENT',
    ],
    [
      'Health: Check risk-based surveillance and fitness restrictions with confidential access',
      'AX_FACTORY_MEDICAL_SURVEILLANCE',
      'DOCUMENT',
    ],
    [
      'Welfare: Inspect water, toilets, washing, rest areas and accessibility',
      'AX_FACTORY_WELFARE',
      'SITE_INSPECTION',
    ],
    [
      'Environment: Check lighting, ventilation and local extraction at workstations',
      'AX_FACTORY_VENTILATION',
      'SITE_INSPECTION',
    ],
    [
      'Movement: Observe pedestrian segregation, loading and vehicle routes',
      'AX_FACTORY_TRAFFIC',
      'SITE_INSPECTION',
    ],
    [
      'Contractors: Sample induction, competency and supervision of outsourced work',
      'AX_FACTORY_CONTRACTORS',
      'DOCUMENT',
    ],
    [
      'Workforce: Reconcile schedules, rest, overtime approvals and attendance',
      'AX_FACTORY_HOURS',
      'DOCUMENT',
    ],
    [
      'Environment: Inspect waste segregation, containment and authorised disposal arrangements',
      'AX_FACTORY_WASTE',
      'SITE_INSPECTION',
    ],
    [
      'Changes: Verify safety review before process, layout or equipment changes',
      'AX_FACTORY_CHANGE_CONTROL',
      'DOCUMENT',
    ],
  ],
  SHOPS_ESTABLISHMENT: [
    [
      'Registration: Match site, activity and workforce against applicable registrations',
      'AX_SHOPS_ESTABLISHMENT_SCOPE',
      'DOCUMENT',
    ],
    [
      'Notices: Check applicable registration, working-hour, wage and grievance displays',
      'AX_SHOPS_ESTABLISHMENT_NOTICES',
      'SITE_INSPECTION',
    ],
    [
      'Employment: Sample appointment terms and acknowledged service conditions',
      'AX_SHOPS_ESTABLISHMENT_APPOINTMENTS',
      'DOCUMENT',
    ],
    [
      'Employment: Verify age checks and restrictions on young persons',
      'AX_SHOPS_ESTABLISHMENT_AGE',
      'DOCUMENT',
    ],
    [
      'Hours: Reconcile shifts, opening/closing times and attendance against applicable limits',
      'AX_SHOPS_ESTABLISHMENT_HOURS',
      'DOCUMENT',
    ],
    [
      'Hours: Check rest intervals, weekly holidays and compensatory-off records',
      'AX_SHOPS_ESTABLISHMENT_REST',
      'DOCUMENT',
    ],
    [
      'Pay: Verify overtime approvals, recorded hours and payment basis',
      'AX_SHOPS_ESTABLISHMENT_OVERTIME',
      'DOCUMENT',
    ],
    [
      'Pay: Match skill, zone and effective period to the applicable wage notification',
      'AX_SHOPS_ESTABLISHMENT_MINIMUM_WAGE',
      'DOCUMENT',
    ],
    [
      'Pay: Reconcile registers, payslips and traceable wage payments',
      'AX_SHOPS_ESTABLISHMENT_PAYMENTS',
      'DOCUMENT',
    ],
    [
      'Pay: Sample deductions for authorised basis, limits and worker communication',
      'AX_SHOPS_ESTABLISHMENT_DEDUCTIONS',
      'DOCUMENT',
    ],
    [
      'Benefits: Reconcile eligible employees to applicable enrolment and remittances',
      'AX_SHOPS_ESTABLISHMENT_SOCIAL_SECURITY',
      'DOCUMENT',
    ],
    [
      'Leave: Check accrual, use, carry-forward and encashment',
      'AX_SHOPS_ESTABLISHMENT_LEAVE',
      'DOCUMENT',
    ],
    [
      'Benefits: Check maternity, gratuity and other applicable claims and settlements',
      'AX_SHOPS_ESTABLISHMENT_BENEFITS',
      'DOCUMENT',
    ],
    [
      'Holidays: Verify notified holidays and applicable holiday-work compensation',
      'AX_SHOPS_ESTABLISHMENT_HOLIDAYS',
      'DOCUMENT',
    ],
    [
      'Shifts: Verify applicable consent and safety arrangements for women working at night',
      'AX_SHOPS_ESTABLISHMENT_NIGHT_WORK',
      'DOCUMENT',
    ],
    [
      'Dignity: Check complaint mechanism, awareness and confidential case handling',
      'AX_SHOPS_ESTABLISHMENT_DIGNITY',
      'DOCUMENT',
    ],
    [
      'Separation: Sample final wages, benefits and settlement records',
      'AX_SHOPS_ESTABLISHMENT_EXIT',
      'DOCUMENT',
    ],
    [
      'Welfare: Inspect drinking water, sanitation, ventilation and lighting',
      'AX_SHOPS_ESTABLISHMENT_WELFARE',
      'SITE_INSPECTION',
    ],
    [
      'Emergency: Check clear exits, escape signs and firefighting access',
      'AX_SHOPS_ESTABLISHMENT_FIRE',
      'SITE_INSPECTION',
    ],
    [
      'Safety: Inspect sockets, cables, panels and unsafe temporary connections',
      'AX_SHOPS_ESTABLISHMENT_ELECTRICAL',
      'SITE_INSPECTION',
    ],
    [
      'Workstations: Observe seating, manual handling and repetitive tasks',
      'AX_SHOPS_ESTABLISHMENT_ERGONOMICS',
      'SITE_INSPECTION',
    ],
    [
      'Emergency: Check first-aid facilities and accessible contacts',
      'AX_SHOPS_ESTABLISHMENT_FIRST_AID',
      'SITE_INSPECTION',
    ],
    [
      'Outsourcing: Review security/housekeeping deployment and statutory-payment evidence',
      'AX_SHOPS_ESTABLISHMENT_CONTRACTORS',
      'DOCUMENT',
    ],
    [
      'Worker feedback: Sample confidential interviews on wages, hours and grievance access',
      'AX_SHOPS_ESTABLISHMENT_INTERVIEWS',
      'DOCUMENT',
    ],
  ],
  CONTRACTOR: [
    [
      'Contract: Verify work order, location, period, scope and compliance responsibilities',
      'AX_CONTRACTOR_AGREEMENT',
      'DOCUMENT',
    ],
    [
      'Approvals: Verify applicable principal-employer registration and licence linkage',
      'AX_CONTRACTOR_PRINCIPAL_EMPLOYER',
      'DOCUMENT',
    ],
    [
      'Licence: Compare validity, work scope and authorised headcount with deployment',
      'AX_CONTRACTOR_LICENCE_SCOPE',
      'DOCUMENT',
    ],
    [
      'Deployment: Reconcile gate access, worker roster, attendance and billed manpower',
      'AX_CONTRACTOR_ROSTER',
      'DOCUMENT',
    ],
    [
      'Deployment: Check joining, transfer and exit dates against site records',
      'AX_CONTRACTOR_MOVEMENTS',
      'DOCUMENT',
    ],
    [
      'Workers: Sample identity and age verification with restricted access',
      'AX_CONTRACTOR_IDENTITY',
      'DOCUMENT',
    ],
    [
      'Wages: Verify applicable skill, zone and period-specific minimum wages',
      'AX_CONTRACTOR_MINIMUM_WAGES',
      'DOCUMENT',
    ],
    [
      'Wages: Reconcile attendance, payable days, overtime, registers and bank evidence',
      'AX_CONTRACTOR_RECONCILIATION',
      'DOCUMENT',
    ],
    [
      'Wages: Check payment dates, failed transfers and follow-up independent of bill release',
      'AX_CONTRACTOR_PAYMENT_DATES',
      'DOCUMENT',
    ],
    [
      'Overtime: Recompute sampled hours and payments against applicable requirements',
      'AX_CONTRACTOR_OVERTIME',
      'DOCUMENT',
    ],
    [
      'PF: Reconcile worker identifiers and wages to ECR member rows and paid challans',
      'AX_CONTRACTOR_PF_MEMBERS',
      'DOCUMENT',
    ],
    [
      'ESI: Reconcile eligible workers and wages to paid contribution records',
      'AX_CONTRACTOR_ESI_MEMBERS',
      'DOCUMENT',
    ],
    [
      'Coverage: Verify evidence supporting benefit or social-security exclusions',
      'AX_CONTRACTOR_EXCLUSIONS',
      'DOCUMENT',
    ],
    [
      'Benefits: Check applicable bonus eligibility, computation and disbursement',
      'AX_CONTRACTOR_BONUS',
      'DOCUMENT',
    ],
    [
      'Benefits: Verify leave, holiday and separation payments for sampled workers',
      'AX_CONTRACTOR_LEAVE',
      'DOCUMENT',
    ],
    [
      'Workers: Check applicable migrant-worker records, entitlements and support',
      'AX_CONTRACTOR_MIGRANTS',
      'DOCUMENT',
    ],
    [
      'Subcontracting: Verify approvals, worker visibility and responsibilities at each tier',
      'AX_CONTRACTOR_SUBCONTRACTS',
      'DOCUMENT',
    ],
    [
      'Competency: Verify induction, task training and authorised supervision',
      'AX_CONTRACTOR_INDUCTION',
      'DOCUMENT',
    ],
    [
      'Site: Observe task-appropriate PPE availability, condition and use',
      'AX_CONTRACTOR_PPE',
      'SITE_INSPECTION',
    ],
    [
      'Hazardous work: Sample permit authorisation, controls and closure',
      'AX_CONTRACTOR_PERMITS',
      'DOCUMENT',
    ],
    [
      'Site: Inspect drinking water, toilets, rest areas and provided accommodation',
      'AX_CONTRACTOR_WELFARE',
      'SITE_INSPECTION',
    ],
    [
      'Incidents: Check reporting, investigation and applicable insurance or benefit coverage',
      'AX_CONTRACTOR_INCIDENTS',
      'DOCUMENT',
    ],
    [
      'Worker feedback: Confirm wage receipt and grievance access through confidential samples',
      'AX_CONTRACTOR_FEEDBACK',
      'DOCUMENT',
    ],
    [
      'Oversight: Verify principal-employer compliance checks, exceptions and corrective follow-up',
      'AX_CONTRACTOR_OVERSIGHT',
      'DOCUMENT',
    ],
  ],
  LABOUR_EMPLOYMENT: [
    [
      'Employment: Sample appointment terms and classification against actual duties',
      'AX_LABOUR_EMPLOYMENT_TERMS',
      'DOCUMENT',
    ],
    [
      'Coverage: Identify permanent, fixed-term, casual, contract, trainee and migrant workers',
      'AX_LABOUR_EMPLOYMENT_CATEGORIES',
      'DOCUMENT',
    ],
    [
      'Employment: Verify age records and applicable restrictions on young workers',
      'AX_LABOUR_EMPLOYMENT_AGE',
      'DOCUMENT',
    ],
    [
      'Wages: Map skill, zone and effective notification to payroll samples',
      'AX_LABOUR_EMPLOYMENT_WAGE_NOTIFICATION',
      'DOCUMENT',
    ],
    [
      'Wages: Review pay components and statutory wage-base treatment for the period',
      'AX_LABOUR_EMPLOYMENT_WAGE_BASE',
      'DOCUMENT',
    ],
    [
      'Wages: Verify payment dates, payslips and unpaid-wage resolution',
      'AX_LABOUR_EMPLOYMENT_PAYMENT',
      'DOCUMENT',
    ],
    [
      'Wages: Review authorisation and limits for fines, advances and deductions',
      'AX_LABOUR_EMPLOYMENT_DEDUCTIONS',
      'DOCUMENT',
    ],
    [
      'Hours: Reconcile overtime approvals, attendance and payments',
      'AX_LABOUR_EMPLOYMENT_OVERTIME',
      'DOCUMENT',
    ],
    [
      'Hours: Check shift duration, rest intervals, weekly rest and compensatory leave',
      'AX_LABOUR_EMPLOYMENT_REST',
      'DOCUMENT',
    ],
    [
      'Benefits: Reconcile eligible workers to PF/ESI enrolment, returns and paid contributions',
      'AX_LABOUR_EMPLOYMENT_SOCIAL_SECURITY',
      'DOCUMENT',
    ],
    [
      'Benefits: Verify applicable bonus eligibility, calculations and payment',
      'AX_LABOUR_EMPLOYMENT_BONUS',
      'DOCUMENT',
    ],
    [
      'Benefits: Sample leave accrual, use, carry-forward and encashment',
      'AX_LABOUR_EMPLOYMENT_LEAVE',
      'DOCUMENT',
    ],
    [
      'Benefits: Review maternity eligibility, paid benefits and employment protection',
      'AX_LABOUR_EMPLOYMENT_MATERNITY',
      'DOCUMENT',
    ],
    [
      'Benefits: Recompute sampled gratuity and review nominations and settlement',
      'AX_LABOUR_EMPLOYMENT_GRATUITY',
      'DOCUMENT',
    ],
    [
      'Equality: Compare pay and conditions for comparable work and review exceptions',
      'AX_LABOUR_EMPLOYMENT_EQUALITY',
      'DOCUMENT',
    ],
    [
      'Worker protection: Check recruitment fees, deposits, document retention and freedom to leave',
      'AX_LABOUR_EMPLOYMENT_FORCED_LABOUR',
      'DOCUMENT',
    ],
    [
      'Migration: Verify applicable information, travel and welfare arrangements',
      'AX_LABOUR_EMPLOYMENT_MIGRANTS',
      'DOCUMENT',
    ],
    [
      'Night work: Verify applicable consent, transport and safety controls for women',
      'AX_LABOUR_EMPLOYMENT_NIGHT_WORK',
      'DOCUMENT',
    ],
    [
      'Worker voice: Review grievance access, escalation and non-retaliation',
      'AX_LABOUR_EMPLOYMENT_GRIEVANCES',
      'DOCUMENT',
    ],
    [
      'Industrial relations: Check applicable consultation and worker-representation arrangements',
      'AX_LABOUR_EMPLOYMENT_REPRESENTATION',
      'DOCUMENT',
    ],
    [
      'Industrial relations: Sample enquiry records and consistency with service rules',
      'AX_LABOUR_EMPLOYMENT_DISCIPLINE',
      'DOCUMENT',
    ],
    [
      'Separation: Review applicable notice, settlement, retrenchment and closure requirements',
      'AX_LABOUR_EMPLOYMENT_TERMINATION',
      'DOCUMENT',
    ],
    [
      'Site: Observe welfare facilities, notices and worker access to support',
      'AX_LABOUR_EMPLOYMENT_WELFARE',
      'SITE_INSPECTION',
    ],
    [
      'Outsourcing: Review principal-employer oversight of contractor wages and benefits',
      'AX_LABOUR_EMPLOYMENT_CONTRACTORS',
      'DOCUMENT',
    ],
  ],
  FSSAI: [
    [
      'Licence: Match premises, food categories, activity and capacity to current authorisation',
      'AX_FSSAI_LICENCE_SCOPE',
      'DOCUMENT',
    ],
    [
      'Food safety: Verify a documented hazard-based plan for the actual operation',
      'AX_FSSAI_FSMS',
      'DOCUMENT',
    ],
    [
      'Process: Review critical limits, monitoring, deviations and corrective actions',
      'AX_FSSAI_CRITICAL_CONTROLS',
      'DOCUMENT',
    ],
    [
      'Suppliers: Check approval criteria and traceable procurement from appropriate sources',
      'AX_FSSAI_SUPPLIERS',
      'DOCUMENT',
    ],
    [
      'Receiving: Observe food condition checks, packaging and rejection segregation',
      'AX_FSSAI_RECEIVING',
      'SITE_INSPECTION',
    ],
    [
      'Traceability: Trace ingredients and finished batches through supplier and dispatch records',
      'AX_FSSAI_TRACEABILITY',
      'DOCUMENT',
    ],
    [
      'Recall: Review responsibilities, contacts, mock recall and recovery evidence',
      'AX_FSSAI_RECALL',
      'DOCUMENT',
    ],
    [
      'Allergens: Inspect segregation, utensils and controls against unintended allergen transfer',
      'AX_FSSAI_ALLERGENS',
      'SITE_INSPECTION',
    ],
    [
      'Hygiene: Observe separation of raw/cooked food, personnel and waste',
      'AX_FSSAI_CONTAMINATION',
      'SITE_INSPECTION',
    ],
    [
      'People: Observe handwashing, protective clothing and food-handler practices',
      'AX_FSSAI_PERSONAL_HYGIENE',
      'SITE_INSPECTION',
    ],
    [
      'People: Check illness reporting, exclusion from handling and return-to-work controls',
      'AX_FSSAI_ILLNESS',
      'DOCUMENT',
    ],
    [
      'Sanitation: Verify cleaning schedules, chemicals, verification and corrective records',
      'AX_FSSAI_CLEANING',
      'DOCUMENT',
    ],
    [
      'Facilities: Inspect entry points, screens, bait locations and infestation signs',
      'AX_FSSAI_PEST_EXCLUSION',
      'SITE_INSPECTION',
    ],
    [
      'Water: Verify potable water/ice source, relevant testing and adverse-result actions',
      'AX_FSSAI_WATER',
      'DOCUMENT',
    ],
    [
      'Equipment: Check calibration and suitability of monitoring instruments',
      'AX_FSSAI_CALIBRATION',
      'DOCUMENT',
    ],
    [
      'Process: Review cooking, cooling, reheating and holding controls relevant to the food',
      'AX_FSSAI_THERMAL_PROCESS',
      'DOCUMENT',
    ],
    [
      'Storage: Observe cold storage and loading against specified conditions',
      'AX_FSSAI_COLD_CHAIN',
      'SITE_INSPECTION',
    ],
    [
      'Stock: Check expiry/use-by controls, rotation and isolation of expired food',
      'AX_FSSAI_ROTATION',
      'SITE_INSPECTION',
    ],
    [
      'Packaging: Verify food-contact suitability and supplier compliance evidence',
      'AX_FSSAI_PACKAGING',
      'DOCUMENT',
    ],
    [
      'Labelling: Check applicable ingredient, allergen, date, lot and consumer declarations',
      'AX_FSSAI_LABELLING',
      'DOCUMENT',
    ],
    [
      'Facilities: Inspect waste removal, drains, sewage separation and cleaning access',
      'AX_FSSAI_WASTE',
      'SITE_INSPECTION',
    ],
    [
      'Equipment: Inspect food-contact surfaces and maintenance contamination risks',
      'AX_FSSAI_MAINTENANCE',
      'SITE_INSPECTION',
    ],
    [
      'Competency: Verify role-specific food-handler training and supervision',
      'AX_FSSAI_TRAINING',
      'DOCUMENT',
    ],
    [
      'Feedback: Review food complaints, suspected illness and corrective-action effectiveness',
      'AX_FSSAI_COMPLAINTS',
      'DOCUMENT',
    ],
  ],
  PAYROLL: [
    [
      'Master data: Sample employee, salary and bank-detail changes for independent approval',
      'AX_PAYROLL_MASTER_CHANGES',
      'DOCUMENT',
    ],
    [
      'Population: Reconcile payroll with HR, joiner/leaver and active-worker records',
      'AX_PAYROLL_HEADCOUNT',
      'DOCUMENT',
    ],
    [
      'Population: Investigate duplicate identities, bank accounts and inactive workers receiving pay',
      'AX_PAYROLL_DUPLICATES',
      'DOCUMENT',
    ],
    [
      'Inputs: Trace payable days to approved attendance source records',
      'AX_PAYROLL_ATTENDANCE',
      'DOCUMENT',
    ],
    [
      'Inputs: Reconcile leave, loss of pay and attendance corrections',
      'AX_PAYROLL_LEAVE_LOP',
      'DOCUMENT',
    ],
    [
      'Earnings: Recompute approved overtime and applicable payment basis',
      'AX_PAYROLL_OVERTIME',
      'DOCUMENT',
    ],
    [
      'Earnings: Check applicable minimum wages by skill, location and effective period',
      'AX_PAYROLL_WAGE_FLOOR',
      'DOCUMENT',
    ],
    [
      'Statutory base: Verify pay-component inclusion/exclusion for applicable contributions',
      'AX_PAYROLL_STATUTORY_BASE',
      'DOCUMENT',
    ],
    [
      'Earnings: Reconcile retrospective revisions and arrears to approvals and earlier payroll',
      'AX_PAYROLL_ARREARS',
      'DOCUMENT',
    ],
    [
      'Earnings: Validate incentives, reimbursements and one-off payments',
      'AX_PAYROLL_VARIABLE_PAY',
      'DOCUMENT',
    ],
    [
      'Deductions: Review authorisation, recoveries, applicable limits and balances',
      'AX_PAYROLL_DEDUCTIONS',
      'DOCUMENT',
    ],
    [
      'PF: Match member-level payroll wages/contributions to ECR and paid challans',
      'AX_PAYROLL_PF_MATCH',
      'DOCUMENT',
    ],
    [
      'ESI: Match employee coverage and wages to contribution records and payments',
      'AX_PAYROLL_ESI_MATCH',
      'DOCUMENT',
    ],
    [
      'State deductions: Verify applicable professional tax and labour-welfare fund treatment',
      'AX_PAYROLL_STATE_LEVIES',
      'DOCUMENT',
    ],
    [
      'Tax: Reconcile deductions, deposits, returns and employee certificates',
      'AX_PAYROLL_TAX_MATCH',
      'DOCUMENT',
    ],
    [
      'Payslips: Compare earnings, deductions and net pay with approved payroll and bank output',
      'AX_PAYROLL_PAYSLIPS',
      'DOCUMENT',
    ],
    [
      'Payments: Reconcile bank acceptance, rejected transfers, reissues and unpaid wages',
      'AX_PAYROLL_BANK_REJECTIONS',
      'DOCUMENT',
    ],
    [
      'Payments: Check separate preparation, approval and payment-release responsibilities',
      'AX_PAYROLL_SEGREGATION',
      'DOCUMENT',
    ],
    [
      'Accounting: Reconcile payroll, liabilities and clearing to the general ledger',
      'AX_PAYROLL_LEDGER',
      'DOCUMENT',
    ],
    [
      'Review: Investigate unusual month-on-month changes and manual overrides',
      'AX_PAYROLL_VARIANCES',
      'DOCUMENT',
    ],
    [
      'Separation: Recompute final wages, notice adjustments, leave and applicable benefits',
      'AX_PAYROLL_FINAL_PAY',
      'DOCUMENT',
    ],
    [
      'Systems: Review payroll permissions, privileged roles and leaver access removal',
      'AX_PAYROLL_ACCESS',
      'DOCUMENT',
    ],
    [
      'Systems: Verify change logs and locked-period adjustment approvals',
      'AX_PAYROLL_AUDIT_TRAIL',
      'DOCUMENT',
    ],
    [
      'Continuity: Review secure retention, restricted sharing, backup and recovery tests',
      'AX_PAYROLL_RECOVERY',
      'DOCUMENT',
    ],
  ],
  HR: [
    [
      'Planning: Review sanctioned roles, reporting lines and approved workforce changes',
      'AX_HR_WORKFORCE_PLAN',
      'DOCUMENT',
    ],
    [
      'Recruitment: Sample requisitions, selection criteria and hiring approvals',
      'AX_HR_REQUISITIONS',
      'DOCUMENT',
    ],
    [
      'Recruitment: Check consistent selection, candidate consent and prohibited recruitment fees',
      'AX_HR_FAIR_RECRUITMENT',
      'DOCUMENT',
    ],
    [
      'Records: Sample complete personnel files with valid sources and restricted access',
      'AX_HR_PERSONNEL_FILES',
      'DOCUMENT',
    ],
    [
      'Employment: Verify employee, intern, apprentice and contractor classification against actual work',
      'AX_HR_CLASSIFICATION',
      'DOCUMENT',
    ],
    [
      'Internships: Check agreements, period, learning objectives, mentor and stipend terms',
      'AX_HR_INTERNS',
      'DOCUMENT',
    ],
    [
      'Employment: Review probation, confirmation and contract-renewal decisions',
      'AX_HR_CONFIRMATION',
      'DOCUMENT',
    ],
    [
      'Onboarding: Check policy, emergency and role-specific induction',
      'AX_HR_INDUCTION',
      'DOCUMENT',
    ],
    [
      'Competency: Map job risks and required qualifications to current records',
      'AX_HR_COMPETENCY',
      'DOCUMENT',
    ],
    [
      'Learning: Check training effectiveness and closure of skill gaps',
      'AX_HR_TRAINING_EFFECT',
      'DOCUMENT',
    ],
    [
      'Attendance: Review schedules, overtime, leave and authorised corrections',
      'AX_HR_HOURS',
      'DOCUMENT',
    ],
    [
      'Rewards: Reconcile approved pay and applicable benefits with payroll',
      'AX_HR_PAY_BENEFITS',
      'DOCUMENT',
    ],
    [
      'Welfare: Review applicable maternity benefits and return-to-work arrangements',
      'AX_HR_MATERNITY',
      'DOCUMENT',
    ],
    [
      'Dignity: Verify applicable committee, awareness and confidential complaint handling',
      'AX_HR_DIGNITY',
      'DOCUMENT',
    ],
    [
      'Worker voice: Sample complaint timelines, escalation and non-retaliation controls',
      'AX_HR_GRIEVANCES',
      'DOCUMENT',
    ],
    [
      'Performance: Review communicated criteria, calibration and acknowledgement',
      'AX_HR_PERFORMANCE',
      'DOCUMENT',
    ],
    [
      'Conduct: Sample enquiries, approvals and consistency with employment terms',
      'AX_HR_DISCIPLINE',
      'DOCUMENT',
    ],
    [
      'Continuity: Verify critical-role cover and handover plans',
      'AX_HR_SUCCESSION',
      'DOCUMENT',
    ],
    [
      'Separation: Check final settlement, benefits, documents and access removal',
      'AX_HR_SEPARATION',
      'DOCUMENT',
    ],
    [
      'Privacy: Review purpose, access, retention and disposal of employee records',
      'AX_HR_PRIVACY',
      'DOCUMENT',
    ],
    [
      'Workplace: Inspect welfare amenities and accessibility for the workforce',
      'AX_HR_WELFARE',
      'SITE_INSPECTION',
    ],
    [
      'Communication: Check worker access to policies, complaint channels and emergency contacts',
      'AX_HR_COMMUNICATION',
      'SITE_INSPECTION',
    ],
    [
      'Worker feedback: Sample confidential interviews about terms and treatment',
      'AX_HR_FEEDBACK',
      'DOCUMENT',
    ],
    [
      'Monitoring: Review attrition, absence and complaint patterns requiring action',
      'AX_HR_METRICS',
      'DOCUMENT',
    ],
  ],
  GAP: [
    [
      'Criteria: Map each agreed requirement to a control owner and evidence source',
      'AX_GAP_CRITERIA',
      'DOCUMENT',
    ],
    [
      'Processes: Confirm inputs, outputs, interfaces and outsourced activities',
      'AX_GAP_BOUNDARIES',
      'DOCUMENT',
    ],
    [
      'Controls: Assess whether documented controls address identified risks',
      'AX_GAP_DESIGN',
      'DOCUMENT',
    ],
    [
      'Controls: Test operation across the period, not policy existence alone',
      'AX_GAP_OPERATION',
      'DOCUMENT',
    ],
    [
      'Priorities: Rate gaps using agreed consequence and likelihood criteria',
      'AX_GAP_PRIORITIES',
      'DOCUMENT',
    ],
    [
      'Requirements: Reconcile licences, obligations and commitments to the control register',
      'AX_GAP_OBLIGATIONS',
      'DOCUMENT',
    ],
    [
      'Documents: Check approval, version history and obsolete-procedure withdrawal',
      'AX_GAP_VERSIONS',
      'DOCUMENT',
    ],
    [
      'People: Verify ownership, delegated authority and segregation of duties',
      'AX_GAP_RESPONSIBILITY',
      'DOCUMENT',
    ],
    [
      'People: Assess training and competency gaps for critical responsibilities',
      'AX_GAP_COMPETENCY',
      'DOCUMENT',
    ],
    [
      'Information: Test accuracy, completeness and timeliness of key records',
      'AX_GAP_DATA_QUALITY',
      'DOCUMENT',
    ],
    [
      'Systems: Review access approvals, privileged roles and recertification',
      'AX_GAP_ACCESS',
      'DOCUMENT',
    ],
    [
      'Changes: Sample approvals, testing, communication and rollback plans',
      'AX_GAP_CHANGE',
      'DOCUMENT',
    ],
    [
      'Vendors: Review due diligence, service criteria and issue escalation',
      'AX_GAP_VENDORS',
      'DOCUMENT',
    ],
    [
      'Performance: Verify objectives, meaningful measures and reporting reliability',
      'AX_GAP_METRICS',
      'DOCUMENT',
    ],
    [
      'Feedback: Analyse complaints, rework and failures for systemic gaps',
      'AX_GAP_FEEDBACK',
      'DOCUMENT',
    ],
    [
      'Incidents: Evaluate escalation, response ownership and lessons learned',
      'AX_GAP_INCIDENTS',
      'DOCUMENT',
    ],
    [
      'Continuity: Review critical dependencies and evidence of recovery exercises',
      'AX_GAP_CONTINUITY',
      'DOCUMENT',
    ],
    [
      'Remediation: Verify owners, resources and due dates for each accepted gap',
      'AX_GAP_ACTION_OWNERS',
      'DOCUMENT',
    ],
    [
      'Remediation: Retest closed actions and prevention of recurrence',
      'AX_GAP_EFFECTIVENESS',
      'DOCUMENT',
    ],
    [
      'Exceptions: Check approval, compensating controls and expiry of deviations',
      'AX_GAP_EXCEPTIONS',
      'DOCUMENT',
    ],
    [
      'Governance: Verify overdue/high-risk reporting and management decisions',
      'AX_GAP_ESCALATION',
      'DOCUMENT',
    ],
    [
      'Walkthrough: Compare actual operating practice with agreed controls',
      'AX_GAP_WALKTHROUGH',
      'SITE_INSPECTION',
    ],
    [
      'Interviews: Check process-owner understanding of controls and escalation',
      'AX_GAP_INTERVIEWS',
      'DOCUMENT',
    ],
    [
      'Closeout: Record residual exposure, evidence limits and follow-up commitments',
      'AX_GAP_RESIDUAL_RISK',
      'DOCUMENT',
    ],
  ],
  SAFETY: [
    [
      'Governance: Verify applicable safety requirements, inspections and responsible owners',
      'AX_SAFETY_REQUIREMENTS',
      'DOCUMENT',
    ],
    [
      'People: Review worker consultation, safety committee actions and escalation',
      'AX_SAFETY_CONSULTATION',
      'DOCUMENT',
    ],
    [
      'Competency: Check task authorisation, qualifications and refresher training',
      'AX_SAFETY_COMPETENCY',
      'DOCUMENT',
    ],
    [
      'Communication: Review task briefings, contractor induction and hazard awareness',
      'AX_SAFETY_BRIEFINGS',
      'DOCUMENT',
    ],
    [
      'Height: Inspect platforms, edge protection, harness anchorage and rescue readiness',
      'AX_SAFETY_HEIGHT',
      'SITE_INSPECTION',
    ],
    [
      'Access: Inspect ladders and scaffolds for condition and inspection status',
      'AX_SAFETY_ACCESS',
      'SITE_INSPECTION',
    ],
    [
      'Confined spaces: Check isolation, testing, attendant and rescue provisions',
      'AX_SAFETY_CONFINED_SPACE',
      'DOCUMENT',
    ],
    [
      'Hot work: Verify fire-watch, combustible clearance and permit controls',
      'AX_SAFETY_HOT_WORK',
      'SITE_INSPECTION',
    ],
    [
      'Excavation: Check shoring, access, edge and underground-service controls where relevant',
      'AX_SAFETY_EXCAVATION',
      'SITE_INSPECTION',
    ],
    [
      'Lifting: Observe exclusion zones, load limits, equipment condition and lift plans',
      'AX_SAFETY_LIFTING',
      'SITE_INSPECTION',
    ],
    [
      'Isolation: Verify lockout, test-for-dead and stored-energy controls',
      'AX_SAFETY_LOCKOUT',
      'SITE_INSPECTION',
    ],
    [
      'Chemicals: Check labels, segregation, containment and spill-response supplies',
      'AX_SAFETY_CHEMICALS',
      'SITE_INSPECTION',
    ],
    [
      'Gases: Inspect cylinder restraint, identification, separation and leak controls',
      'AX_SAFETY_GAS_CYLINDERS',
      'SITE_INSPECTION',
    ],
    [
      'Vehicles: Observe pedestrian separation, reversing and loading-zone controls',
      'AX_SAFETY_TRAFFIC',
      'SITE_INSPECTION',
    ],
    [
      'Ergonomics: Observe lifting loads, posture and repetitive-task risk controls',
      'AX_SAFETY_ERGONOMICS',
      'SITE_INSPECTION',
    ],
    [
      'Health: Check noise, dust, fumes and heat assessment and control effectiveness',
      'AX_SAFETY_EXPOSURE',
      'DOCUMENT',
    ],
    [
      'Health: Verify risk-based surveillance and action on adverse findings',
      'AX_SAFETY_SURVEILLANCE',
      'DOCUMENT',
    ],
    [
      'Fire: Review alarm, detection and suppression tests and maintenance exceptions',
      'AX_SAFETY_FIRE_TESTS',
      'DOCUMENT',
    ],
    [
      'Emergency: Review drills, headcount, assistance needs and resulting actions',
      'AX_SAFETY_DRILLS',
      'DOCUMENT',
    ],
    [
      'Emergency: Inspect rescue, eyewash and emergency-shower readiness where needed',
      'AX_SAFETY_RESCUE',
      'SITE_INSPECTION',
    ],
    [
      'Learning: Sample incident and near-miss investigations for root cause and action effectiveness',
      'AX_SAFETY_ROOT_CAUSE',
      'DOCUMENT',
    ],
    [
      'Outsourcing: Verify contractor risk assessment, coordination and supervision',
      'AX_SAFETY_CONTRACTORS',
      'DOCUMENT',
    ],
    [
      'Changes: Review safety approval before plant, process or layout changes',
      'AX_SAFETY_CHANGE',
      'DOCUMENT',
    ],
    [
      'Follow-up: Revisit unsafe conditions and verify controls remain effective',
      'AX_SAFETY_FOLLOW_UP',
      'SITE_INSPECTION',
    ],
  ],
  TRANSPORT: [
    [
      'Fleet: Match class, route, use and load capacity to applicable permits',
      'AX_TRANSPORT_PERMIT_SCOPE',
      'DOCUMENT',
    ],
    [
      'Drivers: Verify licence class, validity and identity against duty assignments',
      'AX_TRANSPORT_DRIVER_ID',
      'DOCUMENT',
    ],
    [
      'Drivers: Review fitness, fatigue management and applicable medical checks',
      'AX_TRANSPORT_FITNESS',
      'DOCUMENT',
    ],
    [
      'Duty: Reconcile trips, rest breaks and rosters against applicable limits',
      'AX_TRANSPORT_HOURS',
      'DOCUMENT',
    ],
    [
      'Vehicle: Observe checks of tyres, brakes, lights, mirrors and restraints',
      'AX_TRANSPORT_PRETRIP',
      'SITE_INSPECTION',
    ],
    [
      'Maintenance: Trace defects to repairs and return-to-service checks',
      'AX_TRANSPORT_DEFECTS',
      'DOCUMENT',
    ],
    [
      'Maintenance: Review mileage/time-based servicing and overdue work',
      'AX_TRANSPORT_SERVICING',
      'DOCUMENT',
    ],
    [
      'Driving: Review speed/telematics exceptions and corrective actions where monitored',
      'AX_TRANSPORT_SPEED',
      'DOCUMENT',
    ],
    [
      'Passengers: Inspect restraints, seating condition and capacity controls',
      'AX_TRANSPORT_SEATBELTS',
      'SITE_INSPECTION',
    ],
    [
      'Passengers: Observe safe boarding, alighting and pickup/drop arrangements',
      'AX_TRANSPORT_BOARDING',
      'SITE_INSPECTION',
    ],
    [
      'Employee transport: Check applicable night-travel safeguards and escalation',
      'AX_TRANSPORT_NIGHT_TRAVEL',
      'DOCUMENT',
    ],
    [
      'Freight: Compare weight/dimensions with vehicle and route limits',
      'AX_TRANSPORT_LOAD_LIMITS',
      'DOCUMENT',
    ],
    [
      'Freight: Inspect load restraint, stability and distribution before dispatch',
      'AX_TRANSPORT_LOAD_RESTRAINT',
      'SITE_INSPECTION',
    ],
    [
      'Special cargo: Check dangerous-goods records, trained crew and emergency instructions',
      'AX_TRANSPORT_DANGEROUS_GOODS',
      'DOCUMENT',
    ],
    [
      'Special cargo: Verify hygiene and temperature records for sensitive loads',
      'AX_TRANSPORT_COLD_CHAIN',
      'DOCUMENT',
    ],
    [
      'Journeys: Review route risks, weather disruption and safe stopping plans',
      'AX_TRANSPORT_ROUTES',
      'DOCUMENT',
    ],
    [
      'Traceability: Reconcile consignment, dispatch, delivery and vehicle records',
      'AX_TRANSPORT_DISPATCH',
      'DOCUMENT',
    ],
    [
      'Emergency: Check first aid, fire extinguisher and warning equipment',
      'AX_TRANSPORT_EMERGENCY_KIT',
      'SITE_INSPECTION',
    ],
    [
      'Response: Review breakdown assistance, contacts and escalation arrangements',
      'AX_TRANSPORT_BREAKDOWN',
      'DOCUMENT',
    ],
    [
      'Incidents: Check investigations, insurance notifications and corrective actions',
      'AX_TRANSPORT_ACCIDENTS',
      'DOCUMENT',
    ],
    [
      'Vendors: Verify outsourced vehicles and drivers meet agreed controls',
      'AX_TRANSPORT_VENDORS',
      'DOCUMENT',
    ],
    [
      'Operations: Review fuel, mileage and trip exceptions for unauthorised use',
      'AX_TRANSPORT_FUEL',
      'DOCUMENT',
    ],
    [
      'Yard: Inspect parking, reversing, pedestrian routes and vehicle securing',
      'AX_TRANSPORT_YARD',
      'SITE_INSPECTION',
    ],
    [
      'Information: Review access, retention and sharing of passenger/location data',
      'AX_TRANSPORT_PRIVACY',
      'DOCUMENT',
    ],
  ],
  WAREHOUSE: [
    [
      'Planning: Compare capacity, commodity classes and approved layout with use',
      'AX_WAREHOUSE_CAPACITY',
      'DOCUMENT',
    ],
    [
      'Racks: Check load limits, anchoring and damage isolation',
      'AX_WAREHOUSE_RACK_LIMITS',
      'SITE_INSPECTION',
    ],
    [
      'Storage: Observe stack stability, pallet condition and clearance from services',
      'AX_WAREHOUSE_STACKING',
      'SITE_INSPECTION',
    ],
    [
      'Access: Inspect mezzanines, stairs, edges and access ladders',
      'AX_WAREHOUSE_MEZZANINE',
      'SITE_INSPECTION',
    ],
    [
      'Movement: Check clear aisles, markings and emergency access',
      'AX_WAREHOUSE_AISLES',
      'SITE_INSPECTION',
    ],
    [
      'Vehicles: Observe forklift/pedestrian segregation and crossings',
      'AX_WAREHOUSE_FORKLIFT_ROUTES',
      'SITE_INSPECTION',
    ],
    [
      'Equipment: Verify servicing, defect closure and operator authorisation',
      'AX_WAREHOUSE_FORKLIFT_SERVICE',
      'DOCUMENT',
    ],
    [
      'Charging: Inspect ventilation, ignition control and spill/eyewash arrangements',
      'AX_WAREHOUSE_CHARGING',
      'SITE_INSPECTION',
    ],
    [
      'Loading: Check dock edges, levellers, vehicle restraint and fall controls',
      'AX_WAREHOUSE_DOCKS',
      'SITE_INSPECTION',
    ],
    [
      'Handling: Observe lifting aids, loads and manual-handling practices',
      'AX_WAREHOUSE_MANUAL_HANDLING',
      'SITE_INSPECTION',
    ],
    [
      'Receiving: Reconcile quantities, condition checks and quarantine decisions',
      'AX_WAREHOUSE_RECEIVING',
      'DOCUMENT',
    ],
    [
      'Inventory: Sample counts, adjustments and approved discrepancies',
      'AX_WAREHOUSE_INVENTORY',
      'DOCUMENT',
    ],
    [
      'Traceability: Trace batch movement through receipt, storage and dispatch',
      'AX_WAREHOUSE_TRACEABILITY',
      'DOCUMENT',
    ],
    [
      'Stock: Inspect expiry rotation, obsolete stock and rejected-goods segregation',
      'AX_WAREHOUSE_EXPIRY',
      'SITE_INSPECTION',
    ],
    [
      'Compatibility: Check incompatible chemicals, hazardous goods and food separation',
      'AX_WAREHOUSE_SEGREGATION',
      'SITE_INSPECTION',
    ],
    [
      'Containment: Inspect spill controls, drains and emergency supplies',
      'AX_WAREHOUSE_SPILLS',
      'SITE_INSPECTION',
    ],
    [
      'Conditions: Review monitoring, calibration and temperature/humidity excursions where needed',
      'AX_WAREHOUSE_CONDITIONS',
      'DOCUMENT',
    ],
    [
      'Cold storage: Check internal escape, alarms and worker protection where applicable',
      'AX_WAREHOUSE_COLDROOM_ESCAPE',
      'SITE_INSPECTION',
    ],
    [
      'Fire: Review system tests, inspections and impairment controls',
      'AX_WAREHOUSE_FIRE_TESTS',
      'DOCUMENT',
    ],
    [
      'Emergency: Review evacuation drills, shift coverage and actions',
      'AX_WAREHOUSE_DRILLS',
      'DOCUMENT',
    ],
    [
      'Security: Review permissions, keys, visitors and incident escalation',
      'AX_WAREHOUSE_ACCESS_CONTROL',
      'DOCUMENT',
    ],
    [
      'Housekeeping: Inspect waste accumulation, obstructions and sanitation',
      'AX_WAREHOUSE_WASTE',
      'SITE_INSPECTION',
    ],
    [
      'Continuity: Review power loss, flooding, stock damage and system-outage response',
      'AX_WAREHOUSE_CONTINUITY',
      'DOCUMENT',
    ],
    [
      'Workers: Review temporary-labour induction, PPE, supervision and competence',
      'AX_WAREHOUSE_TEMP_WORKERS',
      'DOCUMENT',
    ],
  ],
  E_MARKETING: [
    [
      'Scope: Inventory websites, apps, marketplaces and social accounts with owners',
      'AX_E_MARKETING_ASSETS',
      'DOCUMENT',
    ],
    [
      'Approvals: Verify campaign spend, audience and publication approvals',
      'AX_E_MARKETING_AUTHORITY',
      'DOCUMENT',
    ],
    [
      'Content: Test performance, comparative and environmental claims against evidence',
      'AX_E_MARKETING_CLAIMS',
      'DOCUMENT',
    ],
    [
      'Content: Check clear identification of paid promotions and sponsored placement',
      'AX_E_MARKETING_SPONSORSHIP',
      'DOCUMENT',
    ],
    [
      'Pricing: Check total-price, fee and discount transparency against applicable requirements',
      'AX_E_MARKETING_PRICE',
      'DOCUMENT',
    ],
    [
      'Listings: Reconcile specifications, availability and required seller/product information',
      'AX_E_MARKETING_LISTINGS',
      'DOCUMENT',
    ],
    [
      'Customer journey: Review false urgency, forced actions, hidden costs and obstructive cancellation',
      'AX_E_MARKETING_DARK_PATTERNS',
      'DOCUMENT',
    ],
    [
      'Customer journey: Check visible and consistent delivery, warranty and refund terms',
      'AX_E_MARKETING_TERMS',
      'DOCUMENT',
    ],
    [
      'Privacy: Check applicable collection basis, recorded consent, purpose and notices',
      'AX_E_MARKETING_CONSENT',
      'DOCUMENT',
    ],
    [
      'Preferences: Test unsubscribe and suppression across campaigns and vendors',
      'AX_E_MARKETING_OPT_OUT',
      'DOCUMENT',
    ],
    [
      'Privacy: Review data minimisation, retention and rights-request handling',
      'AX_E_MARKETING_MINIMISATION',
      'DOCUMENT',
    ],
    [
      'Targeting: Check controls for children and sensitive audience categories where applicable',
      'AX_E_MARKETING_AUDIENCES',
      'DOCUMENT',
    ],
    [
      'Tracking: Review disclosed technologies and applicable consent/preferences',
      'AX_E_MARKETING_TRACKING',
      'DOCUMENT',
    ],
    [
      'Access: Verify account roles, MFA and removal of former staff or agencies',
      'AX_E_MARKETING_ACCESS',
      'DOCUMENT',
    ],
    [
      'Security: Review account ownership, credential storage and recovery permissions',
      'AX_E_MARKETING_CREDENTIALS',
      'DOCUMENT',
    ],
    [
      'Vendors: Inventory tracking scripts, approved purposes and data sharing',
      'AX_E_MARKETING_TAGS',
      'DOCUMENT',
    ],
    [
      'Security: Review response to account compromise or customer-data incidents',
      'AX_E_MARKETING_INCIDENTS',
      'DOCUMENT',
    ],
    [
      'Change control: Trace material campaign or website edits to approval and versions',
      'AX_E_MARKETING_CHANGELOG',
      'DOCUMENT',
    ],
    [
      'Service: Sample complaint acknowledgement, escalation and resolution',
      'AX_E_MARKETING_GRIEVANCES',
      'DOCUMENT',
    ],
    [
      'Service: Compare advertised refund terms with actual communications and processing',
      'AX_E_MARKETING_REFUNDS',
      'DOCUMENT',
    ],
    [
      'Finance: Reconcile budgets, platform invoices, agency charges and credits',
      'AX_E_MARKETING_SPEND',
      'DOCUMENT',
    ],
    [
      'Analytics: Check conversion definitions, attribution and invalid-traffic handling',
      'AX_E_MARKETING_ANALYTICS',
      'DOCUMENT',
    ],
    [
      'Usability: Review accessible forms, understandable choices and working support links',
      'AX_E_MARKETING_ACCESSIBILITY',
      'DOCUMENT',
    ],
    [
      'Continuity: Verify procedures for incorrect-content removal and account recovery',
      'AX_E_MARKETING_RECOVERY',
      'DOCUMENT',
    ],
  ],
  OTHER: [
    [
      'Criteria: Confirm evaluation criteria, exclusions and stakeholder expectations',
      'AX_OTHER_CRITERIA',
      'DOCUMENT',
    ],
    [
      'Governance: Map owners, decision rights and escalation contacts',
      'AX_OTHER_OWNERSHIP',
      'DOCUMENT',
    ],
    [
      'Processes: Document inputs, outputs, dependencies and outsourced activities',
      'AX_OTHER_PROCESS_MAP',
      'DOCUMENT',
    ],
    [
      'Risks: Identify material operational, people, legal and information risks',
      'AX_OTHER_RISKS',
      'DOCUMENT',
    ],
    [
      'Controls: Assess whether controls address the risks they are intended to manage',
      'AX_OTHER_CONTROL_DESIGN',
      'DOCUMENT',
    ],
    [
      'Testing: Sample control operation across the agreed period',
      'AX_OTHER_CONTROL_TEST',
      'DOCUMENT',
    ],
    [
      'Documents: Check approval, version control and access to current procedures',
      'AX_OTHER_DOCUMENTS',
      'DOCUMENT',
    ],
    [
      'Records: Reconcile sampled source transactions to summaries and reported outcomes',
      'AX_OTHER_RECONCILIATION',
      'DOCUMENT',
    ],
    [
      'Approvals: Sample authorisation limits and segregation of duties',
      'AX_OTHER_AUTHORITY',
      'DOCUMENT',
    ],
    [
      'People: Verify training, qualifications and supervision for scoped activities',
      'AX_OTHER_COMPETENCE',
      'DOCUMENT',
    ],
    [
      'Third parties: Review due diligence, service obligations and oversight',
      'AX_OTHER_VENDORS',
      'DOCUMENT',
    ],
    [
      'Information: Review access approval, privileged roles and revocation',
      'AX_OTHER_ACCESS',
      'DOCUMENT',
    ],
    [
      'Information: Check secure retention, privacy and disposal of records',
      'AX_OTHER_RETENTION',
      'DOCUMENT',
    ],
    [
      'Changes: Sample approvals, testing and communication',
      'AX_OTHER_CHANGES',
      'DOCUMENT',
    ],
    [
      'Incidents: Verify reporting, root-cause review and implemented actions',
      'AX_OTHER_INCIDENTS',
      'DOCUMENT',
    ],
    [
      'Continuity: Review response and recovery for critical activities',
      'AX_OTHER_CONTINUITY',
      'DOCUMENT',
    ],
    [
      'Feedback: Review complaints, interviews and unresolved concerns',
      'AX_OTHER_FEEDBACK',
      'DOCUMENT',
    ],
    [
      'Observation: Inspect physical conditions relevant to agreed scope and record locations',
      'AX_OTHER_SITE',
      'SITE_INSPECTION',
    ],
    [
      'Walkthrough: Compare actual practice with documented controls where a site visit applies',
      'AX_OTHER_WALKTHROUGH',
      'SITE_INSPECTION',
    ],
    [
      'Closeout: Verify finding severity, action owners and due dates',
      'AX_OTHER_ACTION_OWNER',
      'DOCUMENT',
    ],
    [
      'Closeout: Retest remediation and record accepted residual risk or evidence limits',
      'AX_OTHER_EFFECTIVENESS',
      'DOCUMENT',
    ],
    [
      'Reporting: Confirm findings, disagreement resolution and management review',
      'AX_OTHER_MANAGEMENT',
      'DOCUMENT',
    ],
  ],
};
