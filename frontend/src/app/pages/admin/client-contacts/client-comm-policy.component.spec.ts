import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientCommPolicyComponent } from './client-comm-policy.component';
import { AuthService } from '../../../core/auth.service';
describe('Client reminder policy UI', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ClientCommPolicyComponent], providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { getUser: () => ({ roleCode: 'ADMIN' }) } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  it('cancels the previous client request and saves only the selected client/version', () => {
    const f = TestBed.createComponent(ClientCommPolicyComponent);
    f.componentRef.setInput('clientId','client-a'); f.detectChanges();
    const old = http.expectOne(r => r.url.includes('/client-a/'));
    f.componentRef.setInput('clientId','client-b'); f.detectChanges();
    expect(old.cancelled).toBe(true); expect(f.componentInstance.policies()).toEqual([]);
    const policy = { commType: 'MCD_REQUEST', requestDay: 16, deadlineDay: 25, enabled: true, version: 3 };
    http.expectOne(r => r.url.includes('/client-b/')).flush([policy]); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Contractor documents');
    f.componentInstance.save(policy);
    const save = http.expectOne(r => r.method === 'PATCH' && r.url.includes('/client-b/'));
    expect(save.request.body.version).toBe(3); save.flush([{ ...policy, version: 4 }]); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Schedule saved for future requests'); f.destroy();
  });
});
