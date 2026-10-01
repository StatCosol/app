import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ClientRegistersComponent } from './client-registers.component';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

describe('Complete client register ZIP requests', () => {
  let component: ClientRegistersComponent, http: HttpTestingController;
  const toast = { error: vi.fn() };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isBranchUser: () => true } },
        { provide: ClientBranchesService, useValue: { list: () => of([]) } },
        { provide: ToastService, useValue: toast },
        { provide: ProtectedFileService, useValue: {} },
      ],
    });
    component = TestBed.createComponent(ClientRegistersComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
    toast.error.mockClear();
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('sends all displayed IDs in the body and exposes a missing-file error from a blob response', async () => {
    component.filteredRows = Array.from({ length: 200 }, (_, i) => ({ id: 'record-' + i })) as any;
    component.q.branchId = 'branch';
    component.q.periodYear = 2026;
    component.q.periodMonth = 3;
    component.downloadPack();
    component.downloadPack();
    const request = http.expectOne((r) => r.url.endsWith('/download-pack'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.registerIds).toHaveLength(200);
    expect(request.request.params.get('limit')).toBeNull();
    expect(request.request.params.get('branchId')).toBe('branch');
    expect(request.request.params.get('periodMonth')).toBe('3');
    request.flush(
      new Blob([JSON.stringify({ message: 'Regenerate missing register before download.' })], {
        type: 'application/json',
      }),
      { status: 404, statusText: 'Not Found' },
    );
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Regenerate missing register before download.'),
    );
    expect(component.packDownloading).toBe(false);
  });
  it('blocks stale and oversized requests before downloading', () => {
    component.filteredRows = [{ id: 'saved' }] as any;
    component.loading = true;
    component.downloadPack();
    http.expectNone((r) => r.url.endsWith('/download-pack'));
    component.loading = false;
    component.filteredRows = Array(301).fill({ id: 'saved' });
    component.downloadPack();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('300'));
    http.expectNone((r) => r.url.endsWith('/download-pack'));
  });
});
