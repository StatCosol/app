import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { CrmRegistrationsComponent } from './crm/registrations/crm-registrations.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';
import { ToastService } from '../shared/toast/toast.service';
import { ConfirmDialogService } from '../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../shared/ui';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';

afterEach(() => TestBed.resetTestingModule());
it.each(['original','renewal','current'])('previews the %s registration file through authenticated retrieval', async kind => {
 const url = `/uploads/crm-documents/test-client/${kind}.txt`;
 const record = {id:'test-reg',type:'Factory License',documentUrl:kind === 'current' ? url : '/uploads/crm-documents/test-client/original.txt',renewalDocumentUrl:'/uploads/crm-documents/test-client/renewal.txt',computedStatus:'ACTIVE'};
 const fetch = vi.fn().mockReturnValue(of({blob:new Blob(['synthetic document'],{type:'text/plain'}),objectUrl:'',fileName:`${kind}.txt`,mimeType:'text/plain',revoke:vi.fn()}));
 await TestBed.configureTestingModule({imports:[CrmRegistrationsComponent],providers:[
  {provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({clientId:'test-client'}))}},
  {provide:ClientBranchesService,useValue:{crmListRegistrations:()=>of([record])}},{provide:CrmClientsApi,useValue:{getBranchesForClient:()=>of([{id:'branch-a',name:'Test branch'}])}},
  {provide:ToastService,useValue:{}},{provide:ConfirmDialogService,useValue:{}},
  {provide:ProtectedFileService,useValue:{fetch}}
 ]}).overrideComponent(CrmRegistrationsComponent,{remove:{imports:[ClientContextStripComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
 const fixture = TestBed.createComponent(CrmRegistrationsComponent);
 fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();

 if(kind === 'current') {(fixture.nativeElement.querySelector('[aria-label="Edit"]') as HTMLButtonElement).click();}
 fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
 const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
 const button = buttons.find(b => kind === 'renewal' ? b.textContent?.includes('Renewal') : b.getAttribute('aria-label') === (kind === 'current' ? 'View current' : 'View'));
 expect(button).toBeDefined();button!.click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
 expect(fetch).toHaveBeenCalledWith(url,`${kind}.txt`);
 expect(document.querySelector('[aria-label="Document preview"]')).not.toBeNull();
 expect(fixture.nativeElement.querySelector('a[href*="/uploads/"]')).toBeNull();
 const close = document.querySelector('[aria-label="Close preview"]') as HTMLButtonElement;
 close.click();fixture.detectChanges();expect(fixture.componentInstance.documentPreview).toBeNull();
});