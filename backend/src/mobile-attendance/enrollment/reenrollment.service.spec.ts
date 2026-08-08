import { ReenrollmentService } from './reenrollment.service';
import { FaceReenrollmentRequestEntity } from './face-reenrollment-request.entity';

describe('ReenrollmentService', () => {
  const makeService = () => {
    const empReqRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const conReqRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const photoStorage = {
      readPhoto: jest.fn().mockResolvedValue({
        buffer: Buffer.from('x'),
        contentType: 'image/jpeg',
      }),
    };
    const templateService = {
      appendTemplate: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      update: jest.fn(),
      save: jest.fn(async (_target: unknown, entity: any) => ({
        id: 'req-1',
        ...entity,
      })),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (fn: any) => fn(manager)),
    };
    const service = new ReenrollmentService(
      empReqRepo as any,
      conReqRepo as any,
      photoStorage as any,
      templateService as any,
      dataSource as any,
    );
    return { service, empReqRepo, manager, templateService, dataSource };
  };

  it('creates a pending employee re-enrollment request', async () => {
    const { service, manager } = makeService();
    const res = await service.createEmployeeRequest({
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      actorUserId: 'user-1',
      source: 'ESS',
      embedding: Buffer.from([1, 2, 3]),
      embeddingModel: 'mobilefacenet',
      photoUrl: '/uploads/x.jpg',
      reason: 'appearance change',
    });
    expect(res.status).toBe('PENDING_REVIEW');
    expect(manager.update).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      FaceReenrollmentRequestEntity,
      expect.objectContaining({ status: 'PENDING', employeeId: 'emp-1' }),
    );
  });

  it('rejects review of a non-pending employee request', async () => {
    const { service, empReqRepo } = makeService();
    empReqRepo.findOne.mockResolvedValue({
      id: 'req-1',
      clientId: 'client-1',
      status: 'APPROVED',
      branchId: 'branch-1',
    });
    await expect(
      service.reviewEmployeeRequest(
        'client-1',
        'req-1',
        'APPROVED',
        'admin-1',
      ),
    ).rejects.toThrow('not pending');
  });

  it('applies branch filter when allowedBranchIds is empty', async () => {
    const { service, dataSource } = makeService();
    await service.listEmployeeRequests('client-1', 'PENDING', []);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('r.branch_id = ANY'),
      ['client-1', 'PENDING', []],
    );
  });

  it('omits branch filter when allowedBranchIds is null', async () => {
    const { service, dataSource } = makeService();
    await service.listEmployeeRequests('client-1', 'PENDING', null);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.not.stringContaining('r.branch_id = ANY'),
      ['client-1', 'PENDING'],
    );
  });
});
