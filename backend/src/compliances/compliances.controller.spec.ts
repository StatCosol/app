import { Test, TestingModule } from '@nestjs/testing';
import { CompliancesController } from './compliances.controller';

describe('CompliancesController', () => {
  let controller: CompliancesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompliancesController],
      providers: [
        {
          provide: require('./compliances.service').CompliancesService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<CompliancesController>(CompliancesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
