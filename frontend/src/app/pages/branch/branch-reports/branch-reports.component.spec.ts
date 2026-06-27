import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { BranchReportsComponent } from './branch-reports.component';

const noopCdr: ChangeDetectorRef = {
  markForCheck: vi.fn(),
  detectChanges: vi.fn(),
  checkNoChanges: vi.fn(),
  detach: vi.fn(),
  reattach: vi.fn(),
} as unknown as ChangeDetectorRef;

const makeComponent = (modules: string[]) => {
  const http = {
    get: vi.fn().mockReturnValue(of({ data: [], summary: null })),
  };
  const auth = {
    hasModule: (module: string) => modules.includes(module),
  };

  const component = new BranchReportsComponent(
    http as any,
    noopCdr,
    auth as any,
  );

  return { component, http };
};

describe('BranchReportsComponent entitlement filtering', () => {
  it('shows only employee compliance reports for employee compliance access', () => {
    const { component } = makeComponent(['EMPLOYEE_COMPLIANCE']);

    expect(component.visibleReports.map((report) => report.key)).toEqual([
      'compliance-summary',
      'pf-esic-status',
      'headcount',
      'registration-expiry',
    ]);
    expect(component.categories).toEqual([
      'Compliance',
      'Workforce',
      'Registrations',
    ]);
  });

  it('shows only contractor document reports for contractor documents access', () => {
    const { component } = makeComponent(['CONTRACTOR_DOCUMENTS']);

    expect(component.visibleReports.map((report) => report.key)).toEqual([
      'contractor-uploads',
    ]);
    expect(component.categories).toEqual(['Workforce']);
  });

  it('does not call a report endpoint when the module is unavailable', () => {
    const { component, http } = makeComponent(['MOBILE_ATTENDANCE']);
    const report = component.reports.find((item) => item.key === 'headcount')!;

    component.openReport(report);

    expect(http.get).not.toHaveBeenCalled();
    expect(component.activeReport).toBeNull();
  });
});
