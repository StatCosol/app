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

describe('Formula quotation entry', () => {
  const make = () => new CrmContractorsComponent({ quotationBranches: () => of([]) } as any, {} as any, {} as any, { markForCheck: () => {} } as any, {} as any);
  it('writes formulas, subtotals and unbilled earnings for the upload', async () => {
    const c = make(); c.quoteDesignation = 'HK Staff'; c.quoteSkill = 'UNSKILLED';
    c.quoteComponents = [
      { ...c.newQuoteComponent(), code: 'per_day', category: 'SUBTOTAL', value: 577, prorate: false },
      { ...c.newQuoteComponent(), code: 'BASIC_DA', value: 15002 },
      { ...c.newQuoteComponent(), code: 'LEAVE', method: 'FORMULA', formula: ' 1.5 * PER_DAY ', prorate: true, billable: false },
      { ...c.newQuoteComponent(), code: 'BONUS', method: 'FORMULA', formula: '(BASIC_DA + LEAVE) * 8.33%', prorate: false },
    ];
    const wb = XLSX.read(await c.manualQuoteFile().arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    expect(rows[0]).toMatchObject({ component_code: 'PER_DAY', category: 'SUBTOTAL', formula: '' });
    expect(rows[2]).toMatchObject({ method: 'FORMULA', formula: '1.5 * PER_DAY', prorate: 'yes', billable: 'no', value: '' });
    expect(rows[3]).toMatchObject({ formula: '(BASIC_DA + LEAVE) * 8.33%', prorate: 'no', billable: '' });
  });
  it('requires a formula on formula lines', () => {
    const c = make(); c.quoteDesignation = 'HK Staff'; c.quoteSkill = 'UNSKILLED';
    c.quoteComponents = [{ ...c.newQuoteComponent(), code: 'BONUS', method: 'FORMULA', formula: '  ' }];
    expect(() => c.manualQuoteFile()).toThrow(/formula/);
  });
});

describe('Vendor breakup import', () => {
  const make = () => new CrmContractorsComponent({ quotationBranches: () => of([]) } as any, {} as any, {} as any, { markForCheck: () => {}, detectChanges: () => {} } as any, {} as any);
  const draft = (over: any = {}) => ({
    key: 'B', include: true, skillCategory: 'UNSKILLED', designation: 'MANUAL PACKING - FEMALE', effectiveFrom: '2026-06-01',
    check: { ok: true },
    components: [
      { code: 'PER_DAY', label: 'Per day wage', category: 'SUBTOTAL', method: 'FIXED', value: 577, prorate: false },
      { code: 'BASIC_DA', label: 'Basic+DA', category: 'EARNING', method: 'FORMULA', value: 0, formula: 'PER_DAY*26', prorate: true },
      { code: 'LEAVE', label: 'Leave', category: 'EARNING', method: 'FORMULA', value: 0, formula: 'BASIC_DA*4.81%', prorate: false, billable: false },
    ],
    ...over,
  });
  it('writes the confirmed roles in the component template', async () => {
    const c = make();
    c.vendorDrafts = [draft(), draft({ key: 'C', include: false })];
    const wb = XLSX.read(await c.vendorQuoteFile().arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ component_code: 'PER_DAY', category: 'SUBTOTAL', method: 'FIXED', value: 577, effective_from: '2026-06-01', rounding: 'PAISE' });
    expect(rows[1]).toMatchObject({ method: 'FORMULA', formula: 'PER_DAY*26', prorate: 'yes', value: '' });
    expect(rows[2]).toMatchObject({ billable: 'no', prorate: 'no' });
  });
  it('refuses roles that are unconfirmed, clash or differ from the vendor', () => {
    const c = make();
    c.vendorDrafts = [draft({ skillCategory: '' })];
    expect(() => c.vendorQuoteFile()).toThrow(/skill category/);
    c.vendorDrafts = [draft(), draft({ key: 'C' })];
    expect(() => c.vendorQuoteFile()).toThrow(/share/);
    c.vendorDrafts = [draft({ check: { ok: false } })];
    expect(() => c.vendorQuoteFile()).toThrow(/reproduce/);
    c.vendorDrafts = [draft({ include: false })];
    expect(() => c.vendorQuoteFile()).toThrow(/Tick at least one/);
  });
});
