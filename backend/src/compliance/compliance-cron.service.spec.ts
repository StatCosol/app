import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ComplianceCronService } from './compliance-cron.service';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceMcdItem } from './entities/compliance-mcd-item.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { UserEntity } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CronLoggerService } from '../common/services/cron-logger.service';

const mockRepo = () => ({
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  }),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe('ComplianceCronService', () => {
  let service: ComplianceCronService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComplianceCronService,
        { provide: getRepositoryToken(ComplianceTask), useFactory: mockRepo },
        {
          provide: getRepositoryToken(ComplianceMcdItem),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(DocumentReuploadRequest),
          useFactory: mockRepo,
        },
        { provide: getRepositoryToken(UserEntity), useFactory: mockRepo },
        {
          provide: NotificationsService,
          useValue: { createTicket: jest.fn() },
        },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: CronLoggerService,
          useValue: {
            start: jest.fn().mockResolvedValue('logId'),
            succeed: jest.fn().mockResolvedValue(undefined),
            fail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ComplianceCronService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('markOverdueAndNotify should complete without error', async () => {
    await expect(service.markOverdueAndNotify()).resolves.not.toThrow();
  });
});
