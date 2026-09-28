import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
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
    getUser: vi.fn().mockReturnValue({ clientId: 'company-a' }),
  };
  const pdf = { downloadPdf: vi.fn().mockReturnValue(of(undefined)) };

  const component = new BranchReportsComponent(
    http as any,
    noopCdr,
    auth as any,
    pdf as any,
  );

  return { component, http, pdf, auth };
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
    const { component, http } = makeComponent(['CONTRACTOR_FACE_ATTENDANCE']);
    const report = component.reports.find((item) => item.key === 'headcount')!;

    component.openReport(report);

    expect(http.get).not.toHaveBeenCalled();
    expect(component.activeReport).toBeNull();
  });

  it('downloads the selected report and month for the signed-in company', () => {
    const { component, pdf } = makeComponent(['EMPLOYEE_COMPLIANCE']);
    component.pdfType = 'dtss';
    component.pdfMonth = '2026-09';
    component.downloadPdf();
    expect(pdf.downloadPdf).toHaveBeenCalledWith('dtss', 'company-a', '2026-09');
    expect(component.pdfLoading).toBe(false);
  });

  it('prevents duplicate clicks and cancels on destruction', () => {
    const { component, pdf } = makeComponent(['EMPLOYEE_COMPLIANCE']);
    const pending = new Subject<void>();
    pdf.downloadPdf.mockReturnValue(pending);
    component.downloadPdf();
    component.downloadPdf();
    expect(pdf.downloadPdf).toHaveBeenCalledTimes(1);
    expect(component.pdfLoading).toBe(true);
    component.ngOnDestroy();
    expect(pending.observed).toBe(false);
    expect(component.pdfLoading).toBe(false);
  });

  it('blocks invalid months before requesting a download', () => {
    const { component, pdf } = makeComponent(['EMPLOYEE_COMPLIANCE']);
    component.pdfMonth = '2026-13';
    component.downloadPdf();
    expect(pdf.downloadPdf).not.toHaveBeenCalled();
    expect(component.pdfError).toContain('valid report month');
  });

  it('blocks PDF requests without entitlement or company context', () => {
    const { component, pdf } = makeComponent([]);
    component.downloadPdf();
    expect(pdf.downloadPdf).not.toHaveBeenCalled();
    const allowed = makeComponent(['EMPLOYEE_COMPLIANCE']);
    allowed.auth.getUser.mockReturnValue(null as any);
    allowed.component.downloadPdf();
    expect(allowed.pdf.downloadPdf).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 403 }, 'branch assignments'],
    [{ status: 401 }, 'Sign in again'],
    [{ status: 400 }, 'filters are invalid'],
    [{ status: 0 }, 'connection'],
    [{ name: 'TimeoutError' }, 'taking too long'],
    [{ status: 500 }, 'could not be downloaded'],
  ])('shows an actionable failure and clears busy state (%j)', (error, message) => {
    const { component, pdf } = makeComponent(['EMPLOYEE_COMPLIANCE']);
    pdf.downloadPdf.mockReturnValue(throwError(() => error));
    component.downloadPdf();
    expect(component.pdfError).toContain(message);
    expect(component.pdfLoading).toBe(false);
  });
});
