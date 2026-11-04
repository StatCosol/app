import { fieldworkAppendix } from './audit-fieldwork-report';
import { ENTRY_CATEGORIES } from './statutory-audit-entry.catalogue';

describe('Statutory report appendix', () => {
  it('retains existing fieldwork and includes statutory results and document revision', async () => {
    const point = ENTRY_CATEGORIES[0].items[0];
    const original = {
      label: 'Existing inspection',
      status: 'COMPLIED',
      remarks: 'Verified',
      evidence: 'site.jpg',
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([original])
        .mockResolvedValueOnce([
          {
            item_id: point.id,
            answer: 'Verified online',
            status: 'COMPLIED',
            remarks: 'Signed copy',
            evidence: 'inspection.jpg',
            document: 'register.pdf',
            revision: 2,
            review_status: 'APPROVED',
          },
        ]),
    };
    const rows = await fieldworkAppendix(db, 'audit');
    expect(rows[0]).toEqual(original);
    expect(rows[1].label).toContain(point.description);
    expect(rows[1].evidence).toContain(
      'register.pdf [Auditee, version 2, APPROVED]',
    );
    expect(rows[1].remarks).toContain('Signed copy');
  });
  it('keeps legacy report results when no statutory answers exist', async () => {
    const legacy = [
      {
        label: 'Legacy',
        status: 'COMPLIED',
        remarks: 'Checked',
        evidence: 'photo.jpg',
      },
    ];
    const db = {
      query: jest.fn().mockResolvedValueOnce(legacy).mockResolvedValueOnce([]),
    };
    expect(await fieldworkAppendix(db, 'audit')).toEqual(legacy);
  });
});
