import { actualUnitDocumentSql } from '../common/actual-records';
import { CrmDocumentsService } from './crm-documents.service';

describe('unit-document operational lists', () => {
  const patterns = Array.from(
    actualUnitDocumentSql().matchAll(/!~\* '([^']+)'/g),
    (match) => new RegExp(match[1], 'i'),
  );
  it.each([
    'TEST-ONLY.pdf',
    'TEST ONLY: synthetic document',
    'TEST-ONLY-20261014-original-licence.pdf',
    'test_only_branch.pdf',
    'TEST ONLY 20261014 - Upload and renewal verification',
    'SYNTHETIC TEST ONLY evidence',
  ])('excludes explicit fixture %s', (value) => {
    expect(patterns.some((pattern) => pattern.test(value))).toBe(true);
  });
  it.each([
    'Test certificate.pdf',
    'Lab test report.pdf',
    'TEST-RESULT.pdf',
    'Latest licence.pdf',
    'Reviewed TEST ONLY attachment separately',
    '',
  ])('preserves ordinary record %s', (value) => {
    expect(patterns.some((pattern) => pattern.test(value))).toBe(false);
  });
  it.each(['Client', 'Branch', 'Crm'] as const)(
    'applies fixture exclusion without removing %s access scope',
    async (role) => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const repo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager: {
          query: jest.fn().mockResolvedValue([{ client_id: 'client-a' }]),
        },
      };
      const svc = new CrmDocumentsService(
        repo as any,
        {
          find: jest.fn().mockResolvedValue([{ clientId: 'client-a' }]),
        } as any,
      );
      if (role === 'Client') await svc.listForClient('client-a', {});
      if (role === 'Branch') await svc.listForBranch(['branch-a'], {});
      if (role === 'Crm') await svc.listForCrm('crm-a', {});
      expect(qb.andWhere).toHaveBeenCalledWith(actualUnitDocumentSql('d'));
      const clauses = qb.andWhere.mock.calls.map((call) => call[0]).join(' ');
      expect(clauses).toContain(
        role === 'Branch' ? 'd.branchId IN' : 'd.clientId',
      );
      expect(qb.where).toHaveBeenCalledWith('d.deletedAt IS NULL');
    },
  );
});
