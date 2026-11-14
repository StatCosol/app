import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CrmComplianceComponent } from './crm-compliance.component';
import { CrmContractorDocumentsApi } from '../../../core/api/crm-contractor-documents.api';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { ClientContextStripComponent } from '../../../shared/ui';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

it.each([false, true])('renders an audit summary without an observation-close action (empty=%s)', async empty => {
  vi.spyOn(CrmComplianceComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  const api = { crmGetAuditClosures: vi.fn(() => of({ data: [] })), crmCloseAuditObservation: vi.fn() };
  await TestBed.configureTestingModule({ imports: [CrmComplianceComponent], providers: [
    provideRouter([]),
    { provide: CrmContractorDocumentsApi, useValue: {} },
    { provide: CrmClientsApi, useValue: {} },
    { provide: ComplianceApiService, useValue: api },
    { provide: ToastService, useValue: {} },
    { provide: ConfirmDialogService, useValue: {} },
    { provide: ProtectedFileService, useValue: {} },
  ] }).overrideComponent(CrmComplianceComponent, {
    remove: { imports: [ClientContextStripComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] },
  }).compileComponents();
  const fixture = TestBed.createComponent(CrmComplianceComponent);
  fixture.componentInstance.activeTab = 'AUDIT_CLOSURES';
  fixture.componentInstance.auditClosures = empty ? [] : [{
    auditId: 'synthetic-audit-id', auditCode: 'LOCAL-FIXTURE', clientName: 'Local client', branchName: 'Local unit',
    majorOpen: 1, totalObservations: 2, closedObservations: 1, closurePct: 50,
  }];
  fixture.detectChanges(); await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.textContent).toContain('Each row represents an audit');
  expect(root.querySelector('a[routerLink="/crm/audits"]')?.textContent).toContain('Open Audits');
  expect(Array.from(root.querySelectorAll('button')).some(button => /close/i.test(button.textContent || ''))).toBe(false);
  expect(root.querySelectorAll('table th').length).toBe(9);
  if (empty) expect(root.querySelector('td[colspan="9"]')?.textContent).toContain('No audit closures found');
  else expect(root.textContent).toContain('50%');
  (root.querySelector('button[aria-label="Refresh"]') as HTMLButtonElement).click();
  await fixture.whenStable();
  expect(api.crmGetAuditClosures).toHaveBeenCalledTimes(1);
  expect(api.crmCloseAuditObservation).not.toHaveBeenCalled();
  fixture.destroy();
});
