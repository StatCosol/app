import { ContractorEmployeesService } from './contractor-employees.service';

/**
 * The same worker must not land on the register twice.
 *
 * A check for this shipped in #197 and was dropped by #227 along with helpers
 * it used, so from June a file uploaded twice created every worker twice —
 * which is exactly what happened to a 75-worker upload.
 */
describe('refusing a worker who is already registered', () => {
  const found = (row: any) => {
    const qb: any = { conditions: [] as string[], params: {} as any };
    for (const m of ['where', 'andWhere']) {
      qb[m] = (sql: string, params?: any) => {
        qb.conditions.push(sql);
        Object.assign(qb.params, params ?? {});
        return qb;
      };
    }
    qb.select = () => qb;
    qb.getOne = async () => row;
    return qb;
  };
  const service = (row: any) => {
    const svc: any = Object.create(ContractorEmployeesService.prototype);
    const qb = found(row);
    svc.qb = qb;
    svc.em = { createQueryBuilder: () => qb };
    return svc;
  };
  const args = {
    clientId: 'client',
    branchId: 'branch',
    contractorUserId: 'contractor',
    name: 'Ravi Kumar',
  };

  it('refuses the same Aadhaar anywhere in the client, naming who holds it', async () => {
    const svc = service({
      id: 'other',
      name: 'Ravi Kumar',
      employeeCode: 'SBS0007',
    });
    await expect(
      svc.assertNoDuplicateRegistration(svc.em, {
        ...args,
        aadhaar: '1234 5678 9012',
      }),
    ).rejects.toThrow(
      'This Aadhaar is already registered to Ravi Kumar - SBS0007',
    );
    // Matched on digits alone, and not narrowed to one branch or contractor.
    expect(svc.qb.params.aadhaar).toBe('123456789012');
    expect(svc.qb.conditions.join(' ')).not.toContain('ce.branchId');
  });

  it('without an Aadhaar, refuses the same name for that contractor at that branch', async () => {
    const svc = service({
      id: 'other',
      name: 'Ravi Kumar',
      employeeCode: 'SBS0007',
    });
    await expect(
      svc.assertNoDuplicateRegistration(svc.em, args),
    ).rejects.toThrow('already registered for this contractor at this branch');
    const sql = svc.qb.conditions.join(' ');
    expect(sql).toContain('ce.branchId');
    expect(sql).toContain('ce.contractorUserId');
    // The stored name is normalised the same way the supplied one is.
    expect(sql).toContain('regexp_replace(ce.name');
    expect(svc.qb.params.name).toBe('ravi kumar');
  });

  it('lets a worker through when nobody matches, and ignores those who have left', async () => {
    const svc = service(undefined);
    await expect(
      svc.assertNoDuplicateRegistration(svc.em, args),
    ).resolves.toBeUndefined();
    expect(svc.qb.params.activeStatuses).toEqual(['ACTIVE', 'PENDING_DELETE']);
  });

  it('does not count the worker being edited as their own duplicate', async () => {
    const svc = service(undefined);
    await svc.assertNoDuplicateRegistration(svc.em, {
      ...args,
      excludeId: 'self',
    });
    expect(svc.qb.conditions.join(' ')).toContain('ce.id <> :excludeId');
    expect(svc.qb.params.excludeId).toBe('self');
  });
});

describe('an edit that assigns an identity', () => {
  const build = (over: any = {}) => {
    const svc: any = Object.create(ContractorEmployeesService.prototype);
    const calls: string[] = [];
    const qb: any = {};
    for (const m of ['where', 'andWhere', 'select']) qb[m] = () => qb;
    qb.getOne = async () => over.duplicate;
    const em = {
      // withCodeLock takes the advisory lock on this manager first.
      query: async () => [],
      createQueryBuilder: () => {
        calls.push('CHECK');
        return qb;
      },
      save: async (v: any) => {
        calls.push('SAVE');
        return v;
      },
    };
    svc.calls = calls;
    svc.dataSource = {
      transaction: async (cb: any) => {
        calls.push('LOCKED');
        return cb(em);
      },
    };
    svc.repo = {
      findOne: async () => ({
        id: 'self',
        clientId: 'client',
        branchId: 'branch',
        contractorUserId: 'contractor',
        name: 'Ravi Kumar',
        skillCategory: 'UNSKILLED',
      }),
      manager: em,
      save: async (v: any) => {
        calls.push('SAVE_UNLOCKED');
        return v;
      },
    };
    svc.minWage = { validateSalary: async () => ({ ok: true }) };
    svc.userRepo = { findOne: async () => ({ scheduledEmployment: null }) };
    svc.branchRepo = {
      findOne: async () => ({ id: 'branch', stateCode: 'TS' }),
    };
    return svc;
  };

  it('checks and saves under the same lock, so two edits cannot both pass', async () => {
    const svc = build();
    await svc.update('self', 'contractor', { aadhaar: '123456789012' });
    expect(svc.calls).toEqual(['LOCKED', 'CHECK', 'SAVE']);
  });

  it('refuses an identity that belongs to someone else', async () => {
    const svc = build({
      duplicate: { id: 'other', name: 'Ravi Kumar', employeeCode: 'SBS0007' },
    });
    await expect(
      svc.update('self', 'contractor', { aadhaar: '123456789012' }),
    ).rejects.toThrow('already registered');
    expect(svc.calls).not.toContain('SAVE');
  });

  it('does not take the lock for an edit that touches neither name nor identity', async () => {
    const svc = build();
    await svc.update('self', 'contractor', { designation: 'Supervisor' });
    expect(svc.calls).toEqual(['SAVE_UNLOCKED']);
  });
});
