import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { BranchFaceEnrollmentComponent } from './branch-face-enrollment.component';
import type {
  KioskEnrollTicket,
  MobileAttendanceDevice,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

/**
 * Focused unit tests for the kiosk-supervised enrollment flow inside
 * BranchFaceEnrollmentComponent. We instantiate the component directly with
 * stubbed services instead of going through TestBed — the kiosk methods are
 * pure controller logic and the template would otherwise drag in many UI
 * dependencies for tests that don't exercise the DOM.
 */

const noopCdr: ChangeDetectorRef = {
  markForCheck: vi.fn(),
  detectChanges: vi.fn(),
  checkNoChanges: vi.fn(),
  detach: vi.fn(),
  reattach: vi.fn(),
} as unknown as ChangeDetectorRef;

const buildDevice = (
  over: Partial<MobileAttendanceDevice> = {},
): MobileAttendanceDevice =>
  ({
    id: 'd-1',
    clientId: 'c-1',
    branchId: 'b-1',
    deviceName: 'Kiosk 1',
    mode: 'KIOSK',
    isActive: true,
    ...over,
  }) as MobileAttendanceDevice;

const buildTicket = (over: Partial<KioskEnrollTicket> = {}): KioskEnrollTicket =>
  ({
    id: 't-1',
    clientId: 'c-1',
    deviceId: 'd-1',
    subjectType: 'EMPLOYEE',
    subjectName: 'Alice',
    subjectCode: 'E001',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...over,
  }) as unknown as KioskEnrollTicket;

const makeComponent = (
  overrides: {
    auth?: any;
    svc?: any;
    toast?: any;
  } = {},
): BranchFaceEnrollmentComponent => {
  const auth = overrides.auth ?? { getBranchIds: () => ['b-1'] };
  const empSvc: any = {};
  const contractorEmpSvc: any = {};
  const svc = overrides.svc ?? {};
  const toast = overrides.toast ?? {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };
  return new BranchFaceEnrollmentComponent(
    auth,
    empSvc,
    contractorEmpSvc,
    svc,
    toast,
    noopCdr,
  );
};

describe('BranchFaceEnrollmentComponent kiosk-enroll flow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('openKioskEnrollForEmployee', () => {
    it('seeds subject fields, opens the modal and loads devices', () => {
      const listDevices = vi.fn().mockReturnValue(of([]));
      const cmp = makeComponent({ svc: { listDevices } });
      cmp.openKioskEnrollForEmployee({
        employeeId: 'emp-1',
        employeeName: 'Alice',
        employeeCode: 'E001',
        branchId: 'b-2',
      } as any);

      expect(cmp.kioskSubjectType).toBe('EMPLOYEE');
      expect(cmp.kioskSubjectId).toBe('emp-1');
      expect(cmp.kioskSubjectName).toBe('Alice');
      expect(cmp.kioskSubjectCode).toBe('E001');
      expect(cmp.kioskSubjectBranchId).toBe('b-2');
      expect(cmp.kioskModalOpen).toBe(true);
      expect(cmp.kioskConsentGiven).toBe(false);
      expect(cmp.kioskActiveTicket).toBeNull();
      expect(listDevices).toHaveBeenCalled();
    });

    it('falls back to first auth branch when subject branch is null', () => {
      const cmp = makeComponent({
        auth: { getBranchIds: () => ['b-fallback'] },
        svc: { listDevices: () => of([]) },
      });
      cmp.openKioskEnrollForEmployee({
        employeeId: 'emp-1',
        employeeName: 'Alice',
        employeeCode: 'E001',
        branchId: null,
      } as any);
      expect(cmp.kioskSubjectBranchId).toBe('b-fallback');
    });
  });

  describe('openKioskEnrollForContractor', () => {
    it('uses contractor name + id and forces subjectType=CONTRACTOR', () => {
      const cmp = makeComponent({
        svc: { listDevices: () => of([]) },
      });
      cmp.openKioskEnrollForContractor({
        contractorEmployeeId: 'ce-1',
        name: 'Bob',
        branchId: 'b-1',
      } as any);
      expect(cmp.kioskSubjectType).toBe('CONTRACTOR');
      expect(cmp.kioskSubjectId).toBe('ce-1');
      expect(cmp.kioskSubjectName).toBe('Bob');
      expect(cmp.kioskSubjectCode).toBeNull();
    });
  });

  describe('kioskDevicesForSubject', () => {
    it('keeps only active KIOSK devices that match the subject branch', () => {
      const cmp = makeComponent();
      cmp.kioskSubjectBranchId = 'b-1';
      cmp.kioskDevices = [
        buildDevice({ id: 'd-keep', branchId: 'b-1' }),
        buildDevice({ id: 'd-inactive', isActive: false }),
        buildDevice({ id: 'd-ess', mode: 'ESS' as any }),
        buildDevice({ id: 'd-other-branch', branchId: 'b-other' }),
        buildDevice({ id: 'd-unscoped', branchId: null as any }),
      ];
      const ids = cmp.kioskDevicesForSubject.map((d) => d.id).sort();
      expect(ids).toEqual(['d-keep', 'd-unscoped']);
    });
  });

  describe('startKioskEnrollment', () => {
    it('does nothing without a selected device or consent', () => {
      const create = vi.fn();
      const cmp = makeComponent({ svc: { createKioskEnrollTicket: create } });
      cmp.kioskSelectedDeviceId = '';
      cmp.kioskConsentGiven = true;
      cmp.startKioskEnrollment();
      expect(create).not.toHaveBeenCalled();

      cmp.kioskSelectedDeviceId = 'd-1';
      cmp.kioskConsentGiven = false;
      cmp.startKioskEnrollment();
      expect(create).not.toHaveBeenCalled();
    });

    it('posts the ticket request and stores the returned ticket', () => {
      const ticket = buildTicket();
      const create = vi.fn().mockReturnValue(of(ticket));
      const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
      const cmp = makeComponent({
        svc: { createKioskEnrollTicket: create },
        toast,
      });
      cmp.kioskSubjectType = 'EMPLOYEE';
      cmp.kioskSubjectId = 'emp-1';
      cmp.kioskSelectedDeviceId = 'd-1';
      cmp.kioskConsentGiven = true;

      cmp.startKioskEnrollment();

      expect(create).toHaveBeenCalledWith({
        deviceId: 'd-1',
        subjectType: 'EMPLOYEE',
        subjectId: 'emp-1',
        consentGiven: true,
      });
      expect(cmp.kioskActiveTicket).toEqual(ticket);
      expect(toast.success).toHaveBeenCalled();

      // Stop the polling timers the success path started.
      (cmp as any).stopKioskTimers();
    });

    it('captures backend error message into kioskError', () => {
      const create = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { message: 'boom' } })));
      const cmp = makeComponent({
        svc: { createKioskEnrollTicket: create },
      });
      cmp.kioskSelectedDeviceId = 'd-1';
      cmp.kioskConsentGiven = true;
      cmp.startKioskEnrollment();
      expect(cmp.kioskError).toBe('boom');
      expect(cmp.kioskCreating).toBe(false);
    });
  });

  describe('cancelKioskEnrollment', () => {
    it('is a no-op when there is no active ticket', () => {
      const cancel = vi.fn();
      const cmp = makeComponent({
        svc: { cancelKioskEnrollTicket: cancel },
      });
      cmp.kioskActiveTicket = null;
      cmp.cancelKioskEnrollment();
      expect(cancel).not.toHaveBeenCalled();
    });

    it('calls the API and marks the local ticket CANCELLED', () => {
      const cancel = vi.fn().mockReturnValue(of({ ok: true }));
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const cmp = makeComponent({
        svc: { cancelKioskEnrollTicket: cancel },
        toast,
      });
      cmp.kioskActiveTicket = buildTicket();
      cmp.cancelKioskEnrollment();
      expect(cancel).toHaveBeenCalledWith('t-1');
      expect(cmp.kioskActiveTicket?.status).toBe('CANCELLED');
      expect(toast.info).toHaveBeenCalled();
    });
  });

  describe('updateKioskCountdown', () => {
    it('formats the remaining TTL as M:SS', () => {
      const cmp = makeComponent();
      cmp.kioskActiveTicket = buildTicket({
        expiresAt: new Date(Date.now() + 65_000).toISOString(),
      });
      (cmp as any).updateKioskCountdown();
      expect(cmp.kioskCountdownLabel).toMatch(/^1:0[45]$/);
    });

    it('clamps to 0:00 once the ticket has expired', () => {
      const cmp = makeComponent();
      cmp.kioskActiveTicket = buildTicket({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      (cmp as any).updateKioskCountdown();
      expect(cmp.kioskCountdownLabel).toBe('0:00');
    });
  });

  describe('pollKioskTicket', () => {
    it('stops the polling timers when status flips to COMPLETED', () => {
      const get = vi
        .fn()
        .mockReturnValue(of(buildTicket({ status: 'COMPLETED' })));
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const cmp = makeComponent({
        svc: {
          getKioskEnrollTicket: get,
          listKioskEnrollTickets: vi.fn().mockReturnValue(of([])),
        },
        toast,
      });
      cmp.kioskActiveTicket = buildTicket();
      const stop = vi.spyOn(cmp as any, 'stopKioskTimers');
      (cmp as any).pollKioskTicket();
      expect(get).toHaveBeenCalledWith('t-1');
      expect(cmp.kioskActiveTicket?.status).toBe('COMPLETED');
      expect(stop).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Alice'),
      );
    });

    it('keeps polling silently on transient HTTP errors', () => {
      const get = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('network')));
      const cmp = makeComponent({
        svc: { getKioskEnrollTicket: get },
      });
      cmp.kioskActiveTicket = buildTicket();
      const stop = vi.spyOn(cmp as any, 'stopKioskTimers');
      (cmp as any).pollKioskTicket();
      expect(stop).not.toHaveBeenCalled();
      expect(cmp.kioskActiveTicket?.status).toBe('PENDING');
    });
  });

  describe('closeKioskModal', () => {
    it('refreshes enrollments only when ticket completed', () => {
      const cmp = makeComponent();
      const reload = vi
        .spyOn(cmp as any, 'loadEnrollments')
        .mockImplementation(() => undefined);
      cmp.kioskModalOpen = true;
      cmp.kioskActiveTicket = buildTicket({ status: 'CANCELLED' });
      cmp.closeKioskModal();
      expect(reload).not.toHaveBeenCalled();
      expect(cmp.kioskModalOpen).toBe(false);

      cmp.kioskModalOpen = true;
      cmp.kioskActiveTicket = buildTicket({ status: 'COMPLETED' });
      cmp.closeKioskModal();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  // Silence unused import warnings for symbols only kept for type clarity.
  void Subject;
});
