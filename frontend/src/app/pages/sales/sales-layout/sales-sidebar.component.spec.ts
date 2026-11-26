import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SalesSidebarComponent } from './sales-sidebar.component';

function activeLabels(url: string): string[] {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { url } }] });
  const sidebar = TestBed.runInInjectionContext(() => new SalesSidebarComponent());
  return sidebar.items.filter((item) => sidebar.isActive(item)).map((item) => item.label);
}

describe('Sales sidebar active item', () => {
  it('highlights only New Lead on the new-lead page', () => {
    expect(activeLabels('/sales/leads/new')).toEqual(['New Lead']);
  });

  it('highlights Leads on the list and on a lead detail page', () => {
    expect(activeLabels('/sales/leads')).toEqual(['Leads']);
    expect(activeLabels('/sales/leads/8f2c1d9e-0000-4000-8000-000000000001')).toEqual(['Leads']);
    expect(activeLabels('/sales/leads?status=OPEN')).toEqual(['Leads']);
  });

  it('highlights the dashboard only on the dashboard', () => {
    expect(activeLabels('/sales/dashboard')).toEqual(['Dashboard']);
    expect(activeLabels('/sales/followups')).toEqual(['Follow-ups']);
  });

  it('does not treat a route that only shares a prefix as a match', () => {
    expect(activeLabels('/sales/leadsx')).toEqual([]);
  });
});
