import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayrollRegistersService } from './payroll-registers.service';

describe('Register ZIP transfer request', () => {
  it('posts a 300-file selection without expanding the URL and retains branch/period scope', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(PayrollRegistersService);
    const http = TestBed.inject(HttpTestingController);
    const registerIds = Array.from({ length: 300 }, (_, n) => '11111111-1111-4111-8111-' + String(n).padStart(12, '0'));
    service.downloadRegistersPack({ clientId: 'client', branchId: 'branch', periodYear: 2026, periodMonth: 3, registerIds }).subscribe();
    const request = http.expectOne(r => r.url.endsWith('/registers/download-pack'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.registerIds).toEqual(registerIds);
    expect(request.request.params.has('registerIds')).toBe(false);
    expect(request.request.params.get('branchId')).toBe('branch');
    expect(request.request.params.get('periodMonth')).toBe('3');
    request.flush(new Blob(['zip'])); http.verify();
  });
});
