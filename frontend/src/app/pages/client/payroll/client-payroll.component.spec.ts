import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ClientPayrollComponent } from './client-payroll.component';
import { ClientPayrollService, EmployeePayrollRecord } from '../../../core/client-payroll.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

describe('LegitX and BranchDesk payroll downloads', () => {
  const row: EmployeePayrollRecord = { employeeId: 'employee-a', employeeCode: 'A1', employeeName: 'Alice', branchId: 'branch-a', runId: 'run-a', runStatus: 'APPROVED', payslipAvailable: true, fnfId: 'fnf-a', fnfStatus: 'COMPLETED', settlementAvailable: true, relievingAvailable: true };
  function setup(path = '/client/payroll') {
    const payroll = {
      listInputs: vi.fn(() => of([])), listRuns: vi.fn(() => of([])),
      listEmployeeRecords: vi.fn(() => of({ records: [row], bulkPayslipAvailable: true })),
      payslipFileUrl: vi.fn(() => '/published-payslip'), payslipPackUrl: vi.fn(() => '/payslips-pack'),
      fnfDocumentUrl: vi.fn((_id, type) => '/finalized/' + type),
    };
    const files = { download: vi.fn(() => of(undefined)) };
    const toast = { error: vi.fn() };
    TestBed.configureTestingModule({ imports: [ClientPayrollComponent], providers: [
      provideRouter([]), { provide: ClientPayrollService, useValue: payroll },
      { provide: ClientBranchesService, useValue: { list: () => of([]) } },
      { provide: ProtectedFileService, useValue: files }, { provide: ToastService, useValue: toast },
    ] });
    Object.defineProperty(TestBed.inject(Router), 'url', { get: () => path });
    const fixture = TestBed.createComponent(ClientPayrollComponent);
    fixture.componentInstance.filters.periodYear = 2026;
    fixture.componentInstance.filters.periodMonth = 9;
    fixture.componentInstance.filters.branchId = 'branch-a';
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, payroll, files, toast };
  }
  it.each(['/client', '/branch'])('links payroll to the correct register download portal: %s', (portal) => {
    const { fixture } = setup(portal + '/payroll');
    const link = [...fixture.nativeElement.querySelectorAll('a')].find((a: any) => a.textContent.includes('Registers Download')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(portal + '/registers');
  });
  it('shows bulk download without opening an employee and preserves the displayed month and branch', () => {
    const { fixture, component, payroll, files } = setup();
    expect(component.selectedEmployeeRecord).toBeNull();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Download payslips for this month')) as HTMLButtonElement;
    component.filters.periodMonth = 10;
    button.click();
    expect(payroll.payslipPackUrl).toHaveBeenCalledWith({ periodYear: 2026, periodMonth: 9, branchId: 'branch-a' });
    expect(files.download).toHaveBeenCalledWith('/payslips-pack', 'payslips_2026_09.zip');
  });
  it('offers all three finalized employee documents and sends authenticated downloads', () => {
    const { fixture, component, payroll, files } = setup();
    component.selectEmployeeRecord(row);
    fixture.detectChanges();
    for (const label of ['Download payslip', 'Download settlement statement', 'Download relieving letter']) {
      const button = [...fixture.nativeElement.querySelectorAll('.record-panel button')].find((b: any) => b.textContent.trim() === label) as HTMLButtonElement;
      expect(button).toBeTruthy();
      button.click();
    }
    expect(files.download).toHaveBeenCalledTimes(3);
    expect(payroll.fnfDocumentUrl).toHaveBeenCalledWith('fnf-a', 'SETTLEMENT_STATEMENT');
    expect(payroll.fnfDocumentUrl).toHaveBeenCalledWith('fnf-a', 'RELIEVING_LETTER');
  });
  it('blocks duplicate requests, reports failures and restores the download controls', () => {
    const { component, files, toast } = setup();
    const pending = new Subject<undefined>();
    files.download.mockReturnValueOnce(pending);
    component.downloadEmployeePayslip(row);
    component.downloadEmployeePayslip(row);
    expect(files.download).toHaveBeenCalledTimes(1);
    pending.error(new Error('Unavailable'));
    expect(component.documentDownloadBusy).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Could not download payslip.');
    files.download.mockReturnValueOnce(throwError(() => new Error('Unavailable')));
    component.downloadRelievingLetter(row);
    expect(component.documentDownloadBusy).toBe(false);
  });
});
