import { CcoService } from './cco.service';
describe('CCO CRM login visibility', () => {
  it('returns persisted login timestamps and preserves genuinely missing values', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 'crm1', lastLogin: '2026-11-12T01:00:00Z', isActive: true },
      { id: 'crm2', lastLogin: null },
    ]);
    const rows = await new CcoService({ query } as any).getCrmsUnderMe({
      userId: 'cco1',
    } as any);
    expect(rows.map((r) => r.lastLogin)).toEqual([
      '2026-11-12T01:00:00Z',
      null,
    ]);
    expect(query.mock.calls[0][0]).toContain('u.last_login_at AS "lastLogin"');
    expect(query.mock.calls[0][1]).toEqual(['cco1']);
  });
});
