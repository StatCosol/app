import { describe, it, expect } from 'vitest';
import { detailPagePurpose, branchNavigationUrl } from './detail-page-purpose';
import { portalPagePurpose } from './portal-page-purpose';

describe('Record-level page guidance', () => {
  it.each(['client', 'branch'])('distinguishes %s enrollment, editing and viewing', role => {
    expect(detailPagePurpose(`/app/${role}/employees/new?from=list`)?.title).toBe('Register an employee');
    expect(detailPagePurpose(`/${role}/employees/test/edit#form`)?.title).toBe('Update employee details');
    expect(detailPagePurpose(`/${role}/employees/test`)?.title).toBe('Review an employee record');
    expect(detailPagePurpose(`/${role}/employees`)).toBeUndefined();
  });
  it('keeps branch audit corrections under observations', () => {
    expect(branchNavigationUrl('/app/branch/audits/test/non-compliances?status=OPEN')).toBe('/app/branch/audits/observations?status=OPEN');
    expect(branchNavigationUrl('/branch/audits/test/non-compliances-extra')).toBe('/branch/audits/test/non-compliances-extra');
    expect(detailPagePurpose('/branch/audits/test/non-compliances')?.title).toContain('Corrective');
  });
  it.each(['overview','branches','contractors','contractor-computation','quotation-comparison','clra','compliance-tracker','documents','compliance-docs','registrations','payroll-status','unit-documents','safety'])('explains the selected CRM client %s workspace', section => {
    const guide = portalPagePurpose(`/app/crm/clients/test-client/${section}?branch=test`);
    expect(guide?.purpose.length).toBeGreaterThan(70);
    expect(guide?.title).not.toBe(portalPagePurpose('/crm/clients')?.title);
  });
  it.each(['/auditor/audits/test/workspace','/auditor/reports/test/builder','/contractor/audits/test/non-compliances','/payroll/clients/test/employees/test','/client/branches/test/applicability','/client/branches/test/compliance-items','/client/branches/test','/client/contractors/branch/test','/client/appraisals/test','/branch/appraisals/test','/cco/news/test'])('provides specific guidance for %s', url => {
    expect(detailPagePurpose(url)?.purpose.length).toBeGreaterThan(70);
  });
  it('does not match similar route names or extra segments', () => {
    expect(detailPagePurpose('/client/employees/test/edit/unknown')).toBeUndefined();
    expect(detailPagePurpose('/auditor/reports/test/builder-other')).toBeUndefined();
  });
});
