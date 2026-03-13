import { Test, TestingModule } from '@nestjs/testing';
import { RuleEvaluatorService } from './rule-evaluator.service';
import { ThresholdResolverService } from '../../masters/services/threshold-resolver.service';

describe('RuleEvaluatorService', () => {
  let service: RuleEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleEvaluatorService,
        { provide: ThresholdResolverService, useValue: { resolve: jest.fn() } },
      ],
    }).compile();

    service = module.get<RuleEvaluatorService>(RuleEvaluatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
