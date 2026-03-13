import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnsService } from '../src/returns/returns.service';
import { ComplianceReturnEntity } from '../src/returns/entities/compliance-return.entity';
import { ClientAssignmentCurrentEntity } from '../src/assignments/entities/client-assignment-current.entity';
import { BranchAccessService } from '../src/auth/branch-access.service';

// Integration-style service test with in-memory SQLite DB

describe('ReturnsService (integration) - soft delete / restore', () => {
  let app: INestApplication;
  let service: ReturnsService;
  let returnsRepo: Repository<ComplianceReturnEntity>;

  const branchAccessMock = {
    getAllowedBranchIds: jest.fn().mockResolvedValue('ALL'),
    assertBranchUserOnly: jest.fn(),
  } as Partial<BranchAccessService>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [ComplianceReturnEntity, ClientAssignmentCurrentEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          ComplianceReturnEntity,
          ClientAssignmentCurrentEntity,
        ]),
      ],
      providers: [
        ReturnsService,
        { provide: BranchAccessService, useValue: branchAccessMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    service = moduleRef.get(ReturnsService);
    returnsRepo = moduleRef.get(getRepositoryToken(ComplianceReturnEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await returnsRepo.clear();
  });

  async function seedReturn(partial: Partial<ComplianceReturnEntity> = {}) {
    const entity = returnsRepo.create({
      clientId: 'client-1',
      branchId: 'branch-1',
      lawType: 'LABOUR',
      returnType: 'PF',
      periodYear: 2026,
      periodMonth: 1,
      periodLabel: 'Jan-2026',
      dueDate: '2026-02-15',
      filedDate: null,
      status: 'PENDING',
      filedByUserId: null,
      ackNumber: null,
      ackFilePath: null,
      challanFilePath: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      ...partial,
    });
    return returnsRepo.save(entity);
  }

  it('soft deletes then hides from list and restores back', async () => {
    const rec = await seedReturn();

    await service.softDeleteAsAdmin(rec.id, 'admin-1', 'cleanup');

    const deleted = await returnsRepo.findOne({ where: { id: rec.id } });
    expect(deleted?.isDeleted).toBe(true);
    expect(deleted?.deletedBy).toBe('admin-1');
    expect(deleted?.deleteReason).toBe('cleanup');

    const listAfterDelete = await service.listForAdmin({});
    expect(listAfterDelete).toHaveLength(0);

    await service.restoreAsAdmin(rec.id);

    const restored = await returnsRepo.findOne({ where: { id: rec.id } });
    expect(restored?.isDeleted).toBe(false);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.deletedBy).toBeNull();
    expect(restored?.deleteReason).toBeNull();

    const listAfterRestore = await service.listForAdmin({});
    expect(listAfterRestore).toHaveLength(1);
    expect(listAfterRestore[0].id).toBe(rec.id);
  });
});
