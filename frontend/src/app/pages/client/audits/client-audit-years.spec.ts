import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ClientAuditsComponent } from './client-audits.component';
import { ClientAuditsService } from '../../../core/client-audits.service';

describe('Client and Branch audit year access', () => {
  async function setup() {
    const api = { list: vi.fn(() => of([] as any[])) };
    await TestBed.configureTestingModule({
      imports: [ClientAuditsComponent],
      providers: [provideHttpClient(), { provide: ClientAuditsService, useValue: api }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ClientAuditsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api };
  }

  it('keeps the current year default and offers an unfiltered year option', async () => {
    const { fixture, component } = await setup();
    expect(component.filters.year).toBe(new Date().getFullYear());
    expect(fixture.nativeElement.textContent).toContain('All years');
    expect(component.yearOptions.some(o => o.value === new Date().getFullYear())).toBe(true);
  });

  it('discovers older and future years and retains them after narrowing the results', async () => {
    const { fixture, component, api } = await setup();
    api.list.mockReturnValue(of([
      { id: 'old', periodYear: 2018, status: 'IN_PROGRESS', auditType: 'FACTORY', frequency: 'MONTHLY' },
      { id: 'future', periodCode: '2099-12', status: 'IN_PROGRESS', auditType: 'FACTORY', frequency: 'MONTHLY' },
      { id: 'bad', periodCode: 'invalid', status: 'IN_PROGRESS', auditType: 'FACTORY', frequency: 'MONTHLY' },
    ]));
    component.filters.year = '';
    component.loadAudits();
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ year: '' }));
    expect(component.yearOptions).toContainEqual({ value: 2018, label: '2018' });
    expect(component.yearOptions).toContainEqual({ value: 2099, label: '2099' });
    expect(component.yearOptions.every(o => o.value === '' || Number.isInteger(o.value))).toBe(true);
    component.filters.year = 2018;
    api.list.mockReturnValue(of([{ id: 'old', periodYear: 2018, status: 'IN_PROGRESS', auditType: 'FACTORY', frequency: 'MONTHLY' }]));
    component.loadAudits();
    expect(component.yearOptions).toContainEqual({ value: 2099, label: '2099' });
    expect(new Set(component.yearOptions.map(o => o.value)).size).toBe(component.yearOptions.length);
  });
});

