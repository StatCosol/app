import { vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ContractorEmployeesPageComponent } from './contractor-employees-page.component';
import { ContractorEmployee } from '../../../core/contractor-employees-api.service';

describe('Contractor worker download', () => {
  let component: ContractorEmployeesPageComponent;
  let blobs: Blob[];
  let names: string[];
  const error = vi.fn();
  beforeEach(() => {
    blobs = []; names = []; error.mockClear();
    type Args = ConstructorParameters<typeof ContractorEmployeesPageComponent>;
    component = new ContractorEmployeesPageComponent(
      {} as Args[0], {} as Args[1], { error } as unknown as Args[2],
      {} as Args[3], { markForCheck: vi.fn() } as unknown as Args[4],
    );
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      blobs.push(blob as Blob); return 'blob:worker-export';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) {
      names.push(this.download);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  const worker = (name: string, isActive = true) => ({
    name, isActive, status: isActive ? 'ACTIVE' : 'LEFT', branchId: 'branch-1',
    employeeCode: 'SBS0001', punchCode: '00063', phone: '09876543210', monthlySalary: 0,
    aadhaar: 'not-for-export',
  } as ContractorEmployee);

  it('exports only matching active workers and preserves text codes, formula-like names and zero salary', async () => {
    component.allRows = [worker('=Sri Sai, Worker'), worker('Other'), worker('Sri Sai Left', false)];
    component.searchTerm = 'Sri Sai';
    component.applyFilters();
    await component.downloadWorkers();
    const workbook = XLSX.read(await blobs[0].arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets['Workers'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows).toHaveLength(1);
    expect(rows[0]['Worker Name']).toBe('=Sri Sai, Worker');
    expect(rows[0]['Contract Employee ID']).toBe('SBS0001');
    expect(rows[0]['Punch Code']).toBe('00063');
    expect(rows[0]['Phone']).toBe('09876543210');
    expect(rows[0]['Monthly Salary']).toBe(0);
    expect(sheet['A2'].t).toBe('s');
    expect(sheet['A2'].f).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain('not-for-export');
    expect(names[0]).toMatch(/^contractor-workers-active-.*\.xlsx$/);
  });

  it('finds a worker by employee ID', () => {
    component.allRows = [worker('Ravi')];
    component.searchTerm = 'sbs0001';
    component.applyFilters();
    expect(component.filteredRows).toHaveLength(1);
  });

  it('blocks new registration without mandatory identity and bank details', () => {
    component.form.name = 'Synthetic Worker';
    component.saveEmployee();
    expect(component.formError).toContain('Aadhaar, PAN and bank account number are required');
    expect(component.saving).toBe(false);
  });

  it('validates mandatory bulk fields and refuses numeric bank cells', () => {
    const valid = { name: 'Synthetic Worker', skillCategory: 'SKILLED', monthlySalary: 15000, aadhaar: '123456789012', pan: 'abcde1234f', bankAccount: '001234567890' };
    const rows = component['validateBulkRows']([valid, { ...valid, bankAccount: 1234567890 }, { ...valid, aadhaar: '', pan: '', bankAccount: '' }]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].dto.bankAccount).toBe('001234567890');
    expect(rows[0].dto.pan).toBe('ABCDE1234F');
    expect(rows[1].errors.join(' ')).toContain('as text');
    expect(rows[2].errors).toHaveLength(3);
  });

  it('blocks exports while branch data is loading, after failure, and for an empty list', async () => {
    component.filteredRows = [worker('Old branch worker')];
    component.loading = true;
    await component.downloadWorkers();
    component.loading = false; component.errorMsg = 'Load failed';
    await component.downloadWorkers();
    component.errorMsg = null; component.filteredRows = [];
    await component.downloadWorkers();
    expect(blobs).toHaveLength(0);
  });

  it('reports download failures and allows a retry', async () => {
    component.filteredRows = [worker('Worker')];
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error('Unavailable'); });
    await component.downloadWorkers();
    expect(error).toHaveBeenCalled();
    expect(component.downloading).toBe(false);
    await component.downloadWorkers();
    expect(blobs).toHaveLength(1);
  });
});
