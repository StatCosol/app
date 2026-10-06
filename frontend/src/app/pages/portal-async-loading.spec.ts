import { Component, InjectionToken, NgZone, OnInit, inject, provideZoneChangeDetection, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { ClientLayoutComponent } from './client/client-layout/client-layout.component';
import { BranchLayoutComponent } from './branch/branch-layout/branch-layout.component';
import { CrmLayoutComponent } from './crm/crm-layout/crm-layout.component';
import { ContractorLayoutComponent } from './contractor/contractor-layout/contractor-layout.component';
import { AuditorLayoutComponent } from './auditor/auditor-layout/auditor-layout.component';
import { AdminLayoutComponent } from './admin/admin-layout/admin-layout.component';
import { PayrollLayoutComponent } from './payroll/payroll-layout/payroll-layout.component';
import { CcoLayoutComponent } from './cco/cco-layout/cco-layout.component';
import { CeoLayoutComponent } from './ceo/ceo-layout/ceo-layout.component';
import { EssLayoutComponent } from './ess/ess-layout/ess-layout.component';
import { PfTeamLayoutComponent } from './pf-team/pf-team-layout/pf-team-layout.component';
import { AccountsLayoutComponent } from './accounts/accounts-layout/accounts-layout.component';
import { SalesLayoutComponent } from './sales/sales-layout/sales-layout.component';

const DATA = new InjectionToken<Subject<string>>('delayed portal data');
@Component({ standalone: true, template: '<p class="delayed-data">{{ data }}</p>' })
class DelayedModulePage implements OnInit {
  data = 'Loading module';
  private source = inject(DATA);
  ngOnInit() { this.source.subscribe(value => { this.data = value; }); }
}
@Component({ standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class RootHost {}

describe('Portal renders delayed module data on the first visit', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it.each([['client', ClientLayoutComponent],
['branch', BranchLayoutComponent],
['crm', CrmLayoutComponent],
['contractor', ContractorLayoutComponent],
['auditor', AuditorLayoutComponent],
['admin', AdminLayoutComponent],
['payroll', PayrollLayoutComponent],
['cco', CcoLayoutComponent],
['ceo', CeoLayoutComponent],
['ess', EssLayoutComponent],
['pf-team', PfTeamLayoutComponent],
['accounts', AccountsLayoutComponent],
['sales', SalesLayoutComponent] ] as Array<[string, Type<any>]>)('%s portal', async (_portal, layout) => {
    const source = new Subject<string>();
    if (typeof layout.prototype.ngOnInit === 'function') vi.spyOn(layout.prototype, 'ngOnInit').mockImplementation(() => {});
    const auth = {
      getUser: () => ({ name: 'Test user', clientId: 'company', clientName: 'Test company', roleCode: 'CLIENT', branchIds: [] }),
      authenticateUrl: (url: string) => url, hasModule: () => true,
      sessionReset$: new Subject<void>(), getAccessToken: () => '',
    };
    TestBed.configureTestingModule({
      imports: [RootHost],
      providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: 'module', component: layout, children: [{ path: '', component: DelayedModulePage }] }]),
        { provide: DATA, useValue: source }, { provide: AuthService, useValue: auth },
      ],
    }).overrideComponent(layout, { set: { imports: [RouterOutlet], template: '<router-outlet />' } });
    const fixture = TestBed.createComponent(RootHost);
    fixture.autoDetectChanges();
    await TestBed.inject(Router).navigateByUrl('/module');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Loading module');
    TestBed.inject(NgZone).run(() => source.next('Recorded module data'));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Recorded module data');
    fixture.destroy(); source.complete();
  });
});
