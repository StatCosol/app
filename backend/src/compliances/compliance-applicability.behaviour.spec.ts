import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { ComplianceApplicabilityService } from './compliance-applicability.service';
import { CompliancesService } from './compliances.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from './entities/compliance-master.entity';

/**
 * Compliance applicability decides which statutory items a branch has to file.
 * These tests use the law families that the seeded compliance master actually
 * contains (migrations/20260404_seed_compliance_master.sql): FACTORY_ACT,
 * SHOPS_ESTABLISHMENTS and LABOUR_CODE.
 */

type Master = Partial<ComplianceMasterEntity> & { id: string };

const FACTORIES_ACT: Master = {
  id: 'm-factory',
  complianceName: 'Factories Act, 1948',
  lawName: 'Factories Act, 1948',
  lawFamily: 'FACTORY_ACT',
  stateScope: 'ALL',
  minHeadcount: null,
  maxHeadcount: null,
  isActive: true,
};
const SHOPS_ACT: Master = {
  id: 'm-shops',
  complianceName: 'Shops & Establishments Act',
  lawName: 'Shops & Establishments Act',
  lawFamily: 'SHOPS_ESTABLISHMENTS',
  stateScope: 'ALL',
  minHeadcount: null,
  maxHeadcount: null,
  isActive: true,
};
const CODE_ON_WAGES: Master = {
  id: 'm-wages',
  complianceName: 'Code on Wages',
  lawName: 'Code on Wages',
  lawFamily: 'LABOUR_CODE',
  stateScope: 'ALL',
  minHeadcount: null,
  maxHeadcount: null,
  isActive: true,
};
const TELANGANA_ONLY: Master = {
  ...CODE_ON_WAGES,
  id: 'm-ts',
  complianceName: 'TS Labour Welfare Fund',
  lawFamily: 'STATE_TAX',
  stateScope: 'TS,AP',
};
const LARGE_ONLY: Master = {
  ...CODE_ON_WAGES,
  id: 'm-large',
  complianceName: 'Standing Orders',
  lawFamily: 'LABOUR_CODE',
  minHeadcount: 100,
};

const branch = (extra: Partial<BranchEntity> = {}) =>
  ({
    id: 'branch-1',
    clientId: 'client-1',
    branchType: 'ESTABLISHMENT',
    stateCode: 'TS',
    headcount: 25,
    employeeCount: 0,
    contractorCount: 0,
    isActive: true,
    isDeleted: false,
    ...extra,
  }) as BranchEntity;

describe('ComplianceApplicabilityService.recomputeForBranch (runs on branch create)', () => {
  function setup(
    b: BranchEntity | null,
    masters: Master[],
    existing: any[] = [],
  ) {
    const writes: { sql: string; params: any[] }[] = [];
    const ds = {
      getRepository: (entity: unknown) => ({
        findOne: async () => (entity === BranchEntity ? b : null),
        find: async () => masters,
      }),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('FROM branch_compliances'))
          return existing.filter((e) => e.compliance_id === params[1]);
        if (sql.includes('FROM compliance_applicability')) return [];
        writes.push({ sql, params });
        return [];
      }),
    };
    const service = new ComplianceApplicabilityService(ds as any);
    const decision = (id: string) => {
      const w = writes.find((x) =>
        x.sql.includes('INSERT') ? x.params[2] === id : x.params[1] === id,
      );
      return w
        ? {
            isApplicable: w.sql.includes('INSERT') ? w.params[3] : w.params[2],
            reason: w.sql.includes('INSERT') ? w.params[5] : w.params[4],
          }
        : undefined;
    };
    return { service, writes, decision, ds };
  }

  it('fails for a missing, inactive or deleted branch', async () => {
    const { service } = setup(null, []);
    await expect(service.recomputeForBranch('x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('keeps manual overrides untouched', async () => {
    const { service, writes } = setup(
      branch(),
      [CODE_ON_WAGES],
      [{ compliance_id: 'm-wages', override_mode: 'MANUAL' }],
    );
    await expect(service.recomputeForBranch('branch-1')).resolves.toEqual({
      updated: 0,
    });
    expect(writes).toHaveLength(0);
  });

  it('updates an existing AUTO row instead of inserting a duplicate', async () => {
    const { service, writes } = setup(
      branch(),
      [CODE_ON_WAGES],
      [{ compliance_id: 'm-wages', override_mode: 'AUTO' }],
    );
    await service.recomputeForBranch('branch-1');
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain('UPDATE branch_compliances');
  });

  it('applies labour codes to every branch', async () => {
    const { service, decision } = setup(branch(), [CODE_ON_WAGES]);
    await service.recomputeForBranch('branch-1');
    expect(decision('m-wages')?.isApplicable).toBe(true);
  });

  it('applies state-scoped items only in listed states', async () => {
    const ts = setup(branch({ stateCode: 'TS' }), [TELANGANA_ONLY]);
    await ts.service.recomputeForBranch('branch-1');
    expect(ts.decision('m-ts')?.isApplicable).toBe(true);
    const ka = setup(branch({ stateCode: 'KA' }), [TELANGANA_ONLY]);
    await ka.service.recomputeForBranch('branch-1');
    expect(ka.decision('m-ts')).toMatchObject({
      isApplicable: false,
      reason: 'Not applicable in state KA',
    });
  });

  it('respects headcount thresholds', async () => {
    const small = setup(branch({ headcount: 20 }), [LARGE_ONLY]);
    await small.service.recomputeForBranch('branch-1');
    expect(small.decision('m-large')?.isApplicable).toBe(false);
    const big = setup(branch({ headcount: 150 }), [LARGE_ONLY]);
    await big.service.recomputeForBranch('branch-1');
    expect(big.decision('m-large')?.isApplicable).toBe(true);
  });

  // KNOWN BUG: this service gates on law families 'FACTORY' and 'S&E', but the
  // compliance master (and CompliancesService, and the Admin UI) use
  // 'FACTORY_ACT' and 'SHOPS_ESTABLISHMENTS'. Every newly created shop/office
  // branch is therefore marked as needing the Factories Act and Code on OSH,
  // and every factory as needing the Shops & Establishments Act.
  // Remove `.failing` once the two vocabularies agree.
  it.failing(
    'does not mark the Factories Act applicable to a shop',
    async () => {
      const { service, decision } = setup(branch({ branchType: 'SHOP' }), [
        FACTORIES_ACT,
      ]);
      await service.recomputeForBranch('branch-1');
      expect(decision('m-factory')?.isApplicable).toBe(false);
    },
  );

  it.failing(
    'does not mark the Shops & Establishments Act applicable to a factory',
    async () => {
      const { service, decision } = setup(branch({ branchType: 'FACTORY' }), [
        SHOPS_ACT,
      ]);
      await service.recomputeForBranch('branch-1');
      expect(decision('m-shops')?.isApplicable).toBe(false);
    },
  );

  // KNOWN BUG: the rule lookup passes the raw branch type (HO, OFFICE, SHOP…)
  // as branch_category, but rules only use FACTORY / ESTABLISHMENT, so no
  // ESTABLISHMENT rule ever matches a non-factory branch.
  it.failing('matches ESTABLISHMENT rules for an office branch', async () => {
    const { service, ds } = setup(branch({ branchType: 'OFFICE' }), [
      CODE_ON_WAGES,
    ]);
    await service.recomputeForBranch('branch-1');
    const ruleQuery = (ds.query.mock.calls as any[]).find(([sql]: any[]) =>
      sql.includes('FROM compliance_applicability'),
    );
    expect(ruleQuery?.[1][1]).toBe('ESTABLISHMENT');
  });
});

describe('CompliancesService', () => {
  function setup(opts: {
    branch?: Partial<BranchEntity> | null;
    masters?: Master[];
    selected?: any[];
    rules?: any[];
    assignedClients?: { id: string }[];
  }) {
    const b = opts.branch === null ? null : branch(opts.branch ?? {});
    const masters = opts.masters ?? [];
    const managerOps: any[] = [];
    const manager = {
      delete: jest.fn(async (...a: any[]) => managerOps.push(['delete', ...a])),
      create: jest.fn((_e: unknown, v: any) => v),
      save: jest.fn(async (_e: unknown, v: any) => {
        managerOps.push(['save', v]);
        return v;
      }),
    };
    const rawRows: any[] = [];
    const qb: any = {
      leftJoin: () => qb,
      select: () => qb,
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: () => qb,
      getRawMany: async () => rawRows,
    };
    const applicabilityRepo = {
      find: jest.fn(async () => opts.rules ?? []),
    };
    const service = new CompliancesService(
      {
        find: jest.fn(async (o: any) => {
          const ids = o?.where?.id?._value;
          return ids ? masters.filter((m) => ids.includes(m.id)) : masters;
        }),
      } as any,
      applicabilityRepo as any,
      {
        find: jest.fn(async () => opts.selected ?? []),
        createQueryBuilder: () => qb,
      } as any,
      { findOne: jest.fn(async () => b) } as any,
      {
        getAssignedClientsForCrm: jest.fn(
          async () => opts.assignedClients ?? [],
        ),
      } as any,
      { transaction: async (fn: any) => fn(manager) } as any,
    );
    return { service, managerOps, qb, rawRows, applicabilityRepo };
  }

  describe('getBranchCompliances', () => {
    it('explains applicability per law family, state and headcount', async () => {
      const { service } = setup({
        branch: {
          branchType: 'FACTORY',
          stateCode: 'ka',
          headcount: null as any,
          employeeCount: 30,
          contractorCount: 10,
        },
        masters: [
          FACTORIES_ACT,
          SHOPS_ACT,
          CODE_ON_WAGES,
          TELANGANA_ONLY,
          LARGE_ONLY,
        ],
        selected: [{ complianceId: 'm-wages' }],
      });
      const rows = await service.getBranchCompliances('branch-1');
      const byId = Object.fromEntries(rows.map((r) => [r.complianceId, r]));
      expect(byId['m-factory']).toMatchObject({
        applicable: true,
        reason: 'Factory branch',
      });
      expect(byId['m-shops']).toMatchObject({
        applicable: false,
        reason: 'Not applicable to factory',
      });
      expect(byId['m-wages']).toMatchObject({
        applicable: true,
        selected: true,
        autoApplicable: true,
      });
      expect(byId['m-ts']).toMatchObject({
        applicable: false,
        reason: 'State scope excludes KA',
      });
      // headcount falls back to employees + contractors = 40
      expect(byId['m-large']).toMatchObject({
        applicable: false,
        reason: 'Headcount below minimum (100)',
      });
    });

    it('treats a shop as an S&E establishment', async () => {
      const { service } = setup({
        branch: { branchType: 'SHOP' },
        masters: [FACTORIES_ACT, SHOPS_ACT],
      });
      const rows = await service.getBranchCompliances('branch-1');
      expect(rows.map((r) => [r.complianceId, r.applicable])).toEqual([
        ['m-factory', false],
        ['m-shops', true],
      ]);
    });

    it('404s for a deleted branch', async () => {
      const { service } = setup({ branch: null });
      await expect(service.getBranchCompliances('x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveBranchCompliances', () => {
    const valid = '6f1c1c55-6d3f-4b8e-9a9b-1c2d3e4f5a6b';

    it('requires an owner from the token and a branch of the same company', async () => {
      const { service } = setup({});
      await expect(
        service.saveBranchCompliances('branch-1', 'client-1', [], null),
      ).rejects.toThrow('ownerUserId missing');
      await expect(
        service.saveBranchCompliances('branch-1', 'other-client', [], 'crm-1'),
      ).rejects.toThrow('Branch does not belong to client');
    });

    it('rejects malformed and unknown compliance ids before writing', async () => {
      const { service, managerOps } = setup({ masters: [] });
      await expect(
        service.saveBranchCompliances(
          'branch-1',
          'client-1',
          ['1; drop'],
          'crm-1',
        ),
      ).rejects.toThrow('Invalid complianceId UUID');
      await expect(
        service.saveBranchCompliances('branch-1', 'client-1', [valid], 'crm-1'),
      ).rejects.toThrow(BadRequestException);
      expect(managerOps).toHaveLength(0);
    });

    it('replaces the selection atomically as MANUAL rows', async () => {
      const { service, managerOps } = setup({
        masters: [{ ...CODE_ON_WAGES, id: valid }],
      });
      const res = await service.saveBranchCompliances(
        'branch-1',
        'client-1',
        [` ${valid} `, ''],
        'crm-1',
      );
      expect(res).toMatchObject({ ok: true, count: 1, complianceIds: [valid] });
      expect(managerOps[0][0]).toBe('delete');
      expect(managerOps[1][1]).toEqual([
        expect.objectContaining({
          complianceId: valid,
          ownerUserId: 'crm-1',
          source: 'MANUAL',
          isApplicable: true,
        }),
      ]);
    });
  });

  describe('recomputeBranchComplianceApplicability', () => {
    it('keeps rules inside the headcount band and de-duplicates', async () => {
      const { service, managerOps } = setup({
        branch: { branchType: 'FACTORY', headcount: 50 },
        rules: [
          { complianceId: 'a', minHeadcount: 10, maxHeadcount: null },
          { complianceId: 'a', minHeadcount: null, maxHeadcount: null },
          { complianceId: 'b', minHeadcount: 100, maxHeadcount: null },
          { complianceId: 'c', minHeadcount: null, maxHeadcount: 20 },
        ],
      });
      const res =
        await service.recomputeBranchComplianceApplicability('branch-1');
      expect(res).toMatchObject({
        autoCount: 1,
        branchCategory: 'FACTORY',
        headcount: 50,
      });
      expect(managerOps[0]).toEqual([
        'delete',
        expect.anything(),
        { branchId: 'branch-1', source: 'AUTO' },
      ]);
      expect(managerOps[1][1].map((r: any) => r.complianceId)).toEqual(['a']);
    });

    // KNOWN BUG: for a branch with no state, the first rule filter becomes
    // `stateCode: undefined`, which TypeORM drops, so rules for every state are
    // applied to the branch. It should only use state-agnostic rules.
    it.failing(
      'does not apply other states’ rules to a branch with no state',
      async () => {
        const { service, applicabilityRepo } = setup({
          branch: { stateCode: null as any },
        });
        await service.recomputeBranchComplianceApplicability('branch-1');
        const where = (applicabilityRepo.find.mock.calls[0] as any)[0].where;
        for (const clause of where) {
          expect(clause.stateCode).toEqual(IsNull());
        }
      },
    );
  });

  describe('listCrmComplianceWorklist', () => {
    it('returns nothing for a CRM with no clients', async () => {
      const { service } = setup({ assignedClients: [] });
      await expect(
        service.listCrmComplianceWorklist('crm-1', {}),
      ).resolves.toEqual({ data: [], total: 0 });
    });

    it('ignores a client filter for a client the CRM is not assigned to', async () => {
      const { service, qb } = setup({ assignedClients: [{ id: 'mine' }] });
      await service.listCrmComplianceWorklist('crm-1', {
        clientId: 'not-mine',
      });
      expect(qb.where).toHaveBeenCalledWith('bc.clientId IN (:...clientIds)', {
        clientIds: ['mine'],
      });
    });

    it('applies branch and status filters and maps rows', async () => {
      const { service, qb, rawRows } = setup({
        assignedClients: [{ id: 'mine' }, { id: 'also' }],
      });
      rawRows.push({
        id: 5,
        clientId: 'mine',
        branchId: 'b',
        complianceId: 9,
        complianceName: 'X',
        ownerUserId: null,
        status: 'PENDING',
      });
      const res = await service.listCrmComplianceWorklist('crm-1', {
        clientId: 'mine',
        branchId: 'b',
        status: 'PENDING' as any,
      });
      expect(qb.where).toHaveBeenCalledWith(expect.any(String), {
        clientIds: ['mine'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('bc.branchId = :branchId', {
        branchId: 'b',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('bc.status = :status', {
        status: 'PENDING',
      });
      expect(res).toEqual({
        data: [
          {
            id: '5',
            clientId: 'mine',
            branchId: 'b',
            complianceId: '9',
            complianceName: 'X',
            ownerUserId: null,
            status: 'PENDING',
          },
        ],
        total: 1,
      });
    });
  });
});
