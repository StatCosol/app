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
  const makeService = (opts: { run: any; assertThrows?: boolean }) => {
    const assertClientAllowed = jest.fn(async () => {
      if (opts.assertThrows)
        throw new ForbiddenException('Client not in scope');
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
    );
    return { svc, assertClientAllowed, runRepo };
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

  it('still rejects a missing run before any scope check', async () => {
    const { svc, assertClientAllowed } = makeService({ run: null });

    await expect(
      svc.generateForEmployee('nope', 'emp-1', 'u1', caller),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assertClientAllowed).not.toHaveBeenCalled();
  });
});
