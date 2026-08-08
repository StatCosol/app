import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NoticesService } from './notices.service';
import { NoticeEntity } from './entities/notice.entity';
import { NoticeDocumentEntity } from './entities/notice-document.entity';
import { NoticeActivityLogEntity } from './entities/notice-activity-log.entity';

const repoMock = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

describe('NoticesService', () => {
  let service: NoticesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: getRepositoryToken(NoticeEntity), useValue: repoMock() },
        { provide: getRepositoryToken(NoticeDocumentEntity), useValue: repoMock() },
        { provide: getRepositoryToken(NoticeActivityLogEntity), useValue: repoMock() },
      ],
    }).compile();

    service = module.get<NoticesService>(NoticesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
