import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

describe('ChecklistsController', () => {
  let controller: ChecklistsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChecklistsController],
      providers: [
        {
          provide: ChecklistsService,
          useValue: {
            getByBranch: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<ChecklistsController>(ChecklistsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
