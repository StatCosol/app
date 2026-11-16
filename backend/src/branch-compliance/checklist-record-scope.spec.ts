import { BranchComplianceService } from './branch-compliance.service';
describe('monthly checklist test evidence separation', () => {
  it.each(['ACTUAL', 'TEST'])(
    'filters %s evidence before matching return codes',
    async (recordScope) => {
      const qb: any = {};
      for (const k of ['where', 'andWhere']) qb[k] = jest.fn(() => qb);
      qb.getMany = jest.fn(async () => []);
      const svc: any = Object.create(BranchComplianceService.prototype);
      svc.resolveBranchId = async () => 'TEST-B';
      svc.assertBranchAccess = jest.fn(async () => {});
      svc.getPeriodFromQuery = () => ({ year: 2026, month: 11 });
      svc.dataSource = {
        query: jest.fn(async () => [
          { statecode: 'TS', branchtype: 'FACTORY' },
        ]),
      };
      svc.normalizeStateCode = (s: any) => s;
      svc.getReturnMaster = jest.fn(async () => [
        { returnCode: 'REQ', appliesTo: 'BOTH', uploadRequired: true },
      ]);
      svc.docRepo = { createQueryBuilder: () => qb };
      const result = await svc.getChecklist(
        { clientId: 'TEST-C', userId: 'TEST-U' },
        {
          branchId: 'TEST-B',
          year: 2026,
          month: 11,
          frequency: 'MONTHLY',
          recordScope,
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        "COALESCE(d.uploaded_file_name, '') " +
          (recordScope === 'TEST' ? '~*' : '!~*') +
          ' :testMarker',
        { testMarker: '^TEST([ _-]|$)' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('d.period_month = :month', {
        month: 11,
      });
      expect(svc.assertBranchAccess).toHaveBeenCalled();
      expect(result.data[0].document).toBeNull();
    },
  );
});
