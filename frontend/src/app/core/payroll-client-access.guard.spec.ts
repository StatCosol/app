import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError, firstValueFrom, isObservable } from 'rxjs';
import { payrollClientAccessGuard } from './payroll-client-access.guard';
import { PayrollApiService } from '../pages/payroll/payroll-api.service';

describe('payrollClientAccessGuard', () => {
  let mockRouter: { createUrlTree: ReturnType<typeof vi.fn> };
  let mockApi: { getAssignedClients: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRouter = { createUrlTree: vi.fn((commands, extras) => ({ commands, extras })) };
    mockApi = { getAssignedClients: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: PayrollApiService, useValue: mockApi },
      ],
    });
  });

  const route = (clientId: string | null) =>
    ({ paramMap: { get: () => clientId } }) as never;
  const run = (clientId: string | null) =>
    TestBed.runInInjectionContext(() =>
      payrollClientAccessGuard(route(clientId), {} as never),
    );

  it('denies immediately when clientId is missing', () => {
    run(null);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/payroll/clients'], {
      queryParams: { denied: 'client-missing' },
    });
  });

  it('allows navigation when the client is assigned', async () => {
    mockApi.getAssignedClients.mockReturnValue(of([{ id: 'c1' }]));
    const result = run('c1');
    expect(isObservable(result)).toBe(true);
    expect(await firstValueFrom(result as never)).toBe(true);
  });

  it('redirects when the client is not assigned', async () => {
    mockApi.getAssignedClients.mockReturnValue(of([{ id: 'other' }]));
    await firstValueFrom(run('c1') as never);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/payroll/clients'], {
      queryParams: { denied: 'client' },
    });
  });

  it('redirects when the assigned-clients lookup errors', async () => {
    mockApi.getAssignedClients.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    await firstValueFrom(run('c1') as never);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/payroll/clients'], {
      queryParams: { denied: 'client' },
    });
  });
});
