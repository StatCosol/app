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
    '/api/v1/branch/audit-non-compliances',
    '/api/v1/branch/audit-non-compliances/audit/audit-1',
    '/api/v1/branch/audit-non-compliances/nc-1/upload',
  ])('requires contractor audit for client audit path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_AUDIT',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/returns-visibility/client-1',
    '/api/v1/client/expiry-visibility/client-1',
    '/api/v1/client/compliance-summary/client-1',
    '/api/v1/client/compliance-calendar/client-1',
    '/api/v1/client/compliance-calendar/me',
    '/api/v1/client/compliance-reminders/client-1',
  ])('requires employee compliance for client visibility path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'EMPLOYEE_COMPLIANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/attendance',
    '/api/v1/client/attendance/daily',
    '/api/v1/client/biometric',
    '/api/v1/client/biometric/devices',
    '/api/v1/client/biometric/punches',
  ])('requires employee attendance for client attendance path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'EMPLOYEE_ATTENDANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/mobile-attendance',
    '/api/v1/client/mobile-attendance/enrollment',
    '/api/v1/mobile-attendance/enrollment/self',
    '/api/v1/mobile-attendance/enrollment/employees',
    '/api/v1/mobile-attendance/enrollment/employees?status=pending',
  ])('requires mobile attendance for employee mobile path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'MOBILE_ATTENDANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/mobile-attendance/devices',
    '/api/v1/mobile-attendance/devices/device-1',
    '/api/v1/mobile-attendance/enrollment/contractors',
  ])('requires contractor face attendance for face device path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/mobile-attendance/enrollment/kiosk/ticket',
    '/api/v1/mobile-attendance/enrollment/kiosk/tickets',
    '/api/v1/mobile-attendance/enrollment/kiosk/tickets/ticket-1',
    '/api/v1/mobile-attendance/enrollment/kiosk/tickets/ticket-1/cancel',
    '/api/v1/mobile-attendance/enrollment/deactivate',
  ])('allows either mobile attendance module for shared enrollment path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertAnyModule).toHaveBeenCalledWith(clientId, [
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    expect(entitlements.assertModule).not.toHaveBeenCalled();
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
