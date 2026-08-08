import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientContactsService } from './client-contacts.service';
import { ClientDepartmentContactEntity } from './client-department-contact.entity';

describe('ClientContactsService', () => {
  let service: ClientContactsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientContactsService,
        {
          provide: getRepositoryToken(ClientDepartmentContactEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ClientContactsService>(ClientContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
