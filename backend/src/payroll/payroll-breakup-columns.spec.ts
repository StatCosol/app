import * as ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PayrollProcessingService } from './payroll-processing.service';

/**
 * Which spreadsheet column each payroll value is read from.
 *
 * ExcelJS `eachCell` reports ONE-based column numbers, and the header map is
 * keyed by that number. The breakup importer then treated the same value as a
 * zero-based array index and added one to it, so every field was read from the
 * column to its right: the employee name arrived as the employee code, Basic
 * took HRA's amount, and the last column was dropped. The import reported
 * success with no errors.
 *
 * The attendance importer in the same file is correct — it keys by the same
 * one-based number and calls `getCell(col)` with no offset. Two conventions,
 * one file.
 */
describe('payroll breakup upload — column alignment', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'payroll-breakup-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A real .xlsx on disk, because the service reads one with ExcelJS. */
  async function writeSheet(
    rows: Array<Array<string | number>>,
    header: string[],
  ): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Breakup');
    ws.addRow(header);
    for (const r of rows) ws.addRow(r);
    const path = join(dir, `breakup-${Date.now()}-${Math.random()}.xlsx`);
    await wb.xlsx.writeFile(path);
    return path;
  }

  function makeService(components: string[]) {
    const savedRunEmps: any[] = [];
    const insertedValues: any[] = [];

    const runEmpRepo = {
      create: (v: any) => v,
      save: async (batch: any[]) => {
        const out = batch.map((b, i) => ({ ...b, id: `re-${i}` }));
        savedRunEmps.push(...out);
        return out;
      },
      find: async () => [],
    };

    const compValRepo = {
      createQueryBuilder: () => ({
        insert: () => ({
          values: (batch: any[]) => {
            insertedValues.push(...batch);
            return { orUpdate: () => ({ execute: async () => undefined }) };
          },
        }),
      }),
    };

    const manager = {
      getRepository: (entity: any) =>
        entity?.name === 'PayrollRunEmployeeEntity' ? runEmpRepo : compValRepo,
    };

    const args: any[] = new Array(16).fill({});
    args[0] = { findOne: async () => ({ id: 'run-1', clientId: 'c1', branchId: 'b1', status: 'DRAFT' }) };
    args[1] = { find: async () => [] };
    args[5] = {
      find: async () =>
        components.map((code) => ({ code, isActive: true, isRequired: false })),
    };
    args[8] = { find: async () => [] };
    args[13] = { transaction: async (cb: any) => cb(manager) };

    // getRepository dispatches on the entity class, so the mock has to see the
    // real ones the service passes in.
    const svc = new (PayrollProcessingService as any)(...args);
    return { svc, savedRunEmps, insertedValues };
  }

  it('reads each value from its own column, not the one to its right', async () => {
    const path = await writeSheet(
      [['E001', 'Example Employee', 15000, 6000]],
      ['Employee Code', 'Employee Name', 'Basic', 'HRA'],
    );

    const { svc, savedRunEmps, insertedValues } = makeService(['BASIC', 'HRA']);
    const res = await svc.uploadBreakup('run-1', { path } as any);

    expect(res.errors).toEqual([]);

    // The employee identity must come from its own columns.
    expect(savedRunEmps[0].employeeCode).toBe('E001');
    expect(savedRunEmps[0].employeeName).toBe('Example Employee');

    // …and each component from the column under its own header.
    const byCode = Object.fromEntries(
      insertedValues.map((v: any) => [v.componentCode, Number(v.amount)]),
    );
    expect(byCode).toEqual({ BASIC: 15000, HRA: 6000 });
  });

  it('does not silently drop the last column', async () => {
    // The off-by-one pushed the rightmost component past the end of the row,
    // so it vanished without an error — the failure mode that makes this
    // dangerous rather than merely wrong.
    const path = await writeSheet(
      [['E002', 'Second Worker', 20000, 8000, 1200]],
      ['Employee Code', 'Employee Name', 'Basic', 'HRA', 'Conveyance'],
    );

    const { svc, insertedValues } = makeService(['BASIC', 'HRA', 'CONVEYANCE']);
    await svc.uploadBreakup('run-1', { path } as any);

    const byCode = Object.fromEntries(
      insertedValues.map((v: any) => [v.componentCode, Number(v.amount)]),
    );
    expect(byCode).toEqual({ BASIC: 20000, HRA: 8000, CONVEYANCE: 1200 });
  });
});
