import { BranchComplianceService } from './branch-compliance.service';
function setup() {
  const q: any = {};
  for (const k of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
  ])
    q[k] = jest.fn(() => q);
  q.getManyAndCount = jest.fn(async () => [[], 0]);
  const s: any = Object.create(BranchComplianceService.prototype);
  s.docRepo = { createQueryBuilder: () => q };
  s.assertBranchAccess = async () => {};
  s.extractBranchId = () => 'branch';
  s.accessScope = { applyToQb: () => {}, getScope: async () => ({}) };
  s.branchAccess = { getUserBranchIds: async () => [] };
  return { s, q };
}
describe('explicit synthetic compliance record separation', () => {
  it.each(['listForBranch', 'listForCrmReview', 'listForClient'])(
    '%s excludes explicit test files before pagination by default',
    async (method) => {
      const { s, q } = setup();
      await s[method](
        {
          id: 'u',
          userId: 'u',
          clientId: 'client',
          roleCode: 'CLIENT',
          userType: 'MASTER',
        },
        {},
      );
      expect(q.andWhere).toHaveBeenCalledWith(
        "COALESCE(d.uploaded_file_name, '') !~* :testMarker",
        { testMarker: '^TEST([ _-]|$)' },
      );
      expect(q.andWhere.mock.invocationCallOrder.at(-1)).toBeLessThan(
        q.take.mock.invocationCallOrder[0],
      );
    },
  );
  it.each(['listForBranch', 'listForCrmReview', 'listForClient'])(
    '%s supports a separate test-only view without guessing by year',
    async (method) => {
      const { s, q } = setup();
      await s[method](
        {
          id: 'u',
          userId: 'u',
          clientId: 'client',
          roleCode: 'CLIENT',
          userType: 'MASTER',
        },
        { recordScope: 'TEST' },
      );
      expect(q.andWhere).toHaveBeenCalledWith(
        "COALESCE(d.uploaded_file_name, '') ~* :testMarker",
        { testMarker: '^TEST([ _-]|$)' },
      );
    },
  );
});
