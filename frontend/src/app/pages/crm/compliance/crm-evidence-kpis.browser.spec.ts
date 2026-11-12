import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
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

it.each(['success', 'failure', 'null'])('renders the actual global template while scope KPI response is %s', async outcome => {
  vi.spyOn(CrmComplianceComponent.prototype,'ngOnInit').mockImplementation(() => {});
  const response = new Subject<any>();
  const api = {list:vi.fn(() => of({data:[]})), kpis:vi.fn(() => response)};
  await TestBed.configureTestingModule({imports:[CrmComplianceComponent], providers:[
    provideRouter([]),
    {provide:CrmContractorDocumentsApi,useValue:api},
    {provide:CrmClientsApi,useValue:{}},
    {provide:ComplianceApiService,useValue:{}},
    {provide:ToastService,useValue:{error:vi.fn()}},
    {provide:ConfirmDialogService,useValue:{}},
    {provide:ProtectedFileService,useValue:{}},
  ]}).overrideComponent(CrmComplianceComponent,{
    remove:{imports:[ClientContextStripComponent]},add:{schemas:[NO_ERRORS_SCHEMA]},
  }).compileComponents();
  const fixture = TestBed.createComponent(CrmComplianceComponent);
  const component = fixture.componentInstance;
  component.docKpis.approved=17;
  fixture.detectChanges();await fixture.whenStable();

  const selector=fixture.nativeElement.querySelector('[aria-label="Contractor evidence records"]') as HTMLSelectElement;
  selector.value='TEST';selector.dispatchEvent(new Event('change'));
  await fixture.whenStable();
  expect(() => fixture.detectChanges()).not.toThrow();
  expect(component.docKpis.approved).toBe(0);
  expect(fixture.nativeElement.textContent).toContain('TEST DATA ONLY');
  expect(api.kpis).toHaveBeenLastCalledWith('TEST');

  if(outcome==='failure') response.error(new Error('synthetic request failure'));
  else response.next(outcome==='null'?null:{approved:2});
  expect(() => fixture.detectChanges()).not.toThrow();
  expect(component.docKpis.approved).toBe(outcome==='success'?2:0);
  expect(!!fixture.nativeElement.querySelector('[role="alert"]')).toBe(outcome!=='success');

  const retry=new Subject<any>();api.kpis.mockReturnValue(retry);
  selector.value='ACTUAL';selector.dispatchEvent(new Event('change'));
  await fixture.whenStable();fixture.detectChanges();
  expect(component.docKpis.approved).toBe(0);
  expect(component.docKpiError).toBe(false);
  retry.next({approved:17,pending_review:1});
  fixture.detectChanges();
  expect(component.docKpis.approved).toBe(17);
  expect(fixture.nativeElement.textContent).not.toContain('TEST DATA ONLY');
  fixture.destroy();
});
