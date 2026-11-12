import {
  actualAuditObservationSql,
  actualAuditSql,
} from '../common/actual-records';
import { BranchRegistrationsService } from './branch-registrations.service';

describe('branch observation test isolation', () => {
  const patterns = Array.from(
    actualAuditObservationSql().matchAll(/!~\* '([^']+)'/g),
    (match) => new RegExp(match[1], 'i'),
  );
  it.each([
    [
      'TEST-BRANCH-UI-20261026 — Synthetic correction workflow check. Not an actual compliance finding.',
      true,
    ],
    ['TEST ONLY correction example', true],
    ['SYNTHETIC TEST ONLY workflow', true],
    ['Test certificate is missing', false],
    ['TEST-BRANCH-UI-20261026 actual missing test certificate', false],
    ['Please test the fire alarm', false],
    ['', false],
  ])('classifies only explicit fixtures: %s', (description, excluded) => {
    expect(patterns.some((pattern) => pattern.test(description))).toBe(
      excluded,
    );
  });
  it('preserves client and branch boundaries and removes fixture audits and observations', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new BranchRegistrationsService(
      {} as any,
      {
        findOne: jest.fn().mockResolvedValue({ clientId: 'client-a' }),
      } as any,
      { query } as any,
    );
    await svc.listAuditObservations('branch-a', 'client-a');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['branch-a', 'client-a']);
    expect(sql).toContain('a.branch_id = $1');
    expect(sql).toContain('a.client_id = $2');
    expect(sql).toContain(actualAuditSql('a'));
    expect(sql).toContain(actualAuditObservationSql('ao'));
  });
  it('rejects a foreign branch before listing observations', async () => {
    const query = jest.fn();
    const svc = new BranchRegistrationsService(
      {} as any,
      {
        findOne: jest.fn().mockResolvedValue({ clientId: 'other-client' }),
      } as any,
      { query } as any,
    );
    await expect(
      svc.listAuditObservations('branch-a', 'client-a'),
    ).rejects.toThrow('Branch not found');
    expect(query).not.toHaveBeenCalled();
  });
});
