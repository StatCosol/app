import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  BULK_UPLOAD_BATCH_SIZE,
  ContractorEmployeesPageComponent,
} from './contractor-employees-page.component';

describe('Contractor bulk upload batching', () => {
  let component: ContractorEmployeesPageComponent;
  let sent: { rows: any[]; branchId?: string }[];
  const success = vi.fn();
  const error = vi.fn();
  const bulkUpload = vi.fn();

  beforeEach(() => {
    sent = [];
    success.mockClear();
    error.mockClear();
    bulkUpload.mockReset();
    bulkUpload.mockImplementation((rows: any[], branchId?: string) => {
      sent.push({ rows, branchId });
      return of({ created: rows.length, failed: 0, results: rows.map((_, i) => ({ index: i, ok: true })) });
    });
    type Args = ConstructorParameters<typeof ContractorEmployeesPageComponent>;
    component = new ContractorEmployeesPageComponent(
      { bulkUpload } as unknown as Args[0],
      {} as Args[1],
      { success, error } as unknown as Args[2],
      {} as Args[3],
      { markForCheck: vi.fn() } as unknown as Args[4],
    );
    component.availableBranches = [{ id: 'branch-1', branchName: 'Branch 1' }] as any;
    component.bulkBranchId = 'branch-1';
    vi.spyOn(component, 'load').mockImplementation(() => {});
  });

  const sheet = (count: number, overrides: (i: number) => Record<string, any> = () => ({})) =>
    Array.from({ length: count }, (_, i) => ({
      name: `Worker ${i}`,
      skillCategory: 'SKILLED',
      monthlySalary: 15000,
      aadhaar: String(100000000000 + i),
      pan: 'ABCDE1234F',
      bankAccount: '001234567890',
      ...overrides(i),
    }));

  const preview = (rows: Record<string, any>[]) => {
    component.bulkPreview = component['validateBulkRows'](rows);
  };

  it('splits a sheet larger than the server cap into capped batches', () => {
    preview(sheet(BULK_UPLOAD_BATCH_SIZE * 2 + 500));
    expect(component.bulkErrorCount).toBe(0);
    expect(component.bulkBatchCount).toBe(3);

    component.submitBulk();

    expect(sent.map((r) => r.rows.length)).toEqual([
      BULK_UPLOAD_BATCH_SIZE,
      BULK_UPLOAD_BATCH_SIZE,
      500,
    ]);
    expect(sent.every((r) => r.branchId === 'branch-1')).toBe(true);
    expect(component.bulkResult).toEqual(
      expect.objectContaining({ created: BULK_UPLOAD_BATCH_SIZE * 2 + 500, failed: 0 }),
    );
    expect(component.bulkError).toBeNull();
    expect(component.bulkUploading).toBe(false);
  });

  it('sends a sheet within the cap as a single request', () => {
    preview(sheet(3));
    component.submitBulk();
    expect(sent).toHaveLength(1);
    expect(sent[0].rows).toHaveLength(3);
  });

  it('numbers failures by spreadsheet row, not by position in the request', () => {
    // Row 1 (index 0) never leaves the browser, so the server's index 0 is the
    // sheet's second row.
    preview(sheet(3, (i) => (i === 0 ? { aadhaar: '123' } : {})));
    bulkUpload.mockImplementation((rows: any[]) =>
      of({
        created: 1,
        failed: 1,
        results: [
          { index: 0, ok: true, id: 'a', name: rows[0].name },
          { index: 1, ok: false, error: 'Contractor is not mapped to this branch' },
        ],
      }),
    );

    component.submitBulk();

    expect(component.bulkResult!.results.map((r: any) => r.index)).toEqual([1, 2]);
  });

  it('keeps the rows an earlier batch committed when a later one is rejected', () => {
    preview(sheet(BULK_UPLOAD_BATCH_SIZE + 10));
    let call = 0;
    bulkUpload.mockImplementation((rows: any[]) => {
      call++;
      if (call === 1) {
        return of({ created: rows.length, failed: 0, results: rows.map((_, i) => ({ index: i, ok: true })) });
      }
      return throwError(() => ({ status: 400, error: { message: ['rows must contain no more than 1000 elements'] } }));
    });

    component.submitBulk();

    expect(component.bulkResult!.created).toBe(BULK_UPLOAD_BATCH_SIZE);
    expect(component.bulkError).toContain('Stopped at batch 2 of 2');
    expect(component.bulkError).toContain(`${BULK_UPLOAD_BATCH_SIZE} row(s) already added`);
    expect(component.bulkError).toContain('no more than 1000 elements');
    expect(component.load).toHaveBeenCalled();
    expect(component.bulkUploading).toBe(false);
  });

  it('surfaces a rejection of the only batch in the panel, not just a toast', () => {
    preview(sheet(2));
    bulkUpload.mockImplementation(() =>
      throwError(() => ({ status: 400, error: { message: ['branchId must be a UUID'] } })),
    );

    component.submitBulk();

    expect(component.bulkError).toBe('branchId must be a UUID');
    expect(component.bulkError).not.toContain('Stopped at batch');
    expect(error).toHaveBeenCalled();
    expect(component.load).not.toHaveBeenCalled();
  });
});
