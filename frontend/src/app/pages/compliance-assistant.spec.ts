import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComplianceAssistantComponent } from '../shared/components/compliance-assistant/compliance-assistant.component';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';
import { of } from 'rxjs';

describe('Compliance Assistant empty action plan', () => {
  it.each(['client', 'branch'] as const)(
    'offers same-scope compliance status in the %s portal',
    (portal) => {
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
      const request = http.expectOne((req) => req.url.endsWith('/legitx/assistant/plan'));
      expect(request.request.body).toEqual({ month: 8, year: 2026, branchId: 'branch-two' });
      request.flush({
        mode: 'RULES',
        note: 'No open compliance tasks were found for this selection.',
        coverage:
          'Based on recorded compliance tasks for the selected period and authorized branch scope.',
        period: { month: 8, year: 2026 },
        scope: { branchId: 'branch-two' },
        actions: [],
      });
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent;
      expect(text).not.toContain('AI explanations are currently unavailable');
      expect(text).toContain('Check the selected month and branch');
      expect(text).toContain('does not confirm that every compliance obligation is complete');
      const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
      const url = new URL(link.href);
      expect(url.pathname).toBe(`/${portal}/compliance/status`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        month: '8',
        year: '2026',
        branchId: 'branch-two',
      });
      expect(button.textContent).toContain('Refresh action plan');
      http.verify();
    },
  );

  it('keeps the all-branches selection without an invented branch filter', () => {
    const component = new ComplianceAssistantComponent({} as any);
    component.portal = 'branch';
    component.month = 9;
    component.year = 2026;
    component.branchId = 'ALL';
    expect(component.statusQueryParams).toEqual({ month: 9, year: 2026, branchId: undefined });
    expect(component.statusRoute).toBe('/branch/compliance/status');
  });
});

describe('Assist rendered document UI', () => {
  it.each(['EXACT', 'SHORTLIST'])(
    'renders %s stored documents and uses the authenticated viewer only when appropriate',
    async (status) => {
      const opened: string[] = [];
      TestBed.configureTestingModule({
        imports: [ComplianceAssistantComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ProtectedFileService,
            useValue: {
              open: (url: string) => {
                opened.push(url);
                return of(undefined);
              },
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(ComplianceAssistantComponent);
      fixture.componentRef.setInput('month', 8);
      fixture.componentRef.setInput('year', 2026);
      fixture.componentRef.setInput('branchId', 'branch-two');
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector(
        '#assist-document-request',
      ) as HTMLInputElement;
      input.value = "Show contractor ABC's pending documents";
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
      const submit = fixture.nativeElement.querySelector(
        'button[type=submit]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      submit.click();
      const http = TestBed.inject(HttpTestingController);
      const request = http.expectOne((req) => req.url.endsWith('/legitx/assistant/documents/find'));
      expect(request.request.body.branchId).toBe('branch-two');
      request.flush({
        status,
        sourceLabel: 'Recorded data',
        coverage: 'Stored documents only',
        message: 'A permitted document matched',
        documents: [
          {
            id: 'doc',
            kind: 'CONTRACTOR',
            title: 'Recorded PF evidence',
            owner: 'ABC',
            contractorId: 'contractor',
            branchId: 'branch-two',
            period: '2026-08',
            status: 'PENDING_REVIEW',
          },
        ],
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Recorded PF evidence');
      expect(fixture.nativeElement.textContent).toContain('Recorded data');
      expect(opened.length).toBe(status === 'EXACT' ? 1 : 0);
      const view = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
        (button: any) => button.textContent.includes('Open document'),
      ) as HTMLButtonElement;
      view.click();
      expect(opened.at(-1)).toContain('branchId=branch-two&contractorId=contractor');
      http.verify();
    },
  );
});
