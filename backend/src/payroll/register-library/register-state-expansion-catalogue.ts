import type { RegisterForm } from './register-catalogue';
export const STATE_REGISTER_SOURCES = {
  aps: {
    url: 'https://www.lawrbit.com/wp-content/uploads/2020/08/andhra-pradesh-shops-and-establishments-acts-and-rules.pdf',
    title: 'Andhra Pradesh Shops and Establishments Rules, 1990',
    notification:
      'G.O.Ms.No.169, 28 October 1991 — reproduced rules and schedules',
    publicationDate: null,
    publisher:
      'Andhra Pradesh rules reproduced in a compilation hosted by Lawrbit',
  },
  kas: {
    url: 'https://www.datocms-assets.com/40521/1630504261-karnataka-shops-and-commercial-establishments-rules-1963.pdf',
    title: 'Karnataka Shops and Commercial Establishments Rules, 1963',
    notification: 'Rule 24(9-B); LD 104 LET 2004, 9 May 2006 — Form T',
    publicationDate: null,
    publisher: 'Karnataka rules reproduced in a compilation hosted by DatoCMS',
  },
  tns: {
    url: 'https://bombaychamber.com/wp-content/uploads/2022/04/Amendment-Tamil-Nadu-Shops-Establishments-Act.pdf',
    title:
      'Tamil Nadu Shops and Establishments Rules — final 2022 register amendment',
    notification:
      'G.O.Ms.No.23, 3 March 2022; SRO A-8/2022; Gazette 30 March 2022',
    publicationDate: '2022-03-30',
    publisher:
      'Government of Tamil Nadu (Gazette copy hosted by Bombay Chamber)',
  },
  hrs: {
    url: 'https://ihrcgroup.com/storage/files/Punjab.pdf',
    title:
      'Punjab Shops and Commercial Establishments Rules, 1958, as adapted in Haryana',
    notification:
      'Rule 5, Forms C–E; Haryana adaptations reproduced in the source',
    publicationDate: null,
    publisher:
      'Rules compilation hosted by IHRC; review subsequent Haryana amendments separately',
  },
  wbs: {
    url: 'https://www.datocms-assets.com/40521/1639398146-wb-shops-establishments-rules-1964.pdf',
    title: 'West Bengal Shops and Establishments Rules, 1964',
    notification:
      '2911-IR/IR/1B-64; schedules reproduced in West Bengal Labour Gazette 2011 Volume II',
    publicationDate: null,
    publisher: 'West Bengal Labour Gazette compilation hosted by DatoCMS',
  },
} as const;
type Source = keyof typeof STATE_REGISTER_SOURCES;
const specs: Array<[Source, string, string, string, string, string, number]> = [
  ['aps', 'AP', 'AP_SHOPS_1988', 'X', 'Fines', 'Rule 17(3)(a)', 60],
  [
    'aps',
    'AP',
    'AP_SHOPS_1988',
    'XI',
    'Deductions for damage or loss',
    'Rule 17(4)',
    61,
  ],
  ['aps', 'AP', 'AP_SHOPS_1988', 'XII', 'Advances of wages', 'Rule 18(4)', 62],
  ['aps', 'AP', 'AP_SHOPS_1988', 'XXIII', 'Wages', 'Rule 29(2)', 70],
  [
    'kas',
    'KA',
    'KA_SHOPS_1961',
    'T',
    'Combined muster roll and wages',
    'Rule 24(9-B)',
    20,
  ],
  ['tns', 'TN', 'TN_SHOPS_1947', 'U', 'Employee register', 'Rule 16(1)', 3],
  [
    'tns',
    'TN',
    'TN_SHOPS_1947',
    'V',
    'Employment and daily hours',
    'Rule 16(1)',
    4,
  ],
  ['tns', 'TN', 'TN_SHOPS_1947', 'W', 'Wages', 'Rule 16(1)', 5],
  [
    'tns',
    'TN',
    'TN_SHOPS_1947',
    'X',
    'Leave and social security benefits',
    'Rule 16(1)',
    6,
  ],
  [
    'hrs',
    'HR',
    'HR_SHOPS_1958',
    'C',
    'Employee daily hours and leave',
    'Rule 5',
    39,
  ],
  ['hrs', 'HR', 'HR_SHOPS_1958', 'D', 'Wages of employees', 'Rule 5', 40],
  ['hrs', 'HR', 'HR_SHOPS_1958', 'E', 'Deductions', 'Rule 5', 41],
  [
    'wbs',
    'WB',
    'WB_SHOPS_1963',
    'I',
    'Daily hours and rest intervals',
    'Rule 13',
    29,
  ],
  ['wbs', 'WB', 'WB_SHOPS_1963', 'M', 'Pay register', 'Rule 30', 36],
  ['wbs', 'WB', 'WB_SHOPS_1963', 'U', 'Overtime work', 'Rule 40', 44],
  ['wbs', 'WB', 'WB_SHOPS_1963', 'W', 'Employees', 'Rule 52', 46],
];
specs.push([
  'wbs',
  'WB',
  'WB_SHOPS_1963',
  'J',
  'Leave register — separate employee and leave category pages',
  'Rules 18(2) and 21',
  31,
]);
const rules: Record<Source, string> = {
  aps: 'AP_SHOPS_1990',
  kas: 'KA_SHOPS_1963',
  tns: 'TN_SHOPS_1948_AMEND_2022',
  hrs: 'HR_SHOPS_1958_RULES',
  wbs: 'WB_SHOPS_1964',
};
export const STATE_REGISTER_FORMS: readonly RegisterForm[] = specs.map(
  ([
    sourceId,
    jurisdiction,
    actCode,
    formNumber,
    title,
    ruleReference,
    sourcePage,
  ]) => ({
    id: [jurisdiction, actCode, rules[sourceId], formNumber, sourceId]
      .join('--')
      .toLowerCase()
      .replace(/_/g, '-'),
    jurisdiction,
    actCode,
    rulesCode: rules[sourceId],
    formNumber,
    title,
    ruleReference,
    kind: 'REGISTER',
    sourceId,
    sourceStatus: 'EXISTING_RULES',
    sourcePage,
    layoutId: sourceId + '-' + formNumber.toLowerCase(),
    notes: [
      'State Shops Act binding only. Confirm current branch coverage, exemptions and rules for the selected period. This is not a Factory or contract-labour applicability decision. Complete from reviewed attendance, HR and payment evidence; do not infer NIL or signatures from missing data. Retain establishment details with all register sheets.',
      sourceId === 'kas'
        ? 'Form T retains all 38 numbered groups including daily attendance and suspension particulars. Annual Form U and other obligations remain separate; review any claimed substitution under other Acts.'
        : '',
      sourceId === 'tns'
        ? 'Final 2022 amendment replaces the older P, Q and R forms; preserve source column numbering and contents.'
        : '',
      sourceId === 'tns' && formNumber === 'W'
        ? 'Columns 12–13 are printed as PF/ESI numbers beneath deductions. Preserve those references and record deduction evidence separately; never turn an identifier into a monetary deduction.'
        : '',
      sourceId === 'hrs'
        ? 'Review Haryana amendments and any establishment-specific exemptions. This source does not determine current hours, registration thresholds or wage entitlements.'
        : '',
      sourceId === 'hrs' && formNumber === 'C'
        ? 'Prepare one employee per workbook, with daily rows and monthly totals.'
        : '',
      sourceId === 'wbs' && formNumber === 'I'
        ? 'Prepare one date per workbook. Work hours in this form exclude overtime; retain separate overtime evidence.'
        : '',
      sourceId === 'wbs' && formNumber === 'M'
        ? 'Payment certification requires two witnesses and employer authentication. Payment rates are not earned wages and must not be used to infer payment totals.'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    verifiedOn: '2026-10-02',
    effectiveFrom:
      sourceId === 'tns'
        ? '2022-03-30'
        : sourceId === 'kas'
          ? '2006-03-24'
          : null,
    applicability: 'REVIEW_REQUIRED',
    generation: 'REFERENCE_ONLY',
  }),
);
