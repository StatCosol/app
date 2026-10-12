import { resolveWeeklyNewsRecipients } from './weekly-news-recipients';

describe('weekly news recipients', () => {
  it('includes HR, compliance, payroll and registered sources once per address', () => {
    const rows = resolveWeeklyNewsRecipients([
      { email: 'HR@example.com ', source: 'Contact: HR', blocked: false },
      { email: 'hr@example.com', source: 'Primary contact', blocked: false },
      {
        email: 'compliance@example.com',
        source: 'Contact: COMPLIANCE',
        blocked: false,
      },
      {
        email: 'payroll@example.com',
        source: 'Contact: PAYROLL',
        blocked: false,
      },
      {
        email: 'assigned@example.com',
        source: 'Assigned payroll user',
        blocked: false,
      },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.included)).toBe(true);
    expect(
      rows.find((r) => r.email === 'hr@example.com')?.sources,
    ).toHaveLength(2);
  });

  it.each(['#deleted#123', '#branch-deleted#123', ''])(
    'blocks inactive/deleted emails across other active sources (%s)',
    (tag) => {
      const rows = resolveWeeklyNewsRecipients([
        { email: 'old@example.com', source: 'Primary contact', blocked: false },
        { email: 'OLD@example.com' + tag, source: 'User', blocked: true },
        {
          email: 'old@example.com',
          source: 'Contact: PAYROLL',
          blocked: false,
        },
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].included).toBe(false);
    },
  );

  it('excludes the opted-out address and invalid addresses', () => {
    const rows = resolveWeeklyNewsRecipients([
      {
        email: ' SRAVAN.KUMAR@VEDHAENTECH.COM ',
        source: 'Primary contact',
        blocked: false,
      },
      { email: 'broken', source: 'Contact: HR', blocked: false },
      { email: '', source: 'Primary contact', blocked: false },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.included)).toBe(true);
  });
});
