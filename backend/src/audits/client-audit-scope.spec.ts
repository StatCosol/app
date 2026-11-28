import { ForbiddenException } from '@nestjs/common';
import { assertClientAuditScope } from './client-audit-scope';
import { BranchAuditNcController } from './audits.controller';

function db(audit: any, mapped: any[] = []) {
  return {
    query: jest.fn(async (sql: string) =>
      sql.includes('FROM audits') ? (audit ? [audit] : []) : mapped,
    ),
  };
}
const branches = (ids: string[]) => ({
  getUserBranchIds: jest.fn(async () => ids),
});
const branchUser: any = {
  userId: 'u1',
  clientId: 'c1',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
};

describe('assertClientAuditScope', () => {
  it('rejects another company', async () => {
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c2', branchId: 'b1' }),
        branches(['b1']),
        branchUser,
        'a1',
      ),
    ).rejects.toThrow('Audit not in client scope');
  });
  it('rejects a branch user on another branch of the same company', async () => {
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c1', branchId: 'b2' }),
        branches(['b1']),
        branchUser,
        'a1',
      ),
    ).rejects.toThrow('Audit not in branch scope');
  });
  it('rejects a branch user with no branches', async () => {
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c1', branchId: 'b1' }),
        branches([]),
        branchUser,
        'a1',
      ),
    ).rejects.toThrow('No assigned branches');
  });
  it('allows own branch and a contractor audit mapped to it', async () => {
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c1', branchId: 'b1' }),
        branches(['b1']),
        branchUser,
        'a1',
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c1', branchId: null, contractorUserId: 'k1' }, [{}]),
        branches(['b1']),
        branchUser,
        'a1',
      ),
    ).resolves.toBeUndefined();
  });
  it('allows a company-wide client user on any branch', async () => {
    await expect(
      assertClientAuditScope(
        db({ clientId: 'c1', branchId: 'b9' }),
        branches([]),
        { ...branchUser, userType: 'CLIENT' },
        'a1',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('BranchAuditNcController.listForAudit', () => {
  it('checks branch scope before listing NCs', async () => {
    const svc = { listNcsForVendor: jest.fn() } as any;
    const controller = new BranchAuditNcController(
      svc,
      branches(['b1']) as any,
      db({ clientId: 'c1', branchId: 'b2' }) as any,
    );
    await expect(controller.listForAudit(branchUser, 'a1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(svc.listNcsForVendor).not.toHaveBeenCalled();
  });
});
