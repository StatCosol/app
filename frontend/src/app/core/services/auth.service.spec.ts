import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
      ],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should store tokens on login', () => {
    const mockResponse = {
      accessToken: 'at-123',
      refreshToken: 'rt-456',
      user: { id: 1, role: 'admin', name: 'Admin' },
    };

    service.login({ email: 'test@test.com', password: 'pass' }).subscribe((res) => {
      expect(res.accessToken).toBe('at-123');
      expect(service.getAccessToken()).toBe('at-123');
      expect(service.getCurrentRole()).toBe('admin');
    });

    const req = httpTesting.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });

  it('should clear storage on clearSession', () => {
    localStorage.setItem('access_token', 'at');
    localStorage.setItem('refresh_token', 'rt');
    localStorage.setItem('auth_user', '{}');

    service.clearSession();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('isLoggedIn returns false when no token', () => {
    expect(service.isLoggedIn()).toBe(false);
  });
});
