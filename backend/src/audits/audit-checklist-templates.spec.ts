import { AUDIT_CHECKLIST_TEMPLATES } from './audit-checklist-templates';
import {
  auditChecklistEntries,
  missingChecklistEntries,
} from './audit-checklist-template.helpers';

const types = [
  'FACTORY',
  'SHOPS_ESTABLISHMENT',
  'CONTRACTOR',
  'LABOUR_EMPLOYMENT',
  'FSSAI',
  'PAYROLL',
  'HR',
  'GAP',
  'SAFETY',
  'TRANSPORT',
  'WAREHOUSE',
  'E_MARKETING',
  'OTHER',
];

describe('Audit checklist coverage', () => {
  it('covers every supported audit type', () => {
    expect(Object.keys(AUDIT_CHECKLIST_TEMPLATES).sort()).toEqual(
      [...types].sort(),
    );
  });
  it.each(types)(
    '%s has distinct actionable points with stable upload codes',
    (type) => {
      const entries = AUDIT_CHECKLIST_TEMPLATES[type];
      expect(entries.length).toBeGreaterThanOrEqual(30);
      expect(new Set(entries.map((e) => e[1])).size).toBe(entries.length);
      expect(new Set(entries.map((e) => e[0].toLowerCase())).size).toBe(
        entries.length,
      );
      expect(entries.some((e) => e[1] === 'AX_APPLICABILITY')).toBe(true);
      expect(entries.some((e) => e[1] === 'AX_SAMPLE_PLAN')).toBe(true);
      for (const [label, code, kind] of entries) {
        expect(label.length).toBeLessThanOrEqual(255);
        expect(label.trim().length).toBeGreaterThan(5);
        expect(code).toMatch(/^[A-Z0-9_]{1,100}$/);
        expect(['DOCUMENT', 'SITE_INSPECTION']).toContain(kind || 'DOCUMENT');
      }
    },
  );
  it.each([
    'FACTORY',
    'SHOPS_ESTABLISHMENT',
    'CONTRACTOR',
    'LABOUR_EMPLOYMENT',
    'FSSAI',
    'HR',
    'GAP',
    'SAFETY',
    'TRANSPORT',
    'WAREHOUSE',
    'OTHER',
  ])('%s explicitly includes site observation', (type) => {
    expect(
      AUDIT_CHECKLIST_TEMPLATES[type].some((e) => e[2] === 'SITE_INSPECTION'),
    ).toBe(true);
  });
  it('retains full contractor controls alongside monthly and configured uploads', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { doc_type: 'WORK_ORDER' },
          { doc_type: 'MUSTER_ROLL_REGISTER' },
          { doc_type: 'PF_CHALLAN' },
        ]),
    };
    const entries = await auditChecklistEntries(
      {
        auditType: 'CONTRACTOR',
        clientId: 'client',
        contractorUserId: 'contractor',
      },
      db,
    );
    expect(entries.some((e) => e[1] === 'AX_CONTRACTOR_PF_MEMBERS')).toBe(true);
    expect(
      entries.some(
        (e) => e[1] === 'AX_CONTRACTOR_PPE' && e[2] === 'SITE_INSPECTION',
      ),
    ).toBe(true);
    expect(entries.some((e) => e[1] === 'WORK_ORDER')).toBe(true);
    expect(entries.filter((e) => e[1] === 'PF_CHALLAN')).toHaveLength(1);
    expect(
      entries.filter((e) =>
        ['MUSTER_ROLL', 'MUSTER_ROLL_REGISTER'].includes(e[1]!),
      ),
    ).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      'contractor',
      'client',
    ]);
  });
  it('matches preserved codes, legacy attendance aliases and custom labels without changing records', () => {
    const existing = [
      { docType: 'MUSTER_ROLL', itemLabel: 'Legacy attendance' },
      { docType: 'X', itemLabel: 'Old wording' },
      { docType: null, itemLabel: '  Custom observation  ' },
    ];
    const before = JSON.stringify(existing);
    expect(
      missingChecklistEntries(
        [
          ['New attendance wording', 'MUSTER_ROLL_REGISTER'],
          ['Revised wording', 'X'],
          ['custom observation', 'Y'],
          ['New point', 'Z'],
          ['New point', 'Z'],
        ],
        existing,
      ),
    ).toEqual([['New point', 'Z']]);
    expect(JSON.stringify(existing)).toBe(before);
  });
});
