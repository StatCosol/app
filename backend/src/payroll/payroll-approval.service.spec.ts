import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PayrollApprovalService } from './payroll-approval.service';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollProcessingService } from './payroll-processing.service';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

describe('Payroll approval workflow invariants', () => {
  let state: any;
  let repo: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let access: { assertClientAllowed: jest.Mock };
  let processing: { leaveValidation: jest.Mock; otValidation: jest.Mock };
  let service: PayrollApprovalService;
  const checker = {
    userId: 'checker',
    id: 'checker',
    roleCode: 'CCO',
  } as ReqUser;
  beforeEach(() => {
    state = {
      id: 'run',
      clientId: 'client',
      status: 'PROCESSED',
      submittedByUserId: 'maker',
      title: 'Original title',
    };
    repo = {
      findOne: jest.fn(async () => ({ ...state })),
      update: jest.fn(async (where, patch) => {
        if (where.id !== state.id || where.status !== state.status)
          return { affected: 0 };
        Object.assign(state, patch);
        return { affected: 1 };
      }),
      save: jest.fn(async (run) => {
        Object.assign(state, run);
        return run;
      }),
    };
    access = { assertClientAllowed: jest.fn().mockResolvedValue(undefined) };
    processing = {
      leaveValidation: jest.fn().mockResolvedValue({ rows: [] }),
      otValidation: jest.fn().mockResolvedValue({ rows: [] }),
    };
    service = new PayrollApprovalService(
      repo as unknown as Repository<PayrollRunEntity>,
      processing as unknown as PayrollProcessingService,
      access as unknown as AccessScopeService,
    );
  });
  it('submits clean runs and clears old decision metadata', async () => {
    state.approvedByUserId = 'old-checker';
    await service.submitForApproval('run', 'maker', checker);
    expect(state.status).toBe('SUBMITTED');
    expect(state.approvedByUserId).toBeNull();
  });
  it.each(['leaveValidation', 'otValidation'] as const)(
    'blocks submission with unresolved %s',
    async (name) => {
      processing[name].mockResolvedValue({
        rows: [{ empCode: 'E001', status: 'MISMATCH' }],
      });
      await expect(
        service.submitForApproval('run', 'maker', checker),
      ).rejects.toThrow('E001');
      expect(repo.update).not.toHaveBeenCalled();
    },
  );
  it('does not submit when validation cannot be loaded', async () => {
    processing.leaveValidation.mockRejectedValue(
      new Error('Database unavailable'),
    );
    await expect(
      service.submitForApproval('run', 'maker', checker),
    ).rejects.toThrow();
    expect(state.status).toBe('PROCESSED');
  });
  it('rejects cross-client access before invoking validation', async () => {
    access.assertClientAllowed.mockRejectedValue(new ForbiddenException());
    await expect(
      service.submitForApproval('run', 'maker', checker),
    ).rejects.toThrow(ForbiddenException);
    expect(processing.leaveValidation).not.toHaveBeenCalled();
  });
  it('prevents self-approval and approvals by a payroll operator', async () => {
    state.status = 'SUBMITTED';
    await expect(
      service.approveRun('run', 'maker', '', checker),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.approveRun('run', 'checker', '', {
        ...checker,
        roleCode: 'PAYROLL',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('only one of competing approve/reject actions succeeds', async () => {
    state.status = 'SUBMITTED';
    const results = await Promise.allSettled([
      service.approveRun('run', 'checker', '', checker),
      service.rejectRun('run', 'checker', 'Correction needed', checker),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
  it('requires a reason when rejecting a submitted run', async () => {
    state.status = 'SUBMITTED';
    await expect(
      service.rejectRun('run', 'checker', ' ', checker),
    ).rejects.toThrow(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('does not revert a run that changed after it was read', async () => {
    state.status = 'REJECTED';
    access.assertClientAllowed.mockImplementation(async () => {
      state.status = 'SUBMITTED';
    });
    await expect(service.revertToDraft('run', checker)).rejects.toThrow(
      'changed concurrently',
    );
    expect(state.status).toBe('SUBMITTED');
  });
  it('reverts decision fields without overwriting unrelated concurrent edits', async () => {
    state.status = 'APPROVED';
    access.assertClientAllowed.mockImplementation(async () => {
      state.title = 'Updated title';
    });
    await service.revertToDraft('run', checker);
    expect(state.status).toBe('DRAFT');
    expect(state.title).toBe('Updated title');
    expect(state.approvedAt).toBeNull();
  });
});
