import { EsiGenerator } from './esi.generator';

/**
 * Overtime must never remove anyone from ESI. ESI_WAGES carries overtime, so a
 * covered ₹20,000 employee with ₹1,500 OT reports ₹21,500 — above the ceiling —
 * and the return used to skip them even though the run deducted their ESI.
 */
describe('EsiGenerator', () => {
  function generator(rows: Record<string, Record<string, number>>) {
    const employees = Object.keys(rows).map((id) => ({
      id,
      esic: `ESIC-${id}`,
      employeeName: id,
      branchId: null,
    }));
    const gen = new (EsiGenerator as any)(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'run',
          clientId: 'client-0001',
          periodYear: 2026,
          periodMonth: 4,
        }),
      },
      { find: jest.fn().mockResolvedValue(employees) },
      {
        find: jest.fn(async ({ where }: any) =>
          Object.entries(rows[where.runEmployeeId]).map(
            ([componentCode, amount]) => ({ componentCode, amount }),
          ),
        ),
      },
      { findOne: jest.fn().mockResolvedValue({ esiWageCeiling: 21000 }) },
      {},
      { find: jest.fn().mockResolvedValue([]) },
    );
    gen.saveLinkage = jest.fn();
    return gen as EsiGenerator;
  }

  it('keeps a covered employee whose overtime takes ESI wages over the ceiling', async () => {
    const [file] = await generator({
      withOt: { ESI_WAGES: 21500, ESI_EMP: 162, ESI_ER: 699 },
    }).generate('run');
    expect(file.content).toContain('ESIC-withOt');
    expect(file.content).toContain('|21500|162|699|861');
  });

  it('still leaves out an employee above the ceiling who was charged no ESI', async () => {
    const [file] = await generator({
      notCovered: { ESI_WAGES: 30000, ESI_EMP: 0, ESI_ER: 0 },
      covered: { ESI_WAGES: 15000, ESI_EMP: 113, ESI_ER: 488 },
    }).generate('run');
    expect(file.content).not.toContain('ESIC-notCovered');
    expect(file.content).toContain('ESIC-covered');
  });
});
