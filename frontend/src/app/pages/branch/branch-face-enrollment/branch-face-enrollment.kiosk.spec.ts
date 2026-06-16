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
    deviceLabel: 'Kiosk 1',
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
  const dialog: any = {
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue({ confirmed: true, value: 'Test reason' }),
  };
  return new BranchFaceEnrollmentComponent(
    auth,
    empSvc,
    contractorEmpSvc,
    svc,
    toast,
    noopCdr,
    dialog,
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
      cmp.kioskSubjectName = 'Alice';
      cmp.kioskSubjectCode = 'E001';
      cmp.kioskSelectedDeviceId = 'd-1';
      cmp.kioskConsentGiven = true;

      cmp.startKioskEnrollment();

      expect(create).toHaveBeenCalledWith({
        deviceId: 'd-1',
        subjectType: 'EMPLOYEE',
        employeeId: 'emp-1',
        subjectName: 'Alice',
        subjectCode: 'E001',
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
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: vi.fn().mockReturnValue(of([])) },
      });
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

  describe('kiosk ticket history panel', () => {
    it('loadKioskTickets populates kioskTickets and flips loading flag', () => {
      const list = vi
        .fn()
        .mockReturnValue(
          of([buildTicket({ id: 't-a' }), buildTicket({ id: 't-b' })]),
        );
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.loadKioskTickets();
      expect(list).toHaveBeenCalledWith(undefined);
      expect(cmp.kioskTickets.length).toBe(2);
      expect(cmp.loadingKioskTickets).toBe(false);
    });

    it('loadKioskTickets passes the active status filter to the service', () => {
      const list = vi.fn().mockReturnValue(of([]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.kioskTicketStatusFilter = 'COMPLETED';
      cmp.loadKioskTickets();
      expect(list).toHaveBeenCalledWith('COMPLETED');
    });

    it('loadKioskTickets toasts the API error message and resets loading', () => {
      const list = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { message: 'boom' } })));
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
        toast,
      });
      cmp.loadKioskTickets();
      expect(toast.error).toHaveBeenCalledWith('boom');
      expect(cmp.loadingKioskTickets).toBe(false);
    });

    it('setKioskTicketStatusFilter no-ops when value is unchanged', () => {
      const list = vi.fn().mockReturnValue(of([]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.kioskTicketStatusFilter = 'PENDING';
      cmp.setKioskTicketStatusFilter('PENDING');
      expect(list).not.toHaveBeenCalled();
    });

    it('setKioskTicketStatusFilter updates filter and reloads when changed', () => {
      const list = vi.fn().mockReturnValue(of([]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.setKioskTicketStatusFilter('EXPIRED');
      expect(cmp.kioskTicketStatusFilter).toBe('EXPIRED');
      expect(list).toHaveBeenCalledWith('EXPIRED');
    });

    it('kioskTicketStatusClass returns distinct classes per status', () => {
      const cmp = makeComponent();
      const pending = cmp.kioskTicketStatusClass('PENDING');
      const completed = cmp.kioskTicketStatusClass('COMPLETED');
      const cancelled = cmp.kioskTicketStatusClass('CANCELLED');
      const expired = cmp.kioskTicketStatusClass('EXPIRED');
      expect(new Set([pending, completed, cancelled, expired]).size).toBe(4);
      expect(completed).toMatch(/green/);
      expect(expired).toMatch(/red/);
    });

    it('cancelKioskTicketFromList ignores non-PENDING rows', () => {
      const cancel = vi.fn();
      const cmp = makeComponent({
        svc: { cancelKioskEnrollTicket: cancel },
      });
      cmp.cancelKioskTicketFromList(buildTicket({ status: 'COMPLETED' }));
      expect(cancel).not.toHaveBeenCalled();
    });

    it('cancelKioskTicketFromList cancels then reloads list on success', () => {
      const cancel = vi.fn().mockReturnValue(of(buildTicket({ status: 'CANCELLED' })));
      const list = vi.fn().mockReturnValue(of([]));
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const cmp = makeComponent({
        svc: {
          cancelKioskEnrollTicket: cancel,
          listKioskEnrollTickets: list,
        },
        toast,
      });
      cmp.cancelKioskTicketFromList(buildTicket({ id: 't-x' }));
      expect(cancel).toHaveBeenCalledWith('t-x');
      expect(toast.info).toHaveBeenCalledWith('Ticket cancelled');
      expect(list).toHaveBeenCalled();
    });

    it('cancelKioskTicketFromList toasts API error message on failure', () => {
      const cancel = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { message: 'nope' } })));
      const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
      const cmp = makeComponent({
        svc: { cancelKioskEnrollTicket: cancel },
        toast,
      });
      cmp.cancelKioskTicketFromList(buildTicket());
      expect(toast.error).toHaveBeenCalledWith('nope');
    });

    it('starts a poll timer when PENDING tickets are loaded', () => {
      vi.useFakeTimers();
      const list = vi
        .fn()
        .mockReturnValue(of([buildTicket({ status: 'PENDING' })]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.loadKioskTickets();
      expect(list).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(
        BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS + 50,
      );
      expect(list).toHaveBeenCalledTimes(2);
      cmp.ngOnDestroy();
    });

    it('stops the poll timer once no PENDING tickets remain', () => {
      vi.useFakeTimers();
      const list = vi.fn();
      list
        .mockReturnValueOnce(of([buildTicket({ status: 'PENDING' })]))
        .mockReturnValueOnce(of([buildTicket({ status: 'COMPLETED' })]))
        .mockReturnValue(of([]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      cmp.loadKioskTickets();
      vi.advanceTimersByTime(
        BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS + 50,
      );
      expect(list).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(
        BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS * 3,
      );
      // Timer should have stopped after the COMPLETED-only response.
      expect(list).toHaveBeenCalledTimes(2);
      cmp.ngOnDestroy();
    });

    it('skips the scheduled poll while a previous load is still in flight', () => {
      vi.useFakeTimers();
      const pending = new Subject<KioskEnrollTicket[]>();
      const list = vi.fn();
      // First call: never resolves until we emit on `pending` — simulates a
      // slow request that exceeds the poll interval.
      list.mockReturnValueOnce(pending.asObservable());
      // Subsequent calls (if any) would return immediately, but the in-flight
      // guard should prevent them from being made.
      list.mockReturnValue(of([buildTicket({ status: 'PENDING' })]));
      const cmp = makeComponent({
        svc: { listKioskEnrollTickets: list },
      });
      // Seed the timer by completing one fast cycle with PENDING rows.
      cmp.kioskTickets = [buildTicket({ status: 'PENDING' })];
      (cmp as any).syncKioskTicketPoll();
      // Now trigger a slow load that won't complete.
      cmp.loadKioskTickets();
      expect(list).toHaveBeenCalledTimes(1);
      // Advance well past 3 intervals; guard should drop all of them.
      vi.advanceTimersByTime(
        BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS * 3 + 50,
      );
      expect(list).toHaveBeenCalledTimes(1);
      // Resolve the slow request and let the timer fire once more.
      pending.next([buildTicket({ status: 'PENDING' })]);
      pending.complete();
      vi.advanceTimersByTime(
        BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS + 50,
      );
      expect(list).toHaveBeenCalledTimes(2);
      cmp.ngOnDestroy();
    });
  });

  // Silence unused import warnings for symbols only kept for type clarity.
  void Subject;
});
