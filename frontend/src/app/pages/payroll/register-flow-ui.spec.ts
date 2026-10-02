import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { page } from 'vitest/browser';
import { RegisterLibraryComponent } from './register-library.component';
import { RegisterPreparationComponent } from './register-preparation.component';
import { By } from '@angular/platform-browser';

// Fictional records: exercise the rendered flow without accessing real payroll data.
describe('Register preparation screen', () => {
  afterEach(async () => {
    TestBed.inject(HttpTestingController).verify();
    await page.viewport(1280, 720);
  });
  it('selects formats directly, groups editable details and keeps actions usable on phones', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RegisterLibraryComponent);
    const c = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const field = (key: string, label: string) => ({ key, label, type: 'text', required: true });
    Object.assign(c, {
      branchId: 'example-branch', branchName: 'Example Hyderabad factory', branchStateCode: 'TS',
      jurisdiction: 'TS', year: 2026, month: 3, runId: 'approved-example-run',
      info: { code: 'TS', name: 'Telangana' },
      forms: [{ id: 'example-integrated', actCode: 'FACTORIES_1948', formNumber: 'II + III',
        title: 'Integrated register — Factories (both parts)', kind: 'REGISTER',
        sourceStatus: 'EXISTING_RULES', notes: 'Retain both parts and review supporting records.',
        usage: 'REGISTER', source: { title: 'Example prescribed source', notification: 'Example order', url: 'https://example.com/source.pdf' },
        preparationAvailable: true, sourceDownloadAvailable: true }],
    });
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/jurisdictions')).flush([{ code: 'TS', name: 'Telangana' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const act = root.querySelector<HTMLSelectElement>('[aria-label="Select Act for registers"]')!;
    act.value = 'FACTORIES_1948';
    act.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('Integrated register — Factories');
    expect(root.textContent).not.toContain('Show registers');
    [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Prepare this register'))!.click();
    fixture.detectChanges();
    const particulars = [field('establishmentName', 'Name of establishment'), field('address', 'Address'),
      field('regularWorkers', 'Regular workers'), field('categoryPermanentMale', 'Permanent — male'),
      field('inspections', 'Inspection details'), field('manager', 'Manager'), field('registrations', 'Registration details')];
    http.expectOne(r => r.url.endsWith('/definition')).flush({
      form: { actCode: 'FACTORIES_1948', sourceId: 'tsi' },
      layout: { baseFormNumber: 'STATE', manualOnly: true, payrollDraftPrefill: true, capacityRequired: true,
        particulars, particularsTitle: 'Establishment particulars',
        fields: [field('name', 'Employee name'), field('gross', 'Gross wages'), field('occupation', 'Occupation')] },
    });
    http.expectOne(r => r.url.endsWith('/eligibility')).flush({ eligible: true });
    http.expectOne(r => r.url.endsWith('/prefill')).flush({
      metadata: { employer: 'Example Manufacturing', owner: 'Example owner', employerPan: 'EXAMPLE', registrationNumber: 'EXAMPLE-001', issueDate: '2026-04-01' },
      particulars: { establishmentName: 'Example Hyderabad factory', address: 'Example Industrial Estate', regularWorkers: 2, categoryPermanentMale: 0 },
      rows: [{ name: 'Example worker A', gross: 24000 }, { name: 'Example worker B', gross: 0, occupation: 'Operator' }],
      sourceReference: 'Approved example payroll — March 2026',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const prep = fixture.debugElement.query(By.directive(RegisterPreparationComponent)).componentInstance as RegisterPreparationComponent;
    expect(prep.particularGroups.flatMap(g => g.fields).map(f => f.key).sort()).toEqual(particulars.map(f => f.key).sort());
    expect(root.textContent).toContain('Saved records loaded');
    const summaries = [...root.querySelectorAll('summary')];
    const workforce = summaries.find(s => s.textContent?.includes('Workforce totals'))!;
    expect(workforce.textContent).toContain('0 required fields remaining');
    const workerA = summaries.find(s => s.textContent?.includes('Record 1'))!;
    const workerB = summaries.find(s => s.textContent?.includes('Record 2'))!;
    expect(workerA.textContent).toContain('1 required fields remaining');
    expect(workerB.textContent).toContain('0 required fields remaining');
    workerA.click();
    const occupation = [...workerA.parentElement!.querySelectorAll('label')].find(l => l.textContent?.includes('Occupation'))!.querySelector('input')!;
    occupation.value = 'Technician';
    occupation.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(prep.rows[0]['occupation']).toBe('Technician');
    expect(workerA.textContent).toContain('0 required fields remaining');
    workerA.click();
    expect(root.textContent).toContain('Download empty template (no worker data)');
    expect(root.textContent).toContain('Generate and save register');
    const saved = document.createElement('section');
    saved.id = 'saved-registers';
    saved.tabIndex = -1;
    document.body.append(saved);
    try {
      const url = window.location.href;
      [...root.querySelectorAll('button')].find(b => b.textContent?.includes('View saved registers'))!.click();
      expect(document.activeElement).toBe(saved);
      expect(window.location.href).toBe(url);
    } finally {
      saved.remove();
    }
    for (const [width, height, label] of [[1440, 1000, 'desktop'], [390, 844, 'phone']] as const) {
      await page.viewport(width, height);
      const panel = root.querySelector('section')!;
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
      if (width < 640) {
        const columns = getComputedStyle(root.querySelector('.register-choice-grid')!).gridTemplateColumns;
        expect(columns.split(' ')).toHaveLength(1);
      }
      const primary = [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Generate and save register'))!;
      expect(primary.disabled).toBe(false);
      expect(primary.getBoundingClientRect().width).toBeLessThanOrEqual(width);
      root.querySelector('h3')!.scrollIntoView({ block: 'start' });
      await page.screenshot({ path: `__screenshots__/register-flow-${label}.png` });
      primary.scrollIntoView({ block: 'end' });
      await page.screenshot({ path: `__screenshots__/register-flow-${label}-details.png` });
    }
  });
});
