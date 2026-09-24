import { AuditorObservationsService } from './auditor-observations.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateObservationDto,
  ObservationReasonDto,
} from './dto/create-observation.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';

describe('AuditXpert assignment and verification boundaries', () => {
  const user = { userId: 'auditor-a', roleCode: 'AUDITOR' } as any;
  function setup() {
    const obs = {
      id: 'observation-a',
      auditId: 'audit-a',
      status: 'OPEN',
      audit: { branchId: null },
    };
    const observations = {
      find: jest.fn().mockResolvedValue([obs]),
      findOne: jest.fn().mockResolvedValue(obs),
      save: jest.fn(async (o) => o),
      remove: jest.fn(),
    };
    const audits = {
      findOne: jest.fn().mockResolvedValue({
        id: 'audit-a',
        clientId: 'client-a',
        assignedAuditorId: 'auditor-a',
      }),
      find: jest.fn().mockResolvedValue([{ id: 'audit-a' }]),
    };
    const assignments = {
      getAssignedClientsForAuditor: jest
        .fn()
        .mockResolvedValue([{ id: 'client-a' }]),
      isClientAssignedToAuditor: jest.fn().mockResolvedValue(false),
    };
    const service = new AuditorObservationsService(
      observations as any,
      {} as any,
      audits as any,
      assignments as any,
      {} as any,
    );
    return { service, observations, audits, assignments, obs };
  }
  it('limits unfiltered listing to explicit assignment or legacy unassigned audits', async () => {
    const x = setup();
    await x.service.listForAuditor(user);
    const where = x.audits.find.mock.calls[0][0].where;
    expect(where[0]).toEqual({ assignedAuditorId: 'auditor-a' });
    expect(where[1].assignedAuditorId.type).toBe('isNull');
    expect(where[1].clientId.value).toEqual(['client-a']);
    expect(x.observations.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ auditId: 'audit-a' }] }),
    );
  });
  it('includes explicitly assigned audits even without client-wide assignment', async () => {
    const x = setup();
    x.assignments.getAssignedClientsForAuditor.mockResolvedValue([]);
    await x.service.listForAuditor(user);
    expect(x.audits.find).toHaveBeenCalledWith({
      where: [{ assignedAuditorId: 'auditor-a' }],
    });
  });
  it.each(['getOne', 'update', 'delete', 'verifyClosure', 'reopen'])(
    'denies another auditor before %s',
    async (method) => {
      const x = setup();
      x.audits.findOne.mockResolvedValue({
        id: 'audit-a',
        clientId: 'client-a',
        assignedAuditorId: 'auditor-b',
      });
      await expect(
        (x.service as any)[method](
          user,
          'observation-a',
          method === 'update' ? { status: 'RESOLVED' } : 'reason',
        ),
      ).rejects.toThrow('not assigned');
      expect(x.observations.save).not.toHaveBeenCalled();
      expect(x.observations.remove).not.toHaveBeenCalled();
    },
  );
  it('prevents generic update from closing or reopening an observation', async () => {
    const x = setup();
    await expect(
      x.service.update(user, 'observation-a', { status: 'CLOSED' }),
    ).rejects.toThrow('Invalid status');
    x.obs.status = 'CLOSED';
    await expect(
      x.service.update(user, 'observation-a', { status: 'OPEN' }),
    ).rejects.toThrow('Reopen');
  });
  it('requires resolution and a reason before closure', async () => {
    const x = setup();
    x.obs.status = 'ACKNOWLEDGED';
    await expect(
      x.service.verifyClosure(user, 'observation-a', 'verified evidence'),
    ).rejects.toThrow('Only RESOLVED');
    x.obs.status = 'RESOLVED';
    await expect(
      x.service.verifyClosure(user, 'observation-a', ' '),
    ).rejects.toThrow('reason');
    await expect(
      x.service.verifyClosure(user, 'observation-a', 'Evidence verified'),
    ).resolves.toMatchObject({
      status: 'CLOSED',
      elaboration: expect.stringContaining('Evidence verified'),
    });
  });
  it('validates request bodies, reasons, risk, status and traversal paths', async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateObservationDto, {
            auditId: 'bad',
            observation: ' ',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(UpdateObservationDto, {
            status: 'CLOSED',
            risk: 'anything',
            evidenceFilePaths: ['../other-client.pdf'],
          }),
        )
      ).length,
    ).toBe(3);
    expect(
      (
        await validate(
          plainToInstance(ObservationReasonDto, { remarks: '    ' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
