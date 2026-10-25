import { describe, expect, it } from 'vitest';
import { workspaceNavigation } from './workspace-navigation';
describe('consolidated workspace navigation', () => {
 it.each(['/client/compliance/returns','/client/returns-status','/app/client/returns-summary?branchId=b&periodYear=2026'])('keeps all return views reachable from %s', url => {
  const group = workspaceNavigation(url)!;
  expect(group.title).toBe('Returns & Filings');
  expect(group.links.map(l => l.label)).toEqual(['Filings','Status','Summary']);
  expect(group.links.every(l => l.module === 'EMPLOYEE_COMPLIANCE')).toBe(true);
 });
 it('separates document module permissions and never crosses portals', () => {
  const group = workspaceNavigation('/branch/safety')!;
  expect(group.links.every(l => l.route.startsWith('/branch/'))).toBe(true);
  expect(group.links.find(l => l.label === 'Audit Evidence')?.module).toBe('CONTRACTOR_AUDIT');
  expect(group.links.filter(l => l.module === 'EMPLOYEE_COMPLIANCE')).toHaveLength(5);
 });
 it('keeps expiry dates and renewal work distinct', () => {
  expect(workspaceNavigation('/client/renewals')?.links.map(l => l.route)).toEqual(['/client/compliance/registrations','/client/renewals','/client/renewals-status']);
 });
 it('keeps CRM document discovery pinned to the same client', () => {
  const links=workspaceNavigation('/crm/clients/client-123/documents')!.links;
  expect(links.every(l=>l.route.startsWith('/crm/clients/client-123/'))).toBe(true);
  expect(links[0].route).toBe('/crm/clients/client-123/compliance-tracker');
 });
 it('pins all payroll configuration links to the selected client', () => {
  const group = workspaceNavigation('/payroll/clients/client-123/setup?runId=r')!;
  expect(group.links).toHaveLength(4);
  expect(group.links.every(l => l.route.startsWith('/payroll/clients/client-123/'))).toBe(true);
 });
 it.each(['/client/returns-summary-other','/auditor/dashboard','/payroll/clients/c/runs'])('does not expose unrelated navigation for %s', url => expect(workspaceNavigation(url)).toBeUndefined());
});
