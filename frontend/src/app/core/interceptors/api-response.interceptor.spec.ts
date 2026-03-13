import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiResponseInterceptor } from './api-response.interceptor';

describe('apiResponseInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiResponseInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should unwrap {success:true, data} responses', () => {
    http.get('/api/test').subscribe((result) => {
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    const req = httpTesting.expectOne('/api/test');
    req.flush({ success: true, statusCode: 200, data: { id: 1, name: 'Test' }, timestamp: new Date().toISOString() });
  });

  it('should pass through non-wrapped responses', () => {
    http.get('/api/plain').subscribe((result) => {
      expect(result).toEqual({ raw: true });
    });

    const req = httpTesting.expectOne('/api/plain');
    req.flush({ raw: true });
  });
});
