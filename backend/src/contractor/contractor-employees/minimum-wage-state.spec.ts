import { ContractorEmployeesService } from './contractor-employees.service';

/**
 * Which state the minimum-wage gate is measured against, on create and update.
 *
 * `validateSalary()` returns early when the state is missing, and nothing on
 * the single-registration path ever supplied one: the form has no state field
 * and the create DTO carries no such property. So the hard check that was
 * written to block a below-minimum salary passed every registration, while bulk
 * imports were checked because the spreadsheet has a stateCode column.
 *
 * The branch is the source, matching what payroll already does in
 * contractor-computation.service.ts: `branch?.stateCode ?? employee?.stateCode`.
 */
function makeService(opts: {
  branchStateCode?: string | null;
  branchMissing?: boolean;
}) {
  const validateSalary = jest.fn().mockResolvedValue({ ok: true });
  const checkSalary = jest.fn().mockResolvedValue(null);

  const em = {
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: any, v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'new-id', ...v })),
  };

  const branchRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.branchMissing ? null : { id: 'b1', stateCode: opts.branchStateCode ?? null },
    ),
  };

  const employeeRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'e1',
      branchId: 'b1',
      contractorUserId: 'u1',
      stateCode: null,
      skillCategory: 'SKILLED',
      monthlySalary: 15000,
    }),
    save: jest.fn(async (v: any) => v),
  };

  const service = new ContractorEmployeesService(
    employeeRepo as any,
    { validateSalary, checkSalary } as any,
    // resolveSchedule()
    { findOne: jest.fn().mockResolvedValue({ scheduledEmployment: null }) } as any,
    // assertContractorBranch()
    { findOne: jest.fn().mockResolvedValue({ id: 'link' }) } as any,
    { transaction: jest.fn(async (cb: any) => cb(em)) } as any,
    branchRepo as any,
  );

  return { service, validateSalary, branchRepo, employeeRepo };
}

/** employeeCode supplied so the run does not need the allocation queries. */
const dto = (extra: Record<string, unknown> = {}) => ({
  name: 'Ravi Kumar',
  employeeCode: 'SBS001',
  skillCategory: 'SKILLED' as const,
  monthlySalary: 15000,
  ...extra,
});

describe('minimum-wage state resolution', () => {
  it("measures the salary against the branch's state", async () => {
    const { service, validateSalary, branchRepo } = makeService({
      branchStateCode: 'KA',
    });

    await service.create('c1', 'b1', 'u1', dto() as any);

    expect(branchRepo.findOne).toHaveBeenCalled();
    expect(validateSalary).toHaveBeenCalledWith(
      expect.objectContaining({
        stateCode: 'KA',
        skillCategory: 'SKILLED',
        monthlySalary: 15000,
      }),
    );
  });

  it('prefers the branch over a state supplied on the body', async () => {
    // Payroll resolves it branch-first; a second precedence rule here would
    // mean registration and payroll could disagree about which wage applies.
    const { service, validateSalary } = makeService({ branchStateCode: 'KA' });

    await service.create('c1', 'b1', 'u1', dto({ stateCode: 'MH' }) as any);

    expect(validateSalary).toHaveBeenCalledWith(
      expect.objectContaining({ stateCode: 'KA' }),
    );
  });

  it('falls back to the body when the branch has no state', async () => {
    const { service, validateSalary } = makeService({ branchStateCode: null });

    await service.create('c1', 'b1', 'u1', dto({ stateCode: 'MH' }) as any);

    expect(validateSalary).toHaveBeenCalledWith(
      expect.objectContaining({ stateCode: 'MH' }),
    );
  });

  it('stays a no-op when neither has a state', async () => {
    // lookup() returns early on a missing state, so this is the pre-existing
    // behaviour: nothing is enforced rather than everything being rejected.
    const { service, validateSalary } = makeService({ branchMissing: true });

    await service.create('c1', 'b1', 'u1', dto() as any);

    expect(validateSalary).toHaveBeenCalledWith(
      expect.objectContaining({ stateCode: null }),
    );
  });

  it('applies the same state to an update', async () => {
    // The gate would otherwise close on create and reopen one request later:
    // the state is deliberately not stored on the row, so update() reading
    // emp.stateCode alone saw null and validateSalary() returned early. A
    // worker registered at a compliant salary could be edited below the
    // statutory minimum immediately afterwards.
    const { service, validateSalary } = makeService({ branchStateCode: 'KA' });

    await service.update('e1', 'u1', { monthlySalary: 9000 } as any);

    expect(validateSalary).toHaveBeenCalledWith(
      expect.objectContaining({ stateCode: 'KA', monthlySalary: 9000 }),
    );
  });

  it('does not copy the branch state onto the employee row', async () => {
    // Payroll reads the branch first anyway, and a stored copy would go stale
    // the day a branch's state is corrected.
    const { service } = makeService({ branchStateCode: 'KA' });

    const saved = await service.create('c1', 'b1', 'u1', dto() as any);

    expect((saved as any).stateCode).toBeUndefined();
  });
});
