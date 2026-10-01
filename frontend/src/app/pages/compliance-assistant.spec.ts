import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComplianceAssistantComponent } from '../shared/components/compliance-assistant/compliance-assistant.component';

describe('Compliance Assistant empty action plan', () => {
  it.each(['client', 'branch'] as const)('offers same-scope compliance status in the %s portal', (portal) => {
    TestBed.configureTestingModule({
      imports: [ComplianceAssistantComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ComplianceAssistantComponent);
    fixture.componentRef.setInput('portal', portal);
    fixture.componentRef.setInput('month', 8);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('branchId', 'branch-two');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    const request = http.expectOne(req => req.url.endsWith('/legitx/assistant/plan'));
    expect(request.request.body).toEqual({ month: 8, year: 2026, branchId: 'branch-two' });
    request.flush({ mode: 'RULES', note: 'No open compliance tasks were found for this selection.',
      coverage: 'Based on recorded compliance tasks for the selected period and authorized branch scope.',
      period: { month: 8, year: 2026 }, scope: { branchId: 'branch-two' }, actions: [] });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('AI explanations are currently unavailable');
    expect(text).toContain('Check the selected month and branch');
    expect(text).toContain('does not confirm that every compliance obligation is complete');
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    const url = new URL(link.href);
    expect(url.pathname).toBe(`/${portal}/compliance/status`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ month: '8', year: '2026', branchId: 'branch-two' });
    expect(button.textContent).toContain('Refresh action plan');
    http.verify();
  });

  it('keeps the all-branches selection without an invented branch filter', () => {
    const component = new ComplianceAssistantComponent({} as any);
    component.portal = 'branch'; component.month = 9; component.year = 2026; component.branchId = 'ALL';
    expect(component.statusQueryParams).toEqual({ month: 9, year: 2026, branchId: undefined });
    expect(component.statusRoute).toBe('/branch/compliance/status');
  });
});
