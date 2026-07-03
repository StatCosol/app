import { NotFoundException } from '@nestjs/common';
import { ReturnsService } from '../src/returns/returns.service';
import {
  ComplianceReturnEntity,
  ReturnStatus,
} from '../src/returns/entities/compliance-return.entity';

type StoredReturn = ComplianceReturnEntity & {
  id: string;
  clientId: string;
  branchId: string;
  returnType: string;
  lawType: string;
  periodYear: number;
  periodMonth: number | null;
  periodLabel: string;
  dueDate: string;
  status: ReturnStatus;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
};

function createReturnsRepo(store: StoredReturn[]) {
  const repo = {
    create: jest.fn((value: Partial<StoredReturn>) => value as StoredReturn),
    save: jest.fn(async (value: StoredReturn) => {
      const index = store.findIndex((row) => row.id === value.id);
      if (index >= 0) {
        store[index] = value;
      } else {
        store.push(value);
      }
      return value;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<StoredReturn> }) => {
      return (
        store.find((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof StoredReturn] === value,
          ),
        ) ?? null
      );
    }),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        leftJoinAndSelect: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        getMany: jest.fn(async () =>
          store.filter((row) => !row.isDeleted && row.deletedAt === null),
        ),
      };
      return qb;
    }),
  };
  return repo;
}

describe('ReturnsService (integration) - soft delete / restore', () => {
  let store: StoredReturn[];
  let service: ReturnsService;
  let returnsRepo: ReturnType<typeof createReturnsRepo>;

  beforeEach(() => {
    store = [];
    returnsRepo = createReturnsRepo(store);
    service = new ReturnsService(
      returnsRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query: jest.fn() } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
    );
  });

  async function seedReturn(partial: Partial<StoredReturn> = {}) {
    const entity = returnsRepo.create({
      id: `return-${store.length + 1}`,
      clientId: 'client-1',
      branchId: 'branch-1',
      lawType: 'LABOUR',
      returnType: 'PF',
      periodYear: 2026,
      periodMonth: 1,
      periodLabel: 'Jan-2026',
      dueDate: '2026-02-15',
      filedDate: null,
      filedByUserId: null,
      ackNumber: null,
      ackFilePath: null,
      challanFilePath: null,
      status: 'PENDING',
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      ...partial,
    });
    return returnsRepo.save(entity);
  }

  it('soft deletes then hides from admin list and restores back', async () => {
    const rec = await seedReturn();

    await service.softDeleteAsAdmin(rec.id, 'admin-1', 'cleanup');

    const deleted = await returnsRepo.findOne({
      where: { id: rec.id, isDeleted: true },
    });
    expect(deleted?.deletedBy).toBe('admin-1');
    expect(deleted?.deleteReason).toBe('cleanup');

    const listAfterDelete = await service.listForAdmin({});
    expect(listAfterDelete).toHaveLength(0);

    await service.restoreAsAdmin(rec.id);

    const restored = await returnsRepo.findOne({
      where: { id: rec.id, isDeleted: false },
    });
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.deletedBy).toBeNull();
    expect(restored?.deleteReason).toBeNull();

    const listAfterRestore = await service.listForAdmin({});
    expect(listAfterRestore).toHaveLength(1);
    expect((listAfterRestore[0] as any).id).toBe(rec.id);
  });

  it('rejects restore when the return is not soft-deleted', async () => {
    const rec = await seedReturn();

    await expect(service.restoreAsAdmin(rec.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
