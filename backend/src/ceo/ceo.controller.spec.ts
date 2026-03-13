import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CeoController } from './ceo.controller';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersService } from '../users/users.service';

describe('CeoController', () => {
  let controller: CeoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CeoController],
      providers: [
        {
          provide: getRepositoryToken(ApprovalEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn(), findByRole: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get<CeoController>(CeoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
