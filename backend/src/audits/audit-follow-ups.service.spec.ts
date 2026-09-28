import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditFollowUpsService } from './audit-follow-ups.service';
import {
  AuditFollowUpQuery,
  AuditFollowUpsController,
} from './audit-follow-ups.controller';
import { AuditFollowUpsJob } from './jobs/audit-follow-ups.job';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('Durable audit follow-ups', () => {
  const admin = { userId: 'admin', roleCode: 'ADMIN' } as any;
  function setup(event = 'NC_ACCEPTED') {
    const job = {
      id: 'job',
      audit_id: 'audit',
      nc_id: 'nc',
      resubmission_id: 'upload',
      event,
      status: 'PENDING',
      attempts: 0,
      payload: { action: event },
    };
    const audit = {
      id: 'audit',
      client_id: 'client',
      status: event === 'NC_REJECTED' ? 'CORRECTION_PENDING' : 'CLOSED',
    };
    const nc = { status: event === 'NC_REJECTED' ? 'NC_RAISED' : 'ACCEPTED' };
    const latest = {
      id: 'upload',
      final_mark: event === 'NC_REJECTED' ? 'NON_COMPLIED' : 'COMPLIED',
    };
    const client = { is_deleted: false };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM audits WHERE')) return [audit];
      if (sql.includes('FROM audit_non_compliances')) return [nc];
      if (sql.includes('FROM audit_follow_up_jobs')) return [job];
      if (sql.includes('FROM clients')) return [client];
      if (sql.includes('FROM audit_resubmissions')) return [latest];
      return [];
    });
    const manager = { query };
    const ds = {
      query: jest.fn().mockResolvedValue([job]),
      transaction: jest.fn((cb) => cb(manager)),
    };
    const ncEngine = { closeNc: jest.fn(), createTaskForNc: jest.fn() };
    const output = { refreshAuditOutputs: jest.fn() };
    const logs = { log: jest.fn() };
    const service = new AuditFollowUpsService(
      ds as any,
      ncEngine as any,
      output as any,
      logs as any,
    );
    return {
      service,
      job,
      audit,
      nc,
      latest,
      client,
      query,
      manager,
      ds,
      ncEngine,
      output,
      logs,
    };
  }

  it('runs every effect and completion on the same transaction manager', async () => {
    const t = setup();
    expect(await t.service.run('job')).toBe('SUCCEEDED');
    expect(t.ncEngine.closeNc).toHaveBeenCalledWith('nc', t.manager);
    expect(t.output.refreshAuditOutputs).toHaveBeenCalledWith(
      'audit',
      t.manager,
    );
    expect(t.logs.log).toHaveBeenCalledWith(t.job.payload, t.manager);
    expect(t.query).toHaveBeenLastCalledWith(
      expect.stringContaining('completed_at = now()'),
      ['job', 'SUCCEEDED'],
    );
  });

  it('rolls back partial effects before recording a sanitized retry', async () => {
    const t = setup();
    t.output.refreshAuditOutputs.mockRejectedValue(
      new Error('secret SQL document contents'),
    );
    expect(await t.service.run('job')).toBe('RETRY');
    expect(t.logs.log).not.toHaveBeenCalled();
    expect(t.query).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT audit_follow_up_effects',
    );
    expect(t.query).toHaveBeenLastCalledWith(
      expect.stringContaining('last_error'),
      ['job', 'RETRY', 1, 60],
    );
    expect(JSON.stringify(t.query.mock.calls)).not.toContain('secret SQL');
  });

  it('stops automatic retry after eight failures', async () => {
    const t = setup();
    t.job.attempts = 7;
    t.ncEngine.closeNc.mockRejectedValue(new Error('unavailable'));
    expect(await t.service.run('job')).toBe('FAILED');
    expect(t.query).toHaveBeenLastCalledWith(expect.any(String), [
      'job',
      'FAILED',
      8,
      3600,
    ]);
  });

  it.each([
    'new-upload',
    'changed-mark',
    'changed-state',
    'cancelled',
    'deleted-client',
  ])(
    'skips stale effects for %s but records historical activity',
    async (reason) => {
      const t = setup();
      if (reason === 'new-upload') t.latest.id = 'newer';
      if (reason === 'changed-mark') t.latest.final_mark = 'NON_COMPLIED';
      if (reason === 'changed-state') t.nc.status = 'REUPLOADED';
      if (reason === 'cancelled') t.audit.status = 'CANCELLED';
      if (reason === 'deleted-client') t.client.is_deleted = true;
      expect(await t.service.run('job')).toBe('SKIPPED');
      expect(t.ncEngine.closeNc).not.toHaveBeenCalled();
      expect(t.output.refreshAuditOutputs).not.toHaveBeenCalled();
      expect(t.logs.log).toHaveBeenCalledWith(t.job.payload, t.manager);
    },
  );

  it('creates the rejection task with the job transaction', async () => {
    const t = setup('NC_REJECTED');
    expect(await t.service.run('job')).toBe('SUCCEEDED');
    expect(t.ncEngine.createTaskForNc).toHaveBeenCalledWith('nc', t.manager);
    expect(t.output.refreshAuditOutputs).not.toHaveBeenCalled();
  });

  it.each(['CLOSED', 'COMPLETED'])(
    'does not create a delayed rejection task for a %s audit',
    async (status) => {
      const t = setup('NC_REJECTED');
      t.audit.status = status;
      expect(await t.service.run('job')).toBe('SKIPPED');
      expect(t.ncEngine.createTaskForNc).not.toHaveBeenCalled();
    },
  );

  it('leaves jobs queued when the database is unavailable', async () => {
    const t = setup();
    t.ds.query.mockRejectedValue(new Error('unavailable'));
    expect(await t.service.run('job')).toBe('PENDING');
    expect(t.ds.transaction).not.toHaveBeenCalled();
  });

  it.each([
    'CLIENT',
    'BRANCH_DESK',
    'CONTRACTOR',
    'CRM',
    'AUDITOR',
    'CEO',
    'CCO',
    undefined,
  ])('denies %s list and retry access before querying', async (roleCode) => {
    const t = setup();
    const user = { userId: 'user', roleCode } as any;
    await expect(t.service.list(user, undefined, 1, 25)).rejects.toThrow(
      'Administrator',
    );
    await expect(t.service.retry(user, 'job')).rejects.toThrow('Administrator');
    expect(t.ds.query).not.toHaveBeenCalled();
    expect(t.ds.transaction).not.toHaveBeenCalled();
  });

  it('records the administrator retry in the same transaction', async () => {
    const t = setup();
    expect(await t.service.retry(admin, 'job')).toEqual({
      id: 'job',
      status: 'PENDING',
    });
    expect(t.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "status IN ('RETRY', 'FAILED') FOR UPDATE SKIP LOCKED",
      ),
      ['job'],
    );
    expect(t.logs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        performedRole: 'ADMIN',
        meta: expect.objectContaining({ operation: 'RETRY_FOLLOW_UP' }),
      }),
      t.manager,
    );
  });

  it('rejects retry when the job has already changed', async () => {
    const t = setup();
    t.query.mockResolvedValue([]);
    await expect(t.service.retry(admin, 'job')).rejects.toThrow('Refresh');
    expect(t.logs.log).not.toHaveBeenCalled();
  });

  it('requires JWT and administrator roles on the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AuditFollowUpsController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata('roles', AuditFollowUpsController)).toEqual([
      'ADMIN',
    ]);
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { page: 'invalid' },
    { limit: 101 },
    { limit: 0 },
    { status: 'BOGUS' },
  ])('validates bounded pagination and status %j', async (input) => {
    expect(
      (await validate(plainToInstance(AuditFollowUpQuery, input))).length,
    ).toBeGreaterThan(0);
  });

  it('accepts defaults and valid string pagination', async () => {
    const dto = plainToInstance(AuditFollowUpQuery, {
      page: '2',
      limit: '25',
      status: 'FAILED',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(await validate(new AuditFollowUpQuery())).toEqual([]);
  });

  it('prevents overlapping local scans and recovers after a failed scan', async () => {
    let reject!: (reason: Error) => void;
    const drain = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, r) => {
            reject = r;
          }),
      )
      .mockResolvedValue(undefined);
    const worker = new AuditFollowUpsJob({ drain } as any);
    const first = worker.handle();
    await worker.handle();
    expect(drain).toHaveBeenCalledTimes(1);
    reject(new Error('temporary'));
    await first;
    await worker.handle();
    expect(drain).toHaveBeenCalledTimes(2);
  });
});
