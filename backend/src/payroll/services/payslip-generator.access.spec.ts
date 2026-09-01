import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayslipGeneratorService } from './payslip-generator.service';

/**
 * Payslips are the most sensitive artefact in the product — salary, deductions,
 * PF. `runId` and `employeeId` arrive straight from the URL and nothing scoped
 * them: `generatedByUserId` is only stamped on the archive record and never
 * authorised anything, and ScopeGuard cannot help because the request carries
 * no clientId. A CLIENT user could name another company's run and download it.
 */
describe('PayslipGeneratorService — client scoping', () => {
  const makeService = (opts: {
    run: any;
    assertThrows?: boolean;
    payrollThrows?: boolean;
  }) => {
    const assertClientAllowed = jest.fn(async () => {
      if (opts.assertThrows)
        throw new ForbiddenException('Client not in scope');
    });
    const assertPayrollAccessToClient = jest.fn(async () => {
      if (opts.payrollThrows)
        throw new ForbiddenException(
          'Payroll user not assigned to this client',
        );
    });
    const runRepo = { findOne: jest.fn(async () => opts.run) };
    const runEmpRepo = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
    };

    const svc = new PayslipGeneratorService(
      runRepo as any,
      runEmpRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertClientAllowed } as any,
      { assertPayrollAccessToClient } as any,
    );
    return { svc, assertClientAllowed, assertPayrollAccessToClient, runRepo };
  };

  const caller = { userId: 'u1', roleCode: 'CLIENT', clientId: 'itc' } as any;
  const run = {
    id: 'run-1',
    clientId: 'vedha',
    periodYear: 2026,
    periodMonth: 8,
  };

  it('refuses a single payslip from a run outside the caller scope', async () => {
    const { svc, assertClientAllowed } = makeService({
      run,
      assertThrows: true,
    });

    await expect(
      svc.generateForEmployee('run-1', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assertClientAllowed).toHaveBeenCalledWith(caller, 'vedha');
  });

  it('refuses a whole-run generation outside the caller scope', async () => {
    const { svc, assertClientAllowed } = makeService({
      run,
      assertThrows: true,
    });

    await expect(
      svc.generateForRun('run-1', 'u1', caller),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assertClientAllowed).toHaveBeenCalledWith(caller, 'vedha');
  });

  it('checks the run the caller actually asked for, not one they supplied', async () => {
    // The clientId comes from the loaded run, never from the request, so a
    // caller cannot assert their way past it.
    const { svc, assertClientAllowed } = makeService({
      run: { ...run, clientId: 'some-third-client' },
      assertThrows: true,
    });

    await expect(
      svc.generateForEmployee('run-1', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assertClientAllowed).toHaveBeenCalledWith(
      caller,
      'some-third-client',
    );
  });

  it('proceeds past the scope check when the run is in scope', async () => {
    const { svc, assertClientAllowed } = makeService({ run });

    // Allowed through the gate, then fails later for an unrelated reason —
    // proving the check passed rather than short-circuiting the request.
    await expect(
      svc.generateForEmployee('run-1', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assertClientAllowed).toHaveBeenCalledWith(caller, 'vedha');
  });

  describe('PAYROLL callers', () => {
    // AccessScopeService lists PAYROLL in GLOBAL_ROLES, so assertClientAllowed
    // returns immediately for them without ever consulting payroll
    // assignments. Routing them through it would have left salary PDFs open to
    // every tenant — their real scope is payroll_client_assignments.
    const payrollCaller = {
      id: 'p1',
      userId: 'p1',
      roleCode: 'PAYROLL',
      clientId: null,
    } as any;

    it('checks payroll assignments, not the global scope helper', async () => {
      const { svc, assertClientAllowed, assertPayrollAccessToClient } =
        makeService({ run, payrollThrows: true });

      await expect(
        svc.generateForEmployee('run-1', 'emp-1', 'p1', payrollCaller),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(assertPayrollAccessToClient).toHaveBeenCalledWith(
        payrollCaller,
        'vedha',
      );
      // Must NOT fall through to the helper that treats PAYROLL as global.
      expect(assertClientAllowed).not.toHaveBeenCalled();
    });

    it('applies the same check to a whole-run generation', async () => {
      const { svc, assertPayrollAccessToClient } = makeService({
        run,
        payrollThrows: true,
      });

      await expect(
        svc.generateForRun('run-1', 'p1', payrollCaller),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(assertPayrollAccessToClient).toHaveBeenCalledWith(
        payrollCaller,
        'vedha',
      );
    });

    it('lets an assigned payroll user through', async () => {
      const { svc, assertPayrollAccessToClient } = makeService({ run });

      await expect(
        svc.generateForEmployee('run-1', 'emp-1', 'p1', payrollCaller),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(assertPayrollAccessToClient).toHaveBeenCalled();
    });
  });

  it('keeps non-payroll roles on the general scope check', async () => {
    // assertPayrollAccessToClient rejects anyone who is not payroll or admin,
    // so routing a CLIENT user through it would break a legitimate path.
    const { svc, assertClientAllowed, assertPayrollAccessToClient } =
      makeService({ run });

    await expect(
      svc.generateForEmployee('run-1', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assertClientAllowed).toHaveBeenCalledWith(caller, 'vedha');
    expect(assertPayrollAccessToClient).not.toHaveBeenCalled();
  });

  it('still rejects a missing run before any scope check', async () => {
    const { svc, assertClientAllowed } = makeService({ run: null });

    await expect(
      svc.generateForEmployee('nope', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assertClientAllowed).not.toHaveBeenCalled();
  });
});
