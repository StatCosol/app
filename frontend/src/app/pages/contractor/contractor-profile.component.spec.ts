import { of } from 'rxjs';
import { ContractorProfileComponent } from './contractor-profile.component';

describe('Contractor profile evidence isolation', () => {
  function create(documents: any[]) {
    const api = {
      getContractorProfile: () => of({ name: 'Contractor', email: 'test@example.com' }),
      getContractorBranches: () => of({ branches: [] }),
      getContractorDocuments: () => of(documents),
    };
    const component = new ContractorProfileComponent(api as any, { markForCheck() {} } as any, {} as any);
    component.ngOnInit();
    return component;
  }

  it('filters before limiting recent documents and preserves genuine test certificates', () => {
    const fixtures = Array.from({ length: 12 }, (_, i) => ({ fileName: `TEST-${i}.pdf`, title: 'Fixture', updatedAt: '2026-11-12' }));
    const component = create([...fixtures, { fileName: 'test certificate.pdf', title: 'Equipment test certificate', updatedAt: '2026-01-01' }]);
    expect(component.topRecentDocuments.map(d => d.title)).toEqual(['Equipment test certificate']);
    component.recordScope = 'TEST';
    expect(component.topRecentDocuments).toHaveLength(10);
    expect(component.topRecentDocuments.every(d => d.fileName.startsWith('TEST-'))).toBe(true);
    component.recordScope = 'ACTUAL';
    expect(component.topRecentDocuments).toHaveLength(1);
  });

  it('excludes legacy title-marked fixtures from statutory identity in either view', () => {
    const component = create([
      { title: 'SYNTHETIC TEST ONLY PF identity', fileName: 'pf.pdf', docType: 'PF', updatedAt: '2026-11-12' },
      { title: 'TEST ONLY ESI', fileName: 'esi.pdf', docType: 'ESI', updatedAt: '2026-11-12' },
      { title: 'Actual PF identity', fileName: 'pf-actual.pdf', docType: 'PF', updatedAt: '2026-01-01' },
    ]);
    expect(component.statutoryRows.find(d => d.key === 'PF')?.value).toBe('Actual PF identity');
    expect(component.statutoryRows.find(d => d.key === 'ESI')?.status).toBe('MISSING');
    const completeness = component.profileCompletenessPct;
    component.recordScope = 'TEST';
    expect(component.topRecentDocuments).toHaveLength(2);
    expect(component.profileCompletenessPct).toBe(completeness);
  });
});
