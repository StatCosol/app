import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { CrmComplianceComponent } from './crm-compliance.component';

describe('CRM evidence scope switching', () => {
  it('cancels old actual reads and never displays their results in test scope', () => {
    const component = Object.create(CrmComplianceComponent.prototype) as any;
    const actualList = new Subject<any>(), actualKpis = new Subject<any>();
    const testList = new Subject<any>(), testKpis = new Subject<any>();
    const api = { list: vi.fn().mockReturnValueOnce(actualList).mockReturnValueOnce(testList),
      kpis: vi.fn().mockReturnValueOnce(actualKpis).mockReturnValueOnce(testKpis) };
    Object.assign(component, { destroy$: new Subject<void>(), crmDocsApi: api, routeClientId: '',
      docFilters: {recordScope:'ACTUAL'}, docs:[], docSearch:'', cdr:{detectChanges:vi.fn()}, toast:{error:vi.fn()} });
    component.loadDocs();component.loadDocKpis();
    component.docFilters.recordScope='TEST';component.onDocumentScopeChange();
    expect(actualList.observed).toBe(false);expect(actualKpis.observed).toBe(false);
    testList.next({data:[{id:'test'}]});testKpis.next({pending_review:1});
    actualList.next({data:[{id:'actual'}]});actualKpis.next({pending_review:99});
    expect(component.docs).toEqual([{id:'test'}]);expect(component.docKpis.pending_review).toBe(1);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({recordScope:'TEST'}));
    expect(api.kpis).toHaveBeenLastCalledWith('TEST');
    component.destroy$.next();
  });
});
