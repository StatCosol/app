import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClraAssignmentsService } from './clra-assignments.service';
import { ClraContractor } from './entities/clra-contractor.entity';
import { ClraPeEstablishment } from './entities/clra-pe-establishment.entity';
import { ClraContractorAssignment } from './entities/clra-contractor-assignment.entity';
import { ClraContractorWorker } from './entities/clra-contractor-worker.entity';
import { ClraWorkerDeployment } from './entities/clra-worker-deployment.entity';
import { ClraWagePeriod } from './entities/clra-wage-period.entity';
import { ClraAttendance } from './entities/clra-attendance.entity';
import { ClraWage } from './entities/clra-wage.entity';
import { ClraRegisterRun } from './entities/clra-register-run.entity';
import { DataSource } from 'typeorm';

const repoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
  update: jest.fn(),
});

describe('ClraAssignmentsService (portal)', () => {
  let service: ClraAssignmentsService;
  let contractorRepo: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    contractorRepo = repoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClraAssignmentsService,
        { provide: getRepositoryToken(ClraPeEstablishment), useValue: repoMock() },
        { provide: getRepositoryToken(ClraContractor), useValue: contractorRepo },
        { provide: getRepositoryToken(ClraContractorAssignment), useValue: repoMock() },
        { provide: getRepositoryToken(ClraContractorWorker), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWorkerDeployment), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWagePeriod), useValue: repoMock() },
        { provide: getRepositoryToken(ClraAttendance), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWage), useValue: repoMock() },
        { provide: getRepositoryToken(ClraRegisterRun), useValue: repoMock() },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(ClraAssignmentsService);
  });

  it('findContractorForUser returns linked contractor', async () => {
    const contractor = { id: 'c1', contractorUserId: 'u1', active: true } as ClraContractor;
    contractorRepo.findOne.mockResolvedValueOnce(contractor);

    await expect(service.findContractorForUser('u1')).resolves.toEqual(contractor);
    expect(contractorRepo.findOne).toHaveBeenCalledWith({
      where: { contractorUserId: 'u1', active: true },
    });
  });

  it('findContractorForUser throws when not linked', async () => {
    contractorRepo.findOne.mockResolvedValue(null);
    await expect(service.findContractorForUser('u1', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('assertAssignmentBelongsToContractor rejects foreign assignment', async () => {
    const assignmentRepo = repoMock();
    assignmentRepo.findOne.mockResolvedValue({
      id: 'a1',
      contractorId: 'other',
    });
    const module = await Test.createTestingModule({
      providers: [
        ClraAssignmentsService,
        { provide: getRepositoryToken(ClraPeEstablishment), useValue: repoMock() },
        { provide: getRepositoryToken(ClraContractor), useValue: contractorRepo },
        { provide: getRepositoryToken(ClraContractorAssignment), useValue: assignmentRepo },
        { provide: getRepositoryToken(ClraContractorWorker), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWorkerDeployment), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWagePeriod), useValue: repoMock() },
        { provide: getRepositoryToken(ClraAttendance), useValue: repoMock() },
        { provide: getRepositoryToken(ClraWage), useValue: repoMock() },
        { provide: getRepositoryToken(ClraRegisterRun), useValue: repoMock() },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get(ClraAssignmentsService);

    await expect(svc.assertAssignmentBelongsToContractor('a1', 'mine')).rejects.toMatchObject({
      name: 'ForbiddenException',
    });
  });
});
