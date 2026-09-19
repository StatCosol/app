import { rankNominationsForForm } from './employees.controller';

describe('rankNominationsForForm — which nomination a statutory form prints', () => {
  const n = (status: string, members: number, createdAt: string) => ({
    status,
    createdAt,
    members: Array.from({ length: members }, () => ({})),
  });

  it('prints an older complete approved nomination over a newer empty draft', () => {
    // The PDF prints [0]; it used to be the newest, i.e. the empty draft.
    const list = [n('DRAFT', 0, '2026-08-01'), n('APPROVED', 2, '2026-04-01')];
    expect(rankNominationsForForm(list)[0].status).toBe('APPROVED');
  });

  it('prefers approved, then submitted, then draft, newest within each', () => {
    const list = [
      n('DRAFT', 1, '2026-09-01'),
      n('SUBMITTED', 1, '2026-08-01'),
      n('APPROVED', 1, '2026-05-01'),
      n('APPROVED', 1, '2026-06-01'),
    ];
    expect(
      rankNominationsForForm(list).map((x) => `${x.status}@${x.createdAt}`),
    ).toEqual([
      'APPROVED@2026-06-01',
      'APPROVED@2026-05-01',
      'SUBMITTED@2026-08-01',
      'DRAFT@2026-09-01',
    ]);
  });

  it('still returns something when every nomination is empty', () => {
    expect(rankNominationsForForm([n('DRAFT', 0, '2026-08-01')])).toHaveLength(
      1,
    );
  });
});
