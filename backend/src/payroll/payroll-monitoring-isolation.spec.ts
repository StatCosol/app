import { PayrollInputService } from './payroll-input.service';
import { PayrollRunsService } from './payroll-runs.service';

describe('Client and Branch operational payroll monitoring', () => {
  it.each(['CLIENT', 'BRANCH'])(
    'filters run fixtures before counting employees for %s',
    async (userType) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
      qb.getMany = jest.fn(async () => {
        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('COALESCE(r.approvalComments'),
          expect.objectContaining({
            payrollTestMarker: expect.stringContaining('SYNTHETIC TEST ONLY'),
          }),
        );
        return [];
      });
      const counts = { createQueryBuilder: jest.fn() };
      const ctx = {
        ensureClientPayrollAccess: jest.fn(),
        runRepo: { createQueryBuilder: () => qb },
        runEmployeeRepo: counts,
      };
      const user = {
        id: 'u',
        roleCode: 'CLIENT',
        userType,
        clientId: 'c',
        branchIds: ['b'],
      } as any;
      const result =
        await PayrollRunsService.prototype.clientListPayrollRuns.call(
          ctx as any,
          user,
          { periodYear: 2025, periodMonth: 12 },
        );
      expect(result).toEqual([]);
      expect(counts.createQueryBuilder).not.toHaveBeenCalled();
      expect(ctx.ensureClientPayrollAccess).toHaveBeenCalledWith(user);
      expect(qb.where).toHaveBeenCalledWith('r.client_id = :cid', { cid: 'c' });
      if (userType === 'BRANCH')
        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('r.branch_id IN'),
          { ubids: ['b'] },
        );
    },
  );

  it.each(['CLIENT', 'BRANCH'])(
    'filters title/notes fixtures before input queues for %s',
    async (userType) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
      qb.getMany = jest.fn(async () => {
        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining("COALESCE(p.notes, '')"),
          expect.objectContaining({ payrollTestMarker: expect.any(String) }),
        );
        return [];
      });
      const files = { createQueryBuilder: jest.fn() };
      const ctx = {
        ensureClientPayrollAccess: jest.fn(),
        inputRepo: { createQueryBuilder: () => qb },
        fileRepo: files,
      };
      const result =
        await PayrollInputService.prototype.clientListPayrollInputs.call(
          ctx as any,
          {
            id: 'u',
            roleCode: 'CLIENT',
            userType,
            clientId: 'c',
            branchIds: ['b'],
          } as any,
          {},
        );
      expect(result).toEqual([]);
      expect(files.createQueryBuilder).not.toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('p.client_id = :cid', { cid: 'c' });
      if (userType === 'BRANCH')
        expect(qb.andWhere).toHaveBeenCalledWith('p.branch_id IN (:...ubids)', {
          ubids: ['b'],
        });
    },
  );
});
