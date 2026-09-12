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
