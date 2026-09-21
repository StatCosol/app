import { ContractorComputationService } from './contractor-computation.service';

/** compareQuotations with its repositories stubbed; only the working-out runs. */
function service(found: any[]) {
  const svc: any = Object.create(ContractorComputationService.prototype);
  svc.resolveCrmClient = async (_u: unknown, clientId: string) => clientId;
  svc.complianceContext = async () => ({ payDays: 26 });
  const qb: any = { calls: [] as string[] };
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy'])
    qb[m] = (sql: string) => {
      qb.calls.push(sql);
      return qb;
    };
  qb.getMany = async () => found;
  svc.qb = qb;
  svc.quotationRepo = {
    createQueryBuilder: () => qb,
    manager: {
      query: async (sql: string) =>
        sql.includes('FROM users')
          ? [
              { id: 'A', name: 'Vendor A' },
              { id: 'B', name: 'Vendor B' },
            ]
          : [{ id: 'B1', branchname: 'Plant 1' }],
    },
  };
  return svc;
}
const card = (basic: number) => ({
  rounding: 'PAISE',
  components: [
    {
      code: 'BASIC_DA',
      label: 'Basic + DA',
      category: 'EARNING',
      method: 'FIXED',
      value: basic,
      prorate: true,
    },
    {
      code: 'PF_ER',
      label: 'Employer PF',
      category: 'EMPLOYER_COST',
      method: 'FORMULA',
      value: 0,
      formula: 'MIN(BASIC_DA, 15000) * 12%',
      prorate: false,
    },
    {
      code: 'FEE',
      label: 'Service charge',
      category: 'BILLING_FEE',
      method: 'FIXED',
      value: 1000,
      prorate: false,
    },
  ],
});
const quote = (id: string, over: any) => ({
  id,
  contractorUserId: 'A',
  branchId: null,
  skillCategory: 'UNSKILLED',
  designation: 'GUARD',
  dailyWage: 577,
  rateCard: card(15000),
  ...over,
});
// As the query returns them: newest first.
const found = [
  quote('a-branch', {
    branchId: 'B1',
    effectiveFrom: '2026-07-01',
    rateCard: card(16000),
  }),
  quote('a-all', { effectiveFrom: '2026-06-01' }),
  quote('b-daily', {
    contractorUserId: 'B',
    effectiveFrom: '2026-05-01',
    rateCard: null,
    dailyWage: 600,
  }),
  quote('a-old', { effectiveFrom: '2026-01-01', rateCard: card(14000) }),
];
const user = { id: 'crm', roleCode: 'CRM' } as any;

describe('quotation comparison', () => {
  it('works out each rate in force per head: paid, billed and the gap', async () => {
    const res = await service(found).compareQuotations(user, {
      clientId: 'C',
      onDate: '2026-09-15',
    });
    expect(res.payDays).toBe(26); // September 2026 less its Sundays
    expect(res.branches).toEqual([{ id: 'B1', name: 'Plant 1' }]);
    expect(res.rows.map((r: any) => r.quotationId)).toEqual([
      'a-all',
      'a-branch',
      'b-daily',
    ]);
    expect(res.rows[0]).toMatchObject({
      contractorName: 'Vendor A',
      branchName: null,
      hasBreakup: true,
      basic: 15000,
      workerPaid: 15000,
      employerCosts: 1800,
      fees: 1000,
      billingTotal: 17800,
      gap: 2800,
      gapPercent: 18.67,
      perDay: 684.62,
    });
    expect(res.rows[1]).toMatchObject({
      branchName: 'Plant 1',
      billingTotal: 18800,
    });
    expect(res.rows[2]).toMatchObject({ hasBreakup: false, basic: 15600 });
  });

  it("uses a site's own quotation in place of the contractor's all-sites one", async () => {
    const svc = service(found);
    const res = await svc.compareQuotations(user, {
      clientId: 'C',
      branchId: 'B1',
      onDate: '2026-09-15',
    });
    expect(res.rows.map((r: any) => r.quotationId)).toEqual([
      'a-branch',
      'b-daily',
    ]);
    expect(svc.qb.calls.join(' ')).toContain('q.branch_id IS NULL');
  });

  it('filters by skill and refuses an unknown one', async () => {
    const svc = service([]);
    await svc.compareQuotations(user, {
      clientId: 'C',
      skillCategory: 'semi skilled',
    });
    expect(svc.qb.calls.join(' ')).toContain('q.skill_category = :skill');
    await expect(
      svc.compareQuotations(user, { clientId: 'C', skillCategory: 'EXPERT' }),
    ).rejects.toThrow('Invalid skill category');
  });
});
