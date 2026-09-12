import { of } from 'rxjs';
import { CrmContractorsComponent } from './crm-contractors.component';
import * as XLSX from 'xlsx';
describe('Manual quotation entry', () => {
  it('preserves the quotation effective date and calculation basis', async () => {
    const c = new CrmContractorsComponent({} as any, {} as any, {} as any, {} as any, {} as any);
    c.quoteDesignation = 'Security Guard'; c.quoteSkill = 'SKILLED'; c.quoteEffectiveFrom = '2026-06-01';
    c.quoteComponents = [{ ...c.newQuoteComponent(), code: 'BASIC_DA', value: 16000 }, { ...c.newQuoteComponent(), code: 'PF_EMP', category: 'DEDUCTION', method: 'PERCENT', value: 12, basis: 'BASIC_DA', ceiling: '15000', prorate: false }];
    const wb = XLSX.read(await c.manualQuoteFile().arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]]);
    expect(rows[0].effective_from).toBe('2026-06-01'); expect(rows[0].value).toBe(16000);
    expect(rows[1].basis).toBe('BASIC_DA'); expect(rows[1].prorate).toBe('no');
    c.quoteComponents[1].basis = 'UNKNOWN'; expect(() => c.manualQuoteFile()).toThrow(/earlier rows/);
  });
});

describe('Quotation editor defaults', () => {
  const make = () => new CrmContractorsComponent({ quotationBranches: () => of([]) } as any, {} as any, {} as any, { markForCheck: () => {} } as any, {} as any);
  it('clears proration when switching to percentage or hourly calculations', () => {
    const c = make();
    for (const method of ['PERCENT', 'HOURLY']) {
      const row = { ...c.newQuoteComponent(), method };
      c.onQuoteMethodChange(row);
      expect(row.prorate).toBe(false);
      row.method = 'FIXED'; c.onQuoteMethodChange(row);
      expect(row.prorate).toBe(false);
    }
  });
  it('never writes proration for non-fixed components even with stale editor state', async () => {
    const c = make(); c.quoteDesignation = 'Guard'; c.quoteSkill = 'SKILLED';
    c.quoteComponents = [
      { ...c.newQuoteComponent(), code: 'BASIC_DA', value: 16000 },
      { ...c.newQuoteComponent(), code: 'PF_EMP', category: 'DEDUCTION', method: 'PERCENT', basis: 'BASIC_DA', value: 12 },
      { ...c.newQuoteComponent(), code: 'OT', method: 'HOURLY', value: 100 },
    ];
    const wb = XLSX.read(await c.manualQuoteFile().arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]]);
    expect(rows.map(row => row.prorate)).toEqual(['yes', 'no', 'no']);
  });
  it('resets rounding when opening a different contractor', () => {
    const c = make();
    c.openQuoteUpload({ id: 'first' }); c.quoteRounding = 'PAISE';
    c.closeQuoteUpload(); c.openQuoteUpload({ id: 'second' });
    expect(c.quoteRounding).toBe('RUPEE');
    c.ngOnDestroy();
  });
});
