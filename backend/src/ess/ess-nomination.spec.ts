import { BadRequestException } from '@nestjs/common';
import { EssService, EssUser } from './ess.service';

/**
 * ESS nomination writes after the pipe fix (#667).
 *
 * From 2026-05-09 every nominee reached these methods as `[]` and was dropped,
 * so nominations were SUBMITTED — and could be approved — with nobody named.
 * These pin that a nomination cannot be submitted empty any more, that nothing
 * is written when validation fails, and that re-submitting an approved
 * nomination clears the old approval.
 */
describe('EssService nominations', () => {
  const user: EssUser = {
    id: 'u-1',
    email: 'e@example.com',
    roleCode: 'EMPLOYEE',
    clientId: 'c-1',
    employeeId: 'emp-1',
  };
  const nominee = {
    memberName: 'Lakshmi',
    relationship: 'SPOUSE',
    sharePct: 100,
    dateOfBirth: '1990-01-01',
  };

  let writes: { op: string; value: unknown }[];
  let storedMembers: number;
  let existing: Record<string, unknown> | null;
  let service: EssService;

  beforeEach(() => {
    writes = [];
    storedMembers = 0;
    existing = null;
    const em = {
      save: jest.fn(async (value: any) => {
        writes.push({ op: 'save', value });
        return Array.isArray(value) ? value : { id: 'nom-1', ...value };
      }),
      delete: jest.fn(async (_e: unknown, where: unknown) => {
        writes.push({ op: 'delete', value: where });
      }),
    };
    const nomRepo = {
      create: jest.fn((v) => ({ ...v })),
      findOne: jest.fn(async () => existing),
      save: jest.fn(async (v) => {
        writes.push({ op: 'save', value: v });
        return v;
      }),
      manager: { transaction: jest.fn(async (work: any) => work(em)) },
    };
    const nomMemberRepo = {
      create: jest.fn((v) => ({ ...v })),
      count: jest.fn(async () => storedMembers),
    };
    const empRepo = {
      findOne: jest.fn(async () => ({
        id: 'emp-1',
        clientId: 'c-1',
        branchId: 'b-1',
      })),
    };
    const none = {} as never;
    service = new EssService(
      empRepo as never,
      none,
      nomRepo as never,
      nomMemberRepo as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
  });

  describe('create', () => {
    it('refuses to submit with no nominees and writes nothing', async () => {
      await expect(
        service.createNomination(user, { nominationType: 'PF', members: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(writes).toEqual([]);
    });

    it('still allows an empty DRAFT', async () => {
      const out = await service.createNomination(user, {
        nominationType: 'PF',
        asDraft: true,
      });
      expect(out.status).toBe('DRAFT');
    });

    it('writes nothing when the shares do not total 100', async () => {
      await expect(
        service.createNomination(user, {
          nominationType: 'PF',
          members: [{ ...nominee, sharePct: 60 }],
        }),
      ).rejects.toThrow('must total 100');
      expect(writes).toEqual([]);
    });

    it('saves the header and its nominees together', async () => {
      await service.createNomination(user, {
        nominationType: 'PF',
        members: [nominee],
      });
      const [header, members] = writes.map((w) => w.value) as [any, any[]];
      expect(header.status).toBe('SUBMITTED');
      expect(members).toHaveLength(1);
      expect(members[0]).toEqual(
        expect.objectContaining({
          nominationId: 'nom-1',
          memberName: 'Lakshmi',
          sharePct: '100',
        }),
      );
    });
  });

  describe('submit', () => {
    it('refuses a draft with no stored nominees', async () => {
      existing = { id: 'nom-1', status: 'DRAFT' };
      await expect(service.submitNomination(user, 'nom-1')).rejects.toThrow(
        'at least one nominee',
      );
      expect(writes).toEqual([]);
    });

    it('submits a draft that has nominees', async () => {
      existing = { id: 'nom-1', status: 'DRAFT' };
      storedMembers = 2;
      await expect(service.submitNomination(user, 'nom-1')).resolves.toEqual({
        ok: true,
        status: 'SUBMITTED',
      });
    });
  });

  describe('resubmit', () => {
    it('lets a rejected, nominee-less nomination be resubmitted once nominees are added', async () => {
      existing = { id: 'nom-1', status: 'REJECTED' };
      await service.resubmitNomination(user, 'nom-1', { members: [nominee] });
      expect(writes.map((w) => w.op)).toEqual(['save', 'delete', 'save']);
    });

    it('refuses to resubmit one that still has no nominees', async () => {
      existing = { id: 'nom-1', status: 'REJECTED' };
      await expect(
        service.resubmitNomination(user, 'nom-1', {}),
      ).rejects.toThrow('at least one nominee');
      expect(writes).toEqual([]);
    });
  });

  describe('update', () => {
    it('clears the old approval when an approved nomination is sent back for review', async () => {
      existing = {
        id: 'nom-1',
        status: 'APPROVED',
        approvedAt: new Date('2026-06-01'),
        approvedByUserId: 'approver-1',
      };
      storedMembers = 1;
      await service.updateNomination(user, 'nom-1', { asDraft: false });
      const saved = writes[0].value as any;
      expect(saved.status).toBe('SUBMITTED');
      expect(saved.approvedAt).toBeNull();
      expect(saved.approvedByUserId).toBeNull();
    });
  });
});
