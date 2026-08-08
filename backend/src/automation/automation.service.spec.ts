import { Test, TestingModule } from '@nestjs/testing';
import { AutomationService } from './automation.service';

describe('AutomationService', () => {
  let service: AutomationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('health returns ok', () => {
    expect(service.health()).toEqual(
      expect.objectContaining({ ok: true, module: 'automation' }),
    );
  });
});
