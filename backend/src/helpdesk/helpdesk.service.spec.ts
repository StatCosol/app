import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskTicketEntity } from './entities/helpdesk-ticket.entity';
import { HelpdeskMessageEntity } from './entities/helpdesk-message.entity';
import { HelpdeskMessageFileEntity } from './entities/helpdesk-message-file.entity';

describe('HelpdeskService', () => {
  let service: HelpdeskService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpdeskService,
        {
          provide: getRepositoryToken(HelpdeskTicketEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(HelpdeskMessageEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(HelpdeskMessageFileEntity),
          useValue: mockRepo(),
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<HelpdeskService>(HelpdeskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
