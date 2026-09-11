import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import { ServiceEntitlementsService } from '../../service-entitlements/service-entitlements.service';
import { PayrollReconciliationService } from './payroll-reconciliation.service';

describe('PayrollReconciliationService authorization and provenance', () => {
  const user = {
    id: 'reviewer',
    userId: 'reviewer',
    roleCode: 'PAYROLL',
  } as ReqUser;
  const file = {
    originalname: 'register.csv',
    buffer: Buffer.from(
      'employee_code,period,gross_earnings,net_pay\n001,2026-09,100,90',
    ),
  } as Express.Multer.File;
  let service: PayrollReconciliationService;
  let manager: { findOne: jest.Mock; find: jest.Mock };
  let db: { transaction: jest.Mock };
  let access: { assertClientAllowed: jest.Mock };
  let entitlements: { hasModule: jest.Mock };
  beforeEach(() => {
    manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'run',
        clientId: 'company',
        branchId: null,
        periodYear: 2026,
        periodMonth: 9,
        status: 'PROCESSED',
        updatedAt: '2026-09-12',
      }),
      find: jest.fn().mockResolvedValue([
        {
          employeeCode: '001',
          grossEarnings: '100.00',
          netPay: '90.00',
          pfEmployee: null,
          esiEmployee: null,
        },
      ]),
    };
    db = { transaction: jest.fn((_isolation, callback) => callback(manager)) };
    access = { assertClientAllowed: jest.fn().mockResolvedValue(undefined) };
    entitlements = { hasModule: jest.fn().mockResolvedValue(true) };
    service = new PayrollReconciliationService(
      db as unknown as DataSource,
      access as unknown as AccessScopeService,
      entitlements as unknown as ServiceEntitlementsService,
    );
  });
  it('rejects client/branch/CRM roles before reading payroll', async () => {
    for (const roleCode of ['CLIENT', 'CRM', 'CONTRACTOR', 'EMPLOYEE', 'CCO']) {
      await expect(
        service.compare({ ...user, roleCode }, 'run', file),
      ).rejects.toThrow(ForbiddenException);
    }
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('rejects an unassigned payroll user before reading employee amounts', async () => {
    access.assertClientAllowed.mockRejectedValue(new ForbiddenException());
    await expect(service.compare(user, 'run', file)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.find).not.toHaveBeenCalled();
  });
  it('enforces payroll entitlement before reading employee amounts', async () => {
    entitlements.hasModule.mockResolvedValue(false);
    await expect(service.compare(user, 'run', file)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.find).not.toHaveBeenCalled();
  });
  it('rejects draft runs rather than comparing uncalculated zero amounts', async () => {
    manager.findOne.mockResolvedValue({ clientId: 'company', status: 'DRAFT' });
    await expect(service.compare(user, 'run', file)).rejects.toThrow('Process');
    expect(manager.find).not.toHaveBeenCalled();
  });
  it('uses a consistent snapshot and fingerprints source and payroll independently', async () => {
    const first = await service.compare(user, 'run', file);
    const second = await service.compare(user, 'run', {
      ...file,
      buffer: Buffer.from(file.buffer.toString().replace(',100,', ',101,')),
    });
    expect(db.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(first.source.sha256).not.toBe(second.source.sha256);
    expect(first.baselineSha256).toBe(second.baselineSha256);
    expect(first.source.sha256).toHaveLength(64);
    expect(first.summary.matched).toBe(1);
    expect(second.summary.mismatched).toBe(1);
    expect(first.comparedBy).toBe('reviewer');
    expect(manager.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { runId: 'run', clientId: 'company' },
        take: 5001,
      }),
    );
  });
  it('requires a CSV file', async () => {
    await expect(service.compare(user, 'run')).rejects.toThrow('CSV');
    await expect(
      service.compare(user, 'run', { ...file, originalname: 'scan.pdf' }),
    ).rejects.toThrow('CSV');
  });
});
