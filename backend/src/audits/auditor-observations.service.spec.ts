import { AuditorObservationsService } from './auditor-observations.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateObservationDto,
  ObservationReasonDto,
} from './dto/create-observation.dto';
import { UpdateObservationDto } from './dto/update-observation.dto';
import * as observationPdf from './utils/observations-pdf';

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
  it('separates test audit and test observation markers from normal counts without writing records', async () => {
    const x = setup();
    x.observations.find.mockResolvedValue([
      {
        id: 'actual',
        auditId: 'audit-a',
        observation: 'Review test equipment',
        audit: { notes: '', branchId: null },
      },
      {
        id: 'marker',
        auditId: 'audit-a',
        observation: 'TEST ONLY - synthetic',
        audit: {},
      },
      {
        id: 'legacy-observation',
        auditId: 'audit-a',
        observation:
          'TEST-BRANCH-UI-20261026 — Synthetic correction workflow check. Not an actual compliance finding.',
        audit: {},
      },
      {
        id: 'test-audit',
        auditId: 'audit-a',
        observation: 'Normal title',
        audit: { notes: 'SYNTHETIC TEST ONLY - isolated' },
      },
      {
        id: 'legacy-audit',
        auditId: 'audit-a',
        observation: 'Normal title',
        audit: {
          branchId: '94ad1c42-ea05-460e-b494-0a7e634de127',
          auditCode: 'AX-2099-48EF3CF2FE89',
        },
      },
    ] as any);
    expect((await x.service.listForAuditor(user)).map((r) => r.id)).toEqual([
      'actual',
    ]);
    expect(
      (await x.service.listForAuditor(user, undefined, 'TEST')).map(
        (r) => r.id,
      ),
    ).toEqual(['marker', 'legacy-observation', 'test-audit', 'legacy-audit']);
    expect(x.observations.save).not.toHaveBeenCalled();
    expect(x.observations.remove).not.toHaveBeenCalled();
  });
  it('preserves explicit assigned-audit history and supports an explicit scope within it', async () => {
    const x = setup();
    x.observations.find.mockResolvedValue([
      { id: 'test', auditId: 'audit-a', observation: 'TEST ONLY - fixture' },
    ] as any);
    expect(await x.service.listForAuditor(user, 'audit-a')).toEqual([
      expect.objectContaining({ id: 'test', isTest: true }),
    ]);
    expect(await x.service.listForAuditor(user, 'audit-a', 'ACTUAL')).toEqual(
      [],
    );
    expect(
      await x.service.listForAuditor(user, 'audit-a', 'TEST'),
    ).toHaveLength(1);
    x.audits.findOne.mockResolvedValue({
      id: 'audit-a',
      assignedAuditorId: 'foreign',
    } as any);
    await expect(
      x.service.listForAuditor(user, 'audit-a', 'TEST'),
    ).rejects.toThrow('not assigned');
  });
  it('rejects invalid scope before reading any records', async () => {
    const x = setup();
    await expect(
      x.service.listForAuditor(user, undefined, 'ALL'),
    ).rejects.toThrow('recordScope');
    expect(x.audits.find).not.toHaveBeenCalled();
    expect(x.observations.find).not.toHaveBeenCalled();
  });
  it('exports the selected record scope and labels synthetic PDF content', async () => {
    const x = setup();
    x.observations.find.mockResolvedValue([
      { id: 'actual', auditId: 'audit-a', observation: 'Actual fixture' },
      {
        id: 'test',
        auditId: 'audit-a',
        observation: 'TEST ONLY synthetic fixture',
      },
    ] as any);
    const pdf = jest
      .spyOn(observationPdf, 'generateObservationsPdfBuffer')
      .mockResolvedValue(Buffer.from('PDF fixture'));
    try {
      await x.service.exportPdf(user, 'audit-a', 'ACTUAL');
      expect(pdf).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rows: [expect.objectContaining({ observation: 'Actual fixture' })],
          scopeNotice: expect.stringContaining('Actual findings only'),
        }),
      );
      await x.service.exportPdf(user, 'audit-a', 'TEST');
      expect(pdf).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rows: [
            expect.objectContaining({
              observation: expect.stringContaining('TEST ONLY'),
            }),
          ],
          scopeNotice: expect.stringContaining('TEST ONLY'),
        }),
      );
      await x.service.exportPdf(user, 'audit-a');
      expect(pdf.mock.calls.at(-1)?.[0].rows).toHaveLength(2);
      expect(pdf.mock.calls.at(-1)?.[0].scopeNotice).toContain(
        'includes labelled',
      );
    } finally {
      pdf.mockRestore();
    }
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
