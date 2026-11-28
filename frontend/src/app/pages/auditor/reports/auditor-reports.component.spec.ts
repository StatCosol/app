import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { AuditorReportsComponent } from './auditor-reports.component';

describe('Auditor report audit-status filters', () => {
  it('filters and counts the actual audit states returned by the dashboard', () => {
    const statuses = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SUBMITTED',
      'CORRECTION_PENDING', 'REVERIFICATION_PENDING', 'CLOSED', 'CANCELLED'];
    const component = new AuditorReportsComponent({ getAuditorReports: () => of({ items:
      statuses.map(status => ({ auditId: status, status, auditCode: status })),
    }) } as any, {} as any, {} as any, { detectChanges: vi.fn() } as any,
      { queryParamMap: of(convertToParamMap({ status: 'PENDING_SUBMISSION' })) } as any);
    component.ngOnInit();
    expect(component.filteredReports.map(row => row.status)).toEqual(['COMPLETED']);
    expect(component.reports.length).toBe(statuses.length);
    for (const status of statuses) {
      expect(component.statusOptions.some(option => option.value === status)).toBe(true);
      component.onStatusFilterChange(status);
      expect(component.filteredReports.map(row => row.status)).toEqual([status]);
      expect(component.countByStatus(status)).toBe(1);
    }
    component.onStatusFilterChange('');
    expect(component.filteredReports.length).toBe(statuses.length);
    component.ngOnDestroy();
  });

  it('offers Edit report only where the builder can still edit', () => {
    const component = new AuditorReportsComponent({} as any, {} as any, {} as any, {} as any, {} as any);
    const row = (status: string, reportStatus: string | null = null, reportHeld = false) =>
      ({ status, reportStatus, reportHeld }) as any;
    expect(component.canEditReport(row('IN_PROGRESS'))).toBe(true);
    expect(component.canEditReport(row('SUBMITTED', 'DRAFT'))).toBe(true);
    expect(component.canEditReport(row('CANCELLED', 'DRAFT'))).toBe(false);
    expect(component.canEditReport(row('CLOSED', 'PUBLISHED'))).toBe(false);
    expect(component.canEditReport(row('SUBMITTED', 'APPROVED'))).toBe(false);
    expect(component.canEditReport(row('IN_PROGRESS', 'DRAFT', true))).toBe(false);
  });
});
