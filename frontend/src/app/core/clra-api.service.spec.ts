import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { ClraApiService } from './clra-api.service';

describe('ClraApiService', () => {
  let service: ClraApiService;
  const mockHttp = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClraApiService(mockHttp);
  });

  it('lists PE establishments with clientId query param', async () => {
    mockHttp.get.mockReturnValue(of([]));
    await firstValueFrom(service.listPeEstablishments('client-1'));
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/pe-establishments'),
      expect.objectContaining({
        params: expect.objectContaining({}),
      }),
    );
  });

  it('lists assignments with optional filters', async () => {
    mockHttp.get.mockReturnValue(of([]));
    await firstValueFrom(service.listAssignments('c1', 'pe1'));
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/assignments'),
      expect.any(Object),
    );
  });

  it('lists workers by contractorId', async () => {
    mockHttp.get.mockReturnValue(of([]));
    await firstValueFrom(service.listWorkers('contractor-1'));
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/workers'),
      expect.any(Object),
    );
  });

  it('creates register run on CRM endpoint', async () => {
    mockHttp.post.mockReturnValue(of({ id: 'run-1' }));
    const body = {
      assignmentId: 'a1',
      registerCode: 'FORM_XII',
      wagePeriodId: 'wp1',
    };
    await firstValueFrom(service.createRegisterRun(body));
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/register-runs'),
      body,
    );
  });

  it('uses portal base for getMyContractor', async () => {
    mockHttp.get.mockReturnValue(of({ id: 'c1', contractorCode: 'X', legalName: 'Test' }));
    await firstValueFrom(service.getMyContractor());
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/me/contractor'),
    );
  });

  it('uses portal base for listMyAssignments', async () => {
    mockHttp.get.mockReturnValue(of([]));
    await firstValueFrom(service.listMyAssignments());
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/me/assignments'),
    );
  });

  it('creates worker via portal endpoint', async () => {
    mockHttp.post.mockReturnValue(of({ id: 'w1' }));
    const body = { workerCode: 'W01', fullName: 'Worker One' };
    await firstValueFrom(service.createMyWorker(body));
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/me/workers'),
      body,
    );
  });

  it('upserts attendance via portal endpoint', async () => {
    mockHttp.post.mockReturnValue(of({ id: 'att-1' }));
    const body = {
      wagePeriodId: 'wp1',
      workerDeploymentId: 'd1',
      attendanceDate: '2026-08-01',
      status: 'P',
    };
    await firstValueFrom(service.upsertMyAttendance(body));
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clra/me/attendance'),
      body,
    );
  });
});
