import '@angular/compiler';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { ClientMobileAttendanceComponent } from './client-mobile-attendance.component';
import type { EnrollmentStatusRow } from './client-mobile-attendance.service';

const noopCdr: ChangeDetectorRef = {
  markForCheck: vi.fn(),
  detectChanges: vi.fn(),
  checkNoChanges: vi.fn(),
  detach: vi.fn(),
  reattach: vi.fn(),
} as unknown as ChangeDetectorRef;

const zone = {
  run: (fn: () => void) => fn(),
} as unknown as NgZone;

const makeComponent = (modules: string[] = ['MOBILE_ATTENDANCE']) => {
  const svc = {
    listDevices: vi.fn().mockReturnValue(of([])),
    listEnrollments: vi.fn().mockReturnValue(of([])),
    listReenrollRequests: vi.fn().mockReturnValue(of([])),
    listContractorReenrollRequests: vi.fn().mockReturnValue(of([])),
    registerDevice: vi.fn().mockReturnValue(of({ installToken: 'token' })),
  };
  const branchSvc = {
    list: vi.fn().mockReturnValue(of([{ id: 'b-1', name: 'HAY-001' }])),
  };
  const employeesSvc = {
    list: vi.fn().mockReturnValue(of({ data: [] })),
  };
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
  };
  const dialog = {
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue({ confirmed: true, value: 'Reason' }),
  };
  const auth = {
    hasModule: (module: string) => modules.includes(module),
  };

  const component = new ClientMobileAttendanceComponent(
    svc as any,
    branchSvc as any,
    employeesSvc as any,
    toast as any,
    noopCdr,
    zone,
    dialog as any,
    auth as any,
  );

  return { component, svc, branchSvc, employeesSvc, toast };
};

const enrolledEmployee = {
  employeeId: 'emp-1',
  employeeName: 'Alice',
  employeeCode: 'E001',
  branchId: 'b-1',
  isEnrolled: true,
  isActive: true,
} as EnrollmentStatusRow;

describe('ClientMobileAttendanceComponent entitlement-aware device access', () => {
  it('loads branch names and enrollment status for mobile-attendance-only clients without loading devices', () => {
    const { component, svc, branchSvc, employeesSvc } = makeComponent([
      'MOBILE_ATTENDANCE',
    ]);

    component.ngOnInit();

    expect(component.tab).toBe('status');
    expect(branchSvc.list).toHaveBeenCalled();
    expect(svc.listEnrollments).toHaveBeenCalled();
    expect(svc.listReenrollRequests).not.toHaveBeenCalled();
    expect(svc.listDevices).not.toHaveBeenCalled();
    expect(employeesSvc.list).not.toHaveBeenCalled();

    component.ngOnDestroy();
  });

  it('blocks ESS deputation when the device entitlement is not enabled', () => {
    const { component, toast } = makeComponent(['MOBILE_ATTENDANCE']);

    component.deputeAsEss(enrolledEmployee);

    expect(component.showModal).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      'Device registration is not enabled for this service package',
    );
  });

  it('does not submit device registration without contractor face attendance', () => {
    const { component, svc } = makeComponent(['MOBILE_ATTENDANCE']);

    component.save();

    expect(component.formError).toBe(
      'Device registration is not enabled for this service package',
    );
    expect(svc.registerDevice).not.toHaveBeenCalled();
  });
});
