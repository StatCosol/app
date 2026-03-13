import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CalendarService } from './calendar.service';
import { SlaComplianceResolverService } from '../compliances/sla-compliance-resolver.service';
import { SlaComplianceScheduleService } from '../compliances/sla-compliance-schedule.service';

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: SlaComplianceResolverService,
          useValue: { resolve: jest.fn() },
        },
        {
          provide: SlaComplianceScheduleService,
          useValue: { getSchedule: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
