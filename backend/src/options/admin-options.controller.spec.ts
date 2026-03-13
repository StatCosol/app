import { Test, TestingModule } from '@nestjs/testing';
import { AdminOptionsController } from './admin-options.controller';
import { AccessScopeService } from '../access/access-scope.service';

describe('AdminOptionsController', () => {
  let controller: AdminOptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOptionsController],
      providers: [
        {
          provide: AccessScopeService,
          useValue: {
            getClients: jest.fn().mockResolvedValue([]),
            getBranches: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminOptionsController>(AdminOptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
