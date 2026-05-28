import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceEntity } from './entities/attendance.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricService } from '../biometric/biometric.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let biometricService: { processRange: jest.Mock };

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    biometricService = {
      processRange: jest.fn().mockResolvedValue({ attendanceUpserts: 0 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(AttendanceEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(EmployeeEntity), useValue: mockRepo() },
        { provide: DataSource, useValue: {} },
        { provide: BiometricService, useValue: biometricService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('processes biometric punches before listing daily attendance', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (service as any).ds = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    await service.listDaily({ clientId: 'client-1', date: '2026-05-28' });

    expect(biometricService.processRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
      true,
    );
    expect(qb.getRawMany).toHaveBeenCalled();
  });

  it('processes biometric punches before returning daily approval stats', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (service as any).repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await service.getApprovalStats('client-1', '2026-05-28');

    expect(biometricService.processRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
      true,
    );
  });
});
