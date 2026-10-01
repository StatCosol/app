import { formatDate } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ClientRegistersComponent } from './client-registers.component';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

describe('Register Library files in the download center', () => {
  it.each([false, true])('keeps prepared legal forms in the generated filter and downloads their files (branch=%s)', (branch) => {
    const http = { get: vi.fn(() => of([
      { id: 'legal', title: 'Prepared wages form', legalIdentity: { actCode: 'WAGES_2019' }, payrollInputId: null, approvalStatus: 'APPROVED', fileName: 'form.xlsx', createdAt: '2026-09-01T00:00:00Z', generatedAt: '2026-10-01T08:30:00Z' },
      { id: 'historical', title: 'Historical wages register', sourceType: 'GENERATED', legalIdentity: null, payrollInputId: null, approvalStatus: 'APPROVED', fileName: 'legacy.xlsx', createdAt: '2026-03-31T00:00:00Z' },
      { id: 'manual', title: 'Uploaded record', createdAt: '2026-09-02T00:00:00Z', payrollInputId: null, approvalStatus: 'APPROVED' },
    ])) };
    const files = { download: vi.fn(() => of(undefined)), fetch: vi.fn(() => of({ objectUrl: 'blob:register-preview', revoke: vi.fn() })) };
    TestBed.configureTestingModule({ imports: [ClientRegistersComponent], providers: [
      { provide: HttpClient, useValue: http }, { provide: AuthService, useValue: { isBranchUser: () => branch } },
      { provide: ClientBranchesService, useValue: { list: () => of([]) } },
      { provide: ToastService, useValue: { error: vi.fn() } }, { provide: ProtectedFileService, useValue: files },
    ] });
    const fixture = TestBed.createComponent(ClientRegistersComponent);
    const component = fixture.componentInstance;
    component.q.sourceType = 'GENERATED';
    fixture.detectChanges();
    expect(component.filteredRows.map((r) => r.id)).toEqual(['legal', 'historical']);
    expect(fixture.nativeElement.textContent).toContain('GENERATED');
    const replacementDate = formatDate('2026-10-01T08:30:00Z', 'dd MMM yyyy, hh:mm a', 'en-US');
    const originalDate = formatDate('2026-09-01T00:00:00Z', 'dd MMM yyyy, hh:mm a', 'en-US');
    expect(fixture.nativeElement.textContent).toContain(replacementDate);
    expect(fixture.nativeElement.textContent).not.toContain(originalDate);
    component.preview(component.filteredRows[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(`Generated: ${replacementDate}`);
    expect(component.rows.find(r => r.id === 'manual')?.generatedAt).toBe('2026-09-02T00:00:00Z');
    component.download(component.filteredRows[0]);
    expect(files.download).toHaveBeenCalledWith(expect.stringContaining('/registers-records/legal/download'), 'form.xlsx');
    component.download(component.filteredRows[1]);
    expect(files.download).toHaveBeenCalledWith(expect.stringContaining('/registers-records/historical/download'), 'legacy.xlsx');
  });
});
