import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AiAuditService } from './ai-audit.service';
import { AiController } from './ai.controller';

describe('AI audit observation reference integrity', () => {
  let repo: any;
  let db: any;
  let core: any;
  let library: any;
  let service: AiAuditService;
  let rows: { client: any[]; audit: any[]; branch: any[] };
  const input = {
    clientId: 'company',
    auditId: 'audit',
    findingDescription: '  Synthetic finding  ',
  };
  beforeEach(() => {
    rows = {
      client: [{ client_name: 'Synthetic company' }],
      audit: [{ branch_id: 'branch' }],
      branch: [
        { branch_name: 'Synthetic branch', statecode: 'TS', city: 'Test city' },
      ],
    };
    db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM clients')) return rows.client;
        if (sql.includes('FROM audits')) return rows.audit;
        if (sql.includes('FROM client_branches')) return rows.branch;
        throw new Error('Unexpected query');
      }),
    };
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    core = { isReady: jest.fn().mockResolvedValue(false), complete: jest.fn() };
    library = {
      findBestReusable: jest.fn().mockResolvedValue(null),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    service = new AiAuditService(repo, db, core, library);
  });
  const expectNoGeneration = () => {
    expect(library.findBestReusable).not.toHaveBeenCalled();
    expect(core.isReady).not.toHaveBeenCalled();
    expect(core.complete).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  };

  it('rejects a missing or deleted company before any generation', async () => {
    rows.client = [];
    await expect(service.generateObservation(input)).rejects.toThrow(
      NotFoundException,
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_deleted = false'),
      ['company'],
    );
    expectNoGeneration();
  });

  it('rejects a missing or foreign-company audit before any generation', async () => {
    rows.audit = [];
    await expect(service.generateObservation(input)).rejects.toThrow(
      'Audit does not belong to the selected company',
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('client_id = $2'),
      ['audit', 'company'],
    );
    expectNoGeneration();
  });

  it('rejects a branch that disagrees with the linked audit', async () => {
    await expect(
      service.generateObservation({ ...input, branchId: 'another-branch' }),
    ).rejects.toThrow('Branch does not match the selected audit');
    expectNoGeneration();
  });

  it.each([undefined, 'branch'])(
    'rejects a missing, deleted or foreign branch, including an inferred branch (%s)',
    async (branchId) => {
      rows.branch = [];
      await expect(
        service.generateObservation({ ...input, branchId }),
      ).rejects.toThrow('Branch does not belong to the selected company');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/clientid = \$2 AND isdeleted = false/),
        ['branch', 'company'],
      );
      expectNoGeneration();
    },
  );

  it('derives the omitted branch and state from the stored audit and persists the normalized finding', async () => {
    const result = await service.generateObservation(input);
    expect(result).toEqual(
      expect.objectContaining({
        clientId: 'company',
        auditId: 'audit',
        branchId: 'branch',
        applicableState: 'TS',
        findingDescription: 'Synthetic finding',
      }),
    );
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('passes the real branch name to the provider for a matching explicit branch', async () => {
    core.isReady.mockResolvedValue(true);
    core.complete.mockResolvedValue({
      content: JSON.stringify({ observationText: 'Synthetic result' }),
      model: 'test-provider',
    });
    const result = await service.generateObservation({
      ...input,
      branchId: 'branch',
    });
    expect(JSON.parse(core.complete.mock.calls[0][1])).toEqual(
      expect.objectContaining({
        clientName: 'Synthetic company',
        branchName: 'Synthetic branch',
        state: 'TS',
      }),
    );
    expect(result.observationText).toBe('Synthetic result');
  });

  it('preserves standalone company-level observations and explicit state selection', async () => {
    const result = await service.generateObservation({
      clientId: 'company',
      findingDescription: 'Test',
      applicableState: 'KA',
    });
    expect(result).toEqual(
      expect.objectContaining({
        auditId: null,
        branchId: null,
        applicableState: 'KA',
      }),
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'branch'])(
    'preserves company-wide audits with an optional same-company branch (%s)',
    async (branchId) => {
      rows.audit = [{ branch_id: null }];
      const result = await service.generateObservation({ ...input, branchId });
      expect(result.auditId).toBe('audit');
      expect(result.branchId).toBe(branchId || null);
    },
  );

  it('keeps the validated references on library-generated observations', async () => {
    library.findBestReusable.mockResolvedValue({
      similarity: 1,
      remark: { id: 'remark', observationText: 'Reusable synthetic result' },
    });
    const result = await service.generateObservation(input);
    expect(result).toEqual(
      expect.objectContaining({
        auditId: 'audit',
        branchId: 'branch',
        observationText: 'Reusable synthetic result',
      }),
    );
    expect(core.isReady).not.toHaveBeenCalled();
  });

  it('does not convert database outages into fabricated context or a saved fallback', async () => {
    db.query.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.generateObservation(input)).rejects.toThrow(
      'Database unavailable',
    );
    expectNoGeneration();
  });

  it('rejects whitespace-only findings before database or provider work', async () => {
    await expect(
      service.generateObservation({ ...input, findingDescription: '  ' }),
    ).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expectNoGeneration();
  });
});

describe('AI generation HTTP error contract', () => {
  function controller(error: Error) {
    return new AiController(
      {} as any,
      { generateObservation: jest.fn().mockRejectedValue(error) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertClientAllowed: jest.fn() } as any,
    );
  }
  it.each([
    new BadRequestException('Audit mismatch'),
    new NotFoundException('Company not found'),
  ])('preserves the expected HTTP error %s', async (error) => {
    await expect(
      controller(error).generateAuditObservation(
        { clientId: 'company', findingDescription: 'Test' },
        { roleCode: 'ADMIN' } as any,
      ),
    ).rejects.toBe(error);
  });
  it('does not expose database/provider error details in a 500 response', async () => {
    const result = controller(
      new Error('private database/provider details'),
    ).generateAuditObservation(
      { clientId: 'company', findingDescription: 'Test' },
      { roleCode: 'ADMIN' } as any,
    );
    await expect(result).rejects.toEqual(
      expect.objectContaining({ message: 'Observation generation failed' }),
    );
    await expect(result).rejects.toBeInstanceOf(HttpException);
  });
});
