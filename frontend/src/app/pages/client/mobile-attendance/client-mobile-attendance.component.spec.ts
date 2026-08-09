// @vitest-environment jsdom
import '@angular/compiler';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of, Subject } from 'rxjs';
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

const makeComponent = (
  modules: string[] = ['MOBILE_ATTENDANCE'],
  queryParams: Record<string, string> = {},
) => {
  const svc = {
    listDevices: vi.fn().mockReturnValue(of([])),
    listEnrollments: vi.fn().mockReturnValue(of([])),
    listReenrollRequests: vi.fn().mockReturnValue(of([])),
    listContractorReenrollRequests: vi.fn().mockReturnValue(of([])),
    listReviewPunches: vi.fn().mockReturnValue(of([])),
    listFederatedReview: vi.fn().mockReturnValue(of({
      summary: {
        mobileBorderlinePending: 0,
        facedeskVerificationPending: 0,
        totalPending: 0,
      },
      items: [],
      mobileItems: [],
      facedeskItems: [],
    })),
    reviewPunch: vi.fn().mockReturnValue(of({ ok: true, decision: 'REVIEW_APPROVED' })),
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
  const protectedFile = {
    open: vi.fn(),
    fetch: vi.fn(),
  };
  const route = {
    snapshot: {
      queryParamMap: convertToParamMap(queryParams),
    },
  } as unknown as ActivatedRoute;

  const component = new ClientMobileAttendanceComponent(
    svc as any,
    branchSvc as any,
    employeesSvc as any,
    toast as any,
    noopCdr,
    zone,
    dialog as any,
    auth as any,
    protectedFile as any,
    route,
  );

  return { component, svc, branchSvc, employeesSvc, toast, protectedFile, route };
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
    expect(svc.listReenrollRequests).toHaveBeenCalledWith('PENDING');
    expect(svc.listDevices).not.toHaveBeenCalled();
    expect(employeesSvc.list).not.toHaveBeenCalled();

    component.ngOnDestroy();
  });

  it('opens the review tab when ?tab=review is present', () => {
    const { component, svc } = makeComponent(['MOBILE_ATTENDANCE'], { tab: 'review' });

    component.ngOnInit();

    expect(component.tab).toBe('review');
    expect(svc.listReviewPunches).toHaveBeenCalled();

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

  it('keeps legacy shared kiosks out of ESS device administration', () => {
    const { component, svc } = makeComponent([
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    svc.listDevices.mockReturnValue(of([
      { id: 'legacy-kiosk', mode: 'KIOSK' },
      { id: 'employee-phone', mode: 'ESS' },
    ]));

    component.ngOnInit();

    expect(component.tab).toBe('devices');
    expect(component.devices).toEqual([
      expect.objectContaining({ id: 'employee-phone', mode: 'ESS' }),
    ]);

    component.openAdd();
    expect(component.showModal).toBe(true);
    expect(component.form.mode).toBe('ESS');

    component.ngOnDestroy();
  });

  it('keeps contractor and shared-kiosk punches out of ESS review', () => {
    const { component, svc } = makeComponent([
      'MOBILE_ATTENDANCE',
      'CONTRACTOR_FACE_ATTENDANCE',
    ]);
    svc.listReviewPunches.mockReturnValue(of([
      { id: 'employee-punch', subjectType: 'EMPLOYEE' },
      { id: 'contractor-punch', subjectType: 'CONTRACTOR' },
    ]));
    svc.listFederatedReview.mockReturnValue(of({
      summary: {
        mobileBorderlinePending: 1,
        facedeskVerificationPending: 0,
        totalPending: 1,
      },
      items: [],
      mobileItems: [],
      facedeskItems: [],
    }));

    component.loadReviewPunches();

    expect(component.reviewRows).toEqual([
      expect.objectContaining({
        id: 'employee-punch',
        subjectType: 'EMPLOYEE',
      }),
    ]);
    expect(component.pendingReviewCount).toBe(1);
  });
});

describe('ClientMobileAttendanceComponent review photos', () => {
  it('ignores a stale photo response after another review is opened', () => {
    const { component, protectedFile } = makeComponent();
    const firstPhoto = new Subject<{ objectUrl: string }>();
    const secondPhoto = new Subject<{ objectUrl: string }>();
    protectedFile.fetch
      .mockReturnValueOnce(firstPhoto)
      .mockReturnValueOnce(secondPhoto);
    const request = (id: string, photoUrl: string) => ({
      id,
      scope: 'employee',
      subjectId: id,
      displayName: id,
      displayCode: null,
      branchId: 'branch-1',
      source: 'ESS',
      status: 'PENDING',
      reason: null,
      requestedAt: '2026-08-09T00:00:00.000Z',
      reviewedAt: null,
      reviewNotes: null,
      photoUrl,
    });

    component.openReview(request('first', '/first.jpg') as any, 'APPROVED');
    component.openReview(request('second', '/second.jpg') as any, 'APPROVED');
    firstPhoto.next({ objectUrl: 'blob:first' });

    expect(component.reviewPhotoBlobUrl).toBeNull();

    secondPhoto.next({ objectUrl: 'blob:second' });
    expect(component.reviewPhotoBlobUrl).toBe('blob:second');
  });
});
