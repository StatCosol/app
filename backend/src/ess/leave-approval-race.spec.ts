import { BadRequestException } from '@nestjs/common';
import { EssService } from './ess.service';

/**
 * Approving a leave application debits the balance exactly once.
 *
 * The status check ran outside the transaction and the write was an
 * unconditional save(), so two approvals racing on the same application both
 * read SUBMITTED, both proceeded, and both debited the balance and wrote a
 * ledger row — the employee lost twice the leave they took. Making the
 * transition itself the guard means the loser matches no row and stops before
 * the debit.
 */
describe('approveLeave — concurrent approvals', () => {
  function makeService(opts: { affectedPerCall: number[] }) {
    const debits: number[] = [];
    const ledgers: any[] = [];
    let call = 0;

    const app = {
      id: 'leave-1',
      status: 'SUBMITTED',
      employeeId: 'emp-1',
      clientId: 'client-a',
      branchId: 'branch-1',
      leaveType: 'CL',
      fromDate: '2026-04-01',
      toDate: '2026-04-02',
      totalDays: '2',
    };

    const updateBuilder = (target: any) => ({
      update: (entity: any) => ({
        set: (values: any) => ({
          where: () => ({
            execute: async () => {
              const name = entity?.name ?? String(entity);
              if (name.includes('LeaveApplication')) {
                const affected = opts.affectedPerCall[call++] ?? 0;
                return { affected };
              }
              // The balance debit — only reached by a winner.
              const used = values?.used?.();
              debits.push(Number(String(used).replace(/[^\d.]/g, '')));
              return { affected: 1 };
            },
          }),
        }),
      }),
    });

    const mgr: any = {
      createQueryBuilder: () => updateBuilder(mgr),
      create: (_e: any, v: any) => v,
      save: async (v: any) => {
        ledgers.push(v);
        return v;
      },
    };

    const svc = new (EssService as any)(...new Array(30).fill({})) as any;
    svc.leaveAppRepo = { findOne: async () => ({ ...app }) };
    svc.ds = { transaction: async (cb: any) => cb(mgr) };
    svc.assertClientBranchScope = () => undefined;

    return { svc, debits, ledgers };
  }

  it('debits once when the transition is claimed', async () => {
    const { svc, debits, ledgers } = makeService({ affectedPerCall: [1] });

    await expect(
      svc.approveLeave('leave-1', 'u1', 'client-a', 'ALL'),
    ).resolves.toEqual({ ok: true });

    expect(debits).toHaveLength(1);
    expect(ledgers).toHaveLength(1);
  });

  it('refuses the loser of a race before it debits anything', async () => {
    // The second approval finds the row no longer SUBMITTED, so its
    // conditional update affects nothing.
    const { svc, debits, ledgers } = makeService({ affectedPerCall: [0] });

    await expect(
      svc.approveLeave('leave-1', 'u2', 'client-a', 'ALL'),
    ).rejects.toThrow(BadRequestException);

    expect(debits).toEqual([]);
    expect(ledgers).toEqual([]);
  });

  it('two approvals of the same application debit once between them', async () => {
    // The whole point, stated as the thing that must be true.
    const { svc, debits } = makeService({ affectedPerCall: [1, 0] });

    await svc.approveLeave('leave-1', 'u1', 'client-a', 'ALL');
    await expect(
      svc.approveLeave('leave-1', 'u2', 'client-a', 'ALL'),
    ).rejects.toThrow(BadRequestException);

    expect(debits).toHaveLength(1);
  });
});
