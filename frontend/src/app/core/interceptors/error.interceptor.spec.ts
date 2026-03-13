import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { errorInterceptor } from './error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let toastService: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        ToastService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    toastService = TestBed.inject(ToastService);
  });

  afterEach(() => httpTesting.verify());

  it('should show toast on non-401 error', () => {
    const errorSpy = vi.spyOn(toastService, 'error');

    http.get('/api/test').subscribe({ error: () => {} });

    const req = httpTesting.expectOne('/api/test');
    req.flush(
      { success: false, message: 'Not found', statusCode: 404 },
      { status: 404, statusText: 'Not Found' },
    );

    expect(errorSpy).toHaveBeenCalled();
  });

  it('should NOT show toast on 401 error', () => {
    const errorSpy = vi.spyOn(toastService, 'error');

    http.get('/api/test').subscribe({ error: () => {} });

    const req = httpTesting.expectOne('/api/test');
    req.flush(
      { success: false, message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
