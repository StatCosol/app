import { ExecutionContext } from '@nestjs/common';
import { ServiceEntitlementsGuard } from './service-entitlements.guard';
import { ServiceEntitlementsService } from './service-entitlements.service';

describe('ServiceEntitlementsGuard', () => {
  const clientId = 'client-1';
  let entitlements: jest.Mocked<
    Pick<ServiceEntitlementsService, 'assertModule' | 'assertAnyModule'>
  >;
  let guard: ServiceEntitlementsGuard;

  const contextFor = (url: string, roleCode = 'CLIENT') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: url,
          user: { clientId, roleCode },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    entitlements = {
      assertModule: jest.fn().mockResolvedValue(undefined),
      assertAnyModule: jest.fn().mockResolvedValue(undefined),
    };
    guard = new ServiceEntitlementsGuard(
      entitlements as unknown as ServiceEntitlementsService,
    );
  });

  it.each([
    '/api/v1/client/branches/documents/doc-1/reupload',
    '/api/v1/client/branches/registration-summary',
    '/api/v1/client/branches/registration-alerts',
    '/api/v1/client/branches/branch-1/documents',
    '/api/v1/client/branches/branch-1/documents/upload',
    '/api/v1/client/branches/branch-1/mcd',
    '/api/v1/client/branches/branch-1/mcd/overview',
    '/api/v1/client/branches/branch-1/registrations',
    '/api/v1/client/branches/branch-1/registration-summary',
  ])('requires employee compliance for branch compliance path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'EMPLOYEE_COMPLIANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it('requires contractor audit for branch audit observations', async () => {
    await expect(
      guard.canActivate(
        contextFor('/api/v1/client/branches/branch-1/audit-observations'),
      ),
    ).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_AUDIT',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/audits',
    '/api/v1/client/audits/summary',
    '/api/v1/client/audits/summaries',
    '/api/v1/client/audits/audit-1/latest-report',
  ])('requires contractor audit for client audit path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_AUDIT',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/branches',
    '/api/v1/client/branches/branch-1',
    '/api/v1/client/branches/branch-1/dashboard',
  ])('allows shared branch workspace path %s with any branch module', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertAnyModule).toHaveBeenCalledWith(clientId, [
      'EMPLOYEE_COMPLIANCE',
      'CONTRACTOR_AUDIT',
      'CONTRACTOR_DOCUMENTS',
    ]);
    expect(entitlements.assertModule).not.toHaveBeenCalled();
  });
});
