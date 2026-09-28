import { validate } from 'class-validator';
import { AuditNcService } from './audit-nc.service';
import { ReviewCorrectedDocumentDto } from './dto/review-corrected-document.dto';
import { AuditEntity } from './entities/audit.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';

describe('Audit correction lifecycle', () => {
  const auditor = { userId: 'auditor', roleCode: 'AUDITOR' } as any;
  const vendor = { userId: 'vendor', roleCode: 'CONTRACTOR' } as any;
  const file = {
    path: 'sample.pdf',
    originalname: 'sample.pdf',
    mimetype: 'application/pdf',
    size: 100,
  };
  function setup() {
    const audit = {
      id: 'audit',
      assignedAuditorId: 'auditor',
      status: 'REVERIFICATION_PENDING',
    };
    const nc = {
      id: 'nc',
      auditId: 'audit',
      status: 'REUPLOADED',
      requestedToUserId: 'vendor',
      documentId: 'document',
      sourceTable: 'contractor_documents',
      closedAt: null,
    };
    const resub: any = {
      id: 'upload',
      filePath: 'sample.pdf',
      finalMark: null,
      reviewedAt: null,
    };
    const auditRepo = {
      findOne: jest.fn().mockResolvedValue(audit),
      save: jest.fn().mockImplementation(async (a) => a),
    };
    const ncRepo = {
      findOne: jest.fn().mockResolvedValue(nc),
      save: jest.fn().mockImplementation(async (n) => n),
      count: jest.fn().mockResolvedValue(1),
    };
    const resubRepo = {
      findOne: jest.fn().mockResolvedValue(resub),
      save: jest
        .fn()
        .mockImplementation(async (r) =>
          Object.assign(r, { id: r.id || 'upload' }),
        ),
      create: jest.fn((r) => r),
    };
    const reviewRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      create: jest.fn((r) => r),
    };
    const repositories = new Map<any, any>([
      [AuditEntity, auditRepo],
      [AuditNonComplianceEntity, ncRepo],
      [AuditResubmissionEntity, resubRepo],
      [AuditDocumentReviewEntity, reviewRepo],
    ]);
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const transaction = jest.fn(async (callback) => callback(manager));
    const followUps = {
      enqueue: jest.fn().mockResolvedValue('job'),
      run: jest.fn().mockResolvedValue('SUCCEEDED'),
    };
    const service: AuditNcService = Object.assign(
      Object.create(AuditNcService.prototype),
      {
        dataSource: { transaction },
        followUps,
      },
    );
    return {
      service,
      audit,
      nc,
      resub,
      auditRepo,
      ncRepo,
      resubRepo,
      reviewRepo,
      manager,
      transaction,
      followUps,
    };
  }

  it('persists the follow-up inside the correction transaction and dispatches after commit', async () => {
    const t = setup();
    let committed = false;
    t.transaction.mockImplementation(async (callback) => {
      const result = await callback(t.manager);
      expect(t.followUps.run).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    t.followUps.run.mockImplementation(async () => {
      expect(committed).toBe(true);
      return 'RETRY';
    });
    const result = await t.service.reviewCorrectedDocument(
      auditor,
      'nc',
      'COMPLIED',
    );
    expect(result.status).toBe('ACCEPTED');
    expect(result.warnings).toEqual([
      expect.stringContaining('queued for automatic retry'),
    ]);
    expect(JSON.stringify(result)).not.toContain('private SQL');
    expect(t.followUps.run).toHaveBeenCalledWith('job');
    expect(t.followUps.enqueue).toHaveBeenCalledWith(
      t.manager,
      expect.objectContaining({
        auditId: 'audit',
        ncId: 'nc',
        resubmissionId: 'upload',
        event: 'NC_ACCEPTED',
      }),
    );
  });

  it('reports a logging failure without falsely failing a committed upload', async () => {
    const t = setup();
    t.nc.status = 'NC_RAISED';
    t.followUps.run.mockRejectedValue(new Error('logging unavailable'));
    const result = await t.service.uploadCorrectedFile(vendor, 'nc', file);
    expect(result.status).toBe('REUPLOADED');
    expect(result.warnings).toEqual([
      expect.stringContaining('queued for automatic retry'),
    ]);
  });

  it('fails the transaction if the durable job cannot be saved', async () => {
    const t = setup();
    t.followUps.enqueue.mockRejectedValue(new Error('outbox unavailable'));
    await expect(
      t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED'),
    ).rejects.toThrow('outbox unavailable');
    expect(t.followUps.run).not.toHaveBeenCalled();
  });

  it.each(['INVALID', '', undefined, null, 42])(
    'validates review decision %s at HTTP and service boundaries',
    async (decision) => {
      const dto = Object.assign(new ReviewCorrectedDocumentDto(), { decision });
      expect((await validate(dto)).length).toBeGreaterThan(0);
      const { service, transaction } = setup();
      await expect(
        service.reviewCorrectedDocument(auditor, 'nc', decision as any),
      ).rejects.toThrow('decision');
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['COMPLIED', 'NON_COMPLIED'])(
    'accepts valid DTO %s',
    async (decision) => {
      expect(
        await validate(
          Object.assign(new ReviewCorrectedDocumentDto(), {
            decision,
            remark: 'Verified evidence',
          }),
        ),
      ).toEqual([]);
    },
  );

  it.each([42, 'x'.repeat(2001)])('rejects invalid remarks', async (remark) => {
    expect(
      (
        await validate(
          Object.assign(new ReviewCorrectedDocumentDto(), {
            decision: 'COMPLIED',
            remark,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    await expect(
      setup().service.reviewCorrectedDocument(
        auditor,
        'nc',
        'COMPLIED',
        remark as any,
      ),
    ).rejects.toThrow('remarks');
  });

  it('requires a meaningful rejection reason', async () => {
    await expect(
      setup().service.reviewCorrectedDocument(
        auditor,
        'nc',
        'NON_COMPLIED',
        'bad',
      ),
    ).rejects.toThrow('at least 5');
  });

  it.each(['NC_RAISED', 'AWAITING_REUPLOAD', 'ACCEPTED', 'CLOSED'])(
    'rejects review in NC state %s',
    async (status) => {
      const t = setup();
      t.nc.status = status;
      await expect(
        t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED'),
      ).rejects.toThrow('upload');
      expect(t.ncRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { filePath: null },
    { filePath: 'sample.pdf', finalMark: 'COMPLIED' },
    { filePath: 'sample.pdf', reviewedAt: new Date() },
  ])('requires unreviewed uploaded evidence: %j', async (resub) => {
    const t = setup();
    t.resubRepo.findOne.mockResolvedValue(resub);
    await expect(
      t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED'),
    ).rejects.toThrow('unreviewed');
    expect(t.ncRepo.save).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CLOSED', 'CANCELLED'])(
    'rejects both mutations for %s audit',
    async (status) => {
      const t = setup();
      t.audit.status = status;
      await expect(
        t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED'),
      ).rejects.toThrow('closed');
      await expect(
        t.service.uploadCorrectedFile(vendor, 'nc', file),
      ).rejects.toThrow('closed');
      expect(t.resubRepo.save).not.toHaveBeenCalled();
      expect(t.auditRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['ACCEPTED', 'CLOSED', 'REUPLOADED', 'REVERIFICATION_PENDING'])(
    'rejects corrected uploads in %s state',
    async (status) => {
      const t = setup();
      t.nc.status = status;
      await expect(
        t.service.uploadCorrectedFile(vendor, 'nc', file),
      ).rejects.toThrow('awaiting');
      expect(t.resubRepo.save).not.toHaveBeenCalled();
    },
  );

  it('checks ownership before writing', async () => {
    const t = setup();
    await expect(
      t.service.reviewCorrectedDocument(
        { ...auditor, userId: 'other' },
        'nc',
        'COMPLIED',
      ),
    ).rejects.toThrow('Not your audit');
    await expect(
      t.service.uploadCorrectedFile({ ...vendor, userId: 'other' }, 'nc', file),
    ).rejects.toThrow('Not your NC');
    expect(t.ncRepo.save).not.toHaveBeenCalled();
  });

  it('persists rejection on the audit and marks the reviewed upload', async () => {
    const t = setup();
    t.ncRepo.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await t.service.reviewCorrectedDocument(
      auditor,
      'nc',
      'NON_COMPLIED',
      'Missing proof',
    );
    expect(t.auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CORRECTION_PENDING' }),
    );
    expect(t.ncRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'NC_RAISED', closedAt: null }),
    );
    expect(t.resubRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        finalMark: 'NON_COMPLIED',
        reviewedAt: expect.any(Date),
      }),
    );
    expect(t.followUps.enqueue).toHaveBeenCalledWith(
      t.manager,
      expect.objectContaining({ event: 'NC_REJECTED' }),
    );
  });

  it.each(['REUPLOADED', 'REVERIFICATION_PENDING'])(
    'accepts real evidence in %s and locks audit before NC',
    async (status) => {
      const t = setup();
      t.nc.status = status;
      await t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED');
      expect(t.auditRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'audit' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(t.ncRepo.findOne).toHaveBeenLastCalledWith({
        where: { id: 'nc', auditId: 'audit' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(t.auditRepo.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        t.ncRepo.findOne.mock.invocationCallOrder[1],
      );
      expect(t.auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CLOSED' }),
      );
      expect(t.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('does not run post-commit hooks when a transactional write fails', async () => {
    const t = setup();
    t.reviewRepo.save.mockRejectedValue(new Error('database failure'));
    await expect(
      t.service.reviewCorrectedDocument(auditor, 'nc', 'COMPLIED'),
    ).rejects.toThrow('database failure');
    expect(t.followUps.enqueue).not.toHaveBeenCalled();
  });

  it.each(['NC_RAISED', 'AWAITING_REUPLOAD'])(
    'uploads corrections from %s and persists audit transition',
    async (status) => {
      const t = setup();
      t.nc.status = status;
      t.audit.status = 'CORRECTION_PENDING';
      expect(await t.service.uploadCorrectedFile(vendor, 'nc', file)).toEqual({
        resubmissionId: 'upload',
        status: 'REUPLOADED',
      });
      expect(t.auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REVERIFICATION_PENDING' }),
      );
    },
  );
});
