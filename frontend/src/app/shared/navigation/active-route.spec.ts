import { describe, expect, it } from 'vitest';
import { activeNavigationRoute } from './active-route';

describe('exclusive navigation selection', () => {
  const routes = ['/branch/audits', '/branch/audits/observations', '/branch/attendance', '/branch/attendance/daily'];
  it.each(['/branch/audits/observations', '/app/branch/audits/observations?status=OPEN#response', '/app/branch/audits/observations/123'])('selects only observations at %s', url => {
    expect(activeNavigationRoute(url, routes)).toBe('/branch/audits/observations');
  });
  it('keeps audit evidence details within the reports item', () => {
    expect(activeNavigationRoute('/app/branch/audits/evidence?auditId=123', routes)).toBe('/branch/audits');
  });
  it('also separates attendance children from their parent', () => {
    expect(activeNavigationRoute('/app/branch/attendance/daily', routes)).toBe('/branch/attendance/daily');
  });
  it('does not match a partial segment or an unrelated route', () => {
    expect(activeNavigationRoute('/app/branch/audits-archive', routes)).toBeUndefined();
    expect(activeNavigationRoute('/app/client/audits', routes)).toBeUndefined();
  });
});
