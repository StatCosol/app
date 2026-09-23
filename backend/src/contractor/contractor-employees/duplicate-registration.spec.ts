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
    expect(sql).toContain('LOWER(TRIM(ce.name))');
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
