import { Subject } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { AuditorSidebarComponent } from './auditor-sidebar.component';

describe('Auditor menu during navigation completion', () => {
  it('keeps the first menu choice across a late completion, then follows a different page', () => {
    const events = new Subject<any>();
    const router = { url: '/auditor/dashboard', events, getCurrentNavigation: () => null };
    const sidebar = new AuditorSidebarComponent(router as any, { bypassSecurityTrustHtml: (html: string) => html } as any);
    const work = sidebar.navGroups.find(g => g.label === 'Audit Work')!;
    sidebar.toggleGroup(work);
    events.next(new NavigationEnd(1, '/auditor/dashboard', '/auditor/dashboard'));
    expect(work.expanded).toBe(true);
    expect(sidebar.navGroups.filter(g => g.expanded)).toHaveLength(1);
    router.url = '/auditor/analytics/repeat-ncs';
    events.next(new NavigationEnd(2, router.url, router.url));
    expect(work.expanded).toBe(false);
    expect(sidebar.navGroups.find(g => g.label === 'Insights & Reports')?.expanded).toBe(true);
    sidebar.ngOnDestroy();
  });

  it('keeps an intentional collapse on the same page', () => {
    const events = new Subject<any>();
    const router = { url: '/auditor/dashboard', events, getCurrentNavigation: () => null };
    const sidebar = new AuditorSidebarComponent(router as any, { bypassSecurityTrustHtml: (html: string) => html } as any);
    const overview = sidebar.navGroups.find(g => g.label === 'Overview')!;
    sidebar.toggleGroup(overview);
    events.next(new NavigationEnd(1, router.url, router.url));
    expect(overview.expanded).toBe(false);
    sidebar.ngOnDestroy();
  });
});

it('opens the destination section before the login navigation completes', () => {
  const events = new Subject<any>();
  const router = {
    url: '/login', events,
    getCurrentNavigation: () => ({ finalUrl: { toString: () => '/auditor/dashboard' } }),
  };
  const sidebar = new AuditorSidebarComponent(router as any, { bypassSecurityTrustHtml: (html: string) => html } as any);
  expect(sidebar.navGroups.find(g => g.label === 'Overview')?.expanded).toBe(true);
  const before = sidebar.navGroups.map(g => g.expanded);
  router.url = '/auditor/dashboard';
  events.next(new NavigationEnd(1, '/login', router.url));
  expect(sidebar.navGroups.map(g => g.expanded)).toEqual(before);
  sidebar.ngOnDestroy();
});

it('preserves a menu click before the login URL is replaced', () => {
  const events = new Subject<any>();
  const router = { url: '/login', events, getCurrentNavigation: () => ({ finalUrl: { toString: () => '/auditor/dashboard' } }) };
  const sidebar = new AuditorSidebarComponent(router as any, { bypassSecurityTrustHtml: (html: string) => html } as any);
  const work = sidebar.navGroups.find(g => g.label === 'Audit Work')!;
  sidebar.toggleGroup(work);
  router.url = '/auditor/dashboard';
  events.next(new NavigationEnd(1, '/login', router.url));
  expect(work.expanded).toBe(true);
  expect(sidebar.navGroups.filter(g => g.expanded)).toHaveLength(1);
  sidebar.ngOnDestroy();
});
