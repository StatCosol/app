import { ExecutionContext } from '@nestjs/common';
import { ServiceEntitlementsGuard } from './service-entitlements.guard';
import { ServiceEntitlementsService } from './service-entitlements.service';

describe('ServiceEntitlementsGuard', () => {
  const clientId = 'client-1';
  const entitlements = {
    assertModule: jest.fn().mockResolvedValue(undefined),
    assertAnyModule: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServiceEntitlementsService;
  const guard = new ServiceEntitlementsGuard(entitlements);

  const contextFor = (
    url: string,
    role = 'CLIENT',
    user: Record<string, unknown> = {},
    method = 'GET',
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: url,
          url,
          method,
          user: { clientId, roleCode: role, ...user },
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows unscoped routes without module checks', async () => {
    await expect(guard.canActivate(contextFor('/api/v1/health'))).resolves.toBe(
      true,
    );
    expect(entitlements.assertModule).not.toHaveBeenCalled();
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/mobile-attendance/devices',
    '/api/v1/mobile-attendance/devices?mode=KIOSK',
  ])(
    'requires kiosk attendance to list shared device registry %s',
    async (url) => {
      await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

      expect(entitlements.assertAnyModule).toHaveBeenCalledWith(clientId, [
        'CONTRACTOR_FACE_ATTENDANCE',
      ]);
      expect(entitlements.assertModule).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/api/v1/mobile-attendance/devices',
    '/api/v1/mobile-attendance/devices/device-1',
  ])(
    'requires contractor face attendance for device mutation path %s',
    async (url) => {
      await expect(
        guard.canActivate(contextFor(url, 'CLIENT', {}, 'POST')),
      ).resolves.toBe(true);

      expect(entitlements.assertModule).toHaveBeenCalledWith(
        clientId,
        'CONTRACTOR_FACE_ATTENDANCE',
      );
      expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
    },
  );

  it('requires contractor face attendance for contractor enrollment status', async () => {
    await expect(
      guard.canActivate(
        contextFor('/api/v1/mobile-attendance/enrollment/contractors'),
      ),
    ).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it('requires the kiosk attendance module for FaceDesk administration', async () => {
    await expect(
      guard.canActivate(contextFor('/api/v1/facedesk/devices')),
    ).resolves.toBe(true);

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
  ])(
    'requires kiosk attendance for shared enrollment path %s',
    async (url) => {
      await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

      expect(entitlements.assertModule).toHaveBeenCalledWith(
        clientId,
        'CONTRACTOR_FACE_ATTENDANCE',
      );
      expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/api/v1/legitx/dashboard',
    '/api/v1/legitx/dashboard/summary',
    '/api/v1/legitx/mcd',
    '/api/v1/legitx/compliance-status/summary',
  ])('requires employee compliance for LegitX path %s', async (url) => {
    await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'EMPLOYEE_COMPLIANCE',
    );
    expect(entitlements.assertAnyModule).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/client/branches',
    '/api/v1/client/branches/branch-1',
    '/api/v1/client/branches/branch-1/dashboard',
  ])(
    'allows shared branch workspace path %s with any branch module',
    async (url) => {
      await expect(guard.canActivate(contextFor(url))).resolves.toBe(true);

      expect(entitlements.assertAnyModule).toHaveBeenCalledWith(clientId, [
        'EMPLOYEE_COMPLIANCE',
        'CONTRACTOR_AUDIT',
        'CONTRACTOR_DOCUMENTS',
        'CONTRACTOR_FACE_ATTENDANCE',
      ]);
      expect(entitlements.assertModule).not.toHaveBeenCalled();
    },
  );

  it('enforces module access when role code casing is lower-case', async () => {
    await expect(
      guard.canActivate(contextFor('/api/v1/facedesk/devices', 'client')),
    ).resolves.toBe(true);

    expect(entitlements.assertModule).toHaveBeenCalledWith(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
  });
});
