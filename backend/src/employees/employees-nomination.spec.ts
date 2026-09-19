import { EmployeesService } from './employees.service';

/**
 * createNomination() on the client/admin side.
 *
 * Until the global pipe was fixed every nominee reached this method as `[]`,
 * the member insert failed on member_name NOT NULL, and the nomination header
 * — already committed — was left behind with no nominees. Now that nominees
 * arrive intact, what they may write is pinned here.
 */
describe('EmployeesService.createNomination', () => {
  let saved: unknown[];
  let service: EmployeesService;
  let failMembers: boolean;

  beforeEach(() => {
    saved = [];
    failMembers = false;
    const em = {
      save: jest.fn(async (value: any) => {
        if (Array.isArray(value)) {
          if (failMembers) throw new Error('member insert failed');
          saved.push(value);
          return value;
        }
        const header = { ...value, id: 'nom-1' };
        saved.push(header);
        return header;
      }),
    };
    const nomRepo = {
      create: jest.fn((v) => ({ ...v })),
      manager: {
        transaction: jest.fn(async (work: (m: typeof em) => unknown) => {
          const before = saved.length;
          try {
            return await work(em);
          } catch (e) {
            saved.length = before; // rolled back
            throw e;
          }
        }),
      },
    };
    const nomMemberRepo = { create: jest.fn((v) => ({ ...v })) };
    service = new EmployeesService(
      {} as never,
      {} as never,
      nomRepo as never,
      nomMemberRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('writes named nominee fields only, never a client-supplied id', async () => {
    await service.createNomination('emp-1', {
      nominationType: 'PF',
      members: [
        {
          id: 'someone-elses-member-row',
          nominationId: 'someone-elses-nomination',
          memberName: '  Lakshmi ',
          relationship: 'SPOUSE',
          dateOfBirth: '',
          sharePct: 100,
          isMinor: false,
          guardianName: '',
        },
      ],
    });

    const [header, members] = saved as [
      Record<string, unknown>,
      Record<string, unknown>[],
    ];
    expect(header).toEqual(
      expect.objectContaining({ employeeId: 'emp-1', nominationType: 'PF' }),
    );
    expect(header).not.toHaveProperty('members');
    expect(members).toEqual([
      {
        nominationId: 'nom-1',
        memberName: 'Lakshmi',
        relationship: 'SPOUSE',
        dateOfBirth: null,
        sharePct: '100',
        address: null,
        isMinor: false,
        guardianName: null,
        guardianRelationship: null,
        guardianAddress: null,
      },
    ]);
  });

  it('skips nominees without a name', async () => {
    await service.createNomination('emp-1', {
      nominationType: 'PF',
      members: [{ memberName: '   ' }, { memberName: 'Ravi', sharePct: 100 }],
    });
    const members = saved[1] as Record<string, unknown>[];
    expect(members.map((m) => m.memberName)).toEqual(['Ravi']);
  });

  it('refuses a nomination with no named nominee and writes nothing', async () => {
    await expect(
      service.createNomination('emp-1', {
        nominationType: 'PF',
        members: [{ memberName: '  ' }],
      }),
    ).rejects.toThrow('At least one nominee is required');
    expect(saved).toEqual([]);
  });

  it('records a branch-desk entry as approved, on the employee client and branch', async () => {
    // It was saved DRAFT with no client or branch: in no approvals queue, and
    // editable by the employee as their own unsent draft.
    await service.createNomination(
      'emp-1',
      {
        nominationType: 'PF',
        members: [{ memberName: 'Lakshmi', sharePct: 100 }],
      },
      { clientId: 'client-a', branchId: 'branch-1', userId: 'desk-user' },
    );
    expect(saved[0]).toEqual(
      expect.objectContaining({
        clientId: 'client-a',
        branchId: 'branch-1',
        status: 'APPROVED',
        approvedByUserId: 'desk-user',
      }),
    );
  });

  it('does not leave a nomination behind when its nominees fail to save', async () => {
    failMembers = true;
    await expect(
      service.createNomination('emp-1', {
        nominationType: 'PF',
        members: [{ memberName: 'Lakshmi', sharePct: 100 }],
      }),
    ).rejects.toThrow('member insert failed');
    expect(saved).toEqual([]);
  });
});
