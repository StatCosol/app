import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { HelpdeskAttachmentsComponent } from '../../../shared/helpdesk/helpdesk-attachments.component';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { AuthService } from '../../../core/auth.service';
import { IdleTimeoutService } from '../../../core/idle-timeout.service';
import { ToastService } from '../../../shared/toast/toast.service';

describe('Authenticated Helpdesk downloads', () => {
  const file = { name: 'Report #1 & details.pdf', url: '/uploads/helpdesk/report #1 & details.pdf' };
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpdeskAttachmentsComponent],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAccessToken: () => 'sample-access-token' } },
        { provide: IdleTimeoutService, useValue: { checkFromInterceptor: () => true } },
        { provide: ToastService, useValue: { warning: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  function fixture() {
    const f = TestBed.createComponent(HelpdeskAttachmentsComponent);
    f.componentRef.setInput('attachments', [file]); f.detectChanges(); return f;
  }
  it('sends a bearer-authenticated request and downloads a blob using the original filename', () => {
    const f = fixture(); let downloadedName = ''; let downloadedUrl = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; downloadedUrl = this.href; });
    f.nativeElement.querySelector('button').click();
    const req = http.expectOne('/api/v1/files/download?p=' + encodeURIComponent(file.url));
    expect(req.request.headers.get('Authorization')).toBe('Bearer sample-access-token');
    expect(req.request.url).not.toContain('sample-access-token');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['sample'], { type: 'application/pdf' }));
    expect(downloadedName).toBe(file.name); expect(downloadedUrl.startsWith('blob:')).toBe(true);
    expect(f.componentInstance.downloading).toBe('');
  });
  it('reports access denial and permits a new attempt without opening an unprotected URL', () => {
    const f = fixture(); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    f.componentInstance.download(file);
    http.expectOne('/api/v1/files/download?p=' + encodeURIComponent(file.url)).flush(new Blob(), { status: 403, statusText: 'Forbidden' });
    f.detectChanges(); expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('permission');
    expect(click).not.toHaveBeenCalled(); expect(f.componentInstance.downloading).toBe('');
    f.componentInstance.download(file);
    http.expectOne('/api/v1/files/download?p=' + encodeURIComponent(file.url)).flush(new Blob(['sample']));
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('blocks disabled and duplicate clicks and cancels an in-flight request on destroy', () => {
    const f = fixture(); f.componentRef.setInput('disabled', true); f.detectChanges(); f.componentInstance.download(file);
    http.expectNone(() => true);
    f.componentRef.setInput('disabled', false); f.detectChanges();
    f.componentInstance.download(file); f.componentInstance.download(file);
    const requests = http.match(() => true); expect(requests).toHaveLength(1);
    f.destroy(); expect(requests[0].cancelled).toBe(true);
  });
});
