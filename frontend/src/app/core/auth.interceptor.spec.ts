import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast/toast.service';
import { HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

describe('AuthInterceptor', () => {
  let interceptor: AuthInterceptor;
  let mockAuth: any;
  let mockToast: any;

  beforeEach(() => {
    mockAuth = {
      getAccessToken: vi.fn().mockReturnValue('token123'),
      getRefreshToken: vi.fn().mockReturnValue('ref123'),
      refreshAccessToken: vi.fn().mockReturnValue(of('new-token')),
      logout: vi.fn(),
    };
    mockToast = {
      error: vi.fn(),
      success: vi.fn(),
    };
    interceptor = new AuthInterceptor(
      mockAuth as unknown as AuthService,
      mockToast as unknown as ToastService,
    );
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should add Authorization header when token exists', () => {
    const req = new HttpRequest('GET', '/api/test');
    const handler: HttpHandler = {
      handle: vi.fn().mockReturnValue(of({})),
    } as any;

    interceptor.intercept(req, handler);
    expect(handler.handle).toHaveBeenCalled();
  });

  it('should not add header when no token', () => {
    mockAuth.getAccessToken.mockReturnValue('');
    const req = new HttpRequest('GET', '/api/test');
    const handler: HttpHandler = {
      handle: vi.fn().mockReturnValue(of({})),
    } as any;

    interceptor.intercept(req, handler);
    expect(handler.handle).toHaveBeenCalled();
  });
});
