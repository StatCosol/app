import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { BillingGstReportComponent } from './billing-gst-report.component';
import { AccountsBillingService } from '../services/accounts-billing.service';

afterEach(() => TestBed.resetTestingModule());
it.each([390, 768, 1440])('shows taxable value and reimbursements without dropping balances at %ipx', async width => {
  await page.viewport(width, 900);
  await TestBed.configureTestingModule({imports: [BillingGstReportComponent], providers: [
    {provide: AccountsBillingService, useValue: {getActiveClients: () => of([]), getBillingReport: () => of({
      reportType: 'CLIENT_SUMMARY', title: 'Synthetic summary', generatedAt: '2026-11-11T00:00:00Z', filters: {}, rows: [], columns: [],
      summary: {invoiceCount: 17, clientCount: 4, taxableValue: 283558.35, reimbursementAmount: 185346,
        gstAmount: 51040.51, billedAmount: 519947, receivedAmount: 132868, outstandingAmount: 387079},
    })}},
  ]}).compileComponents();
  const fixture = TestBed.createComponent(BillingGstReportComponent);
  fixture.detectChanges(); await fixture.whenStable();
  expect(fixture.componentInstance.summaryCards).toHaveLength(8);
  const text = fixture.nativeElement.textContent;
  expect(text).toContain('2,83,558.35'); expect(text).toContain('1,85,346.00');
  expect(text).toContain('1,32,868.00'); expect(text).toContain('3,87,079.00');
  expect(text).toContain('Taxable Value excludes lines marked as reimbursements');
});
