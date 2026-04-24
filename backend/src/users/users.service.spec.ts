import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { DeletionRequestEntity } from './entities/deletion-request.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConfigService } from '@nestjs/config';

describe('UsersService', () => {
  let service: UsersService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(RoleEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(UserEntity), useValue: mockRepo() },
        {
          provide: getRepositoryToken(DeletionRequestEntity),
          useValue: mockRepo(),
        },
        { provide: getRepositoryToken(ClientEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(BranchEntity), useValue: mockRepo() },
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn() },
        },
        {
          provide: AuditLogsService,
          useValue: { log: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
