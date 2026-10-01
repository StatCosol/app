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
      { id: 'legal', title: 'Prepared wages form', legalIdentity: { actCode: 'WAGES_2019' }, payrollInputId: null, approvalStatus: 'APPROVED', fileName: 'form.xlsx' },
      { id: 'manual', title: 'Uploaded record', payrollInputId: null, approvalStatus: 'APPROVED' },
    ])) };
    const files = { download: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({ imports: [ClientRegistersComponent], providers: [
      { provide: HttpClient, useValue: http }, { provide: AuthService, useValue: { isBranchUser: () => branch } },
      { provide: ClientBranchesService, useValue: { list: () => of([]) } },
      { provide: ToastService, useValue: { error: vi.fn() } }, { provide: ProtectedFileService, useValue: files },
    ] });
    const fixture = TestBed.createComponent(ClientRegistersComponent);
    const component = fixture.componentInstance;
    component.q.sourceType = 'GENERATED';
    fixture.detectChanges();
    expect(component.filteredRows.map((r) => r.id)).toEqual(['legal']);
    expect(fixture.nativeElement.textContent).toContain('GENERATED');
    component.download(component.filteredRows[0]);
    expect(files.download).toHaveBeenCalledWith(expect.stringContaining('/registers-records/legal/download'), 'form.xlsx');
  });
});
