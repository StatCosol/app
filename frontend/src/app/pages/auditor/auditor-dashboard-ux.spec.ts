import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AuditorDashboardComponent } from './auditor-dashboard.component';

const KEY = 'auditor_timeline_alerts_shown';

describe('Auditor dashboard usability', () => {
  let component: AuditorDashboardComponent;

  beforeEach(async () => {
    sessionStorage.removeItem(KEY);
    await TestBed.configureTestingModule({
      imports: [AuditorDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();
    component = TestBed.createComponent(AuditorDashboardComponent).componentInstance;
  });
  afterEach(() => sessionStorage.removeItem(KEY));

  it('labels audit-log codes in plain words', () => {
    expect(component.activityLabel('NC_ACCEPTED')).toBe('Correction accepted');
    expect(component.activityLabel('STATUS_CHANGE')).toBe('Audit status changed');
    expect(component.activityLabel('SOME_NEW_EVENT')).toBe('Some new event');
    expect(component.activityLabel(null)).toBe('Activity');
  });

  it('pages the working queue ten rows at a time and resets on reload', () => {
    component.myAudits = Array.from({ length: 23 }, (_, i) => ({ id: String(i) }) as any);
    expect(component.pagedAudits.map((a: any) => a.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i)),
    );
    component.queuePage = 3;
    expect(component.pagedAudits.map((a: any) => a.id)).toEqual(['20', '21', '22']);
  });

  it('opens the overdue popup once per browser session, not on every visit', () => {
    const run = (c: AuditorDashboardComponent) => {
      (c as any).allActionableAudits = [{ dueDate: '2000-01-01' }];
      (c as any).computeAlertItems();
    };
    run(component);
    expect(component.showAlertPopup).toBe(true);
    expect(component.alertItems[0].text).toContain('overdue');

    // A fresh dashboard instance (navigating back) keeps the badge, skips the popup.
    const again = TestBed.createComponent(AuditorDashboardComponent).componentInstance;
    run(again);
    expect(again.showAlertPopup).toBe(false);
    expect(again.alertItems.length).toBe(1);
  });
});
