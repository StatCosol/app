import { Test, TestingModule } from '@nestjs/testing';
import { BranchesController } from './branches.controller';

describe('BranchesController', () => {
  let controller: BranchesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BranchesController],
      providers: [
        {
          provide: require('./branches.service').BranchesService,
          useValue: {},
        },
        {
          provide: require('../compliances/compliances.service')
            .CompliancesService,
          useValue: { recomputeBranchComplianceApplicability: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<BranchesController>(BranchesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
